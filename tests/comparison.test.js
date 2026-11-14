
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapDifferenceToSound,
  prepareComparisonPlayback
} from '../src/audio/comparison.js';

function makeDataset(id, value, options = {}) {
  const width = options.width ?? 64;
  const height = options.height ?? 32;

  return {
    schema_version: '1.0',
    id,
    title: id,
    width,
    height,
    normalization: {
      source_min: 0,
      source_max: 255
    },
    values: Array.from(
      { length: height },
      () => Array(width).fill(value)
    )
  };
}

describe('mapDifferenceToSound', () => {
  it('maps positive differences to the upper register', () => {
    const result = mapDifferenceToSound(0.5);

    assert.ok(result);
    assert.equal(result.direction, 'increase');
    assert.ok(result.midi >= 66);
    assert.ok(Number.isFinite(result.frequencyHz));
  });

  it('maps negative differences to the lower register', () => {
    const result = mapDifferenceToSound(-0.5);

    assert.ok(result);
    assert.equal(result.direction, 'decrease');
    assert.ok(result.midi <= 66);
    assert.ok(Number.isFinite(result.frequencyHz));
  });

  it('maps positive and negative changes differently', () => {
    const increase = mapDifferenceToSound(0.5);
    const decrease = mapDifferenceToSound(-0.5);

    assert.notEqual(increase.midi, decrease.midi);
  });

  it('returns null for zero and changes below the silence threshold', () => {
    assert.equal(mapDifferenceToSound(0), null);
    assert.equal(mapDifferenceToSound(0.005), null);
  });

  it('returns null for missing values', () => {
    assert.equal(mapDifferenceToSound(null), null);
  });

  it('rejects differences outside the supported range', () => {
    assert.throws(() => mapDifferenceToSound(1.5), RangeError);
    assert.throws(() => mapDifferenceToSound(-1.5), RangeError);
    assert.throws(() => mapDifferenceToSound(NaN), RangeError);
  });

  it('rejects invalid options', () => {
    assert.throws(
      () => mapDifferenceToSound(0.5, { silenceThreshold: 1 }),
      RangeError
    );

    assert.throws(
      () => mapDifferenceToSound(0.5, { scanIntervalSeconds: 0 }),
      RangeError
    );
  });

  it('rejects MIDI ranges without enough notes for both directions', () => {
    assert.throws(
      () => mapDifferenceToSound(0.5, {
        minMidi: 60,
        maxMidi: 61
      }),
      RangeError
    );
  });
});

describe('prepareComparisonPlayback', () => {
  it('creates one event for every grid cell', () => {
    const baseline = makeDataset('baseline', 0.2);
    const comparison = makeDataset('comparison', 0.4);

    const result = prepareComparisonPlayback(baseline, comparison);

    assert.equal(result.events.length, 64 * 32);
    assert.equal(result.stats.validCount, 64 * 32);
  });

  it('calculates the expected difference and sound direction', () => {
    const baseline = makeDataset('baseline', 0.2);
    const comparison = makeDataset('comparison', 0.7);

    const result = prepareComparisonPlayback(baseline, comparison);
    const firstEvent = result.events[0];

    assert.ok(Math.abs(firstEvent.difference - 0.5) < 0.000001);
    assert.equal(firstEvent.tone.direction, 'increase');
  });

  it('preserves column-first scan order', () => {
    const baseline = makeDataset('baseline', 0.2);
    const comparison = makeDataset('comparison', 0.4);

    const result = prepareComparisonPlayback(baseline, comparison);

    assert.deepEqual(
      result.events.slice(0, 3).map(({ x, y }) => [x, y]),
      [[0, 0], [0, 1], [0, 2]]
    );

    assert.deepEqual(
      [result.events[32].x, result.events[32].y],
      [1, 0]
    );
  });

  it('uses the configured scan interval', () => {
    const baseline = makeDataset('baseline', 0.2);
    const comparison = makeDataset('comparison', 0.4);

    const result = prepareComparisonPlayback(
      baseline,
      comparison,
      { scanIntervalSeconds: 0.05 }
    );

    assert.equal(result.events[1].offsetSeconds, 0.05);
  });

  it('rejects incompatible datasets', () => {
    const baseline = makeDataset('baseline', 0.2);
    const comparison = makeDataset('comparison', 0.4, {
      width: 32
    });

    assert.throws(
      () => prepareComparisonPlayback(baseline, comparison),
      /incompatible/i
    );
  });
});
