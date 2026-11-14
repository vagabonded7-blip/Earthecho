/**
 * Earth Echo — Common Data Interface v1.0 & v1.1 Validation & Utilities
 *
 * Enforces both Schema v1.0 (legacy single-grid) and Schema v1.1 (multi-frame, multi-channel):
 * - schema_version: "1.0" or "1.1"
 * - Dimensions: exactly 64 width x 32 height (32 rows x 64 columns)
 * - Addressing v1.0: dataset.values[y][x]
 * - Addressing v1.1: dataset.frames[frameIndex].values[channelId][y][x]
 * - Coordinates: y in [0, 31], x in [0, 63] (image-grid convention)
 */

export const EXPECTED_SCHEMA_VERSION = '1.1';
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0', '1.1'];
export const EXPECTED_WIDTH = 64;
export const EXPECTED_HEIGHT = 32;

/**
 * Validates a dataset object against Schema v1.0 or v1.1 contract.
 * @param {object} dataset - Full dataset object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDataset(dataset) {
  const errors = [];

  if (!dataset || typeof dataset !== 'object') {
    return { valid: false, errors: ['Dataset must be a non-null object.'] };
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(dataset.schema_version)) {
    errors.push(`Invalid schema_version: expected one of [${SUPPORTED_SCHEMA_VERSIONS.join(', ')}], received "${dataset.schema_version}".`);
  }

  if (!dataset.id || typeof dataset.id !== 'string') {
    errors.push('Missing or invalid "id": must be a non-empty string.');
  }

  if (!dataset.title || typeof dataset.title !== 'string') {
    errors.push('Missing or invalid "title": must be a non-empty string.');
  }

  if (dataset.source && typeof dataset.source === 'object') {
    if (!dataset.source.organization) errors.push('source.organization must be specified.');
    if (dataset.schema_version === '1.1') {
      if (!dataset.source.url) errors.push('source.url must be specified in schema 1.1.');
      if (!dataset.source.attribution) errors.push('source.attribution must be specified in schema 1.1.');
    }
  } else if (dataset.schema_version === '1.1') {
    errors.push('Missing "source" object.');
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

  // Schema v1.0 validation branch (top-level values array)
  if (dataset.schema_version === '1.0' || (!dataset.frames && Array.isArray(dataset.values))) {
    if (!Array.isArray(dataset.values)) {
      errors.push('Missing or invalid "values": must be a 2D array in schema 1.0.');
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
              errors.push(`Cell [${y}][${x}] is not a valid number or null.`);
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
    return { valid: errors.length === 0, errors };
  }

  // Schema v1.1 validation branch (channels + sonification_profile + frames)
  if (!Array.isArray(dataset.channels) || dataset.channels.length === 0) {
    errors.push('dataset.channels must be a non-empty array of channel definitions.');
  } else {
    for (let c = 0; c < dataset.channels.length; c++) {
      const ch = dataset.channels[c];
      if (!ch.id || typeof ch.id !== 'string') errors.push(`Channel at index ${c} missing string "id".`);
      if (!ch.name) errors.push(`Channel at index ${c} missing "name".`);
      if (!ch.type) errors.push(`Channel at index ${c} missing "type".`);
      if (!Array.isArray(ch.range) || ch.range.length !== 2) {
        errors.push(`Channel "${ch.id}" range must be [min, max] array.`);
      }
    }
  }

  if (!dataset.sonification_profile || typeof dataset.sonification_profile !== 'object') {
    errors.push('Missing "sonification_profile" object.');
  } else {
    if (!dataset.sonification_profile.default_channel) {
      errors.push('sonification_profile must declare a "default_channel".');
    }
  }

  if (!Array.isArray(dataset.frames) || dataset.frames.length === 0) {
    errors.push('dataset.frames must be a non-empty array of frame objects.');
    return { valid: false, errors };
  }

  const channelIds = dataset.channels ? dataset.channels.map(c => c.id) : [];

  for (let f = 0; f < dataset.frames.length; f++) {
    const frame = dataset.frames[f];
    if (typeof frame.frame_index !== 'number') {
      errors.push(`Frame ${f} missing numeric "frame_index".`);
    }
    if (!frame.label) {
      errors.push(`Frame ${f} missing "label".`);
    }
    if (!frame.values || typeof frame.values !== 'object') {
      errors.push(`Frame ${f} missing "values" map.`);
      continue;
    }

    for (const chId of channelIds) {
      const grid = frame.values[chId];
      if (!Array.isArray(grid)) {
        errors.push(`Frame ${f} missing values grid for channel "${chId}".`);
        continue;
      }
      if (grid.length !== EXPECTED_HEIGHT) {
        errors.push(`Frame ${f} channel "${chId}" grid height must be ${EXPECTED_HEIGHT}, got ${grid.length}.`);
        continue;
      }

      const chDef = dataset.channels.find(c => c.id === chId);
      const [chMin, chMax] = (chDef && chDef.range) ? chDef.range : [-Infinity, Infinity];

      for (let y = 0; y < grid.length; y++) {
        const row = grid[y];
        if (!Array.isArray(row)) {
          errors.push(`Frame ${f} channel "${chId}" row ${y} is not an array.`);
          break;
        }
        if (row.length !== EXPECTED_WIDTH) {
          errors.push(`Frame ${f} channel "${chId}" row ${y} width must be ${EXPECTED_WIDTH}, got ${row.length}.`);
          break;
        }
        for (let x = 0; x < row.length; x++) {
          const val = row[x];
          if (val !== null) {
            if (typeof val !== 'number' || isNaN(val)) {
              errors.push(`Frame ${f} channel "${chId}" cell [${y}][${x}] is not a valid number or null.`);
              return { valid: false, errors };
            }
            if (val < chMin || val > chMax) {
              errors.push(`Frame ${f} channel "${chId}" cell [${y}][${x}] value ${val} outside channel range [${chMin}, ${chMax}].`);
              return { valid: false, errors };
            }
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
 * Accesses cell values safely from a v1.0 or v1.1 dataset.
 */
