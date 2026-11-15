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

/**
 * Selectable Musical & Sonification Presets
 * Each preset defines acoustic envelope, filtering, spatial panning, and harmonic character,
 * while ensuring environmental data remains the primary driver of pitch, timing, and amplitude.
 */
export const AUDIO_PRESETS = Object.freeze({
  scientific: {
    id: 'scientific',
    name: 'Scientific',
    description: 'Clear, minimal data-to-sound representation with pure waveforms.',
    waveform: 'sine',
    attackSeconds: 0.02,
    releaseSeconds: 0.08,
    releaseLevel: 0.85,
    gainBoost: 1.0,
    useFilter: false,
    useSpatialPanning: false,
    harmonics: false
  },
  ambient: {
    id: 'ambient',
    name: 'Ambient',
    description: 'Soft, atmospheric musical texture with warm timbres and smooth envelopes.',
    waveform: 'triangle',
    attackSeconds: 0.045,
    releaseSeconds: 0.22,
    releaseLevel: 0.72,
    gainBoost: 1.25,
    useFilter: true,
    filterCutoffHz: 2600,
    useSpatialPanning: true,
    harmonics: true
  },
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Richer harmonies, dynamic spectral filtering, and spatial soundscape.',
    waveform: 'triangle',
    attackSeconds: 0.055,
    releaseSeconds: 0.32,
    releaseLevel: 0.65,
    gainBoost: 1.35,
    useFilter: true,
    filterDynamic: true,
    useSpatialPanning: true,
    harmonics: true
  }
});

/**
 * Tailored Sonification Profiles for Specific Environmental Scenarios:
 * 1. Night Lights — Electronic / Synth Music:
 *    Snappy analog synthesizer waveforms, resonant dynamic filter sweeps, and energetic spatial panning.
 * 2. Ocean — Ambient / Flowing Music:
 *    Deep hydroacoustic warmth, gentle rolling swell envelopes, and atmospheric stereo currents.
 * 3. Vegetation — Organic / Nature-Inspired Music:
 *    Warm wooden marimba and bamboo kalimba acoustic transients with natural resonant decay.
 */
export const SCENARIO_PROFILES = Object.freeze({
  night_lights: {
    id: 'night_lights',
    name: 'Night Lights (Electronic / Synth)',
    genre: 'Electronic / Synth Music',
    description: 'Crisp electronic synthesizer waveforms, dynamic resonant filter sweeps, and energetic spatial panning.',
    waveform: 'sawtooth',
    attackSeconds: 0.014,
    releaseSeconds: 0.16,
    releaseLevel: 0.70,
    gainBoost: 1.30,
    useFilter: true,
    filterDynamic: true,
    filterQ: 2.8,
    maxCutoffHz: 4200,
    useSpatialPanning: true,
    periodicWaveKey: 'electronic_synth'
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean (Ambient / Flowing)',
    genre: 'Ambient / Flowing Music',
    description: 'Deep hydroacoustic warmth, gentle rolling swell envelopes, and atmospheric stereo currents.',
    waveform: 'sine',
    attackSeconds: 0.075,
    releaseSeconds: 0.44,
    releaseLevel: 0.82,
    gainBoost: 1.35,
    useFilter: true,
    filterDynamic: false,
    filterCutoffHz: 1600,
    filterQ: 0.85,
    useSpatialPanning: true,
    periodicWaveKey: 'ambient_flowing'
  },
  vegetation: {
    id: 'vegetation',
    name: 'Vegetation (Organic / Nature-Inspired)',
    genre: 'Organic / Nature-Inspired Music',
    description: 'Warm wooden marimba and bamboo kalimba acoustic transients with natural resonant decay.',
    waveform: 'triangle',
    attackSeconds: 0.007,
    releaseSeconds: 0.28,
    releaseLevel: 0.55,
    gainBoost: 1.25,
    useFilter: true,
    filterDynamic: true,
    filterQ: 1.6,
    maxCutoffHz: 2600,
    useSpatialPanning: true,
    periodicWaveKey: 'organic_nature'
  }
});

let currentPresetId = 'ambient';
let activeScenarioId = 'night_lights';

