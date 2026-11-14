import { mapBrightnessToSound, mapScalarToSound } from './mapping.js';

import { prepareComparisonPlayback } from './comparison.js';

const MAX_VOICES = 8;
const MAX_COMBINED_VOICE_GAIN = 0.8;
const DEFAULT_MASTER_VOLUME = 0.7;
const MASTER_VOLUME_RAMP_SECONDS = 0.025;
const VOICE_ATTACK_SECONDS = 0.02;
const VOICE_RELEASE_SECONDS = 0.08;
const VOICE_RELEASE_LEVEL = 0.85;
const SCHEDULER_START_LEAD_SECONDS = 0.05;
const SCHEDULER_LOOKAHEAD_SECONDS = 0.05;
const SCHEDULER_POLL_INTERVAL_MS = 10;
const SCAN_CELL_INTERVAL_SECONDS = 0.12;
const ALLOWED_WAVEFORMS = new Set(['sine', 'triangle', 'square', 'sawtooth']);

let audioContext = null;
let masterGain = null;
let masterVolume = DEFAULT_MASTER_VOLUME;
let activePlaybackSession = null;
const activeVoices = new Set();

function getAudioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function disconnectVoice(voice) {
  let firstError = null;

  if (voice.oscillatorCreated && !voice.oscillatorDisconnected) {
    voice.oscillatorDisconnected = true;
    try {
      voice.oscillator.disconnect();
    } catch (error) {
      firstError = error;
    }
  }
  if (voice.gainCreated && !voice.gainDisconnected) {
    voice.gainDisconnected = true;
    try {
      voice.gain.disconnect();
    } catch (error) {
      if (!firstError) firstError = error;
    }
  }

  if (firstError) throw firstError;
}

function finishVoice(voice) {
  activeVoices.delete(voice);
  disconnectVoice(voice);
}

function stopVoice(voice, atTime) {
  if (voice.stopping) return;
  voice.stopping = true;

  let firstError = null;
  try {
    const gainParam = voice.gain.gain;
    gainParam.cancelScheduledValues(atTime);
    gainParam.setValueAtTime(gainParam.value, atTime);
    gainParam.setValueAtTime(0, atTime);
  } catch (error) {
    firstError = error;
  }

  try {
    voice.oscillator.stop(atTime);
  } catch (error) {
    if (!firstError) firstError = error;
  }

  try {
    finishVoice(voice);
  } catch (cleanupError) {
    if (firstError) {
      throw new AggregateError(
        [firstError, cleanupError],
        'Stopping the voice failed and its audio nodes could not be fully disconnected.'
      );
    }
    throw cleanupError;
  }
  if (firstError) throw firstError;
}

function validateToneParameters(tone, startTime) {
  if (!tone || typeof tone !== 'object') {
    throw new TypeError('Tone parameters must be an object.');
  }
  if (!Number.isFinite(tone.frequencyHz) || tone.frequencyHz <= 0) {
    throw new RangeError('Tone frequencyHz must be a finite positive number.');
  }
  if (!Number.isFinite(tone.velocity) || tone.velocity < 0 || tone.velocity > 1) {
    throw new RangeError('Tone velocity must be between 0 and 1.');
  }
  if (!Number.isFinite(tone.durationSeconds) || tone.durationSeconds <= 0) {
    throw new RangeError('Tone durationSeconds must be a finite positive number.');
  }
  if (tone.timbre !== undefined && !ALLOWED_WAVEFORMS.has(tone.timbre)) {
    throw new RangeError(`Unsupported oscillator waveform "${tone.timbre}".`);
  }
  if (!Number.isFinite(startTime) || startTime < 0) {
    throw new RangeError('Tone start time must be a finite non-negative number.');
  }
}

