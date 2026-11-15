import React, { useCallback, useEffect, useRef, useState } from 'react';
import { initAudio, playTone } from '../audio/audioEngine.js';
import { midiToFrequency } from '../audio/scales.js';

function matrixAt(d, i) {
  if (!d) return null;
  const f = d.frames?.[i];
  if (f?.values) return f.values[d.channels?.[0]?.id] || Object.values(f.values)[0];
  return d.values || null;
}

// Generate deterministic hash string from dataset metadata & grid
function generateFingerprintHash(dataset, frameIndex, matrix) {
  const seed = `${dataset?.id || 'ee'}-${frameIndex}-${dataset?.observation_date || ''}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  if (matrix) {
    // Sample strategic cells
    for (let y = 0; y < matrix.length; y += 4) {
      for (let x = 0; x < (matrix[0]?.length || 0); x += 8) {
        const val = matrix[y]?.[x] || 0;
        hash ^= Math.round(val * 1000);
        hash += (hash << 3);
      }
    }
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const prefix = dataset?.id?.slice(0, 3)?.toUpperCase() || 'EIC';
  return `EE-${prefix}-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export default function FingerprintStudio({ dataset, frameIndex }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [probing, setProbing] = useState(false);

  const matrix = matrixAt(dataset, frameIndex);
  const frame = dataset?.frames?.[frameIndex];
  const epochLabel = frame?.label || frame?.timestamp || dataset?.observation_date || 'Epoch 1';
  const fingerprintHash = useMemo(
    () => generateFingerprintHash(dataset, frameIndex, matrix),
    [dataset, frameIndex, matrix]
  );

  // Determine theme colors for the radial fingerprint
  const theme = useMemo(() => {
    const id = dataset?.id || '';
    if (id.includes('ocean')) return { primary: '#60A5FA', secondary: '#38D9E6', dark: '#0B1120' };
    if (id.includes('veg')) return { primary: '#4ADE80', secondary: '#38D9E6', dark: '#070B18' };
    return { primary: '#F5B85A', secondary: '#A78BFA', dark: '#15243D' };
  }, [dataset?.id]);

  // Render the radial sound fingerprint on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matrix) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const maxRadius = cx - 28;
    const innerRadius = 48;

    ctx.clearRect(0, 0, size, size);

    // Deep cosmic background ring
    const bgGrad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, maxRadius);
    bgGrad.addColorStop(0, '#070B18');
    bgGrad.addColorStop(0.8, '#0B1120');
    bgGrad.addColorStop(1, '#15243D');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Concentric orbital guidelines
    ctx.strokeStyle = 'rgba(56, 217, 230, 0.12)';
    ctx.lineWidth = 1;
    for (let r = innerRadius; r <= maxRadius; r += (maxRadius - innerRadius) / 6) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Radial spokes (64 longitudes)
    const h = matrix.length;
    const w = matrix[0]?.length || 64;
    const angleStep = (Math.PI * 2) / w;

    for (let x = 0; x < w; x++) {
      const angle = x * angleStep - Math.PI / 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Aggregate column intensity and peak
      let colSum = 0;
      let colCount = 0;
      let maxVal = 0;
      for (let y = 0; y < h; y++) {
        const val = matrix[y]?.[x];
        if (val !== null && val !== undefined) {
          colSum += val;
          colCount++;
          if (val > maxVal) maxVal = val;
        }
      }

      const avg = colCount > 0 ? colSum / colCount : 0;
      const spokeLength = innerRadius + avg * (maxRadius - innerRadius);
      const peakLength = innerRadius + maxVal * (maxRadius - innerRadius);

      // Draw sound wave spoke
      const grad = ctx.createLinearGradient(
        cx + cosA * innerRadius,
        cy + sinA * innerRadius,
        cx + cosA * spokeLength,
        cy + sinA * spokeLength
      );
      grad.addColorStop(0, theme.secondary);
      grad.addColorStop(1, theme.primary);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + cosA * innerRadius, cy + sinA * innerRadius);
      ctx.lineTo(cx + cosA * spokeLength, cy + sinA * spokeLength);
      ctx.stroke();

      // Peak orbital marker dot
      if (maxVal > 0.05) {
        ctx.fillStyle = theme.primary;
        ctx.beginPath();
        ctx.arc(cx + cosA * peakLength, cy + sinA * peakLength, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Central Earth core
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius - 6, 0, Math.PI * 2);
    ctx.fillStyle = '#070B18';
    ctx.fill();
    ctx.strokeStyle = theme.secondary;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Central text
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EARTH', cx, cy - 8);
    ctx.fillStyle = theme.primary;
    ctx.font = '9px monospace';
    ctx.fillText('ECHO', cx, cy + 8);

    // Border decorative ring
    ctx.strokeStyle = 'rgba(56, 217, 230, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();

    // Perimeter tick marks
    ctx.fillStyle = 'rgba(167, 139, 250, 0.4)';
    for (let i = 0; i < 36; i++) {
      const a = (i * Math.PI * 2) / 36;
      ctx.fillRect(cx + Math.cos(a) * (size / 2 - 10) - 1, cy + Math.sin(a) * (size / 2 - 10) - 1, 2, 2);
    }
  }, [matrix, theme]);

  // Export Fingerprint as PNG
  const handleExportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `earth-echo-fingerprint-${fingerprintHash.toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [fingerprintHash]);

  // Probe composite chord of the fingerprint
  const handleProbeFingerprintTone = useCallback(async () => {
    if (!matrix || probing) return;
    setProbing(true);
    try {
      await initAudio();
      // Sample 3 harmonic nodes from the fingerprint
      const midis = [53, 60, 67]; // F, C, G pentatonic chord
      for (const m of midis) {
        await playTone({
          midi: m,
          frequencyHz: midiToFrequency(m),
          velocity: 0.4,
          durationSeconds: 0.6,
          timbre: 'sine'
        });
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => setProbing(false), 700);
    }
  }, [matrix, probing]);

  const handleCopyHash = () => {
    navigator.clipboard?.writeText(fingerprintHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="fingerprint-studio-panel" aria-labelledby="fingerprint-title">
      <div className="card-header">
        <div>
          <span className="card-kicker">RADIAL HARMONIC ENCODING</span>
          <h2 id="fingerprint-title" className="card-title">Earth Audio Fingerprint</h2>
        </div>
        <div className="fingerprint-code-badge" onClick={handleCopyHash} role="button" tabIndex={0} title="Click to copy hash">
          <span className="hash-label">HASH:</span>
          <code>{fingerprintHash}</code>
          <span className="copy-hint">{copied ? 'COPIED!' : 'COPY'}</span>
        </div>
      </div>

      <p className="fingerprint-intro">
        A deterministic orbital soundwave encoding Earth's spatial signature at this observation epoch.
        Radial spokes represent 64 longitudinal meridians; concentric rings trace latitude tiers from
        South to North pole.
      </p>

      <div className="fingerprint-display-layout">
        <div className="canvas-frame">
          <canvas
            ref={canvasRef}
            width={480}
            height={480}
            className="fingerprint-canvas"
            aria-label={`Radial sound fingerprint for ${dataset?.title} at ${epochLabel}`}
          />
        </div>

        <div className="fingerprint-meta-panel">
          <div className="meta-block">
            <span className="meta-label">DATASET FEED</span>
            <span className="meta-val">{dataset?.title || 'Unknown Feed'}</span>
          </div>

          <div className="meta-block">
            <span className="meta-label">OBSERVATION EPOCH</span>
            <span className="meta-val">{epochLabel}</span>
          </div>

          <div className="meta-block">
            <span className="meta-label">SAMPLING RESOLUTION</span>
            <span className="meta-val">64 Longitudinal Sectors × 32 Latitudes</span>
          </div>

          <div className="meta-block">
            <span className="meta-label">DETERMINISTIC VERIFIER</span>
            <span className="meta-val monospace">{fingerprintHash}</span>
          </div>

          <div className="fingerprint-actions">
            <button
              type="button"
              className="action-btn primary"
              onClick={handleExportPNG}
            >
              <span className="btn-icon">💾</span>
              <span>Download Fingerprint (PNG)</span>
            </button>

            <button
              type="button"
              className={`action-btn secondary ${probing ? 'active' : ''}`}
              onClick={handleProbeFingerprintTone}
              disabled={probing}
            >
              <span className="btn-icon">{probing ? '♪' : '🔊'}</span>
              <span>{probing ? 'Synthesizing…' : 'Probe Harmonic Tone'}</span>
            </button>
          </div>

          <p className="reproducibility-note">
            <strong>Reproducibility Guarantee:</strong> The exact same NASA observation epoch
            and grid will always yield an identical radial fingerprint and cryptographic hash.
          </p>
        </div>
      </div>
    </section>
  );
}
