import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getScaleNotes,
  midiToFrequency,
  quantizeMidiToScale,
  selectScaleNote
} from '../src/audio/scales.js';

test('MIDI conversion uses A4 = 440 Hz', () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(60) - 261.625565) < 0.000001);
  assert.ok(Math.abs(midiToFrequency(81) - 880) < 0.000001);
});

test('major pentatonic notes are deterministic and stay in the configured range', () => {
  const options = { tonicMidi: 60, minMidi: 60, maxMidi: 72 };
  assert.deepEqual(getScaleNotes(options), [60, 62, 64, 67, 69, 72]);
  assert.deepEqual(getScaleNotes(options), getScaleNotes(options));
});

test('tonic and range can be configured', () => {
  assert.deepEqual(
    getScaleNotes({ tonicMidi: 62, minMidi: 62, maxMidi: 74 }),
    [62, 64, 66, 69, 71, 74]
  );
});

test('Mohanam documents the same equal-tempered pitch classes without implying a different set', () => {
  const range = { tonicMidi: 60, minMidi: 60, maxMidi: 72 };
  assert.deepEqual(
    getScaleNotes({ ...range, mode: 'mohanam' }),
    getScaleNotes({ ...range, mode: 'majorPentatonic' })
  );
});

test('quantization chooses the nearest scale note and resolves ties downward', () => {
  const options = { tonicMidi: 60, minMidi: 60, maxMidi: 72 };
  assert.equal(quantizeMidiToScale(63, options), 62);
  assert.equal(quantizeMidiToScale(65, options), 64);
});

test('normalized selection is monotonic and clamps to the configured endpoints', () => {
  const options = { tonicMidi: 60, minMidi: 60, maxMidi: 72 };
  const selected = [0, 0.25, 0.5, 0.75, 1].map(value => selectScaleNote(value, options));
  assert.deepEqual(selected, [60, 62, 67, 69, 72]);
  assert.equal(selectScaleNote(-1, options), 60);
  assert.equal(selectScaleNote(2, options), 72);
});

test('invalid MIDI values and unsupported configurations are surfaced', () => {
  assert.throws(() => midiToFrequency(NaN), TypeError);
  assert.throws(() => getScaleNotes({ mode: 'minor' }), RangeError);
  assert.throws(
    () => getScaleNotes({ minMidi: 70, maxMidi: 60 }),
    RangeError
  );
});