function scheduleTone(tone, startTime = audioContext.currentTime) {
  validateToneParameters(tone, startTime);

  const now = audioContext.currentTime;
  const scheduledStart = Math.max(now, startTime);

  if (activeVoices.size >= MAX_VOICES) {
    const oldestVoice = activeVoices.values().next().value;
    stopVoice(oldestVoice, now);
  }

  const oscillator = audioContext.createOscillator();
  const voice = {
    oscillator,
    gain: null,
    oscillatorCreated: true,
    gainCreated: false,
    oscillatorDisconnected: false,
    gainDisconnected: false,
    started: false,
    stopping: false
  };

  try {
    const gain = audioContext.createGain();
    voice.gain = gain;
    voice.gainCreated = true;

    const peakGain = (MAX_COMBINED_VOICE_GAIN / MAX_VOICES) * tone.velocity;
    const noteOnTime = scheduledStart + VOICE_ATTACK_SECONDS;
    const noteOffTime = noteOnTime + tone.durationSeconds;
    const releaseEndTime = noteOffTime + VOICE_RELEASE_SECONDS;
    const gainParam = gain.gain;
    voice.endTime = releaseEndTime;

    oscillator.type = tone.timbre || 'sine';
    oscillator.frequency.setValueAtTime(tone.frequencyHz, scheduledStart);
    gainParam.setValueAtTime(0, scheduledStart);
    gainParam.linearRampToValueAtTime(peakGain, noteOnTime);
    gainParam.setValueAtTime(peakGain * VOICE_RELEASE_LEVEL, noteOffTime);
    gainParam.linearRampToValueAtTime(0, releaseEndTime);

    oscillator.onended = () => finishVoice(voice);
    oscillator.connect(gain);
    gain.connect(masterGain);
    activeVoices.add(voice);
    oscillator.start(scheduledStart);
    voice.started = true;
    oscillator.stop(releaseEndTime);
  } catch (error) {
    activeVoices.delete(voice);
    voice.stopping = true;
    const cleanupErrors = [];

    if (voice.started) {
      try {
        oscillator.stop(audioContext.currentTime);
      } catch (stopError) {
        cleanupErrors.push(stopError);
      }
    }

    try {
      disconnectVoice(voice);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Tone scheduling failed and cleanup reported additional errors.'
      );
    }
    throw error;
  }

  return voice;
}

function validateMatrix(matrix, width, height, label, brightnessData = false) {
  if (!Array.isArray(matrix) || matrix.length !== height) {
    throw new RangeError(`${label} must contain exactly ${height} rows.`);
  }

  for (let y = 0; y < height; y++) {
    if (!Array.isArray(matrix[y]) || matrix[y].length !== width) {
      throw new RangeError(`${label}[${y}] must contain exactly ${width} cells.`);
    }
    for (let x = 0; x < width; x++) {
      const value = matrix[y][x];
      if (value !== null && !Number.isFinite(value)) {
        throw new TypeError(`${label}[${y}][${x}] must be a finite number or null.`);
      }
      if (brightnessData && value !== null && (value < 0 || value > 1)) {
        throw new RangeError(`${label}[${y}][${x}] brightness must be between 0 and 1.`);
      }
    }
  }
}

function validateDimensions(dataset) {
  if (!Number.isInteger(dataset.width) || dataset.width <= 0 ||
      !Number.isInteger(dataset.height) || dataset.height <= 0) {
    throw new RangeError('Dataset width and height must be positive integers.');
  }
}

