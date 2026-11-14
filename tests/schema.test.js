import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDataset, validateGridPairCompatibility, calculateGridDifference } from '../src/data/schema.js';
import { mockNightLights2012, mockNightLights2023 } from '../src/data/mockData.js';

test('Schema Validation: mockNightLights2012 passes Common Data Interface v1.0', () => {
  const result = validateDataset(mockNightLights2012);
  assert.equal(result.valid, true, `Validation errors: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);
  assert.equal(mockNightLights2012.width, 64);
  assert.equal(mockNightLights2012.height, 32);
  assert.equal(mockNightLights2012.values.length, 32);
  for (const row of mockNightLights2012.values) {
    assert.equal(row.length, 64);
  }
});

test('Schema Validation: mockNightLights2023 passes Common Data Interface v1.0', () => {
  const result = validateDataset(mockNightLights2023);
  assert.equal(result.valid, true, `Validation errors: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);
  assert.equal(mockNightLights2023.width, 64);
  assert.equal(mockNightLights2023.height, 32);
  assert.equal(mockNightLights2023.values.length, 32);
});

test('Schema Validation: catches dimension mismatch and invalid values', () => {
  const badDimensions = {
    ...mockNightLights2012,
    width: 63,
    values: mockNightLights2012.values.map(r => r.slice(0, 63))
  };
  const dimResult = validateDataset(badDimensions);
  assert.equal(dimResult.valid, false);
  assert.ok(dimResult.errors.some(e => e.includes('Invalid width')));

  const badValue = JSON.parse(JSON.stringify(mockNightLights2012));
  badValue.values[10][10] = 1.25; // Out of range [0, 1]
  const valResult = validateDataset(badValue);
  assert.equal(valResult.valid, false);
  assert.ok(valResult.errors.some(e => e.includes('out of range')));
});

test('Grid Compatibility: validates 2012 and 2023 share dimensions and normalization', () => {
  const result = validateGridPairCompatibility(mockNightLights2012, mockNightLights2023);
  assert.equal(result.compatible, true, `Compatibility errors: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);

  const mismatchedNorm = {
    ...mockNightLights2023,
    normalization: { method: 'linear', source_min: 0, source_max: 100 }
  };
  const mismatchResult = validateGridPairCompatibility(mockNightLights2012, mismatchedNorm);
  assert.equal(mismatchResult.compatible, false);
  assert.ok(mismatchResult.errors.some(e => e.includes('Normalization mismatch')));
});

test('Difference Calculation: produces valid signed delta values in range [-1, +1]', () => {
  const { deltaValues, stats } = calculateGridDifference(mockNightLights2012, mockNightLights2023);

  assert.equal(deltaValues.length, 32);
  assert.equal(deltaValues[0].length, 64);

  // Check stats
  assert.equal(stats.totalCells, 64 * 32);
  assert.ok(stats.validCount > 0);
  assert.ok(stats.minDelta >= -1.0 && stats.maxDelta <= 1.0);
  assert.ok(stats.positiveCount > 0, 'Expect positive growth in synthetic 2023 data');

  // Polar masks (row 0, 1, 30, 31) should remain null in delta
  assert.equal(deltaValues[0][0], null);
  assert.equal(deltaValues[31][31], null);
});

test('Manifest & Public Data: static JSON files exist and pass validation', () => {
  const manifestRaw = fs.readFileSync('./public/data/manifest.json', 'utf8');
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.schema_version, '1.0');
  assert.ok(Array.isArray(manifest.datasets));
  assert.equal(manifest.datasets.length, 2);

  for (const ds of manifest.datasets) {
    const filePath = `./public${ds.path}`;
    assert.ok(fs.existsSync(filePath), `Dataset path ${filePath} does not exist`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const validation = validateDataset(data);
    assert.equal(validation.valid, true, `Validation failed for ${filePath}: ${validation.errors.join('; ')}`);
  }
});

