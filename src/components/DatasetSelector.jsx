import React from 'react';

function getDatasetTheme(id) {
  if (id.includes('ocean') || id.includes('sea')) return 'theme-ocean';
  if (id.includes('veg') || id.includes('forest') || id.includes('ndvi')) return 'theme-vegetation';
  if (id.includes('night') || id.includes('lights')) return 'theme-lights';
  return 'theme-synthetic';
}

function getDatasetIcon(id) {
  if (id.includes('ocean') || id.includes('sea')) return '🌊';
  if (id.includes('veg') || id.includes('forest') || id.includes('ndvi')) return '🌿';
  if (id.includes('night') || id.includes('lights')) return '🌃';
  return '🧪';
}

export default function DatasetSelector({
  datasets,
  selectedId,
  onSelect,
  loading
}) {
  const manifestDatasets = datasets.filter((e) => e.kind === 'manifest');
  const mockDatasets = datasets.filter((e) => e.kind === 'mock');

  return (
    <section className="dataset-selector-card" aria-labelledby="dataset-selector-title">
      <div className="card-header">
        <div>
          <span className="card-kicker">DATASTREAM INGESTION</span>
          <h2 id="dataset-selector-title" className="card-title">Select Observation Feed</h2>
        </div>
        {loading && <span className="loading-badge" role="status">SYNCING FEED…</span>}
      </div>

      <div className="dataset-grid" role="radiogroup" aria-label="Available NASA observations">
        {manifestDatasets.map((entry) => {
          const isSelected = entry.id === selectedId;
          const themeClass = getDatasetTheme(entry.id);
          const icon = getDatasetIcon(entry.id);

          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`dataset-tile ${themeClass} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(entry.id)}
            >
              <div className="tile-top">
                <span className="tile-icon" aria-hidden="true">{icon}</span>
                <span className="tile-badge">NASA SVS</span>
              </div>
              <h3 className="tile-title">{entry.label}</h3>
              <p className="tile-group">Feed: {entry.comparison_group?.toUpperCase() || 'PLANETARY'}</p>
              {isSelected && <span className="tile-active-marker" aria-hidden="true">ACTIVE FEED</span>}
            </button>
          );
        })}

        {mockDatasets.length > 0 && (
          <div className="synthetic-divider" role="separator" aria-label="Synthetic Test Bench">
            <span>SYNTHETIC CALIBRATION BENCH</span>
          </div>
        )}

        {mockDatasets.map((entry) => {
          const isSelected = entry.id === selectedId;
          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`dataset-tile theme-synthetic ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(entry.id)}
            >
              <div className="tile-top">
                <span className="tile-icon" aria-hidden="true">🧪</span>
                <span className="tile-badge synthetic">SIMULATED</span>
              </div>
              <h3 className="tile-title">{entry.label}</h3>
              <p className="tile-group">Interface Test Harness</p>
              {isSelected && <span className="tile-active-marker" aria-hidden="true">ACTIVE FEED</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

