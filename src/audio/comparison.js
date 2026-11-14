
import {
  validateGridPairCompatibility,
  calculateGridDifference
} from '../data/schema.js';

import {
  selectScaleNote,
  midiToFrequency
} from './scales.js';

const DEFAULT_OPTIONS = Object.freeze({
  tonicMidi: 60,
  minMidi: 48,
  maxMidi: 84,
  mode: 'majorPentatonic',
  silenceThreshold: 0.01,
  minVelocity: 0.15,
  maxVelocity: 0.8,
  minDurationSeconds: 0.12,
  maxDurationSeconds: 0.5,
  timbre: 'sine',
  scanIntervalSeconds: 0.12
});

/**
 * Validates comparison sonification options.
 * Ensures that both positive and negative changes have
 * at least one available note in their respective registers.
 */
function validateOptions(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  if (
    !Number.isFinite(config.silenceThreshold) ||
    config.silenceThreshold < 0 ||
    config.silenceThreshold >= 1
  ) {
    throw new RangeError(
      'silenceThreshold must be between 0 (inclusive) and 1 (exclusive).'
    );
  }

  if (
    !Number.isFinite(config.minVelocity) ||
    !Number.isFinite(config.maxVelocity) ||
    config.minVelocity < 0 ||
    config.maxVelocity > 1 ||
    config.minVelocity > config.maxVelocity
  ) {
    throw new RangeError('Invalid velocity range.');
  }

  if (
    !Number.isFinite(config.minDurationSeconds) ||
    !Number.isFinite(config.maxDurationSeconds) ||
    config.minDurationSeconds <= 0 ||
    config.maxDurationSeconds < config.minDurationSeconds
  ) {
    throw new RangeError('Invalid duration range.');
  }

  if (
    !Number.isFinite(config.scanIntervalSeconds) ||
    config.scanIntervalSeconds <= 0
  ) {
    throw new RangeError('scanIntervalSeconds must be positive.');
  }

  if (typeof config.timbre !== 'string' || !config.timbre.trim()) {
    throw new TypeError('timbre must be a non-empty string.');
  }

  if (
    !Number.isFinite(config.minMidi) ||
    !Number.isFinite(config.maxMidi) ||
    config.minMidi > config.maxMidi
  ) {
    throw new RangeError('Invalid MIDI range.');
  }

  const midpoint = (config.minMidi + config.maxMidi) / 2;

  const lowerRegister = {
    ...config,
    minMidi: config.minMidi,
    maxMidi: Math.floor(midpoint)
  };

  const upperRegister = {
    ...config,
    minMidi: Math.ceil(midpoint),
    maxMidi: config.maxMidi
  };

  // Validate the musical scale in both registers.
  // This also surfaces unsupported modes and invalid tonic settings.
  try {
    selectScaleNote(0.5, lowerRegister);
  } catch {
    throw new RangeError(
      'The lower MIDI register contains no available notes in the selected scale.'
    );
  }

  try {
    selectScaleNote(0.5, upperRegister);
  } catch {
    throw new RangeError(
      'The upper MIDI register contains no available notes in the selected scale.'
    );
  }

  return config;
}

/**
 * Converts a signed brightness difference into a musical tone.
 *
 * Positive changes use the upper register.
 * Negative changes use the lower register.
 * Small changes below the silence threshold produce no sound.
 *
 * @param {number|null} delta - Signed difference in [-1, 1].
 * @param {object} options - Sonification configuration.
 * @returns {object|null} Musical tone or null.
 */
export function mapDifferenceToSound(delta, options = {}) {
  if (delta !== null &&
      (!Number.isFinite(delta) || delta < -1 || delta > 1)) {
    throw new RangeError(
      'Difference must be a finite number between -1 and 1.'
    );
  }

  const config = validateOptions(options);

  if (delta === null) {
    return null;
  }

  const magnitude = Math.abs(delta);

  if (magnitude <= config.silenceThreshold) {
    return null;
  }

  const position =
    (magnitude - config.silenceThreshold) /
    (1 - config.silenceThreshold);

  const midpoint = (config.minMidi + config.maxMidi) / 2;

  const registerOptions = delta > 0
    ? {
        ...config,
        minMidi: Math.ceil(midpoint),
        maxMidi: config.maxMidi
      }
    : {
        ...config,
        minMidi: config.minMidi,
        maxMidi: Math.floor(midpoint)
      };

  const midi = selectScaleNote(position, registerOptions);

  return {
    midi,
    frequencyHz: midiToFrequency(midi),

    velocity:
      config.minVelocity +
      position * (config.maxVelocity - config.minVelocity),

    durationSeconds:
      config.minDurationSeconds +
      position * (
        config.maxDurationSeconds -
        config.minDurationSeconds
      ),

    timbre: config.timbre,
    direction: delta > 0 ? 'increase' : 'decrease',
    difference: delta
  };
}

/**
 * Prepares comparison playback events from two compatible datasets.
 *
 * Scanning order:
 * - First column, from top to bottom.
 * - Then the next column.
 * - Continues until the entire grid is scanned.
 *
 * Each grid cell receives a timeline position.
 * Cells with null or insignificant differences remain silent.
 *
 * @param {object} dataset2012 - Baseline dataset.
 * @param {object} dataset2023 - Comparison dataset.
 * @param {object} options - Sonification configuration.
 * @returns {object} Prepared events, statistics and timeline duration.
 */
export function prepareComparisonPlayback(
  dataset2012,
  dataset2023,
  options = {}
) {
  const config = validateOptions(options);

  const compatibility = validateGridPairCompatibility(
    dataset2012,
    dataset2023
  );

  if (!compatibility.compatible) {
    throw new Error(
      `Datasets are incompatible: ${compatibility.errors.join('; ')}`
    );
  }

  const comparison = calculateGridDifference(
    dataset2012,
    dataset2023
  );

  const events = [];

  for (let x = 0; x < dataset2012.width; x++) {
    for (let y = 0; y < dataset2012.height; y++) {
      const delta = comparison.deltaValues[y][x];

      events.push({
        offsetSeconds:
          events.length * config.scanIntervalSeconds,

        tone: mapDifferenceToSound(delta, config),

        x,
        y,
        difference: delta
      });
    }
  }

  return {
    events,
    stats: comparison.stats,

    timelineDurationSeconds:
      events.length * config.scanIntervalSeconds
  };
}