function resolveDatasetAudioConfig(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    throw new TypeError('Dataset must be an object.');
  }

  if (dataset.schema_version === '1.0') {
    if (dataset.width !== 64 || dataset.height !== 32) {
      throw new RangeError('Schema v1.0 datasets must be 64 by 32.');
    }
    validateMatrix(dataset.values, dataset.width, dataset.height, 'dataset.values', true);
    return {
      version: '1.0',
      width: dataset.width,
      height: dataset.height,
      values: dataset.values
    };
  }

  if (dataset.schema_version !== '1.1') {
    throw new RangeError(`Unsupported dataset schema_version "${dataset.schema_version}".`);
  }

  validateDimensions(dataset);
  if (!Array.isArray(dataset.channels) || dataset.channels.length === 0) {
    throw new TypeError('Schema v1.1 dataset must declare at least one channel.');
  }
  if (!Array.isArray(dataset.sonification_profiles) ||
      dataset.sonification_profiles.length === 0) {
    throw new TypeError('Schema v1.1 dataset must declare sonification_profiles.');
  }
  if (!Array.isArray(dataset.frames) || dataset.frames.length === 0) {
    throw new TypeError('Schema v1.1 dataset must contain at least one frame.');
  }

  const channelIds = new Set();
  for (const channel of dataset.channels) {
    if (!channel || typeof channel !== 'object' ||
        typeof channel.id !== 'string' || channel.id.length === 0) {
      throw new TypeError('Each channel must have a non-empty id.');
    }
    if (typeof channel.label !== 'string' || channel.label.length === 0) {
      throw new TypeError(`Channel "${channel.id}" must have a non-empty label.`);
    }
    if (channelIds.has(channel.id)) {
      throw new RangeError(`Duplicate channel id "${channel.id}".`);
    }
    channelIds.add(channel.id);
  }
  for (let index = 0; index < dataset.frames.length; index++) {
    if (!dataset.frames[index] || typeof dataset.frames[index] !== 'object') {
      throw new TypeError(`Frame ${index} must be an object.`);
    }
  }

  const defaultProfiles = dataset.sonification_profiles.filter(profile =>
    profile && profile.is_default === true
  );
  if (defaultProfiles.length !== 1) {
    throw new RangeError('Exactly one sonification profile must have is_default set to true.');
  }
  const profile = defaultProfiles[0];
  if (typeof profile.id !== 'string' || profile.id.length === 0) {
    throw new TypeError('Default sonification profile must have a non-empty id.');
  }
  const channel = dataset.channels.find(candidate => candidate.id === profile.channel_id);
  if (!channel) {
    throw new RangeError(`Default profile references unknown channel "${profile.channel_id}".`);
  }
  if (channel.quantity_type !== 'scalar') {
    throw new RangeError(`Unsupported channel quantity_type "${channel.quantity_type}".`);
  }
  if (typeof channel.value_meaning !== 'string' || channel.value_meaning.length === 0) {
    throw new TypeError('Channel value_meaning must be a non-empty string.');
  }
  if (channel.null_semantics !== 'masked_or_unavailable') {
    throw new RangeError('Channel null_semantics must be "masked_or_unavailable".');
  }

  mapScalarToSound(null, channel, profile);
  return {
    version: '1.1',
    width: dataset.width,
    height: dataset.height,
    frames: dataset.frames,
    channel,
    profile
  };
}

function getFrameValues(config, frameIndex) {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('frameIndex must be a non-negative integer.');
  }

  if (config.version === '1.0') {
    if (frameIndex !== 0) {
      throw new RangeError('Schema v1.0 datasets contain only frameIndex 0.');
    }
    return config.values;
  }

  if (frameIndex >= config.frames.length) {
    throw new RangeError(`frameIndex ${frameIndex} is outside the dataset frame range.`);
  }
  const frame = config.frames[frameIndex];
  if (!frame || typeof frame !== 'object' ||
      !frame.values || typeof frame.values !== 'object') {
    throw new TypeError(`Frame ${frameIndex} must contain a values object.`);
  }

  const matrix = frame.values[config.channel.id];
  validateMatrix(matrix, config.width, config.height,
    `frames[${frameIndex}].values.${config.channel.id}`);
  return matrix;
}

