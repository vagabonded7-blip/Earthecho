import { EXPECTED_SCHEMA_VERSION, validateDataset } from './schema.js';

const MANIFEST_PATH = '/data/manifest.json';
const DATASET_PATH_PATTERN = /^\/data\/[a-zA-Z0-9_-]+\.json$/;

async function fetchJSON(path, description, { signal, fetcher }) {
  const response = await fetcher(path, { signal });
  if (!response.ok) {
    throw new Error(`Could not load ${description} (${response.status}).`);
  }

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${description} is not valid JSON.`);
    }
    throw error;
  }
  return result;
}

export async function loadManifest({ signal, fetcher = fetch } = {}) {
  const manifest = await fetchJSON(MANIFEST_PATH, 'the dataset manifest', { signal, fetcher });
  if (
    !manifest ||
    manifest.schema_version !== EXPECTED_SCHEMA_VERSION ||
    !Array.isArray(manifest.datasets)
  ) {
    throw new Error('The dataset manifest does not match schema version 1.0.');
  }

  const ids = new Set();
  const paths = new Set();
  for (const entry of manifest.datasets) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      typeof entry.label !== 'string' ||
      !entry.label.trim() ||
      typeof entry.path !== 'string' ||
      !DATASET_PATH_PATTERN.test(entry.path) ||
      (entry.comparison_group !== undefined && typeof entry.comparison_group !== 'string')
    ) {
      throw new Error('The dataset manifest contains an invalid entry.');
    }

    if (ids.has(entry.id)) {
      throw new Error(`The dataset manifest contains duplicate id "${entry.id}".`);
    }
    if (paths.has(entry.path)) {
      throw new Error(`The dataset manifest contains duplicate path "${entry.path}".`);
    }
    ids.add(entry.id);
    paths.add(entry.path);
  }

  return manifest.datasets;
}

export async function loadDataset(entry, { signal, fetcher = fetch } = {}) {
  if (
    !entry ||
    typeof entry.id !== 'string' ||
    !entry.id.trim() ||
    typeof entry.path !== 'string' ||
    !DATASET_PATH_PATTERN.test(entry.path)
  ) {
    throw new Error('No dataset was selected.');
  }

  const label = entry.label || entry.id;
  const dataset = await fetchJSON(entry.path, `"${label}"`, { signal, fetcher });
  const validation = validateDataset(dataset);
  if (!validation.valid) {
    throw new Error(`"${label}" is invalid: ${validation.errors.join(' ')}`);
  }
  if (dataset.id !== entry.id) {
    throw new Error(`"${label}" has id "${dataset.id}", but the manifest expects "${entry.id}".`);
  }

  return dataset;
}
