/** Earth Echo Common Data Interface v1.1 validation and utilities. */
export const EXPECTED_SCHEMA_VERSION = '1.1';
export const EXPECTED_WIDTH = 64;
export const EXPECTED_HEIGHT = 32;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function validateDataset(dataset) {
  const errors = [];
  if (!object(dataset)) return { valid: false, errors: ['Dataset must be a non-null object.'] };
  if (dataset.schema_version !== EXPECTED_SCHEMA_VERSION) errors.push('Invalid schema_version.');
  if (!nonempty(dataset.id)) errors.push('Missing or invalid id.');
  if (!nonempty(dataset.title)) errors.push('Missing or invalid title.');
  if (dataset.width !== EXPECTED_WIDTH || dataset.height !== EXPECTED_HEIGHT) errors.push('Invalid grid dimensions: expected 64x32.');
  if (!object(dataset.source) || !['organization', 'url', 'attribution'].every(key => nonempty(dataset.source[key]))) errors.push('source must contain organization, url and attribution.');
  if (!Array.isArray(dataset.channels) || dataset.channels.length === 0) errors.push('channels must be a non-empty array.');
  if (!Array.isArray(dataset.frames) || dataset.frames.length === 0) {
    errors.push('frames must be a non-empty array of frame objects.');
  }
  const channels = Array.isArray(dataset.channels) ? dataset.channels : [];
  const channelIds = new Set();
  for (const [i, ch] of channels.entries()) {
    if (!object(ch)) { errors.push(`Channel ${i} must be an object.`); continue; }
    if (!nonempty(ch.id)) errors.push(`Channel ${i} missing id.`);
    else if (channelIds.has(ch.id)) errors.push(`Duplicate channel id: ${ch.id}`);
    else channelIds.add(ch.id);
    if (!nonempty(ch.name) || !nonempty(ch.type)) errors.push(`Channel ${i} missing name or type.`);
    if (!Array.isArray(ch.range) || ch.range.length !== 2 || !ch.range.every(finite) || ch.range[0] >= ch.range[1]) errors.push(`Channel ${i} has invalid range.`);
  }
  if (!object(dataset.sonification_profile) || !nonempty(dataset.sonification_profile.default_channel)) errors.push('Missing sonification_profile.default_channel.');
  else if (!channelIds.has(dataset.sonification_profile.default_channel)) errors.push('Default sonification channel not declared.');
  if (dataset.normalization !== undefined) {
    const n = dataset.normalization;
    if (!object(n) || !finite(n.source_min) || !finite(n.source_max) || n.source_max <= n.source_min) errors.push('Invalid normalization source_min/source_max.');
  }
  const frameIndices = new Set();
  for (const [f, frame] of (Array.isArray(dataset.frames) ? dataset.frames : []).entries()) {
    if (!object(frame)) { errors.push(`Frame ${f} must be an object.`); continue; }
    if (!Number.isSafeInteger(frame.frame_index) || frame.frame_index < 0) errors.push(`Frame ${f} invalid frame_index.`);
    else if (frameIndices.has(frame.frame_index)) errors.push(`Duplicate frame_index ${frame.frame_index}.`);
    else frameIndices.add(frame.frame_index);
    if (!nonempty(frame.label)) errors.push(`Frame ${f} missing label.`);
    if (frame.timestamp !== undefined && frame.timestamp !== null && !nonempty(frame.timestamp)) errors.push(`Frame ${f} invalid timestamp.`);
    if (!object(frame.values)) { errors.push(`Frame ${f} missing values map.`); continue; }
    for (const key of Object.keys(frame.values)) if (!channelIds.has(key)) errors.push(`Frame ${f} undeclared channel ${key}.`);
    for (const ch of channels) {
      if (!object(ch) || !nonempty(ch.id)) continue;
      const grid = frame.values[ch.id];
      if (!Array.isArray(grid) || grid.length !== EXPECTED_HEIGHT) { errors.push(`Frame ${f} channel ${ch.id} grid must have 32 rows.`); continue; }
      for (const [y, row] of grid.entries()) {
        if (!Array.isArray(row) || row.length !== EXPECTED_WIDTH) { errors.push(`Frame ${f} channel ${ch.id} row ${y} must have 64 cells.`); continue; }
        for (const [x, value] of row.entries()) {
          if (value !== null && (!finite(value) || (Array.isArray(ch.range) && ch.range.length === 2 && ch.range.every(finite) && (value < ch.range[0] || value > ch.range[1])))) {
            errors.push(`Frame ${f} channel ${ch.id} cell [${y}][${x}] invalid.`);
            if (errors.length > 100) return { valid: false, errors };
          }
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function getFrameChannelValues(dataset, frameIndex = 0, channelId = null) {
  if (!dataset || !Array.isArray(dataset.frames) || !dataset.frames[frameIndex]) throw new Error(`Invalid dataset or frameIndex ${frameIndex}.`);
  const targetChannel = channelId || dataset.sonification_profile?.default_channel || dataset.channels?.[0]?.id;
  const grid = dataset.frames[frameIndex].values?.[targetChannel];
  if (!Array.isArray(grid)) throw new Error(`Channel "${targetChannel}" not found in frame ${frameIndex}.`);
  return grid;
}

export function validateCompatibility(datasetA, datasetB, frameIndexA = 0, frameIndexB = 0, channelIdA = null, channelIdB = null) {
  const errors = [];
  const a = validateDataset(datasetA), b = validateDataset(datasetB);
  if (!a.valid) errors.push(`Dataset A invalid: ${a.errors.join('; ')}`);
  if (!b.valid) errors.push(`Dataset B invalid: ${b.errors.join('; ')}`);
  if (errors.length) return { compatible: false, errors };
  if (!Number.isSafeInteger(frameIndexA) || frameIndexA < 0 || frameIndexA >= datasetA.frames.length || !Number.isSafeInteger(frameIndexB) || frameIndexB < 0 || frameIndexB >= datasetB.frames.length) errors.push('Invalid frame selection.');
  const chA = channelIdA || datasetA.sonification_profile.default_channel;
  const chB = channelIdB || datasetB.sonification_profile.default_channel;
  const defA = datasetA.channels.find(ch => ch.id === chA), defB = datasetB.channels.find(ch => ch.id === chB);
  if (!defA || !defB) errors.push('Selected channel is missing.');
  else {
    if (defA.type !== defB.type) errors.push('Channel semantic type mismatch.');
    if (defA.unit !== defB.unit) errors.push('Channel unit mismatch.');
    if (chA !== chB && datasetA.id !== datasetB.id) errors.push('Different channel identifiers require explicit scientific comparison review.');
  }
  if (datasetA.width !== datasetB.width || datasetA.height !== datasetB.height) errors.push('Dimension mismatch.');
  if (datasetA.id !== datasetB.id) {
    // Unknown registration cannot establish cell-by-cell comparability across datasets.
    if (!nonempty(datasetA.projection) || !nonempty(datasetB.projection) || datasetA.projection === 'image_grid_unverified' || datasetB.projection === 'image_grid_unverified' || datasetA.projection !== datasetB.projection) errors.push('Spatial registration is not verified for cross-dataset comparison.');
    if (JSON.stringify(datasetA.normalization ?? null) !== JSON.stringify(datasetB.normalization ?? null)) errors.push('Normalization mismatch.');
  }
  return { compatible: errors.length === 0, errors };
}

export function calculateFrameDifference(datasetA, datasetB, frameIndexA = 0, frameIndexB = 0, channelIdA = null, channelIdB = null) {
  const check = validateCompatibility(datasetA, datasetB, frameIndexA, frameIndexB, channelIdA, channelIdB);
  if (!check.compatible) throw new Error(`Cannot calculate difference: ${check.errors.join(' ')}`);
  const gridA = getFrameChannelValues(datasetA, frameIndexA, channelIdA);
  const gridB = getFrameChannelValues(datasetB, frameIndexB, channelIdB);
  const deltaValues = [];
  let minDelta = Infinity, maxDelta = -Infinity, sumDelta = 0, validCount = 0, positiveCount = 0, negativeCount = 0, unchangedCount = 0, nullCount = 0;
  for (let y = 0; y < datasetA.height; y++) {
    const row = [];
    for (let x = 0; x < datasetA.width; x++) {
      const a = gridA[y][x], b = gridB[y][x];
      if (a === null || b === null) { row.push(null); nullCount++; continue; }
      const delta = Number((b - a).toFixed(6));
      row.push(delta); validCount++; sumDelta += delta;
      minDelta = Math.min(minDelta, delta); maxDelta = Math.max(maxDelta, delta);
      if (delta > 0.001) positiveCount++;
      else if (delta < -0.001) negativeCount++;
      else unchangedCount++;
    }
    deltaValues.push(row);
  }
  return {
    deltaValues, stats: {
      totalCells: datasetA.width * datasetA.height, validCount, nullCount,
      minDelta: validCount ? minDelta : 0, maxDelta: validCount ? maxDelta : 0,
      meanDelta: validCount ? sumDelta / validCount : 0, positiveCount, negativeCount, unchangedCount
    }
  };
}
