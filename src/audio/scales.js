const SCALE_INTERVALS = Object.freeze({
  majorPentatonic: Object.freeze([0, 2, 4, 7, 9]),
  mohanam: Object.freeze([0, 2, 4, 7, 9])
});

const DEFAULT_OPTIONS = Object.freeze({
  tonicMidi: 60,
  minMidi: 48,
  maxMidi: 84,
  mode: 'majorPentatonic'
});

/**
 * Converts a MIDI note number to frequency using the standard A4 = 440 Hz reference.
 * Fractional MIDI numbers are supported.
 * @param {number} midi - MIDI note number.
 * @returns {number} Frequency in hertz.
 */
export function midiToFrequency(midi) {
  if (!Number.isFinite(midi)) {
    throw new TypeError('MIDI note must be a finite number.');
  }

  return 440 * (2 ** ((midi - 69) / 12));
}

/**
 * Returns the scale notes within an inclusive MIDI range.
 * tonicMidi identifies the tonic pitch class; its octave does not limit the range.
 *
 * Mohanam is the Carnatic raga with the ascent S R2 G3 P D2 S and descent
 * S D2 P G3 R2 S. In 12-tone equal temperament these swaras use semitone
 * offsets [0, 2, 4, 7, 9], the same pitch classes as major pentatonic.
 * The modes are therefore not different note sets here; Mohanam's distinct
 * identity lies in its melodic grammar and tradition, which this utility does
 * not encode.
 *
 * @param {object} options
 * @param {number} options.tonicMidi - MIDI note defining the tonic pitch class.
 * @param {number} options.minMidi - Lowest allowed MIDI note, inclusive.
 * @param {number} options.maxMidi - Highest allowed MIDI note, inclusive.
 * @param {'majorPentatonic'|'mohanam'} options.mode
 * @returns {number[]} Ascending MIDI notes in the selected scale and range.
 */
export function getScaleNotes(options = {}) {
  const { tonicMidi, minMidi, maxMidi, mode } = { ...DEFAULT_OPTIONS, ...options };

  if (!Number.isInteger(tonicMidi) || tonicMidi < 0 || tonicMidi > 127) {
    throw new RangeError('tonicMidi must be an integer from 0 to 127.');
  }
  if (!Number.isInteger(minMidi) || minMidi < 0 || minMidi > 127) {
    throw new RangeError('minMidi must be an integer from 0 to 127.');
  }
  if (!Number.isInteger(maxMidi) || maxMidi < 0 || maxMidi > 127) {
    throw new RangeError('maxMidi must be an integer from 0 to 127.');
  }
  if (minMidi > maxMidi) {
    throw new RangeError('minMidi must be less than or equal to maxMidi.');
  }

  const intervals = SCALE_INTERVALS[mode];
  if (!intervals) {
    throw new RangeError(`Unsupported scale mode "${mode}".`);
  }

  const tonicPitchClass = tonicMidi % 12;
  const pitchClasses = new Set(intervals.map(interval => (tonicPitchClass + interval) % 12));
  const notes = [];

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    if (pitchClasses.has(midi % 12)) notes.push(midi);
  }

  return notes;
}

/**
 * Quantizes a MIDI note to the nearest note in the selected scale.
 * Exact ties resolve to the lower note for deterministic behavior.
 * @param {number} midi - MIDI note to quantize.
 * @param {object} options - Options accepted by getScaleNotes().
 * @returns {number} Nearest in-range scale note.
 */
export function quantizeMidiToScale(midi, options = {}) {
  if (!Number.isFinite(midi)) {
    throw new TypeError('MIDI note must be a finite number.');
  }

  const notes = getScaleNotes(options);
  if (notes.length === 0) {
    throw new RangeError('The selected MIDI range contains no notes from this scale.');
  }

  let closest = notes[0];
  let closestDistance = Math.abs(midi - closest);

  for (let index = 1; index < notes.length; index++) {
    const distance = Math.abs(midi - notes[index]);
    if (distance < closestDistance) {
      closest = notes[index];
      closestDistance = distance;
    }
  }

  return closest;
}

/**
 * Selects a scale note by normalized position. 0 selects the lowest note,
 * 1 selects the highest, and intermediate values are evenly distributed.
 * Values outside [0, 1] are clamped.
 * @param {number} position - Normalized position.
 * @param {object} options - Options accepted by getScaleNotes().
 * @returns {number} Selected MIDI note.
 */
export function selectScaleNote(position, options = {}) {
  if (!Number.isFinite(position)) {
    throw new TypeError('Scale position must be a finite number.');
  }

  const notes = getScaleNotes(options);
  if (notes.length === 0) {
    throw new RangeError('The selected MIDI range contains no notes from this scale.');
  }

  const clampedPosition = Math.min(1, Math.max(0, position));
  const index = Math.round(clampedPosition * (notes.length - 1));
  return notes[index];
}
