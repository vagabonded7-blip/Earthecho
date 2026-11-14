import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadDataset, loadManifest } from '../src/data/loader.js';

const publicFetch = async (path) => {
  const filePath = `./public${path}`;
  try {
    const body = await fs.readFile(filePath, 'utf8');
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response('', { status: 404 });
  }
};

test('manifest loader fetches and checks the published manifest entries', async () => {
  const entries = await loadManifest({ fetcher: publicFetch });
  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => entry.path.startsWith('/data/')));
});

test('dataset loader fetches and validates the selected dataset', async () => {
  const entries = await loadManifest({ fetcher: publicFetch });
  const dataset = await loadDataset(entries[0], { fetcher: publicFetch });
  assert.equal(dataset.id, entries[0].id);
  assert.equal(dataset.values.length, 32);
  assert.equal(dataset.values[0].length, 64);
});

test('manifest loader rejects unsafe dataset paths', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    schema_version: '1.0',
    datasets: [{ id: 'invalid', path: '/../private.json', label: 'Invalid' }]
  }), { status: 200 });

  await assert.rejects(loadManifest({ fetcher }), /invalid entry/);
});

test('manifest loader rejects duplicate dataset paths', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    schema_version: '1.0',
    datasets: [
      { id: 'first', path: '/data/shared.json', label: 'First' },
      { id: 'second', path: '/data/shared.json', label: 'Second' }
    ]
  }), { status: 200 });

  await assert.rejects(loadManifest({ fetcher }), /duplicate path/);
});

test('dataset loader reports invalid records instead of returning them', async () => {
  const entry = { id: 'broken', path: '/data/broken.json', label: 'Broken' };
  const fetcher = async () => new Response(JSON.stringify({ id: 'broken', values: [] }), {
    status: 200
  });

  await assert.rejects(loadDataset(entry, { fetcher }), /is invalid/);
});

test('loaders provide a clear error for malformed JSON', async () => {
  const fetcher = async () => new Response('{not json', { status: 200 });

  await assert.rejects(loadManifest({ fetcher }), /manifest is not valid JSON/);
});

test('dataset loader rejects a dataset whose id differs from the manifest', async () => {
  const entry = { id: 'expected', path: '/data/expected.json', label: 'Expected' };
  const fetcher = async () => {
    const body = await fs.readFile('./public/data/night_lights_2012.json', 'utf8');
    const dataset = JSON.parse(body);
    dataset.id = 'different';
    return new Response(JSON.stringify(dataset), { status: 200 });
  };

  await assert.rejects(loadDataset(entry, { fetcher }), /manifest expects "expected"/);
});

test('dataset loader surfaces missing-file responses with status', async () => {
  const entry = { id: 'missing', path: '/data/missing.json', label: 'Missing' };
  const fetcher = async () => new Response('', { status: 404 });

  await assert.rejects(loadDataset(entry, { fetcher }), /Could not load "Missing" \(404\)/);
});