export function getDatasetScenario(dataset) {
  if (!dataset) return 'night_lights';
  const group = dataset.comparison_group?.toLowerCase() || '';
  const id = dataset.id?.toLowerCase() || '';
  const title = dataset.title?.toLowerCase() || '';

  if (group.includes('ocean') || id.includes('ocean') || id.includes('sea') || title.includes('sea') || title.includes('ocean')) {
    return 'ocean';
  }
  if (group.includes('veg') || id.includes('veg') || title.includes('veg') || title.includes('ndvi') || title.includes('forest')) {
    return 'vegetation';
  }
  return 'night_lights';
}

export function setActiveScenario(scenarioId) {
  if (typeof scenarioId !== 'string') return SCENARIO_PROFILES[activeScenarioId];
  const s = scenarioId.toLowerCase();
  if (s.includes('ocean') || s.includes('ambient') || s.includes('flow')) {
    activeScenarioId = 'ocean';
  } else if (s.includes('veg') || s.includes('organic') || s.includes('nature')) {
    activeScenarioId = 'vegetation';
  } else {
    activeScenarioId = 'night_lights';
  }
  return SCENARIO_PROFILES[activeScenarioId];
}

export function getActiveScenario() {
  return activeScenarioId;
}

export function getScenarioProfiles() {
  return SCENARIO_PROFILES;
}

let audioContext = null;
let masterGain = null;
let masterCompressor = null;
let masterVolume = DEFAULT_MASTER_VOLUME;
let storedUnmutedVolume = DEFAULT_MASTER_VOLUME;
let activePlaybackSession = null;
const activeVoices = new Set();
let audioAnalyser = null;
const periodicWaveCache = new WeakMap();

export function getAudioAnalyser() {
  return audioAnalyser;
}

export function setAudioPreset(presetId) {
  if (typeof presetId !== 'string' || !AUDIO_PRESETS[presetId.toLowerCase()]) {
    throw new RangeError(
      `Unsupported audio preset "${presetId}". Available presets: ${Object.keys(AUDIO_PRESETS).join(', ')}.`
    );
  }
  currentPresetId = presetId.toLowerCase();
  return AUDIO_PRESETS[currentPresetId];
}

export function getAudioPreset() {
  return currentPresetId;
}

export function getAvailableAudioPresets() {
  return Object.values(AUDIO_PRESETS).map(({ id, name, description }) => ({
    id,
    name,
    description
  }));
}

function getAudioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function getPresetPeriodicWave(context, presetId) {
  if (!context || typeof context.createPeriodicWave !== 'function') return null;

  let contextCache = periodicWaveCache.get(context);
  if (!contextCache) {
    contextCache = new Map();
    periodicWaveCache.set(context, contextCache);
  }

  if (contextCache.has(presetId)) {
    return contextCache.get(presetId);
  }

  let wave = null;
  try {
    if (presetId === 'electronic_synth' || presetId === 'night_lights') {
      // Electronic / Synth: Analog synthesizer lead wave with dynamic overtone cascade
      const real = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const imag = new Float32Array([0, 0.85, 0.60, 0.45, 0.32, 0.22, 0.15, 0.10, 0.06]);
      wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
    } else if (presetId === 'ambient_flowing' || presetId === 'ocean' || presetId === 'ambient') {
      // Ambient / Flowing: Deep, warm hydroacoustic sinusoidal wave with soft fluid undertones
      const real = new Float32Array([0, 0, 0, 0, 0]);
      const imag = new Float32Array([0, 1.0, 0.22, 0.08, 0.02]);
      wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
    } else if (presetId === 'organic_nature' || presetId === 'vegetation') {
      // Organic / Nature-Inspired: Wooden marimba / bamboo acoustic bar resonance
      const real = new Float32Array([0, 0, 0, 0, 0, 0, 0]);
      const imag = new Float32Array([0, 1.0, 0.06, 0.38, 0.04, 0.16, 0.05]);
      wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
    } else if (presetId === 'cinematic') {
      // Expansive celestial pad with shimmering overtone series
      const real = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]);
      const imag = new Float32Array([0, 1.0, 0.40, 0.24, 0.16, 0.09, 0.04, 0.02]);
      wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
    }
  } catch {
    wave = null;
  }

  contextCache.set(presetId, wave);
  return wave;
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
  if (voice.filterCreated && !voice.filterDisconnected && voice.filter) {
    voice.filterDisconnected = true;
    try {
      voice.filter.disconnect();
    } catch (error) {
      if (!firstError) firstError = error;
    }
  }
  if (voice.gainCreated && !voice.gainDisconnected && voice.gain) {
    voice.gainDisconnected = true;
    try {
      voice.gain.disconnect();
    } catch (error) {
      if (!firstError) firstError = error;
    }
  }
  if (voice.pannerCreated && !voice.pannerDisconnected && voice.panner) {
    voice.pannerDisconnected = true;
    try {
      voice.panner.disconnect();
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

  const scenarioKey = tone.scenario || (tone.dataset ? getDatasetScenario(tone.dataset) : activeScenarioId);
  const scenarioProfile = scenarioKey ? SCENARIO_PROFILES[scenarioKey] : null;
  const preset = scenarioProfile || AUDIO_PRESETS[currentPresetId] || AUDIO_PRESETS.ambient;
  const oscillator = audioContext.createOscillator();
  const voice = {
    oscillator,
    gain: null,
    filter: null,
    panner: null,
    oscillatorCreated: true,
    gainCreated: false,
    filterCreated: false,
    pannerCreated: false,
    oscillatorDisconnected: false,
    gainDisconnected: false,
    filterDisconnected: false,
    pannerDisconnected: false,
    started: false,
    stopping: false
  };

  try {
    const gain = audioContext.createGain();
    voice.gain = gain;
    voice.gainCreated = true;

    // Optional BiquadFilter (when supported by browser and active preset)
    let filter = null;
    if (preset.useFilter && typeof audioContext.createBiquadFilter === 'function') {
      try {
        filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        const qVal = preset.filterQ || 1.0;
        let cutoff = 2400;
        if (preset.filterDynamic) {
          const maxCutoff = preset.maxCutoffHz || 4800;
          cutoff = Math.min(maxCutoff, Math.max(900, tone.frequencyHz * 3.2));
        } else {
          cutoff = preset.filterCutoffHz || 2600;
        }
        filter.frequency.setValueAtTime(cutoff, scheduledStart);
        filter.Q.setValueAtTime(qVal, scheduledStart);
        voice.filter = filter;
        voice.filterCreated = true;
      } catch {
        filter = null;
      }
    }

    // Optional StereoPanner (when supported by browser and active preset)
    let panner = null;
    if (preset.useSpatialPanning && typeof audioContext.createStereoPanner === 'function') {
      try {
        panner = audioContext.createStereoPanner();
        const panValue = Number.isFinite(tone.pan)
          ? Math.max(-0.85, Math.min(0.85, tone.pan))
          : 0;
        panner.pan.setValueAtTime(panValue, scheduledStart);
        voice.panner = panner;
        voice.pannerCreated = true;
      } catch {
        panner = null;
      }
    }

    // Dynamic Headroom & Volume Scaling:
    // Ensures comfortable, clear volume for 1-2 voices (~0.45 - 0.60)
    // while dynamically scaling headroom to guarantee multi-voice sum stays safe and musical.
    const activeCount = Math.max(1, activeVoices.size + 1);
    const voiceHeadroom = Math.min(0.75, 0.95 / Math.sqrt(activeCount));
    const perceptualVelocity = Math.max(0.35, Math.pow(tone.velocity, 0.65));
    const baseGain = voiceHeadroom * perceptualVelocity;
    const peakGain = Math.min(0.70, baseGain * (preset.gainBoost || 1.0));

    const attackDuration = preset.attackSeconds || VOICE_ATTACK_SECONDS;
    const releaseDuration = preset.releaseSeconds || VOICE_RELEASE_SECONDS;
    const releaseLevel = preset.releaseLevel || VOICE_RELEASE_LEVEL;

    const noteOnTime = scheduledStart + attackDuration;
    const noteOffTime = noteOnTime + tone.durationSeconds;
    const releaseEndTime = noteOffTime + releaseDuration;
    const gainParam = gain.gain;
    voice.endTime = releaseEndTime;

    // Apply timbre / waveform
    if (tone.timbre) {
      oscillator.type = tone.timbre;
    } else if (preset.id === 'scientific') {
      oscillator.type = 'sine';
    } else if (typeof audioContext.createPeriodicWave === 'function') {
      const waveKey = preset.periodicWaveKey || preset.id;
      const customWave = getPresetPeriodicWave(audioContext, waveKey);
      if (customWave) {
        oscillator.setPeriodicWave(customWave);
      } else {
        oscillator.type = preset.waveform || 'triangle';
      }
    } else {
      oscillator.type = preset.waveform || 'triangle';
    }

    oscillator.frequency.setValueAtTime(tone.frequencyHz, scheduledStart);
    gainParam.setValueAtTime(0, scheduledStart);
    gainParam.linearRampToValueAtTime(peakGain, noteOnTime);
    gainParam.setValueAtTime(peakGain * releaseLevel, noteOffTime);
    gainParam.linearRampToValueAtTime(0, releaseEndTime);

    oscillator.onended = () => finishVoice(voice);

    // Node connections:
    // oscillator -> [filter] -> gain -> [panner] -> masterGain
    if (filter) {
      oscillator.connect(filter);
      filter.connect(gain);
    } else {
      oscillator.connect(gain);
    }

    if (panner) {
      gain.connect(panner);
      panner.connect(masterGain);
    } else {
      gain.connect(masterGain);
    }

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

  if (dataset.schema_version === '1.0' || (!dataset.frames && Array.isArray(dataset.values))) {
    if (dataset.width !== 64 || dataset.height !== 32) {
      throw new RangeError('Schema v1.0 datasets must be 64 by 32.');
    }
    validateMatrix(dataset.values, dataset.width, dataset.height, 'dataset.values', true);
    return {
      version: '1.0',
      width: dataset.width,
      height: dataset.height,
      values: dataset.values,
      useScalarMapping: false
    };
  }

  if (dataset.schema_version !== '1.1') {
    throw new RangeError(`Unsupported dataset schema_version "${dataset.schema_version}".`);
  }

  validateDimensions(dataset);
  if (!Array.isArray(dataset.channels) || dataset.channels.length === 0) {
    throw new TypeError('Schema v1.1 dataset must declare at least one channel.');
  }

  // Path A: Strict synthetic test fixture declaring `sonification_profiles` array
  if (Array.isArray(dataset.sonification_profiles) && dataset.sonification_profiles.length > 0) {
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
      profile,
      useScalarMapping: true
    };
  }

  // Path B: Real NASA Schema v1.1 datasets with `sonification_profile` object
  if (!Array.isArray(dataset.frames) || dataset.frames.length === 0) {
    throw new TypeError('Schema v1.1 dataset must contain at least one frame.');
  }

  const rawProfile = dataset.sonification_profile || {};
  const defaultChannelId = rawProfile.default_channel || rawProfile.channel_id || dataset.channels[0].id;
  const channel = dataset.channels.find(c => c.id === defaultChannelId) || dataset.channels[0];

  const profile = {
    id: 'default',
    channel_id: channel.id,
    is_default: true,
    ...rawProfile
  };

  const useScalarMapping = channel.quantity_type === 'scalar' &&
    profile.mapping === 'linear_scalar_to_scale' &&
    typeof channel.units === 'string' && channel.units.length > 0;

  return {
    version: '1.1',
    width: dataset.width,
    height: dataset.height,
    frames: dataset.frames,
    channel,
    profile,
    useScalarMapping
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
  if (typeof timestamp !== 'string') {
    throw new TypeError(`Frame ${frameIndex} timestamp must be a string.`);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp)) {
    const milliseconds = Date.parse(timestamp);
    if (!Number.isFinite(milliseconds) ||
        new Date(milliseconds).toISOString().slice(0, 19) !== timestamp.slice(0, 19)) {
      throw new RangeError(`Frame ${frameIndex} timestamp is invalid.`);
    }
    return milliseconds;
  }
  if (/^\d{4}$/.test(timestamp)) {
    return Date.parse(`${timestamp}-01-01T00:00:00Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    return Date.parse(`${timestamp}T00:00:00Z`);
  }
  const ms = Date.parse(timestamp);
  if (Number.isFinite(ms)) {
    return ms;
  }
  throw new RangeError(`Frame ${frameIndex} timestamp is invalid.`);
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

  if (timestamps && Number.isFinite(timing.secondsPerSourceSecond) && timing.secondsPerSourceSecond > 0) {
    const scale = timing.secondsPerSourceSecond;
    return frames.slice(frameIndex).map((_, index) =>
      ((timestamps[frameIndex + index] - timestamps[frameIndex]) / 1000) * scale
    );
  }

  if (Number.isFinite(timing.frameIntervalSeconds) && timing.frameIntervalSeconds > 0) {
    const interval = timing.frameIntervalSeconds;
    return frames.slice(frameIndex).map((_, index) => index * interval);
  }

  if (timestamps) {
    throw new RangeError(
      'Timestamped playback requires a positive secondsPerSourceSecond timing value.'
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
  const scenario = getDatasetScenario(dataset);
  setActiveScenario(scenario);
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('frameIndex must be a non-negative integer.');
  }

  if (config.version === '1.0') {
    const matrix = getFrameValues(config, frameIndex);
    const mean = meanOfValidCells(matrix);
    return {
      events: [{ offsetSeconds: 0, tone: mean === null ? null : { ...mapBrightnessToSound(mean), scenario } }],
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
    if (config.useScalarMapping && config.channel?.normalization) {
      validateScalarMatrix(matrix, config, `frames[${index}].values.${config.channel.id}`);
    }
    const mean = meanOfValidCells(matrix);
    const tone = mean === null ? null : (
      config.useScalarMapping
        ? mapScalarToSound(mean, config.channel, config.profile)
        : mapBrightnessToSound(mean)
    );
    events.push({
      offsetSeconds: offsets[index - frameIndex],
      tone: tone ? { ...tone, scenario } : null
    });
  }

  return {
    events,
    timelineDurationSeconds: offsets.length > 0 ? offsets[offsets.length - 1] : 0
  };
}

function prepareGridScan(dataset, frameIndex) {
  const config = resolveDatasetAudioConfig(dataset);
  const scenario = getDatasetScenario(dataset);
  setActiveScenario(scenario);
  const matrix = getFrameValues(config, frameIndex);
  const events = [];
  let cellIndex = 0;

  for (let x = 0; x < config.width; x++) {
    const pan = ((x / Math.max(1, config.width - 1)) * 1.6) - 0.8;
    for (let y = 0; y < config.height; y++) {
      const value = matrix[y][x];
      let tone = null;
      if (value !== null) {
        tone = config.version === '1.0' || !config.useScalarMapping
          ? mapBrightnessToSound(value)
          : mapScalarToSound(value, config.channel, config.profile);
        if (tone) {
          tone = { ...tone, pan, scenario };
        }
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
  const preset = AUDIO_PRESETS[currentPresetId] || AUDIO_PRESETS.ambient;
  const attackDuration = preset.attackSeconds || VOICE_ATTACK_SECONDS;
  const releaseDuration = preset.releaseSeconds || VOICE_RELEASE_SECONDS;

  const lastNoteEnd = events.reduce((end, event) => {
    if (!event.tone) return end;
    return Math.max(
      end,
      origin + event.offsetSeconds + attackDuration +
        event.tone.durationSeconds + releaseDuration
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

      // Studio Master Limiter / Compressor for clipping prevention and dynamic punch
      if (typeof context.createDynamicsCompressor === 'function') {
        try {
          const compressor = context.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-6, context.currentTime);
          compressor.knee.setValueAtTime(8, context.currentTime);
          compressor.ratio.setValueAtTime(4, context.currentTime);
          compressor.attack.setValueAtTime(0.003, context.currentTime);
          compressor.release.setValueAtTime(0.15, context.currentTime);
          gain.connect(compressor);
          compressor.connect(context.destination);
          masterCompressor = compressor;
        } catch {
          gain.connect(context.destination);
        }
      } else {
        gain.connect(context.destination);
      }

      audioContext = context;
      masterGain = gain;

      if (typeof context.createAnalyser === 'function') {
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        gain.connect(analyser);
        audioAnalyser = analyser;
      }
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
  if (value > 0) {
    storedUnmutedVolume = value;
  }
  if (masterGain && audioContext && audioContext.state !== 'closed') {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(value, now, MASTER_VOLUME_RAMP_SECONDS);
  }
}

/**
 * Gets the current master volume level.
 * @returns {number}
 */
export function getMasterVolume() {
  return masterVolume;
}

/**
 * Returns whether master audio is currently muted.
 * @returns {boolean}
 */
export function isAudioMuted() {
  return masterVolume === 0;
}

/**
 * Mutes master output smoothly while remembering previous volume.
 */
export function muteAudio() {
  if (masterVolume > 0) {
    storedUnmutedVolume = masterVolume;
    setMasterVolume(0);
  }
}

/**
 * Unmutes master output smoothly, restoring previous volume.
 */
export function unmuteAudio() {
  if (masterVolume === 0) {
    setMasterVolume(storedUnmutedVolume > 0 ? storedUnmutedVolume : DEFAULT_MASTER_VOLUME);
  }
}

/**
 * Plays an overall musical soundscape of the visualization.
 * Sweeps across the columns from west to east over `durationSeconds` (default 14s),
 * voicing the most prominent features in each column using the musical scale.
 *
 * @param {object} dataset - Complete v1.0 or v1.1 dataset.
 * @param {number} frameIndex - Selected frame index.
 * @param {object} options
 * @returns {Promise<void>}
 */
export async function playSoundscape(dataset, frameIndex = 0, { durationSeconds = 14 } = {}) {
  const config = resolveDatasetAudioConfig(dataset);
  const matrix = getFrameValues(config, frameIndex);
  const events = [];
  const colInterval = durationSeconds / config.width;

  for (let x = 0; x < config.width; x++) {
    const colValues = [];
    for (let y = 0; y < config.height; y++) {
      const val = matrix[y][x];
      if (val !== null && val > 0) {
        colValues.push({ y, val });
      }
    }
    if (colValues.length === 0) continue;

    colValues.sort((a, b) => b.val - a.val);
    const topValues = colValues.slice(0, 2);
    const pan = ((x / Math.max(1, config.width - 1)) * 1.6) - 0.8;

    for (const item of topValues) {
      const tone = config.version === '1.0' || !config.useScalarMapping
        ? mapBrightnessToSound(item.val)
        : mapScalarToSound(item.val, config.channel, config.profile);
      if (tone) {
        events.push({
          offsetSeconds: x * colInterval,
          tone: {
            ...tone,
            pan,
            scenario: getDatasetScenario(dataset),
            durationSeconds: Math.min(Math.max(tone.durationSeconds, 0.28), 0.55)
          }
        });
      }
    }
  }

  return startPlayback(events, durationSeconds);
}

/**
 * Plays the sound of a single grid cell at coordinates (x, y).
 * Suitable for interactive cell exploration via mouse or keyboard.
 *
 * @param {object} dataset
 * @param {number} frameIndex
 * @param {number} x
 * @param {number} y
 * @returns {Promise<object|null>}
 */
export async function playCell(dataset, frameIndex = 0, x = 0, y = 0) {
  await initAudio();
  const config = resolveDatasetAudioConfig(dataset);
  const scenario = getDatasetScenario(dataset);
  setActiveScenario(scenario);
  const matrix = getFrameValues(config, frameIndex);
  if (y < 0 || y >= config.height || x < 0 || x >= config.width) {
    throw new RangeError(`Coordinates (${x}, ${y}) are out of grid bounds.`);
  }
  const value = matrix[y][x];
  if (value === null) return null;
  const tone = config.version === '1.0' || !config.useScalarMapping
    ? mapBrightnessToSound(value)
    : mapScalarToSound(value, config.channel, config.profile);
  if (tone) {
    const pan = ((x / Math.max(1, config.width - 1)) * 1.6) - 0.8;
    scheduleTone({ ...tone, pan, scenario }, audioContext.currentTime);
  }
  return tone;
}

/**
 * Plays a single prepared tone immediately (used for interactive probing of
 * derived values such as signed differences).
 * @param {object} tone - Tone from a mapping function.
 * @returns {Promise<object>}
 */
export async function playTone(tone) {
  await initAudio();
  scheduleTone(tone, audioContext.currentTime);
  return tone;
}
