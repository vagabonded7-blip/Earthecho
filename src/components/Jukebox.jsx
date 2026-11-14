import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initAudio,
  playGrid,
  scanGrid,
  stopAudio,
  setMasterVolume
} from '../audio/audioEngine.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function getFrameLabel(dataset, frameIndex) {
  const frame = dataset?.frames?.[frameIndex];
  if (frame?.label) return frame.label;
  if (frame?.timestamp) return frame.timestamp;
  return `Frame ${frameIndex + 1}`;
}

function getChannelLabel(dataset) {
  const ch = dataset?.channels?.[0];
  if (!ch) return null;
  return ch.name || ch.label || ch.id;
}

function getSourceOrg(dataset) {
  return dataset?.source?.organization || 'NASA';
}

function getSourceUrl(dataset) {
  return dataset?.source?.url || null;
}

function getAttribution(dataset) {
  return dataset?.source?.attribution || null;
}

function getDisclaimer(dataset) {
  return dataset?.source?.disclaimer || null;
}

function getDescription(dataset) {
  return dataset?.description || dataset?.value_meaning || '';
}

function getFrameCount(dataset) {
  if (dataset?.frames?.length) return dataset.frames.length;
  return 1; // v1.0 single-frame
}

// ─── PlaybackControls ────────────────────────────────────────────────────────

