import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initAudio,
  playGrid,
  playSoundscape,
  scanGrid,
  playComparison,
  playCell,
  stopAudio,
  setMasterVolume
} from '../audio/audioEngine.js';
import EarthMap from './EarthMap.jsx';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFrameLabel(dataset, frameIndex) {
  const frame = dataset?.frames?.[frameIndex];
  if (frame?.label) return frame.label;
  if (frame?.timestamp) return frame.timestamp;
  return `Observation ${frameIndex + 1}`;
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
  return 1;
}

function getActiveMatrix(dataset, frameIndex) {
  if (!dataset) return null;
  if (dataset.values) return dataset.values;
  const frame = dataset.frames?.[frameIndex];
  if (!frame?.values) return null;
  const channelId = dataset.channels?.[0]?.id || Object.keys(frame.values)[0];
  return frame.values[channelId] || null;
}

// ─── PlaybackControls ────────────────────────────────────────────────────────

function PlaybackControls({ dataset, frameIndex, onPlayback }) {
  const [mode, setMode] = useState(null); // 'listen' | 'scan' | 'timelapse' | 'compare'
  const [audioError, setAudioError] = useState('');
  const [volume, setVolume] = useState(0.7);
  const playPromise = useRef(null);

  const frameCount = getFrameCount(dataset);
  const canCompare = frameCount >= 2;

  useEffect(() => {
    if (mode) {
      stopAudio();
      setMode(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id, frameIndex]);

  useEffect(() => () => stopAudio(), []);

  const handleVolume = useCallback((e) => {
    const v = Number(e.target.value);
    setVolume(v);
    try { setMasterVolume(v); } catch { /* ignore */ }
  }, []);

  const handleStop = useCallback(() => {
    stopAudio();
    setMode(null);
    onPlayback?.(null);
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
    onPlayback?.(newMode === 'listen' ? { start: performance.now(), duration: 14 } : null);
    try {
      let promise;
      if (newMode === 'listen') {
        // Immersive musical soundscape sweep of the selected observation
        promise = playSoundscape(dataset, frameIndex, { durationSeconds: 14 });
      } else if (newMode === 'scan') {
        // Sequential grid scan
        promise = scanGrid(dataset, frameIndex);
      } else if (newMode === 'timelapse') {
        // Multi-observation time series playback
        promise = playGrid(dataset, 0, { frameIntervalSeconds: 1.5 });
      } else if (newMode === 'compare') {
        // Differential sonification between first two frames
        const ch = dataset.channels?.[0]?.id || Object.keys(dataset.frames[0].values)[0];
        const f0 = { ...dataset, values: dataset.frames[0].values[ch] };
        const f1 = { ...dataset, values: dataset.frames[1].values[ch] };
        promise = playComparison(f0, f1);
      }
      playPromise.current = promise;
      await promise;
    } catch (err) {
      if (err?.message !== 'Playback cancelled.') {
        setAudioError(`Playback error: ${err.message}`);
      }
    } finally {
      onPlayback?.(null);
      setMode(null);
      playPromise.current = null;
    }
  }, [dataset, frameIndex, mode, volume]);

  const isPlaying = mode !== null;

  return (
    <div className="playback-controls" role="group" aria-label="Playback controls">
      <div className="control-row">
        {/* Listen: Soundscape */}
        <button
          className={`control-btn primary${mode === 'listen' ? ' active' : ''}`}
          type="button"
          aria-pressed={mode === 'listen'}
          onClick={() => mode === 'listen' ? handleStop() : startMode('listen')}
          disabled={!dataset}
          title="Play a 14-second musical soundscape of this observation"
        >
          {mode === 'listen' ? '⏹ Stop' : '▶ Listen (Soundscape)'}
        </button>

        {/* Scan: Left to right */}
        <button
          className={`control-btn${mode === 'scan' ? ' active' : ''}`}
          type="button"
          aria-pressed={mode === 'scan'}
          onClick={() => mode === 'scan' ? handleStop() : startMode('scan')}
          disabled={!dataset}
          title="Scan grid column-by-column from West to East"
        >
          {mode === 'scan' ? '⏹ Stop' : '⟶ Scan Grid'}
        </button>

        {/* Timelapse (if multiple frames) */}
        {frameCount > 1 && (
          <button
            className={`control-btn${mode === 'timelapse' ? ' active' : ''}`}
            type="button"
            aria-pressed={mode === 'timelapse'}
            onClick={() => mode === 'timelapse' ? handleStop() : startMode('timelapse')}
            disabled={!dataset}
            title="Play time-lapse sequence of all observations"
          >
            {mode === 'timelapse' ? '⏹ Stop' : '⏱ Timelapse'}
          </button>
        )}

        {/* Compare: Differences */}
        {canCompare && (
          <button
            className={`control-btn${mode === 'compare' ? ' active' : ''}`}
            type="button"
            aria-pressed={mode === 'compare'}
            onClick={() => mode === 'compare' ? handleStop() : startMode('compare')}
            disabled={!dataset}
            title="Hear changes between first and second observation (high = increase, low = decrease)"
          >
            {mode === 'compare' ? '⏹ Stop' : '⚖ Compare Differences'}
          </button>
        )}

        {isPlaying && (
          <span className="status-pill playing" role="status" aria-live="polite">
            {mode === 'listen' && '♪ Soundscape playing…'}
            {mode === 'scan' && '⟶ Scanning grid…'}
            {mode === 'timelapse' && '⏱ Timelapse playing…'}
            {mode === 'compare' && '⚖ Comparing differences…'}
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
        <strong>Listen</strong> weaves an evocative 14s soundscape across the globe. <strong>Scan</strong> audits coordinates from left to right. <strong>Compare</strong> voices signed deltas.
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
            {dataset.schema_version === '1.1' ? 'NASA EARTH OBSERVATION' : 'SYNTHETIC TEST DATA'}
          </p>
          <h3>{dataset.title}</h3>
        </div>
        <span className="grid-size">{dataset.width} × {dataset.height} numerical grid</span>
      </div>

      <p className="dataset-description">{getDescription(dataset)}</p>

      {/* Frame selector */}
      {frameCount > 1 && (
        <div className="frame-selector">
          <label className="field-label" htmlFor="frame-select">Observation period</label>
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
              Observation {frameIndex + 1} of {frameCount}
            </span>
          </div>
        </div>
      )}

      {/* Audio legend */}
      {dataset.sonification_profile && (
        <details className="audio-legend" open>
          <summary>Audio Legend & Sound Mapping</summary>
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

      {/* Provenance */}
      <dl className="dataset-details">
        <div>
          <dt>Source</dt>
          <dd>
            {getSourceOrg(dataset)}
            {sourceUrl && (
              <> · <a href={sourceUrl} target="_blank" rel="noreferrer noopener">Official link ↗</a></>
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
            <dt>Scientific Note</dt>
            <dd>{disclaimer}</dd>
          </div>
        )}
      </dl>

      {dataset.id?.startsWith('mock:') && (
        <p className="demo-notice">
          Synthetic demonstration baseline. This grid is mathematically generated for interface
          development, not calibrated satellite observations.
        </p>
      )}
    </article>
  );
}

// ─── Jukebox (Main Component) ────────────────────────────────────────────────

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
  const [playback, setPlayback] = useState(null);

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
          <p className="eyebrow">NASA SPACE APPS CHALLENGE · EARTH JUKEBOX</p>
          <h1 id="page-title">Listen to the shape<br />of our changing planet.</h1>
          <p className="intro">
            Earth Echo translates NASA satellite visualizations and physical indices
            into soundscapes. Select an observation, listen to its global timbre,
            sweep across coordinates, or probe differences across years.
          </p>
        </div>
      </section>

      <section className="dataset-panel" aria-labelledby="dataset-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DATASET SELECTION</p>
            <h2 id="dataset-heading">Choose a NASA Observation</h2>
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
            <optgroup label="Verified NASA Observations">
              {manifestDatasets.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </optgroup>
          )}
          {mockDatasets.length > 0 && (
            <optgroup label="Synthetic Test Data">
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
            <div className="workspace">
          <div className="workspace-side">
            <DatasetCard
              dataset={dataset}
              frameIndex={frameIndex}
              onFrameChange={setFrameIndex}
            />

            <PlaybackControls
              dataset={dataset}
              frameIndex={frameIndex}
              onPlayback={setPlayback}
            />
          </div>
          <EarthMap
              dataset={dataset}
              frameIndex={frameIndex}
              playback={playback}
            />
          </div>
          </>
        )}

        <p className="manifest-note">
          Datasets are loaded dynamically from <code>/data/manifest.json</code> conforming to
          Earth Echo Schema v1.1. Audio is rendered purely client-side via the Web Audio API.
        </p>
      </section>

      <footer className="site-footer">
        <p>Built for the NASA Space Apps Challenge · Making Earth Science Accessible</p>
        <details className="accessibility-details" id="accessibility">
          <summary>Accessibility & Sonification Guide</summary>
          <p>
            This application complies with WCAG accessibility guidelines:
            All controls are keyboard navigable (Tab, Space, Enter, Arrows).
            Screen reader announcements provide status updates on playback and probe state.
            Web Audio starts strictly upon user interaction, with volume control and instant stop.
            Reduced motion settings are honored.
          </p>
        </details>
      </footer>
    </main>
  );
}
