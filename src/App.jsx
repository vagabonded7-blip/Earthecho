import { useEffect, useMemo, useState } from 'react';
import Jukebox from './components/Jukebox.jsx';
import { loadDataset, loadManifest } from './data/loader.js';
import { mockNightLights2012, mockNightLights2023 } from './data/mockData.js';

const mockDatasets = [mockNightLights2012, mockNightLights2023].map((dataset) => ({
  id: `mock:${dataset.id}`,
  label: dataset.title,
  kind: 'mock',
  dataset: { ...dataset, id: `mock:${dataset.id}` }
}));

export default function App() {
  const [manifestEntries, setManifestEntries] = useState([]);
  const [manifestError, setManifestError] = useState('');
  const [dataError, setDataError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [dataset, setDataset] = useState(null);
  const [dataStatus, setDataStatus] = useState('loading');
  const [manifestRetry, setManifestRetry] = useState(0);
  const [dataRetry, setDataRetry] = useState(0);

  const availableDatasets = useMemo(
    () => [
      ...manifestEntries.map((entry) => ({ ...entry, kind: 'manifest' })),
      ...mockDatasets
    ],
    [manifestEntries]
  );
  const selectedEntry = availableDatasets.find((entry) => entry.id === selectedId);

  useEffect(() => {
    const controller = new AbortController();
    loadManifest({ signal: controller.signal })
      .then((entries) => {
        setManifestEntries(entries);
        setManifestError('');
        setSelectedId((current) => current || entries[0]?.id || mockDatasets[0].id);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setManifestError(error.message);
          setSelectedId((current) => current || mockDatasets[0].id);
        }
      });

    return () => controller.abort();
  }, [manifestRetry]);

  useEffect(() => {
    if (!selectedEntry) return undefined;

    const controller = new AbortController();
    setDataset(null);
    setDataError('');
    setDataStatus('loading');

    const request = selectedEntry.kind === 'mock'
      ? Promise.resolve(selectedEntry.dataset)
      : loadDataset(selectedEntry, { signal: controller.signal });

    request
      .then((loadedDataset) => {
        if (!controller.signal.aborted) {
          setDataset(loadedDataset);
          setDataStatus('ready');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setDataset(null);
          setDataStatus('error');
          setDataError(error.message);
        }
      });

    return () => controller.abort();
  }, [selectedEntry, dataRetry]);

  return (
    <Jukebox
      datasets={availableDatasets}
      selectedId={selectedId}
      onSelect={(id) => {
        setManifestError('');
        setSelectedId(id);
      }}
      dataset={dataset}
      dataStatus={dataStatus}
      error={manifestError || dataError}
      retryLabel={manifestError ? 'Retry loading available datasets' : 'Retry loading this dataset'}
      onRetry={() => {
        if (manifestError) setManifestRetry((count) => count + 1);
        else setDataRetry((count) => count + 1);
      }}
    />
  );
}
