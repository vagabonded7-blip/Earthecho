import {
  midiToFrequency,
  selectScaleNote
} from './scales.js';

export { midiToFrequency, selectScaleNote };

const DEFAULT_BRIGHTNESS_OPTIONS = Object.freeze({
  tonicMidi: 60,
  minMidi: 48,
  maxMidi: 84,
  mode: 'majorPentatonic',
  silenceThreshold: 0,
  minVelocity: 0.15,
  maxVelocity: 0.8,
  minDurationSeconds: 0.12,
  maxDurationSeconds: 0.5,
  timbre: 'sine'
});

const DEFAULT_DENSITY_OPTIONS = Object.freeze({
  silenceThreshold: 0,
  minNotesPerSecond: 0.5,
  maxNotesPerSecond: 8
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

function validateUnitInterval(value, label) {
  requireFiniteNumber(value, label);
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
}

function normalizeAboveThreshold(value, threshold) {
  if (value <= threshold) return null;
  if (threshold === 1) return 1;
  const position = (value - threshold) / (1 - threshold);
  return Math.round(position * 1e12) / 1e12;
}

/**
 * Maps normalized brightness to a musical note and synthesis parameters.
 *
 * Null is preserved as unavailable data. Numeric inputs are clamped to [0, 1].
 * A value at or below silenceThreshold returns null (no sound). Mapping options
 * are deliberately separate from dataset JSON so a caller can pass verified
 * dataset-profile settings without this module assuming a v1.1 field layout.
 *
 * @param {number|null} brightness - Normalized brightness in [0, 1], or null.
 * @param {object} options
 * @returns {{
 *   midi: number,
 *   frequencyHz: number,
 *   velocity: number,
 *   durationSeconds: number,
 *   timbre?: string
 * }|null}
 */
export function mapBrightnessToSound(brightness, options = {}) {
  if (brightness === null) return null;
  requireFiniteNumber(brightness, 'Brightness');

  const config = { ...DEFAULT_BRIGHTNESS_OPTIONS, ...options };
  validateUnitInterval(config.silenceThreshold, 'silenceThreshold');
  validateUnitInterval(config.minVelocity, 'minVelocity');
  validateUnitInterval(config.maxVelocity, 'maxVelocity');
  if (config.minVelocity > config.maxVelocity) {
    throw new RangeError('Velocity range must satisfy 0 <= minVelocity <= maxVelocity <= 1.');
  }
  requireFiniteNumber(config.minDurationSeconds, 'minDurationSeconds');
  requireFiniteNumber(config.maxDurationSeconds, 'maxDurationSeconds');
  if (config.minDurationSeconds < 0 ||
      config.maxDurationSeconds < config.minDurationSeconds) {
    throw new RangeError('Duration range must satisfy 0 <= minDurationSeconds <= maxDurationSeconds.');
  }
  if (typeof config.timbre !== 'string' || config.timbre.length === 0) {
    throw new TypeError('timbre must be a non-empty string.');
  }

  const clampedBrightness = clamp(brightness, 0, 1);
  const position = normalizeAboveThreshold(clampedBrightness, config.silenceThreshold);
  if (position === null) return null;

  const midi = selectScaleNote(position, config);
  const velocity = config.minVelocity +
    position * (config.maxVelocity - config.minVelocity);
  const durationSeconds = config.minDurationSeconds +
    position * (config.maxDurationSeconds - config.minDurationSeconds);

  return {
    midi,
    frequencyHz: midiToFrequency(midi),
    velocity,
    durationSeconds,
    timbre: config.timbre
  };
}

/**
 * Maps a physical scalar through its declared channel range and sonification
 * profile. Raw measurement values are not modified or clamped.
 *
 * @param {number|null} value - Raw scalar in the channel's declared units.
 * @param {object} channel - Channel metadata with normalization and units.
 * @param {object} profile - Profile referencing the channel and defining a scale.
 * @returns {{
 *   midi: number,
 *   frequencyHz: number,
 *   velocity: number,
 *   durationSeconds: number,
 *   timbre: string,
 *   sourceValue: number,
 *   units: string
 * }|null}
 */
export function mapScalarToSound(value, channel, profile) {
  if (!channel || typeof channel !== 'object') {
    throw new TypeError('Channel metadata must be an object.');
  }
  if (!profile || typeof profile !== 'object') {
    throw new TypeError('Sonification profile must be an object.');
  }
  if (typeof channel.id !== 'string' || channel.id.length === 0) {
    throw new TypeError('Channel id must be a non-empty string.');
  }
  if (typeof channel.units !== 'string' || channel.units.length === 0) {
    throw new TypeError('Channel units must be a non-empty string.');
  }
  if (profile.channel_id !== channel.id) {
    throw new RangeError('Sonification profile channel_id must match the channel id.');
  }
  if (profile.mapping !== 'linear_scalar_to_scale') {
    throw new RangeError(`Unsupported scalar mapping "${profile.mapping}".`);
  }
  if (channel.normalization?.method !== 'linear') {
    throw new RangeError('Scalar channel normalization method must be "linear".');
  }

  const sourceMin = channel.normalization.source_min;
  const sourceMax = channel.normalization.source_max;
  requireFiniteNumber(sourceMin, 'normalization.source_min');
  requireFiniteNumber(sourceMax, 'normalization.source_max');
  const sourceRange = sourceMax - sourceMin;
  if (!Number.isFinite(sourceRange) || sourceRange <= 0) {
    throw new RangeError('normalization.source_max must be greater than source_min with a finite range.');
  }

  const scale = profile.scale;
  if (!scale || typeof scale !== 'object') {
    throw new TypeError('Sonification profile scale must be an object.');
  }
  const scaleOptions = {
    mode: scale.mode,
    tonicMidi: scale.tonic_midi,
    minMidi: scale.min_midi,
    maxMidi: scale.max_midi
  };
  selectScaleNote(0, scaleOptions);
  const velocity = profile.velocity;
  const duration = profile.duration_seconds;
  if (!velocity || typeof velocity !== 'object' ||
      !duration || typeof duration !== 'object') {
    throw new TypeError('Profile velocity and duration_seconds ranges must be objects.');
  }

  validateUnitInterval(velocity.min, 'profile.velocity.min');
  validateUnitInterval(velocity.max, 'profile.velocity.max');
  if (velocity.min > velocity.max) {
    throw new RangeError('Profile velocity range must satisfy min <= max.');
  }
  requireFiniteNumber(duration.min, 'profile.duration_seconds.min');
  requireFiniteNumber(duration.max, 'profile.duration_seconds.max');
  if (duration.min < 0 || duration.min > duration.max) {
    throw new RangeError('Profile duration_seconds range must satisfy 0 <= min <= max.');
  }
  const timbre = profile.timbre === undefined ? 'sine' : profile.timbre;
  if (typeof timbre !== 'string' || timbre.length === 0) {
    throw new TypeError('Profile timbre must be a non-empty string.');
  }

  if (value === null) return null;
  requireFiniteNumber(value, 'Scalar value');
  if (value < sourceMin || value > sourceMax) {
    throw new RangeError(
      `Scalar value ${value} ${channel.units} is outside the declared range [${sourceMin}, ${sourceMax}].`
    );
  }

  const position = (value - sourceMin) / sourceRange;
  const midi = selectScaleNote(position, scaleOptions);

  return {
    midi,
    frequencyHz: midiToFrequency(midi),
    velocity: velocity.min + position * (velocity.max - velocity.min),
    durationSeconds: duration.min + position * (duration.max - duration.min),
    timbre,
    sourceValue: value,
    units: channel.units
  };
}

/**
 * Maps the fraction of lit cells to note rate.
 *
 * Density is a proportion of valid cells considered lit, not a physical
 * measurement. Above the silence threshold, greater density produces a faster
 * note rate. At or below the threshold, the result is silent and has no interval.
 *
 * @param {number} litCellDensity - Proportion in [0, 1].
 * @param {object} options
 * @param {number} options.silenceThreshold - Density at/below which playback is silent.
 * @param {number} options.minNotesPerSecond - Rate at the threshold.
 * @param {number} options.maxNotesPerSecond - Rate at full density.
 * @returns {{
 *   noteDensity: number,
 *   notesPerSecond: number,
 *   intervalSeconds: number|null
 * }}
 */
export function mapLitCellDensityToRhythm(litCellDensity, options = {}) {
  requireFiniteNumber(litCellDensity, 'litCellDensity');

  const config = { ...DEFAULT_DENSITY_OPTIONS, ...options };
  validateUnitInterval(config.silenceThreshold, 'silenceThreshold');
  requireFiniteNumber(config.minNotesPerSecond, 'minNotesPerSecond');
  requireFiniteNumber(config.maxNotesPerSecond, 'maxNotesPerSecond');
  if (config.minNotesPerSecond <= 0 ||
      config.maxNotesPerSecond < config.minNotesPerSecond) {
    throw new RangeError('Note-rate range must satisfy 0 < minNotesPerSecond <= maxNotesPerSecond.');
  }

  const density = clamp(litCellDensity, 0, 1);
  const position = normalizeAboveThreshold(density, config.silenceThreshold);
  if (position === null) {
    return {
      noteDensity: 0,
      notesPerSecond: 0,
      intervalSeconds: null
    };
  }

  const notesPerSecond = config.minNotesPerSecond +
    position * (config.maxNotesPerSecond - config.minNotesPerSecond);

  return {
    noteDensity: density,
    notesPerSecond,
    intervalSeconds: 1 / notesPerSecond
  };
}
