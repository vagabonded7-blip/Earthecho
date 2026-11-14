export default function Jukebox({
  datasets,
  selectedId,
  onSelect,
  dataset,
  dataStatus,
  error,
  retryLabel,
  onRetry
}) {
  const manifestDatasets = datasets.filter((entry) => entry.kind === 'manifest');
  const mockDatasets = datasets.filter((entry) => entry.kind === 'mock');

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="#home" aria-label="Earth Echo home">
          <span className="wordmark-mark" aria-hidden="true">E</span>
          <span>Earth Echo</span>
        </a>
        <span className="header-label">EARTH DATA, IN A NEW KEY</span>
      </header>

      <section className="welcome-panel" id="home" aria-labelledby="page-title">
        <div className="welcome-copy">
          <p className="eyebrow">AN ACCESSIBLE EARTH JUKEBOX</p>
          <h1 id="page-title">Listen to the shape<br />of our changing planet.</h1>
          <p className="intro">
            Earth Echo turns numerical Earth visualizations into sound. Choose a grid
            to get started; the listening controls will be added in the next step.
          </p>
        </div>
      </section>

      <section className="dataset-panel" aria-labelledby="dataset-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">START HERE</p>
            <h2 id="dataset-heading">Choose an observation</h2>
          </div>
          {dataStatus === 'loading' && (
            <span className="status-pill" role="status">Loading data</span>
          )}
        </div>

        <label className="field-label" htmlFor="dataset-select">Available datasets</label>
        <select
          id="dataset-select"
          className="dataset-select"
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
          disabled={datasets.length === 0}
        >
          {datasets.length === 0 && <option value="">No datasets available</option>}
          {manifestDatasets.length > 0 && (
            <optgroup label="Available data">
              {manifestDatasets.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </optgroup>
          )}
          {mockDatasets.length > 0 && (
            <optgroup label="Synthetic test data">
              {mockDatasets.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </optgroup>
          )}
        </select>

        {error && (
          <div className="error-message" role="alert">
            <p>{error}</p>
            <button className="text-button" type="button" onClick={onRetry}>{retryLabel}</button>
          </div>
        )}

        {dataStatus === 'loading' && (
          <p className="loading-message" role="status">Loading the selected grid…</p>
        )}

        {dataStatus === 'ready' && dataset && (
          <article className="dataset-card" aria-live="polite">
            <div className="dataset-card-heading">
              <div>
                <p className="eyebrow">{dataset.observation_date || 'Observation'}</p>
                <h3>{dataset.title}</h3>
              </div>
              <span className="grid-size">{dataset.width} × {dataset.height} grid</span>
            </div>
            <p className="dataset-description">{dataset.description}</p>
            <dl className="dataset-details">
              <div>
                <dt>Value meaning</dt>
                <dd>{dataset.value_meaning}</dd>
              </div>
              <div>
                <dt>Source listed in dataset</dt>
                <dd>
                  {dataset.source?.organization || 'Not specified'}
                  {dataset.source?.url && (
                    <> · <a href={dataset.source.url} target="_blank" rel="noreferrer">Source link</a></>
                  )}
                </dd>
              </div>
            </dl>
            {dataset.id.startsWith('mock:') && (
              <p className="demo-notice">
                Synthetic demonstration only. This grid is illustrative, not NASA-derived
                source data or calibrated satellite radiance.
              </p>
            )}
          </article>
        )}

        <p className="manifest-note">
          Available data is discovered from <code>/data/manifest.json</code>. Dataset
          source details are displayed as supplied and are not independently verified here.
        </p>
      </section>

      <footer className="site-footer">
        <p>Designed to make Earth data more approachable through sound.</p>
        <details className="accessibility-details" id="accessibility">
          <summary>Accessibility information</summary>
          <p>
            The dataset selector is keyboard accessible and the interface respects your
            reduced-motion preference. Synthetic data is provided for interface testing only.
          </p>
        </details>
      </footer>
    </main>
  );
}