function validateScalarMatrix(matrix, config, label) {
  const { source_min: sourceMin, source_max: sourceMax } = config.channel.normalization;
  for (let y = 0; y < config.height; y++) {
    for (let x = 0; x < config.width; x++) {
      const value = matrix[y][x];
      if (value !== null && (value < sourceMin || value > sourceMax)) {
        throw new RangeError(
          `${label}[${y}][${x}] value ${value} ${config.channel.units} is outside ` +
          `the declared range [${sourceMin}, ${sourceMax}].`
        );
      }
    }
  }
}

function meanOfValidCells(matrix) {
  let count = 0;
  let mean = 0;
  for (const row of matrix) {
    for (const value of row) {
      if (value === null) continue;
      count += 1;
      mean += (value - mean) / count;
    }
  }
  return count === 0 ? null : mean;
}

function parseUtcTimestamp(timestamp, frameIndex) {
  if (typeof timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp)) {
    throw new TypeError(`Frame ${frameIndex} timestamp must be ISO 8601 UTC.`);
  }
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) ||
      new Date(milliseconds).toISOString().slice(0, 19) !== timestamp.slice(0, 19)) {
    throw new RangeError(`Frame ${frameIndex} timestamp is invalid.`);
  }
  return milliseconds;
}

function getTimestampSequence(frames) {
  const timestampPresence = frames.map(frame =>
    Object.prototype.hasOwnProperty.call(frame, 'timestamp')
  );
  const anyTimestamp = timestampPresence.some(Boolean);
  if (!anyTimestamp) return null;
  if (timestampPresence.some(present => !present)) {
    throw new RangeError('Sequence frames must either all have timestamps or all omit them.');
  }

  const timestamps = frames.map((frame, index) =>
    parseUtcTimestamp(frame.timestamp, index)
  );
  for (let index = 1; index < timestamps.length; index++) {
    if (timestamps[index] <= timestamps[index - 1]) {
      throw new RangeError('Sequence timestamps must be strictly increasing.');
    }
  }
  return timestamps;
}

function getSequenceOffsets(frames, frameIndex, timing) {
  const timestamps = getTimestampSequence(frames);
  if (!timing || typeof timing !== 'object') {
    throw new TypeError(timestamps
      ? 'Timestamped playback requires secondsPerSourceSecond timing.'
      : 'Untimestamped playback requires frameIntervalSeconds timing.');
  }

  if (timestamps) {
    const scale = timing.secondsPerSourceSecond;
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError(
        'Timestamped playback requires a positive secondsPerSourceSecond timing value.'
      );
    }
    return frames.slice(frameIndex).map((_, index) =>
      ((timestamps[frameIndex + index] - timestamps[frameIndex]) / 1000) * scale
    );
  }

  const interval = timing.frameIntervalSeconds;
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new RangeError(
      'Untimestamped playback requires a positive frameIntervalSeconds timing value.'
    );
  }
  return frames.slice(frameIndex).map((_, index) => index * interval);
}

function prepareGridPlayback(dataset, frameIndex, timing) {
  const config = resolveDatasetAudioConfig(dataset);
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('frameIndex must be a non-negative integer.');
  }

  if (config.version === '1.0') {
    const matrix = getFrameValues(config, frameIndex);
    const mean = meanOfValidCells(matrix);
    return {
      events: [{ offsetSeconds: 0, tone: mean === null ? null : mapBrightnessToSound(mean) }],
      timelineDurationSeconds: 0
    };
  }
  if (frameIndex >= config.frames.length) {
    throw new RangeError(`frameIndex ${frameIndex} is outside the dataset frame range.`);
  }

  const offsets = getSequenceOffsets(config.frames, frameIndex, timing);
  const events = [];
  for (let index = frameIndex; index < config.frames.length; index++) {
    const matrix = getFrameValues(config, index);
    validateScalarMatrix(matrix, config, `frames[${index}].values.${config.channel.id}`);
    const mean = meanOfValidCells(matrix);
    events.push({
      offsetSeconds: offsets[index - frameIndex],
      tone: mean === null ? null : mapScalarToSound(mean, config.channel, config.profile)
    });
  }

  return {
    events,
    timelineDurationSeconds: offsets.length > 0 ? offsets[offsets.length - 1] : 0
  };
}

