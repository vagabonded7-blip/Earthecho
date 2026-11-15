import React, { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function getMatrix(dataset, frameIndex) {
  if (!dataset) return null;
  const frame = dataset.frames?.[frameIndex];
  if (frame?.values) {
    const ch = dataset.channels?.[0]?.id || Object.keys(frame.values)[0];
    return frame.values[ch] || null;
  }
  return dataset.values || null;
}

function kindOf(id = '') {
  if (/ocean|sea/.test(id)) return 'ocean';
  if (/veg|forest|ndvi/.test(id)) return 'veg';
  return 'lights';
}

export default function EarthGlobe({
  dataset,
  frameIndex,
  selectedLocation,
  onSelectLocation,
  isGlobalView,
  onToggleView,
  focusCoords
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const pulseRef = useRef(0);

  // 3D Navigation State: Rotation, Tilt, and Zoom
  const [rotation, setRotation] = useState(0.8); // Y-axis rotation (radians)
  const [tilt, setTilt] = useState(0.12);        // X-axis tilt (radians)
  const [zoom, setZoom] = useState(1.0);         // Zoom scale [0.75 - 2.8]

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const startAngles = useRef({ rot: 0, tilt: 0 });
  const pinchDist = useRef(null);
  const targetRotationRef = useRef(null);

  const matrix = getMatrix(dataset, frameIndex);
  const kind = kindOf(dataset?.id);
  const w = dataset?.width || 64;
  const h = dataset?.height || 32;

  // Fly-to animation when focusCoords changes (e.g. from location search)
  useEffect(() => {
    if (!focusCoords || isGlobalView) return;
    const { lon } = focusCoords;
    // Calculate target Y-axis rotation to face the viewer
    // In our polar coordinates, lon = 0 is centered when rotation = 0
    let target = -(lon * (Math.PI / 180));
    // Normalize target angle within [-PI, PI] relative to current rotation
    const diff = ((target - rotation + Math.PI) % (Math.PI * 2)) - Math.PI;
    targetRotationRef.current = rotation + diff;
  }, [focusCoords, isGlobalView]);

  // Smooth rotation animation loop (idle spin + fly-to lerp)
  useEffect(() => {
    if (isGlobalView) return undefined;
    let lastTime = performance.now();

    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      pulseRef.current = (pulseRef.current + dt * 2.5) % (Math.PI * 2);

      if (targetRotationRef.current !== null) {
        // Smooth lerp to target coordinate
        setRotation((current) => {
          const delta = targetRotationRef.current - current;
          if (Math.abs(delta) < 0.005) {
            const finalVal = targetRotationRef.current;
            targetRotationRef.current = null;
            return finalVal;
          }
          return current + delta * 0.14;
        });
      } else if (!isDragging.current) {
        // Slow ambient rotation
        setRotation((prev) => (prev + dt * 0.08) % (Math.PI * 2));
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [isGlobalView]);

  // ── Render Globe (3D Orthographic or 2D Equirectangular) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matrix) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (isGlobalView) {
      // ══════════════════════════════════════════════════════════
      // 2D EQUIRRECTANGULAR SCIENTIFIC MAP
      // ══════════════════════════════════════════════════════════
      const cw = width / w;
      const ch = height / h;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const val = matrix[y]?.[x];
          if (val === null || val === undefined) {
            ctx.fillStyle = '#050914';
          } else {
            const t = clamp(val, 0, 1);
            if (kind === 'ocean') {
              ctx.fillStyle = `rgb(${(15 + t * 50) | 0}, ${(40 + t * 180) | 0}, ${(100 + t * 155) | 0})`;
            } else if (kind === 'veg') {
              ctx.fillStyle = `rgb(${(15 + (1 - t) * 60) | 0}, ${(45 + t * 180) | 0}, ${(25 + t * 80) | 0})`;
            } else {
              ctx.fillStyle = `rgb(${(t * 255) | 0}, ${(t * 215) | 0}, ${(t * 120) | 0})`;
            }
          }
          ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
        }
      }

      // Lat/Lon gridlines
      ctx.strokeStyle = 'rgba(56, 217, 230, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, width, height);

      // Equator & Prime Meridian
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      // Draw Selected Location Pin in 2D
      if (selectedLocation) {
        const pinX = ((selectedLocation.lon + 180) / 360) * width;
        const pinY = ((90 - selectedLocation.lat) / 180) * height;

        // Outer pulsing ring
        const pulse = Math.sin(pulseRef.current) * 4 + 8;
        ctx.strokeStyle = '#38D9E6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pinX, pinY, pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Pin center dot
        ctx.fillStyle = '#38D9E6';
        ctx.beginPath();
        ctx.arc(pinX, pinY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Text label
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(selectedLocation.name || 'Selected', pinX + 8, pinY - 6);
      }

    } else {
      // ══════════════════════════════════════════════════════════
      // 3D ORTHOGRAPHIC PHOTOREALISTIC EARTH GLOBE
      // ══════════════════════════════════════════════════════════
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.44;
      const radius = baseRadius * zoom;

      // 1. Atmospheric Outer Glow
      const atmoGrad = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.25);
      atmoGrad.addColorStop(0, 'rgba(56, 217, 230, 0.32)');
      atmoGrad.addColorStop(0.35, 'rgba(96, 165, 250, 0.14)');
      atmoGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = atmoGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // 2. Base Celestial Globe
      const sphereBg = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      sphereBg.addColorStop(0, '#0D172A');
      sphereBg.addColorStop(0.7, '#070D1B');
      sphereBg.addColorStop(1, '#03060C');
      ctx.fillStyle = sphereBg;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Project Dataset Grid onto 3D Sphere Surface
      // Sampling step scales dynamically with zoom for sharp rendering
      const step = Math.max(2.0, 3.0 / zoom);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);

      for (let py = -radius; py <= radius; py += step) {
        const yNorm = -py / radius;
        if (Math.abs(yNorm) >= 1) continue;
        const xSpan = Math.sqrt(1 - yNorm * yNorm);

        for (let px = -xSpan * radius; px <= xSpan * radius; px += step) {
          const xNorm = px / radius;
          const zSq = 1 - xNorm * xNorm - yNorm * yNorm;
          if (zSq <= 0) continue;
          const zNorm = Math.sqrt(zSq);

          // Invert pitch tilt (X-axis)
          const y1 = yNorm * cosT + zNorm * sinT;
          const z1 = -yNorm * sinT + zNorm * cosT;
          const x1 = xNorm;

          // Invert azimuth rotation (Y-axis)
          const X = x1 * cosR - z1 * sinR;
          const Z = x1 * sinR + z1 * cosR;
          const Y = y1;

          // Sphere Polar Coordinates
          const lat = Math.asin(clamp(Y, -1, 1));
          const lon = Math.atan2(X, Z);

          const gridY = clamp(Math.floor((1 - (lat / Math.PI + 0.5)) * h), 0, h - 1);
          const gridX = clamp(Math.floor(((lon / Math.PI + 1) * 0.5) * w), 0, w - 1);

          const val = matrix[gridY]?.[gridX];
          if (val === null || val === undefined) continue;

          const t = clamp(val, 0, 1);
          if (t <= 0.015) continue;

          // 3D Limb darkening factor for depth curvature
          const limb = Math.pow(zNorm, 0.65);

          let r, g, b, alpha;
          if (kind === 'ocean') {
            r = (15 + t * 50);
            g = (40 + t * 180);
            b = (120 + t * 135);
            alpha = (0.25 + t * 0.75) * limb;
          } else if (kind === 'veg') {
            r = (15 + (1 - t) * 50);
            g = (40 + t * 190);
            b = (25 + t * 80);
            alpha = (0.3 + t * 0.7) * limb;
          } else {
            // Golden-amber city lights with white core
            r = (t * 255);
            g = (t * 220);
            b = (t * 130);
            alpha = (0.35 + t * 0.65) * (0.85 + 0.15 * limb);
          }

          ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
          ctx.fillRect(cx + px - step / 2, cy + py - step / 2, step * 1.35, step * 1.35);
        }
      }

      // 4. Atmospheric Rim Shading Overlay
      const limbGrad = ctx.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius);
      limbGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      limbGrad.addColorStop(0.85, 'rgba(7, 13, 27, 0.45)');
      limbGrad.addColorStop(1, 'rgba(56, 217, 230, 0.4)');
      ctx.fillStyle = limbGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Outer crisp atmospheric rim line
      ctx.strokeStyle = 'rgba(56, 217, 230, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 5. Draw 3D Selection Pin Marker (Pinned to Globe Surface)
      if (selectedLocation) {
        const latRad = selectedLocation.lat * (Math.PI / 180);
        const lonRad = selectedLocation.lon * (Math.PI / 180);

        // Unit sphere coordinates
        const Y = Math.sin(latRad);
        const cosLat = Math.cos(latRad);
        const X = cosLat * Math.sin(lonRad);
        const Z = cosLat * Math.cos(lonRad);

        // Rotate by Y-axis azimuth (rotation)
        const x1 = X * cosR + Z * sinR;
        const y1 = Y;
        const z1 = -X * sinR + Z * cosR;

        // Rotate by X-axis tilt
        const xScreen = x1;
        const yScreen = y1 * cosT - z1 * sinT;
        const zScreen = y1 * sinT + z1 * cosT;

        // Only draw pin if on the visible hemisphere facing the camera
        if (zScreen > 0) {
          const pinX = cx + xScreen * radius;
          const pinY = cy - yScreen * radius;

          // Animated sonar pulse ring
          const pulse = (Math.sin(pulseRef.current) * 0.5 + 0.5) * 10 + 6;
          ctx.strokeStyle = 'rgba(56, 217, 230, 0.85)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(pinX, pinY, pulse, 0, Math.PI * 2);
          ctx.stroke();

          // Anchor core dot
          ctx.fillStyle = '#38D9E6';
          ctx.shadowColor = '#38D9E6';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(pinX, pinY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0; // reset

          // Vertical pin stem line
          const stemHeight = 22;
          ctx.strokeStyle = '#38D9E6';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pinX, pinY);
          ctx.lineTo(pinX, pinY - stemHeight);
          ctx.stroke();

          // Floating Location Badge Pill
          const label = selectedLocation.name || 'Selected Point';
          ctx.font = '700 11px Inter, sans-serif';
          const textMetrics = ctx.measureText(label);
          const badgeW = textMetrics.width + 16;
          const badgeH = 20;
          const badgeX = pinX - badgeW / 2;
          const badgeY = pinY - stemHeight - badgeH;

          // Badge background
          ctx.fillStyle = 'rgba(11, 19, 36, 0.9)';
          ctx.strokeStyle = '#38D9E6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
          } else {
            ctx.rect(badgeX, badgeY, badgeW, badgeH);
          }
          ctx.fill();
          ctx.stroke();

          // Badge text
          ctx.fillStyle = '#F8FAFC';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, pinX, badgeY + badgeH / 2);
          ctx.textAlign = 'start'; // reset
          ctx.textBaseline = 'alphabetic'; // reset
        }
      }
    }
  }, [matrix, rotation, tilt, zoom, isGlobalView, kind, w, h, selectedLocation]);

  // ── Mouse & Touch Gesture Handlers ──
  const handlePointerDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    startAngles.current = { rot: rotation, tilt };
    targetRotationRef.current = null; // stop any programmatic fly-to
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (isGlobalView) return;

    // Y-axis rotation (drag horizontally)
    setRotation(startAngles.current.rot + dx / (130 * zoom));
    // X-axis tilt (drag vertically, clamped)
    const newTilt = startAngles.current.tilt + dy / (180 * zoom);
    setTilt(clamp(newTilt, -0.75, 0.75));
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  // Wheel Zoom (Mouse & Trackpad)
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => clamp(prev * zoomFactor, 0.75, 2.8));
  };

  // Touch Pinch-to-Zoom for mobile
  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      if (pinchDist.current !== null) {
        const delta = dist / pinchDist.current;
        setZoom((prev) => clamp(prev * delta, 0.75, 2.8));
      }
      pinchDist.current = dist;
    }
  };

  const handleTouchEnd = () => {
    pinchDist.current = null;
  };

  // Click on Earth: Raycast & Select Geographical Location
  const handleCanvasClick = (e) => {
    if (isDragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !onSelectLocation) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (isGlobalView) {
      // 2D Equirectangular map click
      const lon = -180 + (clickX / rect.width) * 360;
      const lat = 90 - (clickY / rect.height) * 180;
      onSelectLocation({ lat: clamp(lat, -90, 90), lon: clamp(lon, -180, 180) });
      return;
    }

    // 3D Sphere Raycast
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const baseRadius = Math.min(rect.width, rect.height) * 0.44;
    const radius = baseRadius * zoom;

    const px = clickX - cx;
    const py = clickY - cy;
    const dSq = px * px + py * py;

    // Check if clicked inside the sphere circle
    if (dSq <= radius * radius) {
      const xNorm = px / radius;
      const yNorm = -py / radius;
      const zNorm = Math.sqrt(1 - xNorm * xNorm - yNorm * yNorm);

      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);

      // Invert tilt around X-axis
      const y1 = yNorm * cosT + zNorm * sinT;
      const z1 = -yNorm * sinT + zNorm * cosT;
      const x1 = xNorm;

      // Invert azimuth around Y-axis
      const X = x1 * cosR - z1 * sinR;
      const Z = x1 * sinR + z1 * cosR;
      const Y = y1;

      const lat = Math.asin(clamp(Y, -1, 1)) * (180 / Math.PI);
      const lon = Math.atan2(X, Z) * (180 / Math.PI);

      onSelectLocation({ lat: clamp(lat, -90, 90), lon: clamp(lon, -180, 180) });
    }
  };

  // Zoom control buttons
  const handleZoomIn = () => setZoom((prev) => clamp(prev * 1.25, 0.75, 2.8));
  const handleZoomOut = () => setZoom((prev) => clamp(prev * 0.8, 0.75, 2.8));
  const handleResetView = () => {
    setZoom(1.0);
    setTilt(0.12);
    setRotation(0.8);
    targetRotationRef.current = null;
  };

  const displayDatasetName = dataset?.name ||
    (dataset?.title?.includes('Night Lights') ? 'Night Lights' :
     dataset?.title?.includes('Sea Surface') ? 'Ocean' :
     dataset?.title?.includes('Vegetation') ? 'Vegetation' :
     dataset?.title?.replace(/\s*\(.*?\)/, '') || 'Night Lights');

  const currentEpochYear = dataset?.frames?.[frameIndex]?.label ||
    dataset?.frames?.[frameIndex]?.timestamp?.match(/\d{4}/)?.[0] ||
    dataset?.observation_date?.match(/\d{4}/)?.[0] ||
    '2023';

  return (
    <div className="earth-viewport-container">
      <div className="viewport-header">
        <h3 className="viewport-title">EARTH OBSERVATION</h3>
        <div className="viewport-header-actions">
          <button
            type="button"
            className="view-toggle-btn"
            onClick={onToggleView}
            title={isGlobalView ? 'Switch to 3D Globe View' : 'Switch to 2D Global Map View'}
          >
            {isGlobalView ? 'GLOBE VIEW' : 'GLOBAL VIEW'}
          </button>
        </div>
      </div>

      <div
        className="viewport-stage"
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={520}
          height={380}
          className="earth-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleCanvasClick}
          title={isGlobalView ? 'Click any point on the map to inspect' : 'Click to select location · Drag to rotate · Scroll to zoom'}
        />

        {/* Floating Zoom and Viewport Controls */}
        <div className="floating-globe-controls" aria-label="Globe navigation controls">
          <button
            type="button"
            className="globe-ctrl-btn"
            onClick={handleZoomIn}
            title="Zoom In (+)"
            aria-label="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            className="globe-ctrl-btn"
            onClick={handleZoomOut}
            title="Zoom Out (−)"
            aria-label="Zoom Out"
          >
            −
          </button>
          <button
            type="button"
            className="globe-ctrl-btn reset-btn"
            onClick={handleResetView}
            title="Reset View"
            aria-label="Reset View"
          >
            ⟲
          </button>
        </div>

        {/* Selected Coordinates Overlay Badge */}
        {selectedLocation && (
          <div className="selected-coord-pill" title="Selected Location">
            <span className="coord-dot" />
            <span>{selectedLocation.name || 'Selected'}</span>
            <span className="coord-latlon">{selectedLocation.latStr}, {selectedLocation.lonStr}</span>
          </div>
        )}
      </div>

      <div className="viewport-footer">
        <span className="footer-dataset-label">
          Dataset: {displayDatasetName}
        </span>
        <span className="footer-year-label">
          {currentEpochYear}
        </span>
      </div>
    </div>
  );
}