export function getFrameChannelValues(dataset, frameIndex = 0, channelId = null) {
  if (!dataset) {
    throw new Error('Dataset must be a valid object.');
  }

  // Schema v1.0 top-level values
  if (Array.isArray(dataset.values)) {
    return dataset.values;
  }

  // Schema v1.1 frames
  if (Array.isArray(dataset.frames) && dataset.frames[frameIndex]) {
    const frame = dataset.frames[frameIndex];
    const targetChannel = channelId ||
      dataset.sonification_profile?.default_channel ||
      dataset.channels?.[0]?.id ||
      (frame.values ? Object.keys(frame.values)[0] : null);

    if (frame.values && frame.values[targetChannel]) {
      return frame.values[targetChannel];
    }
  }

  throw new Error(`Could not resolve values grid for frame ${frameIndex}, channel "${channelId}".`);
}

/**
 * Validates whether two grids or datasets are compatible for comparison or transition.
 */
export function validateCompatibility(datasetA, datasetB, frameIndexA = 0, frameIndexB = 0, channelIdA = null, channelIdB = null) {
  const errors = [];

  const valA = validateDataset(datasetA);
  if (!valA.valid) errors.push(`Dataset A invalid: ${valA.errors.join('; ')}`);

  const valB = validateDataset(datasetB);
  if (!valB.valid) errors.push(`Dataset B invalid: ${valB.errors.join('; ')}`);

  if (errors.length > 0) return { compatible: false, errors };

  if (datasetA.width !== datasetB.width || datasetA.height !== datasetB.height) {
    errors.push(`Dimension mismatch: A (${datasetA.width}x${datasetA.height}) vs B (${datasetB.width}x${datasetB.height})`);
  }

  // Check normalization compatibility
  if (
    datasetA.normalization.source_min !== datasetB.normalization.source_min ||
    datasetA.normalization.source_max !== datasetB.normalization.source_max
  ) {
    errors.push(
      `Normalization mismatch: A has [${datasetA.normalization.source_min}, ${datasetA.normalization.source_max}], ` +
      `B has [${datasetB.normalization.source_min}, ${datasetB.normalization.source_max}]. Shared normalization is required.`
    );
  }

  // If both have channels (v1.1), check semantic type
  if (Array.isArray(datasetA.channels) && Array.isArray(datasetB.channels)) {
    const chA = channelIdA || datasetA.sonification_profile?.default_channel || datasetA.channels[0].id;
    const chB = channelIdB || datasetB.sonification_profile?.default_channel || datasetB.channels[0].id;
    const defA = datasetA.channels.find(c => c.id === chA);
    const defB = datasetB.channels.find(c => c.id === chB);

    if (defA && defB && defA.type !== defB.type) {
      errors.push(`Semantic type mismatch: Channel A is "${defA.type}", Channel B is "${defB.type}".`);
    }
  }

  return {
    compatible: errors.length === 0,
    errors
  };
}

// Alias for backwards compatibility with Audio engine comparison.js
export const validateGridPairCompatibility = validateCompatibility;

/**
 * Computes difference grid between two frames or observations:
 * delta = valuesB[y][x] - valuesA[y][x]
 */
export function calculateFrameDifference(datasetA, datasetB, frameIndexA = 0, frameIndexB = 0, channelIdA = null, channelIdB = null) {
  const compatibility = validateCompatibility(datasetA, datasetB, frameIndexA, frameIndexB, channelIdA, channelIdB);
  if (!compatibility.compatible) {
    throw new Error(`Cannot calculate difference: ${compatibility.errors.join(' ')}`);
  }

  const gridA = getFrameChannelValues(datasetA, frameIndexA, channelIdA);
  const gridB = getFrameChannelValues(datasetB, frameIndexB, channelIdB);

  const deltaValues = [];
  let minDelta = Infinity;
  let maxDelta = -Infinity;
  let sumDelta = 0;
  let validCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let unchangedCount = 0;
  let nullCount = 0;

  for (let y = 0; y < datasetA.height; y++) {
    const row = [];
    for (let x = 0; x < datasetA.width; x++) {
      const a = gridA[y][x];
      const b = gridB[y][x];

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
      totalCells: datasetA.width * datasetA.height,
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

// Alias for backwards compatibility with Audio engine comparison.js
export const calculateGridDifference = calculateFrameDifference;