function prepareGridScan(dataset, frameIndex) {
  const config = resolveDatasetAudioConfig(dataset);
  const matrix = getFrameValues(config, frameIndex);
  const events = [];
  let cellIndex = 0;

  for (let x = 0; x < config.width; x++) {
    for (let y = 0; y < config.height; y++) {
      const value = matrix[y][x];
      let tone = null;
      if (value !== null) {
        tone = config.version === '1.0'
          ? mapBrightnessToSound(value)
          : mapScalarToSound(value, config.channel, config.profile);
      }
      events.push({
        offsetSeconds: cellIndex * SCAN_CELL_INTERVAL_SECONDS,
        tone
      });
      cellIndex += 1;
    }
  }

  return {
    events,
    timelineDurationSeconds: cellIndex * SCAN_CELL_INTERVAL_SECONDS
  };
}

function stopActiveVoices() {
  const errors = [];
  const now = audioContext ? audioContext.currentTime : 0;
  for (const voice of [...activeVoices]) {
    try {
      stopVoice(voice, now);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, 'One or more audio voices could not be stopped cleanly.');
  }
}

function settlePlaybackSession(session, outcome, error) {
  if (session.timer !== null) clearTimeout(session.timer);
  if (activePlaybackSession === session) activePlaybackSession = null;
  if (session.settled) return;
  session.settled = true;
  if (error) session.reject(error);
  else session.resolve(outcome);
}

function failPlaybackSession(session, error) {
  let finalError = error;
  try {
    stopActiveVoices();
  } catch (cleanupError) {
    finalError = new AggregateError(
      [error, cleanupError],
      'Playback failed and active voices could not all be stopped cleanly.'
    );
  }
  settlePlaybackSession(session, null, finalError);
}

function startPlayback(events, timelineDurationSeconds) {
  if (!audioContext || !masterGain) {
    throw new Error('Call initAudio() from a user interaction before playback.');
  }
  if (audioContext.state !== 'running') {
    throw new Error('AudioContext is not running; call initAudio() before playback.');
  }

  stopAudio();
  const origin = audioContext.currentTime + SCHEDULER_START_LEAD_SECONDS;
  const lastNoteEnd = events.reduce((end, event) => {
    if (!event.tone) return end;
    return Math.max(
      end,
      origin + event.offsetSeconds + VOICE_ATTACK_SECONDS +
        event.tone.durationSeconds + VOICE_RELEASE_SECONDS
    );
  }, origin + timelineDurationSeconds);

  return new Promise((resolve, reject) => {
    const session = {
      events,
      nextEventIndex: 0,
      origin,
      endTime: lastNoteEnd,
      timer: null,
      settled: false,
      resolve,
      reject
    };
    activePlaybackSession = session;

    const pump = () => {
      if (activePlaybackSession !== session || session.settled) return;
      const now = audioContext.currentTime;
      const horizon = now + SCHEDULER_LOOKAHEAD_SECONDS;
      try {
        while (session.nextEventIndex < events.length) {
          const event = events[session.nextEventIndex];
          const startTime = origin + event.offsetSeconds;
          if (startTime > horizon) break;
          if (event.tone) scheduleTone(event.tone, startTime);
          session.nextEventIndex += 1;
        }
      } catch (error) {
        failPlaybackSession(session, error);
        return;
      }

      if (session.nextEventIndex === events.length && now >= session.endTime) {
        stopActiveVoices();
        settlePlaybackSession(session, undefined, null);
        return;
      }
      session.timer = setTimeout(pump, SCHEDULER_POLL_INTERVAL_MS);
    };

    pump();
  });
}

/**
 * Initializes or resumes the shared AudioContext.
 *
 * Call this from a direct user interaction handler, such as a button click.
 * Importing this module and calling setMasterVolume do not create an
 * AudioContext.
 * @returns {Promise<void>}
 */
