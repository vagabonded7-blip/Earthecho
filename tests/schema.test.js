import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EXPECTED_SCHEMA_VERSION,
  EXPECTED_WIDTH,
  EXPECTED_HEIGHT,
  validateDataset,
  getFrameChannelValues,
  validateCompatibility,
  calculateFrameDifference
} from '../src/data/schema.js';

// Helper to construct a structurally compliant test fixture
function createCompliantFixture(id = 'test_fixture', frameCount = 2) {
  const blankRow = () => new Array(EXPECTED_WIDTH).fill(0.5);
  const blankGrid = () => Array.from({ length: EXPECTED_HEIGHT }, blankRow);

  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const grid = blankGrid();
    // Polar masks
    grid[0] = new Array(EXPECTED_WIDTH).fill(null);
    grid[31] = new Array(EXPECTED_WIDTH).fill(null);
    // Slight delta on cell [10][10]
    grid[10][10] = i === 0 ? 0.3 : 0.8;

    frames.push({
      frame_index: i,
      label: `Test Frame ${i}`,
      timestamp: `201${2 + i}`,
      values: {
        brightness: grid
      }
    });
  }

  return {
    schema_version: EXPECTED_SCHEMA_VERSION,
    id,
    title: 'NASA Test Visualization',
    source: {
      organization: 'NASA Goddard Space Flight Center',
      url: 'https://svs.gsfc.nasa.gov/5313/',
      attribution: 'NASA SVS'
    },
    width: EXPECTED_WIDTH,
    height: EXPECTED_HEIGHT,
    projection: 'equirectangular',
    description: 'Unit test fixture for schema 1.1 verification.',
    channels: [
      {
        id: 'brightness',
        name: 'Brightness Index',
        type: 'image_derived_index',
        unit: null,
        range: [0.0, 1.0]
      }
    ],
    normalization: {
      method: 'shared_linear',
      source_min: 0,
      source_max: 255
    },
    sonification_profile: {
      default_channel: 'brightness',
      scale: 'pentatonic_major',
      base_frequency: 220,
      pitch_mapping: { channel: 'brightness', min_hz: 110, max_hz: 880 }
    },
    frames
  };
}

test('Schema v1.1: Validates compliant multi-frame, multi-channel dataset', () => {
  const fixture = createCompliantFixture();
  const result = validateDataset(fixture);
  assert.equal(result.valid, true, `Errors: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);
});

test('Schema v1.1: Catches missing frames or invalid addressing', () => {
  const badFixture = createCompliantFixture();
  badFixture.frames = []; // Empty frames array
  const res = validateDataset(badFixture);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('non-empty array of frame objects')));
});

test('Schema v1.1: getFrameChannelValues retrieves values[channelId][y][x]', () => {
  const fixture = createCompliantFixture();
  const grid = getFrameChannelValues(fixture, 0, 'brightness');
  assert.equal(grid.length, 32);
  assert.equal(grid[0].length, 64);
  assert.equal(grid[0][0], null); // polar mask
  assert.equal(grid[10][10], 0.3);

  const gridFrame1 = getFrameChannelValues(fixture, 1, 'brightness');
  assert.equal(gridFrame1[10][10], 0.8);
});

test('Schema v1.1: validateCompatibility enforces semantic and dimensional match', () => {
  const a = createCompliantFixture('a');
  const b = createCompliantFixture('b');
  const comp = validateCompatibility(a, b);
  assert.equal(comp.compatible, true);

  // Mismatch type
  const badType = createCompliantFixture('c');
  badType.channels[0].type = 'unmatched_type';
  const badComp = validateCompatibility(a, badType);
  assert.equal(badComp.compatible, false);
  assert.ok(badComp.errors.some(e => e.includes('Semantic type mismatch')));
});

test('Schema v1.1: calculateFrameDifference calculates correct signed deltas', () => {
  const fixture = createCompliantFixture();
  const diff = calculateFrameDifference(fixture, fixture, 0, 1); // Frame 1 - Frame 0

  assert.equal(diff.deltaValues.length, 32);
  assert.equal(diff.deltaValues[0].length, 64);
  // Polar cell should be null
  assert.equal(diff.deltaValues[0][0], null);
  // Cell [10][10] delta = 0.8 - 0.3 = 0.5
  assert.equal(diff.deltaValues[10][10], 0.5);
  assert.equal(diff.stats.positiveCount, 1);
});

test('Schema v1.1: Manifest file is valid', () => {
  const manifest = JSON.parse(fs.readFileSync('./public/data/manifest.json', 'utf8'));
  assert.equal(manifest.schema_version, '1.1');
  assert.ok(Array.isArray(manifest.datasets));
});
