import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initAudio, playTone } from '../audio/audioEngine.js';
import { midiToFrequency, selectScaleNote } from '../audio/scales.js';

// Deterministic 32-bit hash function
function computeHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function generateFingerprintId(datasetId, frameYear, lat, lon, value) {
  const dsCode = datasetId.includes('ocean') ? 'OC' : datasetId.includes('veg') ? 'VG' : 'NL';
  const yr = String(frameYear).slice(-2);
  const latC = `${Math.abs(Math.round(lat))}${lat >= 0 ? 'N' : 'S'}`;
  const lonC = `${Math.abs(Math.round(lon))}${lon >= 0 ? 'E' : 'W'}`;
  const valSeed = value !== null && value !== undefined ? Math.round(value * 1000) : 0;
  const hash = computeHash(`${datasetId}-${frameYear}-${lat.toFixed(2)}-${lon.toFixed(2)}-${valSeed}`);
  return `EE-${dsCode}${yr}-${latC}${lonC}-${hash.slice(0, 4)}`;
}

export default function FingerprintCard({
  dataset,
  frameIndex,
  selectedLocation,
  dataValue,
  size = 180
}) {
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  const datasetId = dataset?.id || 'night_lights_2012_2023';
  const frameYear = dataset?.frames?.[frameIndex]?.label ||
    dataset?.frames?.[frameIndex]?.timestamp?.match(/\d{4}/)?.[0] ||
    dataset?.observation_date?.match(/\d{4}/)?.[0] ||
    '2023';

  const lat = selectedLocation?.lat ?? 19.076;
  const lon = selectedLocation?.lon ?? 72.8777;

  const fingerprintId = useMemo(
    () => generateFingerprintId(datasetId, frameYear, lat, lon, dataValue),
    [datasetId, frameYear, lat, lon, dataValue]
  );

  // Palette theme based on dataset
  const theme = useMemo(() => {
    if (datasetId.includes('ocean')) return { primary: '#60A5FA', secondary: '#38D9E6', glow: 'rgba(96, 165, 250, 0.4)' };
    if (datasetId.includes('veg')) return { primary: '#4ADE80', secondary: '#38D9E6', glow: 'rgba(74, 222, 128, 0.4)' };
    return { primary: '#38D9E6', secondary: '#A78BFA', glow: 'rgba(56, 217, 230, 0.4)' };
  }, [datasetId]);

  // Render Circular Radial Acoustic Fingerprint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const outerRadius = cx - 12;
    const innerRadius = 24;

    ctx.clearRect(0, 0, w, h);

    // Deep cosmic background disc
    const bgGrad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
    bgGrad.addColorStop(0, '#070B18');
    bgGrad.addColorStop(0.7, '#0B1324');
    bgGrad.addColorStop(1, '#050811');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Concentric harmonic tracks
    ctx.strokeStyle = 'rgba(56, 217, 230, 0.14)';
    ctx.lineWidth = 1;
    for (let r = innerRadius; r <= outerRadius; r += (outerRadius - innerRadius) / 5) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 48 Spectral spokes mapped to location coordinates & data value
    const spokeCount = 48;
    const angleStep = (Math.PI * 2) / spokeCount;
    const seedNum = parseInt(fingerprintId.slice(-4), 16) || 42;

    for (let i = 0; i < spokeCount; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Deterministic harmonic formula
      const wave = Math.sin(i * 0.4 + (lat / 15)) * 0.5 + 0.5;
      const spike = Math.cos(i * 1.2 + (lon / 25) + seedNum) * 0.3 + 0.7;
      const valWeight = dataValue !== null && dataValue !== undefined ? dataValue : 0.4;
      const spokeLength = (outerRadius - innerRadius) * (0.3 + 0.7 * wave * spike * (0.5 + 0.5 * valWeight));

      const rStart = innerRadius;
      const rEnd = innerRadius + spokeLength;

      const isSpecial = (i % 6 === 0);
      ctx.strokeStyle = isSpecial ? theme.secondary : theme.primary;
      ctx.lineWidth = isSpecial ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + cosA * rStart, cy + sinA * rStart);
      ctx.lineTo(cx + cosA * rEnd, cy + sinA * rEnd);
      ctx.stroke();
    }

    // Location coordinate angle notch
    const locAngle = ((lon + 180) / 360) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(locAngle) * (innerRadius - 4), cy + Math.sin(locAngle) * (innerRadius - 4));
    ctx.lineTo(cx + Math.cos(locAngle) * (outerRadius + 4), cy + Math.sin(locAngle) * (outerRadius + 4));
    ctx.stroke();

    // Center Core Ring
    ctx.fillStyle = theme.primary;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    // Outer Rim
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.stroke();
  }, [fingerprintId, lat, lon, dataValue, theme]);

  // Play distinctive fingerprint acoustic motif
  const handlePlayFingerprint = useCallback(async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      await initAudio();
      // Generate a 3-note harmonic triad from the fingerprint
      const seedVal = dataValue !== null && dataValue !== undefined ? dataValue : 0.5;
      const pos = Math.max(0, Math.min(1, seedVal));

      const midiRoot = selectScaleNote(pos, { tonicMidi: 55, minMidi: 48, maxMidi: 79, mode: 'majorPentatonic' });
      const midiThird = selectScaleNote(Math.min(1, pos + 0.25), { tonicMidi: 55, minMidi: 48, maxMidi: 79, mode: 'majorPentatonic' });
      const midiFifth = selectScaleNote(Math.min(1, pos + 0.5), { tonicMidi: 55, minMidi: 48, maxMidi: 79, mode: 'majorPentatonic' });

      await playTone({
        midi: midiRoot,
        frequencyHz: midiToFrequency(midiRoot),
        velocity: 0.7,
        durationSeconds: 0.35,
        timbre: 'triangle'
      });

      setTimeout(() => {
        playTone({
          midi: midiThird,
          frequencyHz: midiToFrequency(midiThird),
          velocity: 0.65,
          durationSeconds: 0.4,
          timbre: 'sine'
        });
      }, 180);

      setTimeout(() => {
        playTone({
          midi: midiFifth,
          frequencyHz: midiToFrequency(midiFifth),
          velocity: 0.6,
          durationSeconds: 0.6,
          timbre: 'sine'
        });
      }, 360);

      setTimeout(() => setIsPlaying(false), 900);
    } catch {
      setIsPlaying(false);
    }
  }, [isPlaying, dataValue]);

  // Export as PNG image download
  const handleDownloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Earth-Echo-Fingerprint-${fingerprintId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Copy unique ID to clipboard
  const handleCopyId = () => {
    navigator.clipboard?.writeText(fingerprintId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Copy shareable restoration URL
  const handleShareLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('dataset', datasetId);
    url.searchParams.set('year', frameYear);
    url.searchParams.set('lat', lat.toFixed(4));
    url.searchParams.set('lon', lon.toFixed(4));
    navigator.clipboard?.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fingerprint-card-widget">
      <div className="fingerprint-visual-frame">
        <canvas
          ref={canvasRef}
          width={size * 2}
          height={size * 2}
          style={{ width: `${size}px`, height: `${size}px` }}
          className="fingerprint-canvas-el"
        />
      </div>

      <div className="fingerprint-info-block">
        <div className="fingerprint-badge" onClick={handleCopyId} title="Click to copy ID">
          <code>{fingerprintId}</code>
          <span className="copy-state-tag">{copied ? 'COPIED!' : 'COPY'}</span>
        </div>

        <div className="fingerprint-action-row">
          <button
            type="button"
            className={`fp-action-btn ${isPlaying ? 'playing' : ''}`}
            onClick={handlePlayFingerprint}
            title="Hear this location's unique audio fingerprint"
          >
            {isPlaying ? '▶ Playing...' : '♫ Play Motif'}
          </button>

          <button
            type="button"
            className="fp-action-btn secondary"
            onClick={handleDownloadPNG}
            title="Export fingerprint visualization as PNG"
          >
            ⇣ PNG
          </button>

          <button
            type="button"
            className="fp-action-btn secondary"
            onClick={handleShareLink}
            title="Copy shareable link with this exact location and dataset"
          >
            🔗 Share
          </button>
        </div>
      </div>
    </div>
  );
}

