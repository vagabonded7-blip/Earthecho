import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playCell, playTone } from '../audio/audioEngine.js';
import { mapDifferenceToSound } from '../audio/comparison.js';

const W = 896;
const H = 448;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function matrixAt(d, i) {
  if (!d) return null;
  const f = d.frames?.[i];
  if (f?.values) return f.values[d.channels?.[0]?.id] || Object.values(f.values)[0];
  return d.values || null;
}

function kindOf(d) {
  const id = d?.id || '';
  if (/ocean|sea/.test(id)) return 'ocean';
  if (/veg|forest|ndvi/.test(id)) return 'veg';
  return 'lights';
}

function toGeoCoord(x, y, w, h) {
  const lon = ((x + 0.5) / w) * 360 - 180;
  const lat = 90 - ((y + 0.5) / h) * 180;
  const lonStr = `${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
  const latStr = `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`;
  return { lon, lat, lonStr, latStr };
}

function color(v, kind) {
  if (v == null) return '#070B18';
  const t = clamp(v, 0, 1);
  if (kind === 'ocean') {
    // Cosmic ocean palette: deep midnight blue to radiant cyan
    const r = (11 + t * 45) | 0;
    const g = (25 + t * 190) | 0;
    const b = (70 + t * 185) | 0;
    return `rgb(${r},${g},${b})`;
  }
  if (kind === 'veg') {
    // Cosmic biosphere palette: deep forest dark to vivid emerald
    const r = (10 + (1 - t) * 40) | 0;
    const g = (35 + t * 185) | 0;
    const b = (25 + t * 90) | 0;
    return `rgb(${r},${g},${b})`;
  }
  // Night Lights palette: cosmic obsidian to brilliant warm electric amber
  const r = (t * 245) | 0;
  const g = (t * 184) | 0;
  const b = (t * 90) | 0;
  return `rgb(${r},${g},${b})`;
}

function deltaColor(d) {
  if (d == null) return '#070B18';
  const t = Math.min(1, Math.abs(d) * 2.5);
  // Gold for increase (#F5B85A), Electric Blue for decrease (#38D9E6 / #60A5FA)
  return d >= 0
    ? `rgb(${(50 + t * 195) | 0},${(45 + t * 139) | 0},${(20 + t * 70) | 0})`
    : `rgb(${(20 + t * 36) | 0},${(40 + t * 177) | 0},${(70 + t * 180) | 0})`;
}

const VIEWS = [
  ['observe', 'Observation', 'Single observation map with coordinate audio probe'],
  ['split', 'Before / After', 'Interactive split-screen divider comparing epochs'],
  ['change', 'Change Delta', 'Differential sonification showing regional increase & decrease']
];

export default function EarthMap({ dataset, frameIndex, playback }) {
  const canvasRef = useRef(null);
  const headRef = useRef(null);
  const dragging = useRef(false);
  const lastKey = useRef('');

  const [view, setView] = useState('observe');
  const [split, setSplit] = useState(0.5);
  const [showGrid, setShowGrid] = useState(true);
  const [showEquator, setShowEquator] = useState(true);
  const [cell, setCell] = useState(null);

  const w = dataset?.width || 64;
  const h = dataset?.height || 32;
  const two = (dataset?.frames?.length || 1) >= 2;
  const kind = kindOf(dataset);

  const A = useMemo(() => matrixAt(dataset, two ? 0 : frameIndex), [dataset, two, frameIndex]);
  const B = useMemo(() => (two ? matrixAt(dataset, 1) : null), [dataset, two]);
  const cur = useMemo(() => matrixAt(dataset, frameIndex), [dataset, frameIndex]);

  useEffect(() => {
    setView('observe');
    setCell(null);
  }, [dataset?.id]);

  // Notable data-driven hotspots
  const spots = useMemo(() => {
    const out = [];
    let loud = null, up = null, down = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = cur?.[y]?.[x];
        if (v != null && (!loud || v > loud.v)) loud = { x, y, v };
        const a = A?.[y]?.[x], b = B?.[y]?.[x];
        if (a != null && b != null) {
          const d = b - a;
          if (!up || d > up.d) up = { x, y, d };
          if (!down || d < down.d) down = { x, y, d };
        }
      }
    }
    if (loud) out.push({ label: 'Maximum Intensity', ...loud, view: 'observe' });
    if (up && up.d > 0) out.push({ label: 'Greatest Increase', ...up, view: 'change' });
    if (down && down.d < 0) out.push({ label: 'Greatest Decrease', ...down, view: 'change' });
    return out;
  }, [cur, A, B, w, h]);

  // Main Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cur) return;
    const ctx = canvas.getContext('2d');
    const cw = W / w;
    const ch = H / h;

    // Draw cells
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c;
        if (view === 'change' && two) {
          const a = A?.[y]?.[x];
          const b = B?.[y]?.[x];
          c = deltaColor(a == null || b == null ? null : b - a);
        } else if (view === 'split' && two) {
          const isRight = (x + 0.5) / w > split;
          const targetMat = isRight ? B : A;
          c = color(targetMat?.[y]?.[x], kind);
        } else {
          c = color(cur?.[y]?.[x], kind);
        }
        ctx.fillStyle = c;
        ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }

    // Grid Overlay
    if (showGrid) {
      ctx.strokeStyle = 'rgba(56, 217, 230, 0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, H);
      }
      for (let y = 0; y <= h; y++) {
        ctx.moveTo(0, y * ch); ctx.lineTo(W, y * ch);
      }
      ctx.stroke();
    }

    // Equator and Prime Meridian Guides
    if (showEquator) {
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      // Equator (y = h / 2)
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      // Prime Meridian (x = w / 2)
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Split Divider Line
    if (view === 'split' && two) {
      ctx.fillStyle = '#F5B85A';
      ctx.shadowColor = '#F5B85A';
      ctx.shadowBlur = 8;
      ctx.fillRect(split * W - 1.5, 0, 3, H);
      ctx.shadowBlur = 0;
    }

    // Active Cell Highlight
    if (cell) {
      ctx.strokeStyle = '#38D9E6';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#38D9E6';
      ctx.shadowBlur = 6;
      ctx.strokeRect(cell.x * cw, cell.y * ch, cw, ch);
      ctx.shadowBlur = 0;
    }
  }, [cur, A, B, view, split, showGrid, showEquator, cell, kind, two, w, h]);

  // Synchronized Playhead Animation (follows 14s soundscape)
  useEffect(() => {
    const el = headRef.current;
    if (!el) return undefined;
    if (!playback) {
      el.style.opacity = '0';
      return undefined;
    }

    let rafId;
    const tick = () => {
      const elapsed = (performance.now() - playback.start) / 1000;
      const progress = clamp(elapsed / playback.duration, 0, 1);
      el.style.opacity = progress < 1 ? '1' : '0';
      el.style.left = `${progress * 100}%`;
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        el.style.opacity = '0';
      }
    };

    tick();
    return () => {
      cancelAnimationFrame(rafId);
      if (el) el.style.opacity = '0';
    };
  }, [playback]);

  // Audio Probe on Coordinate
  const probe = useCallback(async (x, y, forceView) => {
    const v = forceView || view;
    const a = A?.[y]?.[x];
    const b = B?.[y]?.[x];
    let value = null;
    let tone = null;

    try {
      if (v === 'change' && two) {
        value = a == null || b == null ? null : b - a;
        tone = value === null ? null : mapDifferenceToSound(clamp(value, -1, 1));
        if (tone) await playTone(tone);
      } else {
        const targetFrame = v === 'split' && two ? ((x + 0.5) / w > split ? 1 : 0) : frameIndex;
        value = matrixAt(dataset, targetFrame)?.[y]?.[x] ?? null;
        if (value !== null) tone = await playCell(dataset, targetFrame, x, y);
      }
    } catch {
      // Audio engine error fallback: update visual readout regardless
    }

    const geo = toGeoCoord(x, y, w, h);
    setCell({
      x,
      y,
      geo,
      value,
      hz: tone?.frequencyHz,
      midi: tone?.midi,
      change: v === 'change'
    });
  }, [view, A, B, two, w, h, split, frameIndex, dataset]);

  const getCellFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = clamp((e.clientX - rect.left) / rect.width, 0, 0.9999);
    const py = clamp((e.clientY - rect.top) / rect.height, 0, 0.9999);
    return [Math.floor(px * w), Math.floor(py * h)];
  };

  const handlePointerDown = (e) => {
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    dragging.current = true;
    const [x, y] = getCellFromEvent(e);
    lastKey.current = `${x},${y}`;
    probe(x, y);
  };

  const handlePointerMove = (e) => {
    if (!dragging.current) return;
    const [x, y] = getCellFromEvent(e);
    const key = `${x},${y}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      probe(x, y);
    }
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  const handleKeyDown = (e) => {
    const current = cell || { x: 0, y: 0 };
    const step = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1]
    }[e.key];

    if (step) {
      e.preventDefault();
      const nx = clamp(current.x + step[0], 0, w - 1);
      const ny = clamp(current.y + step[1], 0, h - 1);
      probe(nx, ny);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      probe(current.x, current.y);
    }
  };

  const handleJumpSpot = (spot) => {
    if (spot.view === 'change' && !two) return;
    setView(spot.view);
    probe(spot.x, spot.y, spot.view);
  };

  return (
    <section className="earth-observatory-panel" aria-label="Cosmic Earth Observatory Interactive Map">
      <div className="observatory-toolbar">
        <div className="view-mode-tabs" role="group" aria-label="Observatory View Modes">
          {VIEWS.filter(([id]) => two || id === 'observe').map(([id, label, desc]) => (
            <button
              key={id}
              type="button"
              className={`mode-tab-btn ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              title={desc}
            >
              <span>{label}</span>
              {view === id && <span className="tab-indicator" aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div className="hud-toggles" role="group" aria-label="HUD Overlays">
          <button
            type="button"
            className={`hud-toggle-btn ${showGrid ? 'active' : ''}`}
            onClick={() => setShowGrid(!showGrid)}
            aria-pressed={showGrid}
            title="Toggle 64x32 grid lines"
          >
            # Grid
          </button>
          <button
            type="button"
            className={`hud-toggle-btn ${showEquator ? 'active' : ''}`}
            onClick={() => setShowEquator(!showEquator)}
            aria-pressed={showEquator}
            title="Toggle Equator and Prime Meridian axes"
          >
            ☩ Axes
          </button>
        </div>
      </div>

      {/* Map Viewport & Stage */}
      <div className="map-stage-frame">
        <div className="hud-corners top-left" aria-hidden="true" />
        <div className="hud-corners top-right" aria-hidden="true" />
        <div className="hud-corners bottom-left" aria-hidden="true" />
        <div className="hud-corners bottom-right" aria-hidden="true" />

        <div className="map-stage">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="map-canvas"
            tabIndex={0}
            role="application"
            aria-label={`Interactive Earth map (${w} by ${h} grid). Drag or click to probe cell audio. Arrow keys move coordinate probe.`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
          />

          <div className="sweeping-playhead" ref={headRef} aria-hidden="true">
            <span className="playhead-glow" />
            <span className="playhead-beacon" />
          </div>
        </div>

        <div className="map-axis-labels" aria-hidden="true">
          <span className="axis-label w180">180° W</span>
          <span className="axis-label prime">0° PRIME</span>
          <span className="axis-label e180">180° E</span>
        </div>
      </div>

      {/* Split Comparison Slider Controls */}
      {view === 'split' && two && (
        <div className="split-scrubber-row" role="region" aria-label="Split Screen Epoch Divider">
          <span className="epoch-tag">{dataset.frames[0].label || 'Baseline'}</span>
          <input
            type="range"
            min="0.05"
            max="0.95"
            step="0.01"
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            className="cosmic-range split-slider"
            aria-label="Before and after split divider"
          />
          <span className="epoch-tag">{dataset.frames[1].label || 'Comparison'}</span>
        </div>
      )}

      {/* Change View Legend */}
      {view === 'change' && two && (
        <div className="change-legend-bar" role="note">
          <span className="legend-indicator gold"><i /> Increase (Higher Register)</span>
          <span className="legend-indicator blue"><i /> Decrease (Lower Register)</span>
          <span className="legend-indicator dark"><i /> Silent (Masked / No Change)</span>
        </div>
      )}

      {/* Real-time Coordinate & Sonification HUD Readout */}
      <div className="cell-probe-hud" aria-live="polite">
        {cell ? (
          <div className="probe-grid">
            <div className="probe-item">
              <span className="hud-label">COORDINATE</span>
              <span className="hud-val">[{cell.x}, {cell.y}]</span>
            </div>
            <div className="probe-item">
              <span className="hud-label">GEOGRAPHIC LOCATION</span>
              <span className="hud-val">{cell.geo?.latStr}, {cell.geo?.lonStr}</span>
            </div>
            <div className="probe-item">
              <span className="hud-label">{cell.change ? 'DELTA' : 'MAGNITUDE'}</span>
              <span className="hud-val highlight">
                {cell.value === null ? 'Masked' : `${cell.change && cell.value > 0 ? '+' : ''}${cell.value.toFixed(4)}`}
              </span>
            </div>
            <div className="probe-item">
              <span className="hud-label">SYNTHESIZED PITCH</span>
              <span className="hud-val cyan">
                {cell.hz ? `${cell.hz.toFixed(1)} Hz (MIDI ${cell.midi})` : 'Silent'}
              </span>
            </div>
          </div>
        ) : (
          <div className="probe-placeholder">
            <span className="pulse-icon" aria-hidden="true">🎯</span>
            <span>Hover, click or drag across the Earth to probe coordinate values and hear their sonified frequencies.</span>
          </div>
        )}
      </div>

      {/* Data-Driven Hotspot Jumps */}
      {spots.length > 0 && (
        <div className="hotspot-jump-strip" role="group" aria-label="Notable Planetary Hotspots">
          <span className="hotspot-label">NOTABLE HOTSPOTS:</span>
          {spots.map((spot) => (
            <button
              key={spot.label}
              type="button"
              className="hotspot-chip"
              disabled={spot.view === 'change' && !two}
              onClick={() => handleJumpSpot(spot)}
            >
              <span>{spot.label}</span>
              <small>[{spot.x}, {spot.y}]</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
