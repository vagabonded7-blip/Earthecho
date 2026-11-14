import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playCell, playTone } from '../audio/audioEngine.js';
import { mapDifferenceToSound } from '../audio/comparison.js';

const W = 768;
const H = 384;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function matrixAt(d, i) {
  const f = d.frames?.[i];
  if (f?.values) return f.values[d.channels?.[0]?.id] || Object.values(f.values)[0];
  return d.values || null;
}

function kindOf(d) {
  const id = d.id || '';
  if (/ocean|sea/.test(id)) return 'ocean';
  if (/veg|forest|ndvi/.test(id)) return 'veg';
  return 'lights';
}

function color(v, kind) {
  if (v == null) return '#06100e';
  const t = clamp(v, 0, 1);
  if (kind === 'ocean') return `rgb(${(15 + t * 60) | 0},${(50 + t * 180) | 0},${(120 + t * 135) | 0})`;
  if (kind === 'veg') return `rgb(${(20 + (1 - t) * 80) | 0},${(60 + t * 190) | 0},${(30 + t * 80) | 0})`;
  return `rgb(${(t * 255) | 0},${(t * 215) | 0},${(t * 120) | 0})`;
}

function deltaColor(d) {
  if (d == null) return '#06100e';
  const t = Math.min(1, Math.abs(d) * 2.5);
  return d >= 0
    ? `rgb(${(40 + t * 215) | 0},${(40 + t * 170) | 0},50)`
    : `rgb(40,${(60 + t * 60) | 0},${(80 + t * 175) | 0})`;
}

const VIEWS = [
  ['observe', 'Observation'],
  ['split', 'Before / After'],
  ['change', 'Change']
];

