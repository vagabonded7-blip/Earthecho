import React from 'react';

export default function Dashboard({ dataset, onStartListening, onExploreMap, onOpenCompare }) {
  const sensor = dataset?.source?.instrument || dataset?.source?.organization || 'NASA Observation';
  const width = dataset?.width || 64;
  const height = dataset?.height || 32;
  const valueType = dataset?.channels?.[0]?.type === 'physical_measurement'
    ? 'Physical Measurement'
    : 'Image-Derived Index';
  const unit = dataset?.channels?.[0]?.unit || 'Relative Display Luma';

  return (
    <section className="cosmic-hero" aria-labelledby="hero-title">
      <div className="hero-atmosphere" aria-hidden="true">
        <div className="star-field" />
        <div className="aurora-glow cyan" />
        <div className="aurora-glow violet" />
      </div>

      <div className="hero-content">
        <div className="hero-eyebrow">
          <span className="eyebrow-badge">NASA SPACE APPS CHALLENGE</span>
          <span className="eyebrow-code">MISSION REF: EIC-2026-EE</span>
        </div>

        <h1 id="hero-title" className="hero-heading">
          EARTH ECHO
          <span className="hero-subheading">Every change has a sound.</span>
        </h1>

        <p className="hero-description">
          Explore Earth's changing environment through NASA observations, interactive visualizations,
          and data-driven sound. Transform global satellite imagery, oceanic currents, and biosphere
          dynamics into living musical soundscapes.
        </p>

        <div className="hero-actions">
          <button
            type="button"
            className="action-btn primary"
            onClick={onStartListening}
          >
            <span className="btn-icon">▶</span>
            <span>Start Listening</span>
          </button>

          <button
            type="button"
            className="action-btn secondary"
            onClick={onExploreMap}
          >
            <span className="btn-icon">🌐</span>
            <span>Explore Observatory</span>
          </button>

          <button
            type="button"
            className="action-btn subtle"
            onClick={onOpenCompare}
          >
            <span className="btn-icon">⚖️</span>
            <span>Time Comparison</span>
          </button>
        </div>

        <div className="telemetry-bar" aria-label="Mission Sensor Telemetry">
          <div className="telemetry-item">
            <span className="telemetry-label">OBSERVATION SOURCE</span>
            <span className="telemetry-value">{sensor}</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">GRID RESOLUTION</span>
            <span className="telemetry-value">{width} × {height} Equirectangular</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">VALUE SEMANTICS</span>
            <span className="telemetry-value">{valueType} ({unit})</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">SONIFICATION ENGINE</span>
            <span className="telemetry-value">Web Audio DSP (Pentatonic Major)</span>
          </div>
        </div>
      </div>
    </section>
  );
}