function PlaybackControls({ dataset, frameIndex }) {
  const [mode, setMode] = useState(null); // null | 'listen' | 'scan'
  const [audioError, setAudioError] = useState('');
  const [volume, setVolume] = useState(0.7);
  const playPromise = useRef(null);

  // stop on dataset or frame change
  useEffect(() => {
    if (mode) {
      stopAudio();
      setMode(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id, frameIndex]);

  // cleanup on unmount
  useEffect(() => () => stopAudio(), []);

  const handleVolume = useCallback((e) => {
    const v = Number(e.target.value);
    setVolume(v);
    try { setMasterVolume(v); } catch { /* ignore before init */ }
  }, []);

  const startMode = useCallback(async (newMode) => {
    if (mode) {
      stopAudio();
      setMode(null);
      await playPromise.current;
      playPromise.current = null;
    }
    setAudioError('');
    try {
      await initAudio();
      setMasterVolume(volume);
    } catch (err) {
      setAudioError(`Audio failed to start: ${err.message}`);
      return;
    }

    setMode(newMode);
    try {
      const promise = newMode === 'listen'
        ? playGrid(dataset, frameIndex, { frameIntervalSeconds: 2 })
        : scanGrid(dataset, frameIndex);
      playPromise.current = promise;
      await promise;
    } catch (err) {
      if (err?.message !== 'Playback cancelled.') {
        setAudioError(`Playback error: ${err.message}`);
      }
    } finally {
      setMode(null);
      playPromise.current = null;
    }
  }, [dataset, frameIndex, mode, volume]);

  const handleStop = useCallback(() => {
    stopAudio();
    setMode(null);
  }, []);

  const isPlaying = mode !== null;

  return (
    <div className="playback-controls" role="group" aria-label="Playback controls">

      <div className="control-row">
        <button
          className={`control-btn primary${mode === 'listen' ? ' active' : ''}`}
          type="button"
          aria-pressed={mode === 'listen'}
          onClick={() => mode === 'listen' ? handleStop() : startMode('listen')}
          disabled={!dataset}
        >
          {mode === 'listen' ? '⏹ Stop' : '▶ Listen'}
        </button>

        <button
          className={`control-btn${mode === 'scan' ? ' active' : ''}`}
          type="button"
          aria-pressed={mode === 'scan'}
          onClick={() => mode === 'scan' ? handleStop() : startMode('scan')}
          disabled={!dataset}
        >
          {mode === 'scan' ? '⏹ Stop' : '⟶ Scan'}
        </button>

        {isPlaying && (
          <span className="status-pill playing" role="status" aria-live="polite">
            {mode === 'listen' ? '♪ Playing…' : '⟶ Scanning…'}
          </span>
        )}
      </div>

      <div className="control-row volume-row">
        <label htmlFor="volume-slider" className="volume-label">Volume</label>
        <input
          id="volume-slider"
          type="range"
          min="0" max="1" step="0.05"
          value={volume}
          onChange={handleVolume}
          className="volume-slider"
          aria-label="Master volume"
        />
        <span className="volume-value" aria-hidden="true">{Math.round(volume * 100)}%</span>
      </div>

      {audioError && (
        <p className="error-message" role="alert">{audioError}</p>
      )}

      <p className="controls-hint">
        <strong>Listen</strong> plays a summary tone per frame. <strong>Scan</strong> sweeps left-to-right, one column at a time.
      </p>
    </div>
  );
}

// ─── DatasetCard ─────────────────────────────────────────────────────────────

function DatasetCard({ dataset, frameIndex, onFrameChange }) {
  const frameCount = getFrameCount(dataset);
  const channelLabel = getChannelLabel(dataset);
  const sourceUrl = getSourceUrl(dataset);
  const attribution = getAttribution(dataset);
  const disclaimer = getDisclaimer(dataset);

  return (
    <article className="dataset-card" aria-live="polite">
      <div className="dataset-card-heading">
        <div>
          <p className="eyebrow">
            {dataset.schema_version === '1.1' ? 'NASA DATA' : 'SYNTHETIC DATA'}
          </p>
          <h3>{dataset.title}</h3>
        </div>
        <span className="grid-size">{dataset.width} × {dataset.height} grid</span>
      </div>

      <p className="dataset-description">{getDescription(dataset)}</p>

      {/* Frame selector */}
      {frameCount > 1 && (
        <div className="frame-selector">
          <label className="field-label" htmlFor="frame-select">Observation</label>
          <div className="frame-select-row">
            <select
              id="frame-select"
              className="dataset-select frame-select"
              value={frameIndex}
              onChange={(e) => onFrameChange(Number(e.target.value))}
            >
              {dataset.frames.map((frame, i) => (
                <option key={i} value={i}>
                  {getFrameLabel(dataset, i)}
                </option>
              ))}
            </select>
            <span className="frame-badge">
              {frameIndex + 1} / {frameCount}
            </span>
          </div>
        </div>
      )}

      {/* Audio legend */}
      {dataset.sonification_profile && (
        <details className="audio-legend">
          <summary>How this sounds</summary>
          <dl className="legend-list">
            {channelLabel && (
              <div>
                <dt>Data channel</dt>
                <dd>{channelLabel}{dataset.channels?.[0]?.unit ? ` (${dataset.channels[0].unit})` : ''}</dd>
              </div>
            )}
            {dataset.sonification_profile.legend?.pitch && (
              <div>
                <dt>Pitch</dt>
                <dd>{dataset.sonification_profile.legend.pitch}</dd>
              </div>
            )}
            {dataset.sonification_profile.legend?.stereo && (
              <div>
                <dt>Stereo</dt>
                <dd>{dataset.sonification_profile.legend.stereo}</dd>
              </div>
            )}
            {dataset.sonification_profile.legend?.silence && (
              <div>
                <dt>Silence</dt>
                <dd>{dataset.sonification_profile.legend.silence}</dd>
              </div>
            )}
          </dl>
        </details>
      )}

      {/* Attribution */}
      <dl className="dataset-details">
        <div>
          <dt>Source</dt>
          <dd>
            {getSourceOrg(dataset)}
            {sourceUrl && (
              <> · <a href={sourceUrl} target="_blank" rel="noreferrer noopener">Source link ↗</a></>
            )}
          </dd>
        </div>
        {attribution && (
          <div>
            <dt>Attribution</dt>
            <dd>{attribution}</dd>
          </div>
        )}
        {disclaimer && (
          <div>
            <dt>Data note</dt>
            <dd>{disclaimer}</dd>
          </div>
        )}
      </dl>

      {dataset.id.startsWith('mock:') && (
        <p className="demo-notice">
          Synthetic demonstration only. This grid is illustrative, not NASA-derived
          source data or calibrated satellite radiance.
        </p>
      )}
    </article>
  );
}

// ─── Jukebox (main export) ───────────────────────────────────────────────────

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
  const [frameIndex, setFrameIndex] = useState(0);

  // reset frame when dataset changes
  useEffect(() => setFrameIndex(0), [selectedId]);

  const manifestDatasets = datasets.filter((e) => e.kind === 'manifest');
  const mockDatasets = datasets.filter((e) => e.kind === 'mock');

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
            Earth Echo turns NASA Earth data into sound. Choose a dataset, pick an
            observation, then press <strong>Listen</strong> or <strong>Scan</strong>.
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
            <span className="status-pill" role="status">Loading data…</span>
          )}
        </div>

        <label className="field-label" htmlFor="dataset-select">Available datasets</label>
        <select
          id="dataset-select"
          className="dataset-select"
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          disabled={datasets.length === 0}
        >
          {datasets.length === 0 && <option value="">No datasets available</option>}
          {manifestDatasets.length > 0 && (
            <optgroup label="NASA datasets">
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
          <>
            <DatasetCard
              dataset={dataset}
              frameIndex={frameIndex}
              onFrameChange={setFrameIndex}
            />
            <PlaybackControls
              dataset={dataset}
              frameIndex={frameIndex}
            />
          </>
        )}

        <p className="manifest-note">
          NASA datasets are discovered from <code>/data/manifest.json</code>. Attribution
          and disclaimers are displayed as supplied by the dataset files.
        </p>
      </section>

      <footer className="site-footer">
        <p>Designed to make Earth data more approachable through sound.</p>
        <details className="accessibility-details" id="accessibility">
          <summary>Accessibility information</summary>
          <p>
            All controls are keyboard accessible. The dataset selector, frame selector,
            and volume slider work with screen readers. Reduced-motion preferences are respected.
            Audio starts only on user interaction.
          </p>
        </details>
      </footer>
    </main>
  );
}
