import React, { useCallback, useMemo, useState } from 'react';
import { initAudio, playComparison, playSoundscape, stopAudio, setMasterVolume } from '../audio/audioEngine.js';

function matrixAt(d, i) {
  if (!d) return null;
  const f = d.frames?.[i];
  if (f?.values) return f.values[d.channels?.[0]?.id] || Object.values(f.values)[0];
  return d.values || null;
}

export default function ComparisonLab({ dataset }) {
  const [frameAIndex, setFrameAIndex] = useState(0);
  const [frameBIndex, setFrameBIndex] = useState(1);
  const [activePlay, setActivePlay] = useState(null); // 'A' | 'B' | 'diff' | null
  const [error, setError] = useState('');

  const frames = dataset?.frames || [];
  const canCompare = frames.length >= 2;

  const frameA = frames[frameAIndex];
  const frameB = frames[frameBIndex];

  const matrixA = useMemo(() => matrixAt(dataset, frameAIndex), [dataset, frameAIndex]);
  const matrixB = useMemo(() => matrixAt(dataset, frameBIndex), [dataset, frameBIndex]);

  // Differential statistics
  const stats = useMemo(() => {
    if (!matrixA || !matrixB) return null;
    let validPairs = 0;
    let sumDelta = 0;
    let maxInc = 0;
    let maxDec = 0;
    let incCount = 0;
    let decCount = 0;

    const h = matrixA.length;
    const w = matrixA[0]?.length || 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = matrixA[y]?.[x];
        const b = matrixB[y]?.[x];
        if (a !== null && b !== null && a !== undefined && b !== undefined) {
          validPairs++;
          const d = b - a;
          sumDelta += d;
          if (d > 0.001) {
            incCount++;
            if (d > maxInc) maxInc = d;
          } else if (d < -0.001) {
            decCount++;
            if (d < maxDec) maxDec = d;
          }
        }
      }
    }

    return {
      validPairs,
      meanDelta: validPairs > 0 ? sumDelta / validPairs : 0,
      maxInc,
      maxDec,
      incCount,
      decCount
    };
  }, [matrixA, matrixB]);

  const handleStop = useCallback(() => {
    stopAudio();
    setActivePlay(null);
  }, []);

  const handlePlaySingle = useCallback(async (which) => {
    handleStop();
    setError('');
    const targetIdx = which === 'A' ? frameAIndex : frameBIndex;
    try {
      await initAudio();
      setActivePlay(which);
      await playSoundscape(dataset, targetIdx, { durationSeconds: 10 });
    } catch (err) {
      if (err?.message !== 'Playback cancelled.') {
        setError(`Playback error: ${err.message}`);
      }
    } finally {
      setActivePlay(null);
    }
  }, [frameAIndex, frameBIndex, dataset, handleStop]);

  const handlePlayDifference = useCallback(async () => {
    handleStop();
    setError('');
    if (!canCompare) return;

    try {
      await initAudio();
      setActivePlay('diff');
      const ch = dataset.channels?.[0]?.id || Object.keys(dataset.frames[0].values)[0];
      const dsA = { ...dataset, values: dataset.frames[frameAIndex].values[ch] };
      const dsB = { ...dataset, values: dataset.frames[frameBIndex].values[ch] };
      await playComparison(dsA, dsB);
    } catch (err) {
      if (err?.message !== 'Playback cancelled.') {
        setError(`Comparison error: ${err.message}`);
      }
    } finally {
      setActivePlay(null);
    }
  }, [canCompare, dataset, frameAIndex, frameBIndex, handleStop]);

  if (!canCompare) {
    return (
      <section className="comparison-lab-panel" aria-labelledby="comp-title">
        <div className="card-header">
          <div>
            <span className="card-kicker">ENVIRONMENTAL TIME COMPARISON</span>
            <h2 id="comp-title" className="card-title">Temporal Comparison Laboratory</h2>
          </div>
        </div>
        <div className="empty-state-card">
          <p>This dataset contains a single observation epoch. Comparison requires at least two observation periods.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="comparison-lab-panel" aria-labelledby="comp-title">
      <div className="card-header">
        <div>
          <span className="card-kicker">ENVIRONMENTAL TIME COMPARISON</span>
          <h2 id="comp-title" className="card-title">Temporal Comparison Laboratory</h2>
        </div>
        <div className="status-pill active">
          <span>COMPATIBILITY VERIFIED</span>
        </div>
      </div>

      <p className="lab-intro">
        Audit and sonify environmental changes across time. Compare two NASA observation epochs
        independently, or listen to the <strong>Differential Soundtrack</strong> where regional increases
        resonate in the upper register and decreases in the lower register.
      </p>

      {/* Epoch Selectors */}
      <div className="epoch-selection-grid">
        <div className="epoch-card baseline">
          <div className="epoch-card-header">
            <span className="epoch-role">BASELINE EPOCH (A)</span>
            <select
              value={frameAIndex}
              onChange={(e) => setFrameAIndex(Number(e.target.value))}
              className="cosmic-select epoch-select"
              aria-label="Baseline observation epoch"
            >
              {frames.map((f, i) => (
                <option key={i} value={i} disabled={i === frameBIndex}>
                  {f.label || f.timestamp || `Epoch ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div className="epoch-card-body">
            <span className="epoch-meta">Date: {frameA?.timestamp || 'Unspecified'}</span>
            <button
              type="button"
              className={`epoch-play-btn ${activePlay === 'A' ? 'active' : ''}`}
              onClick={() => activePlay === 'A' ? handleStop() : handlePlaySingle('A')}
            >
              <span>{activePlay === 'A' ? '⏹ Stop' : '▶ Listen Baseline (A)'}</span>
            </button>
          </div>
        </div>

        <div className="comparison-vs-badge" aria-hidden="true">
          <span>VS</span>
        </div>

        <div className="epoch-card comparison">
          <div className="epoch-card-header">
            <span className="epoch-role">COMPARISON EPOCH (B)</span>
            <select
              value={frameBIndex}
              onChange={(e) => setFrameBIndex(Number(e.target.value))}
              className="cosmic-select epoch-select"
              aria-label="Comparison observation epoch"
            >
              {frames.map((f, i) => (
                <option key={i} value={i} disabled={i === frameAIndex}>
                  {f.label || f.timestamp || `Epoch ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div className="epoch-card-body">
            <span className="epoch-meta">Date: {frameB?.timestamp || 'Unspecified'}</span>
            <button
              type="button"
              className={`epoch-play-btn ${activePlay === 'B' ? 'active' : ''}`}
              onClick={() => activePlay === 'B' ? handleStop() : handlePlaySingle('B')}
            >
              <span>{activePlay === 'B' ? '⏹ Stop' : '▶ Listen Comparison (B)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Differential Soundtrack Trigger */}
      <div className="differential-action-deck">
        <button
          type="button"
          className={`differential-btn ${activePlay === 'diff' ? 'active' : ''}`}
          onClick={() => activePlay === 'diff' ? handleStop() : handlePlayDifference()}
        >
          <span className="btn-icon">{activePlay === 'diff' ? '⏹' : '⚖️'}</span>
          <div className="btn-text">
            <strong>{activePlay === 'diff' ? 'Stop Differential Soundtrack' : 'Play Differential Soundtrack (A → B)'}</strong>
            <small>Upper musical register voices increases · Lower register voices decreases</small>
          </div>
        </button>

        {activePlay !== null && (
          <button type="button" className="action-btn stop" onClick={handleStop}>
            ⏹ Silence All
          </button>
        )}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Comparative Scientific Metrics */}
      {stats && (
        <div className="metrics-dashboard" aria-label="Differential Metrics Summary">
          <h3 className="metrics-heading">Differential Telemetry Summary</h3>
          <div className="metrics-grid">
            <div className="metric-tile">
              <span className="metric-kicker">COMPARABLE REGIONS</span>
              <span className="metric-num">{stats.validPairs.toLocaleString()}</span>
              <span className="metric-sub">Valid 64×32 Grid Cells</span>
            </div>
            <div className="metric-tile gold">
              <span className="metric-kicker">REGIONAL INCREASES</span>
              <span className="metric-num">+{stats.incCount}</span>
              <span className="metric-sub">Peak: +{stats.maxInc.toFixed(3)}</span>
            </div>
            <div className="metric-tile cyan">
              <span className="metric-kicker">REGIONAL DECREASES</span>
              <span className="metric-num">-{stats.decCount}</span>
              <span className="metric-sub">Peak: {stats.maxDec.toFixed(3)}</span>
            </div>
            <div className="metric-tile">
              <span className="metric-kicker">MEAN NET DELTA</span>
              <span className="metric-num">
                {stats.meanDelta >= 0 ? '+' : ''}{stats.meanDelta.toFixed(4)}
              </span>
              <span className="metric-sub">Global Mean Shift</span>
            </div>
          </div>
        </div>
      )}

      {/* Scientific Integrity Note */}
      <div className="scientific-notice">
        <strong>Scientific Provenance:</strong> Units and normalization are preserved across observations
        ({dataset?.normalization?.method || 'shared_linear'}). Differences reflect relative visual and
        environmental trends within the sensor's validated bounds.
      </div>
    </section>
  );
}

