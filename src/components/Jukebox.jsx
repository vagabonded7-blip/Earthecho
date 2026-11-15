import React, { useState } from 'react';
import Navigation from './Navigation.jsx';
import Dashboard from './Dashboard.jsx';
import DatasetSelector from './DatasetSelector.jsx';
import TimelineSelector from './TimelineSelector.jsx';
import SonificationStudio from './SonificationStudio.jsx';
import EarthMap from './EarthMap.jsx';
import ComparisonLab from './ComparisonLab.jsx';
import FingerprintStudio from './FingerprintStudio.jsx';
import DataProvenance from './DataProvenance.jsx';

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
  const [activeTab, setActiveTab] = useState('observatory');
  const [frameIndex, setFrameIndex] = useState(0);
  const [playback, setPlayback] = useState(null);

  // Reset frame when dataset changes
  const handleSelectDataset = (id) => {
    setFrameIndex(0);
    setPlayback(null);
    onSelect(id);
  };

  const currentDatasetTitle = dataset?.title || datasets.find((d) => d.id === selectedId)?.label || '';

  return (
    <div className="cosmic-observatory-app">
      {/* Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        dataStatus={dataStatus}
        datasetTitle={currentDatasetTitle}
      />

      <main className="observatory-main-container">
        {/* Error Notification Banner */}
        {error && (
          <div className="global-error-banner" role="alert">
            <span className="error-icon" aria-hidden="true">⚠️</span>
            <div className="error-body">
              <strong>Telemetry Error:</strong> {error}
            </div>
            <button type="button" className="retry-btn" onClick={onRetry}>
              {retryLabel}
            </button>
          </div>
        )}

        {/* Tab 1: Observatory (Main Centerpiece Experience) */}
        {activeTab === 'observatory' && (
          <div className="observatory-view-flow">
            <Dashboard
              dataset={dataset}
              onStartListening={() => {
                const el = document.getElementById('sonification-deck');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onExploreMap={() => {
                const el = document.getElementById('earth-observatory-deck');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onOpenCompare={() => setActiveTab('compare')}
            />

            <div className="observatory-command-grid">
              {/* Left Column: Data feeds & Timeline & Audio Studio */}
              <div className="command-sidebar">
                <DatasetSelector
                  datasets={datasets}
                  selectedId={selectedId}
                  onSelect={handleSelectDataset}
                  loading={dataStatus === 'loading'}
                />

                <TimelineSelector
                  dataset={dataset}
                  frameIndex={frameIndex}
                  onSelectFrame={setFrameIndex}
                />

                <div id="sonification-deck">
                  <SonificationStudio
                    dataset={dataset}
                    frameIndex={frameIndex}
                    onPlaybackStateChange={setPlayback}
                  />
                </div>
              </div>

              {/* Right Column: Centerpiece Interactive Earth Observatory */}
              <div className="command-centerpiece" id="earth-observatory-deck">
                {dataStatus === 'loading' && !dataset ? (
                  <div className="loading-stage-card">
                    <span className="loading-spinner" aria-hidden="true" />
                    <p>Ingesting NASA Telemetry Grid…</p>
                  </div>
                ) : (
                  <EarthMap
                    dataset={dataset}
                    frameIndex={frameIndex}
                    playback={playback}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Comparison Laboratory */}
        {activeTab === 'compare' && (
          <div className="tab-view-container">
            <ComparisonLab dataset={dataset} />
          </div>
        )}

        {/* Tab 3: Earth Audio Fingerprint */}
        {activeTab === 'fingerprint' && (
          <div className="tab-view-container">
            <FingerprintStudio
              dataset={dataset}
              frameIndex={frameIndex}
            />
          </div>
        )}

        {/* Tab 4: Data Sources & Provenance */}
        {activeTab === 'provenance' && (
          <div className="tab-view-container">
            <DataProvenance dataset={dataset} />
          </div>
        )}
      </main>

      {/* Cosmic Observatory Footer */}
      <footer className="cosmic-footer" role="contentinfo">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="footer-title">EARTH ECHO</span>
            <span className="footer-sub">NASA Space Apps Challenge · Cosmic Observatory Edition</span>
          </div>

          <div className="footer-meta">
            <span>Client-side Web Audio DSP</span>
            <span>·</span>
            <span>Schema v1.1 Compliant</span>
            <span>·</span>
            <span>Accessible WCAG AA Design</span>
          </div>
        </div>

        <details className="footer-accessibility-guide">
          <summary>Accessibility & Keyboard Navigation Protocol</summary>
          <div className="guide-body">
            <p>
              Earth Echo is engineered for complete keyboard and screen reader accessibility:
              Use <strong>Tab</strong> and <strong>Shift+Tab</strong> to navigate control decks.
              In the Earth Observatory Map, focus the map canvas and use <strong>Arrow Keys</strong> to traverse coordinates,
              or press <strong>Enter / Space</strong> to probe pitches. Reduced-motion preferences are strictly respected.
            </p>
          </div>
        </details>
      </footer>
    </div>
  );
}
