/**
 * Earth Echo — Common Data Interface v1.0 Validation & Utilities
 *
 * Enforces the shared dataset specification:
 * - Dimensions: exactly 64 width x 32 height (32 rows x 64 columns)
 * - Coordinate convention: values[y][x], where y in [0, 31], x in [0, 63]
 * - Value range: [0.0, 1.0] or null
 * - Difference convention: delta = gridB[y][x] - gridA[y][x] (range [-1, 1] or null)
 */

export const EXPECTED_SCHEMA_VERSION = '1.0';
export const EXPECTED_WIDTH = 64;
export const EXPECTED_HEIGHT = 32;

/**
 * Validates a dataset object against the Common Data Interface v1.0 contract.
 * @param {object} dataset - Dataset object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDataset(dataset) {
  const errors = [];

  if (!dataset || typeof dataset !== 'object') {
    return { valid: false, errors: ['Dataset must be a non-null object.'] };
  }

  if (dataset.schema_version !== EXPECTED_SCHEMA_VERSION) {
    errors.push(`Invalid schema_version: expected "${EXPECTED_SCHEMA_VERSION}", received "${dataset.schema_version}".`);
  }

  if (!dataset.id || typeof dataset.id !== 'string') {
    errors.push('Missing or invalid "id": must be a non-empty string.');
  }

  if (!dataset.title || typeof dataset.title !== 'string') {
    errors.push('Missing or invalid "title": must be a non-empty string.');
  }

  if (dataset.width !== EXPECTED_WIDTH) {
    errors.push(`Invalid width: expected ${EXPECTED_WIDTH}, received ${dataset.width}.`);
  }

  if (dataset.height !== EXPECTED_HEIGHT) {
    errors.push(`Invalid height: expected ${EXPECTED_HEIGHT}, received ${dataset.height}.`);
  }

  if (!dataset.normalization || typeof dataset.normalization !== 'object') {
    errors.push('Missing "normalization" object.');
  } else {
    if (typeof dataset.normalization.source_min !== 'number' || isNaN(dataset.normalization.source_min)) {
      errors.push('normalization.source_min must be a valid number.');
    }
    if (typeof dataset.normalization.source_max !== 'number' || isNaN(dataset.normalization.source_max)) {
      errors.push('normalization.source_max must be a valid number.');
    }
    if (dataset.normalization.source_min >= dataset.normalization.source_max) {
      errors.push('normalization.source_min must be strictly less than normalization.source_max.');
    }
  }

  if (!Array.isArray(dataset.values)) {
    errors.push('Missing or invalid "values": must be a 2D array.');
    return { valid: false, errors };
  }

  if (dataset.values.length !== EXPECTED_HEIGHT) {
    errors.push(`values array length (rows) must be exactly ${EXPECTED_HEIGHT}, received ${dataset.values.length}.`);
  } else {
    for (let y = 0; y < dataset.values.length; y++) {
      const row = dataset.values[y];
      if (!Array.isArray(row)) {
        errors.push(`Row ${y} is not an array.`);
        break;
      }
      if (row.length !== EXPECTED_WIDTH) {
        errors.push(`Row ${y} length must be exactly ${EXPECTED_WIDTH}, received ${row.length}.`);
        break;
      }
      for (let x = 0; x < row.length; x++) {
        const val = row[x];
        if (val !== null) {
          if (typeof val !== 'number' || isNaN(val)) {
            errors.push(`Cell [${y}][${x}] is not a valid number or null: received ${val}.`);
            return { valid: false, errors };
          }
          if (val < 0.0 || val > 1.0) {
            errors.push(`Cell [${y}][${x}] value out of range [0, 1]: received ${val}.`);
            return { valid: false, errors };
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates whether two datasets are compatible for comparison or transition.
 * Both grids must meet schema v1.0, have identical dimensions, and shared normalization limits.
 * @param {object} gridA
 * @param {object} gridB
 * @returns {{ compatible: boolean, errors: string[] }}
 */
export function validateGridPairCompatibility(gridA, gridB) {
  const errors = [];

  const valA = validateDataset(gridA);
  if (!valA.valid) {
    errors.push(`Grid A failed validation: ${valA.errors.join('; ')}`);
  }

  const valB = validateDataset(gridB);
  if (!valB.valid) {
    errors.push(`Grid B failed validation: ${valB.errors.join('; ')}`);
  }

  if (errors.length > 0) {
    return { compatible: false, errors };
  }

  if (gridA.width !== gridB.width || gridA.height !== gridB.height) {
    errors.push(`Dimension mismatch: Grid A is ${gridA.width}x${gridA.height}, Grid B is ${gridB.width}x${gridB.height}.`);
  }

  if (
    gridA.normalization.source_min !== gridB.normalization.source_min ||
    gridA.normalization.source_max !== gridB.normalization.source_max
  ) {
    errors.push(
      `Normalization mismatch: Grid A has [${gridA.normalization.source_min}, ${gridA.normalization.source_max}], ` +
      `Grid B has [${gridB.normalization.source_min}, ${gridB.normalization.source_max}]. Shared normalization is required.`
    );
  }

  return {
    compatible: errors.length === 0,
    errors
  };
}

/**
 * Computes difference grid between two compatible observations:
 * delta = gridB.values[y][x] - gridA.values[y][x]
 * Range: [-1.0, +1.0], or null if either cell is null.
 *
 * @param {object} gridA - Base observation
 * @param {object} gridB - Target observation
 * @returns {{ deltaValues: Array<Array<number|null>>, stats: object }}
 */
export function calculateGridDifference(gridA, gridB) {
  const compatibility = validateGridPairCompatibility(gridA, gridB);
  if (!compatibility.compatible) {
    throw new Error(`Cannot calculate difference: ${compatibility.errors.join(' ')}`);
  }

  const deltaValues = [];
  let minDelta = Infinity;
  let maxDelta = -Infinity;
  let sumDelta = 0;
  let validCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let unchangedCount = 0;
  let nullCount = 0;

  for (let y = 0; y < gridA.height; y++) {
    const row = [];
    for (let x = 0; x < gridA.width; x++) {
      const a = gridA.values[y][x];
      const b = gridB.values[y][x];

      if (a === null || b === null) {
        row.push(null);
        nullCount++;
      } else {
        const delta = Number((b - a).toFixed(6));
        row.push(delta);
        validCount++;
        sumDelta += delta;
        if (delta < minDelta) minDelta = delta;
        if (delta > maxDelta) maxDelta = delta;

        if (delta > 0.001) positiveCount++;
        else if (delta < -0.001) negativeCount++;
        else unchangedCount++;
      }
    }
    deltaValues.push(row);
  }

  return {
    deltaValues,
    stats: {
      totalCells: gridA.width * gridA.height,
      validCount,
      nullCount,
      minDelta: validCount > 0 ? minDelta : 0,
      maxDelta: validCount > 0 ? maxDelta : 0,
      meanDelta: validCount > 0 ? sumDelta / validCount : 0,
      positiveCount,
      negativeCount,
      unchangedCount
    }
  };
}