export default function EarthMap({ dataset, frameIndex, playback }) {
  const canvasRef = useRef(null);
  const headRef = useRef(null);
  const dragging = useRef(false);
  const lastKey = useRef('');
  const [view, setView] = useState('observe');
  const [split, setSplit] = useState(0.5);
  const [grid, setGrid] = useState(false);
  const [cell, setCell] = useState(null);

  const w = dataset.width || 64;
  const h = dataset.height || 32;
  const two = (dataset.frames?.length || 1) >= 2;
  const kind = kindOf(dataset);
  const A = useMemo(() => matrixAt(dataset, two ? 0 : frameIndex), [dataset, two, frameIndex]);
  const B = useMemo(() => (two ? matrixAt(dataset, 1) : null), [dataset, two]);
  const cur = useMemo(() => matrixAt(dataset, frameIndex), [dataset, frameIndex]);

  useEffect(() => { setView('observe'); setCell(null); }, [dataset.id]);

  // Data-driven hotspots (no geographic claims, just grid cells)
  const spots = useMemo(() => {
    const out = [];
    let loud = null, up = null, down = null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = cur?.[y]?.[x];
      if (v != null && (!loud || v > loud.v)) loud = { x, y, v };
      const a = A?.[y]?.[x], b = B?.[y]?.[x];
      if (a != null && b != null) {
        const d = b - a;
        if (!up || d > up.d) up = { x, y, d };
        if (!down || d < down.d) down = { x, y, d };
      }
    }
    if (loud) out.push({ label: 'Strongest signal', ...loud, view: 'observe' });
    if (up && up.d > 0) out.push({ label: 'Biggest increase', ...up, view: 'change' });
    if (down && down.d < 0) out.push({ label: 'Biggest decrease', ...down, view: 'change' });
    return out;
  }, [cur, A, B, w, h]);

  // Draw
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !cur) return;
    const cw = W / w, ch = H / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c;
      if (view === 'change' && two) {
        const a = A[y]?.[x], b = B[y]?.[x];
        c = deltaColor(a == null || b == null ? null : b - a);
      } else if (view === 'split' && two) {
        c = color(((x + 0.5) / w > split ? B : A)[y]?.[x], kind);
      } else {
        c = color(cur[y]?.[x], kind);
      }
      ctx.fillStyle = c;
      ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
    }
    if (grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) { ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, H); }
      for (let y = 0; y <= h; y++) { ctx.moveTo(0, y * ch); ctx.lineTo(W, y * ch); }
      ctx.stroke();
    }
    if (view === 'split' && two) {
      ctx.fillStyle = '#f1c875';
      ctx.fillRect(split * W - 1, 0, 2, H);
    }
    if (cell) {
      ctx.strokeStyle = '#9cdbbd';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x * cw, cell.y * ch, cw, ch);
    }
  }, [cur, A, B, view, split, grid, cell, kind, two, w, h]);

  // Playhead that follows the 14s soundscape sweep
  useEffect(() => {
    const el = headRef.current;
    if (!el) return undefined;
    if (!playback) { el.style.opacity = 0; return undefined; }
    let raf;
    const tick = () => {
      const p = (performance.now() - playback.start) / 1000 / playback.duration;
      el.style.opacity = p <= 1 ? 1 : 0;
      el.style.left = `${clamp(p, 0, 1) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); el.style.opacity = 0; };
  }, [playback]);

  const probe = useCallback(async (x, y, forceView) => {
    const v = forceView || view;
    const a = A?.[y]?.[x], b = B?.[y]?.[x];
    let value = null, tone = null;
    try {
      if (v === 'change' && two) {
        value = a == null || b == null ? null : b - a;
        tone = value === null ? null : mapDifferenceToSound(clamp(value, -1, 1));
        if (tone) await playTone(tone);
      } else {
        const f = v === 'split' && two ? ((x + 0.5) / w > split ? 1 : 0) : frameIndex;
        value = matrixAt(dataset, f)?.[y]?.[x] ?? null;
        if (value !== null) tone = await playCell(dataset, f, x, y);
      }
    } catch { /* audio unavailable: still update the readout */ }
    setCell({ x, y, value, hz: tone?.frequencyHz, change: v === 'change' });
  }, [view, A, B, two, w, split, frameIndex, dataset]);

  const toCell = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [
      clamp(Math.floor(((e.clientX - r.left) / r.width) * w), 0, w - 1),
      clamp(Math.floor(((e.clientY - r.top) / r.height) * h), 0, h - 1)
    ];
  };

  const onDown = (e) => {
    canvasRef.current.setPointerCapture?.(e.pointerId);
    dragging.current = true;
    const [x, y] = toCell(e);
    lastKey.current = `${x},${y}`;
    probe(x, y);
  };
  const onMove = (e) => {
    if (!dragging.current) return;
    const [x, y] = toCell(e);
    const k = `${x},${y}`;
    if (k !== lastKey.current) { lastKey.current = k; probe(x, y); }
  };
  const onUp = () => { dragging.current = false; };

  const onKey = (e) => {
    const c = cell || { x: 0, y: 0 };
    const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (d) {
      e.preventDefault();
      probe(clamp(c.x + d[0], 0, w - 1), clamp(c.y + d[1], 0, h - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      probe(c.x, c.y);
    }
  };

  const jump = (s) => {
    if (s.view === 'change' && !two) return;
    setView(s.view);
    setCell({ x: s.x, y: s.y, value: null });
    probe(s.x, s.y, s.view);
  };

  return (
    <section className="earth-map" aria-label="Interactive Earth map">
      <div className="map-toolbar">
        <div className="seg" role="group" aria-label="Map view">
          {VIEWS.filter(([id]) => two || id === 'observe').map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id}
              className={view === id ? 'seg-btn on' : 'seg-btn'} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="seg-btn" aria-pressed={grid} onClick={() => setGrid(!grid)}>
          Grid {grid ? 'on' : 'off'}
        </button>
      </div>

      <div className="map-stage">
        <canvas ref={canvasRef} width={W} height={H} className="map-canvas"
          tabIndex={0} role="application"
          aria-label={`Interactive ${w} by ${h} map. Click or drag to hear values; arrow keys move between cells.`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerCancel={onUp} onKeyDown={onKey} />
        <div className="playhead" ref={headRef} aria-hidden="true" />
      </div>

      {view === 'split' && two && (
        <label className="split-row">
          <span>{dataset.frames[0].label || 'Before'}</span>
          <input type="range" min="0.05" max="0.95" step="0.01" value={split}
            onChange={(e) => setSplit(Number(e.target.value))} aria-label="Before and after divider" />
          <span>{dataset.frames[1].label || 'After'}</span>
        </label>
      )}

      {view === 'change' && two && (
        <p className="legend-line">
          <i className="sw up" /> increase <i className="sw down" /> decrease. Drag across the map to hear the
          size of each change: higher pitch for increases, lower for decreases.
        </p>
      )}

      <div className="cell-probe-readout" aria-live="polite">
        {cell ? (
          <span>
            <strong>Cell ({cell.x}, {cell.y})</strong>
            {cell.value === null || cell.value === undefined
              ? ' · No data (silent)'
              : ` · ${cell.change ? 'Change' : 'Value'}: ${cell.change && cell.value > 0 ? '+' : ''}${cell.value.toFixed(3)}`}
            {cell.hz ? ` · ${cell.hz.toFixed(0)} Hz` : ''}
          </span>
        ) : (
          <span className="text-muted">Click or drag across the map to play what is under your cursor.</span>
        )}
      </div>

      {spots.length > 0 && (
        <div className="spot-row" role="group" aria-label="Jump to notable cells">
          {spots.map((s) => (
            <button key={s.label} type="button" className="spot"
              disabled={s.view === 'change' && !two} onClick={() => jump(s)}>
              {s.label} <small>({s.x}, {s.y})</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