export async function initAudio() {
  if (!audioContext) {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      throw new Error('Web Audio API is not supported by this browser.');
    }

    let context;
    try {
      context = new AudioContextConstructor();
      const gain = context.createGain();
      gain.gain.setValueAtTime(masterVolume, context.currentTime);
      gain.connect(context.destination);
      audioContext = context;
      masterGain = gain;
    } catch (error) {
      if (context && context.state !== 'closed' && typeof context.close === 'function') {
        try {
          await context.close();
        } catch (closeError) {
          throw new AggregateError(
            [error, closeError],
            'Audio initialization failed and the partially created AudioContext could not be closed.'
          );
        }
      }
      throw error;
    }
  }

  if (audioContext.state === 'closed') {
    throw new Error('The shared AudioContext is closed and cannot be reused.');
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
    if (audioContext.state === 'suspended') {
      throw new Error('AudioContext remains suspended; call initAudio from a user interaction.');
    }
  }
}

/**
 * Plays one mean-derived note per frame, starting at frameIndex and continuing
 * through the remaining v1.1 frames.
 *
 * Timestamped v1.1 sequences require timing.secondsPerSourceSecond.
 * Untimestamped v1.1 sequences require timing.frameIntervalSeconds.
 * A v1.0 brightness grid is treated as one frame and needs no timing object.
 *
 * @param {object} dataset - Complete v1.0 or v1.1 dataset.
 * @param {number} frameIndex - First frame to play; defaults to 0.
 * @param {{ secondsPerSourceSecond?: number, frameIntervalSeconds?: number }} timing
 * @returns {Promise<void>} Resolves after playback or explicit stopAudio() cancellation.
 */
export async function playGrid(dataset, frameIndex = 0, timing) {
  const prepared = prepareGridPlayback(dataset, frameIndex, timing);
  return startPlayback(prepared.events, prepared.timelineDurationSeconds);
}

/**
 * Plays the signed differences between two compatible datasets.
 *
 * Positive changes use the upper musical register.
 * Negative changes use the lower musical register.
 *
 * Call initAudio() from a user interaction before calling this function.
 *
 * @param {object} dataset2012 - Baseline dataset.
 * @param {object} dataset2023 - Comparison dataset.
 * @param {object} options - Comparison sonification options.
 * @returns {Promise<void>}
 */
export async function playComparison(
  dataset2012,
  dataset2023,
  options = {}
) {
  const prepared = prepareComparisonPlayback(
    dataset2012,
    dataset2023,
    options
  );

  return startPlayback(
    prepared.events,
    prepared.timelineDurationSeconds
  );
}


/**
 * Scans one selected frame in left-to-right column order.
 * @param {object} dataset - Complete v1.0 or v1.1 dataset.
 * @param {number} frameIndex - Frame to scan; defaults to 0.
 * @returns {Promise<void>}
 */
export async function scanGrid(dataset, frameIndex = 0) {
  const prepared = prepareGridScan(dataset, frameIndex);
  return startPlayback(prepared.events, prepared.timelineDurationSeconds);
}

/**
 * Stops scheduled and active voices without closing the reusable AudioContext.
 * Explicitly stopping a playGrid()/scanGrid() session resolves its Promise.
 */
export function stopAudio() {
  const session = activePlaybackSession;
  if (session) {
    settlePlaybackSession(session, undefined, null);
  }
  stopActiveVoices();
}

/**
 * Sets the master output level. The value is stored before initialization and
 * applied when initAudio creates the master gain node.
 * @param {number} value - Linear gain from 0 (mute) to 1 (full level).
 */
export function setMasterVolume(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('Master volume must be a finite number between 0 and 1.');
  }

  masterVolume = value;
  if (masterGain && audioContext && audioContext.state !== 'closed') {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(value, now, MASTER_VOLUME_RAMP_SECONDS);
  }
}
