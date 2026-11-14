import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapBrightnessToSound,
  mapLitCellDensityToRhythm,
  mapScalarToSound
} from '../src/audio/mapping.js';

const temperatureChannel = {
  id: 'surface_temperature',
  units: 'degC',
  normalization: {
    method: 'linear',
    source_min: -10,
    source_max: 30
  }
};

const temperatureProfile = {
  channel_id: 'surface_temperature',
  mapping: 'linear_scalar_to_scale',
  scale: {
    mode: 'majorPentatonic',
    tonic_midi: 60,
    min_midi: 48,
    max_midi: 84
  },
  velocity: { min: 0.15, max: 0.8 },
  duration_seconds: { min: 0.12, max: 0.5 }
};

test('brightness maps monotonically to scale pitch, velocity, and duration', () => {
  const low = mapBrightnessToSound(0.2);
  const high = mapBrightnessToSound(0.9);

  assert.ok(low.midi < high.midi);
  assert.ok(low.frequencyHz < high.frequencyHz);
  assert.ok(low.velocity < high.velocity);
  assert.ok(low.durationSeconds < high.durationSeconds);
  assert.equal(low.timbre, 'sine');
});

test('null and values at the silence threshold produce no sound', () => {
  assert.equal(mapBrightnessToSound(null), null);
  assert.equal(mapBrightnessToSound(0), null);
  assert.equal(mapBrightnessToSound(0.2, { silenceThreshold: 0.2 }), null);
});

test('brightness is clamped and threshold uses the remaining dynamic range', () => {
  assert.deepEqual(mapBrightnessToSound(-2), null);
  const capped = mapBrightnessToSound(2);
  const maximum = mapBrightnessToSound(1);
  assert.deepEqual(capped, maximum);

  const thresholdMapping = mapBrightnessToSound(0.6, { silenceThreshold: 0.2 });
  assert.deepEqual(thresholdMapping, mapBrightnessToSound(0.5));
});

test('brightness mapping accepts scale and output-range configuration', () => {
  const result = mapBrightnessToSound(1, {
    tonicMidi: 62,
    minMidi: 62,
    maxMidi: 74,
    mode: 'majorPentatonic',
    minVelocity: 0.2,
    maxVelocity: 0.6,
    minDurationSeconds: 0.2,
    maxDurationSeconds: 0.4,
    timbre: 'triangle'
  });

  assert.equal(result.midi, 74);
  assert.equal(result.velocity, 0.6);
  assert.equal(result.durationSeconds, 0.4);
  assert.equal(result.timbre, 'triangle');
});

test('higher lit-cell density increases note rate', () => {
  const sparse = mapLitCellDensityToRhythm(0.2);
  const dense = mapLitCellDensityToRhythm(0.8);

  assert.ok(sparse.notesPerSecond < dense.notesPerSecond);
  assert.ok(sparse.intervalSeconds > dense.intervalSeconds);
  assert.ok(sparse.noteDensity < dense.noteDensity);
});

test('density threshold and clamping are handled deterministically', () => {
  assert.deepEqual(
    mapLitCellDensityToRhythm(0.1, { silenceThreshold: 0.1 }),
    { noteDensity: 0, notesPerSecond: 0, intervalSeconds: null }
  );
  assert.deepEqual(
    mapLitCellDensityToRhythm(2),
    mapLitCellDensityToRhythm(1)
  );
});

test('invalid inputs and mapping ranges are surfaced', () => {
  assert.throws(() => mapBrightnessToSound(Number.NaN), TypeError);
  assert.throws(
    () => mapBrightnessToSound(0.5, { silenceThreshold: 1.1 }),
    RangeError
  );
  assert.throws(() => mapLitCellDensityToRhythm(Infinity), TypeError);
  assert.throws(
    () => mapLitCellDensityToRhythm(0.5, { minNotesPerSecond: 0 }),
    RangeError
  );
});

test('scalar mapping preserves physical values and maps increasing values to higher pitches', () => {
  const low = mapScalarToSound(-10, temperatureChannel, temperatureProfile);
  const high = mapScalarToSound(30, temperatureChannel, temperatureProfile);

  assert.equal(low.sourceValue, -10);
  assert.equal(low.units, 'degC');
  assert.equal(low.midi, 48);
  assert.equal(high.sourceValue, 30);
  assert.equal(high.units, 'degC');
  assert.equal(high.midi, 84);
  assert.ok(low.frequencyHz < high.frequencyHz);
  assert.ok(low.velocity < high.velocity);
  assert.ok(low.durationSeconds < high.durationSeconds);
});

test('scalar nulls remain unavailable and are not treated as zero', () => {
  assert.equal(mapScalarToSound(null, temperatureChannel, temperatureProfile), null);
});

test('scalar mapping rejects invalid ranges and samples outside declared bounds', () => {
  assert.throws(
    () => mapScalarToSound(-11, temperatureChannel, temperatureProfile),
    /outside the declared range/
  );
  assert.throws(
    () => mapScalarToSound(1, {
      ...temperatureChannel,
      normalization: { method: 'linear', source_min: 5, source_max: 5 }
    }, temperatureProfile),
    /source_max must be greater/
  );
  assert.throws(
    () => mapScalarToSound(1, {
      ...temperatureChannel,
      normalization: { method: 'linear', source_min: Number.NaN, source_max: 5 }
    }, temperatureProfile),
    /finite number/
  );
});
