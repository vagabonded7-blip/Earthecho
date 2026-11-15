import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { findNearestLocation } from '../data/worldLocations.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Convert Latitude & Longitude to 3D Cartesian coordinates on sphere
function latLonToVector3(lat, lon, radius = 1.0) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Convert 3D Cartesian point on sphere back to Latitude & Longitude
function vector3ToLatLon(v) {
  const norm = v.clone().normalize();
  const lat = 90 - Math.acos(clamp(norm.y, -1, 1)) * (180 / Math.PI);
  let lon = (Math.atan2(norm.z, -norm.x) * (180 / Math.PI)) - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

// Custom Atmospheric Rayleigh Scattering Shader (ethereal NASA orbit glow)
const AtmosphereShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vec3 viewDir = normalize(-vPosition);
      float intensity = pow(0.68 - dot(vNormal, viewDir), 2.8);
      vec3 atmosphereColor = vec3(0.24, 0.68, 0.98); // Rayleigh blue rim
      gl_FragColor = vec4(atmosphereColor, intensity * 0.95);
    }
  `
};

export default function EarthGlobe({
  dataset,
  frameIndex,
  selectedLocation,
  onSelectLocation,
  isGlobalView,
  onToggleView,
  focusCoords
}) {
  const threeMountRef = useRef(null);
  const canvas2dRef = useRef(null);

  // References for Three.js scene
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const earthGroupRef = useRef(null);
  const earthMeshRef = useRef(null);
  const selectedPinGroupRef = useRef(null);
  const pulseRingRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const texturesCacheRef = useRef({});

  // Interaction & camera targets
  const isDraggingRef = useRef(false);
  const previousPointerRef = useRef({ x: 0, y: 0 });
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const rotationTargetRef = useRef({ x: 0.14, y: 0.9 });
  const cameraDistanceTargetRef = useRef(2.75);
  const flyToTargetRef = useRef(null);

  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Determine dataset key: 'night_lights', 'ocean', or 'vegetation'
  const datasetKey = useMemo(() => {
    const group = dataset?.comparison_group?.toLowerCase() || '';
    const id = dataset?.id?.toLowerCase() || '';
    const title = dataset?.title?.toLowerCase() || '';

    if (group.includes('ocean') || id.includes('ocean') || id.includes('sea') || title.includes('sea') || title.includes('ocean')) {
      return 'ocean';
    }
    if (group.includes('veg') || id.includes('veg') || title.includes('veg')) {
      return 'vegetation';
    }
    return 'night_lights';
  }, [dataset]);

  // Helper to load or retrieve cached texture
  const getTexture = useCallback((key) => {
    if (texturesCacheRef.current[key]) {
      return texturesCacheRef.current[key];
    }
    const loader = new THREE.TextureLoader();
    const url = key === 'ocean'
      ? '/assets/earth_ocean_1024.jpg'
      : key === 'vegetation'
        ? '/assets/earth_veg_1024.jpg'
        : '/assets/earth_night_1024.jpg';

    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    texturesCacheRef.current[key] = tex;
    return tex;
  }, []);

  // ── 1. Setup Three.js WebGL Scene ──
  useEffect(() => {
    if (isGlobalView) return;
    const container = threeMountRef.current;
    if (!container) return;

    const width = container.clientWidth || 520;
    const height = container.clientHeight || 380;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, cameraDistanceTargetRef.current);
    cameraRef.current = camera;

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 3. Main Earth Group (sphere + markers)
    const earthGroup = new THREE.Group();
    earthGroup.rotation.x = rotationTargetRef.current.x;
    earthGroup.rotation.y = rotationTargetRef.current.y;
    scene.add(earthGroup);
    earthGroupRef.current = earthGroup;

    // 4. Smooth Realistic Earth Sphere (No spikes)
    const initialTex = getTexture(datasetKey);
    const earthGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: initialTex,
      roughness: datasetKey === 'ocean' ? 0.35 : datasetKey === 'vegetation' ? 0.75 : 0.65,
      metalness: datasetKey === 'ocean' ? 0.15 : 0.05
    });

    if (datasetKey === 'night_lights') {
      earthMat.emissiveMap = initialTex;
      earthMat.emissive = new THREE.Color(0xFFE890);
      earthMat.emissiveIntensity = 0.55;
    }

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // 5. Atmospheric Rayleigh Scattering Halo
    const atmoGeo = new THREE.SphereGeometry(1.032, 64, 64);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: AtmosphereShader.vertexShader,
      fragmentShader: AtmosphereShader.fragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    earthGroup.add(atmoMesh);

    // 6. Selected Location Reticle & Beacon Marker Group
    const pinGroup = new THREE.Group();
    pinGroup.visible = false;

    // Center illuminated beacon bead
    const pinDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x38D9F6 })
    );
    pinGroup.add(pinDot);

    // Surface targeting reticle ring (flush with planet surface)
    const ringGeo = new THREE.RingGeometry(0.024, 0.035, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38D9F6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    pinGroup.add(ringMesh);

    // Pulsing outer radar ring
    const pulseGeo = new THREE.RingGeometry(0.042, 0.052, 32);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x7DF9FF,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });
    const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
    pulseRing.rotation.x = Math.PI / 2;
    pinGroup.add(pulseRing);
    pulseRingRef.current = pulseRing;

    // Subtle perpendicular pinpoint stem
    const stemPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.06, 0)];
    const stemGeo = new THREE.BufferGeometry().setFromPoints(stemPoints);
    const stemMat = new THREE.LineBasicMaterial({ color: 0x38D9F6, transparent: true, opacity: 0.7 });
    const stemLine = new THREE.Line(stemGeo, stemMat);
    pinGroup.add(stemLine);

    earthGroup.add(pinGroup);
    selectedPinGroupRef.current = pinGroup;

    // 7. Lighting
    const sunLight = new THREE.DirectionalLight(0xFFFFFF, 2.4);
    sunLight.position.set(5, 3, 4);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x0C182B, 0.6);
    scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0x38D9E6, 0.9);
    rimLight.position.set(-5, -2, -3);
    scene.add(rimLight);

    // 8. Animation Loop
    let pulseT = 0;
    const animate = () => {
      pulseT += 0.045;

      // Smooth camera distance interpolation
      camera.position.z += (cameraDistanceTargetRef.current - camera.position.z) * 0.1;

      // Smooth rotation interpolation
      if (flyToTargetRef.current) {
        const dy = flyToTargetRef.current.y - earthGroup.rotation.y;
        const dx = flyToTargetRef.current.x - earthGroup.rotation.x;
        earthGroup.rotation.y += dy * 0.1;
        earthGroup.rotation.x += dx * 0.1;
        if (Math.abs(dy) < 0.002 && Math.abs(dx) < 0.002) {
          flyToTargetRef.current = null;
        }
      } else if (!isDraggingRef.current) {
        // Subtle ambient continuous spin
        rotationTargetRef.current.y += 0.0012;
        earthGroup.rotation.y += (rotationTargetRef.current.y - earthGroup.rotation.y) * 0.08;
        earthGroup.rotation.x += (rotationTargetRef.current.x - earthGroup.rotation.x) * 0.08;
      } else {
        earthGroup.rotation.y += (rotationTargetRef.current.y - earthGroup.rotation.y) * 0.18;
        earthGroup.rotation.x += (rotationTargetRef.current.x - earthGroup.rotation.x) * 0.18;
      }

      // Selected Reticle Pulse Animation
      if (pulseRingRef.current) {
        const pScale = 1.0 + Math.sin(pulseT * 2.8) * 0.25;
        pulseRingRef.current.scale.set(pScale, pScale, pScale);
        pulseRingRef.current.material.opacity = 0.4 + Math.sin(pulseT * 2.8) * 0.35;
      }

      renderer.render(scene, camera);
      animFrameIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    // 9. Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 520;
      const h = container.clientHeight || 380;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [isGlobalView, getTexture, datasetKey]);

  // ── 2. Update Earth Texture when Dataset Changes ──
  useEffect(() => {
    if (!earthMeshRef.current) return;
    const mat = earthMeshRef.current.material;
    const tex = getTexture(datasetKey);

    mat.map = tex;
    if (datasetKey === 'night_lights') {
      mat.emissiveMap = tex;
      mat.emissive = new THREE.Color(0xFFE890);
      mat.emissiveIntensity = 0.55;
      mat.roughness = 0.65;
      mat.metalness = 0.05;
    } else if (datasetKey === 'ocean') {
      mat.emissiveMap = null;
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0;
      mat.roughness = 0.35;
      mat.metalness = 0.15;
    } else {
      // vegetation
      mat.emissiveMap = null;
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0;
      mat.roughness = 0.75;
      mat.metalness = 0.02;
    }
    mat.needsUpdate = true;
  }, [datasetKey, getTexture]);

  // ── 3. Update Selected Location Reticle Position on Sphere Surface ──
  useEffect(() => {
    if (!selectedPinGroupRef.current) return;
    if (!selectedLocation) {
      selectedPinGroupRef.current.visible = false;
      return;
    }

    const pos = latLonToVector3(selectedLocation.lat, selectedLocation.lon, 1.002);
    selectedPinGroupRef.current.position.copy(pos);
    selectedPinGroupRef.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      pos.clone().normalize()
    );
    selectedPinGroupRef.current.visible = true;
  }, [selectedLocation]);

  // ── 4. Smooth Fly-to Animation when search focusCoords changes ──
  useEffect(() => {
    if (!focusCoords || !earthGroupRef.current) return;
    const { lat, lon } = focusCoords;
    const targetY = -(lon * (Math.PI / 180)) - Math.PI / 2;
    const targetX = (lat * (Math.PI / 180)) * 0.4;
    flyToTargetRef.current = { x: targetX, y: targetY };
    rotationTargetRef.current = { x: targetX, y: targetY };
  }, [focusCoords]);

  // ── 5. Mouse & Touch Drag Rotation ──
  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    previousPointerRef.current = { x: e.clientX, y: e.clientY };
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    flyToTargetRef.current = null;
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - previousPointerRef.current.x;
    const dy = e.clientY - previousPointerRef.current.y;
    previousPointerRef.current = { x: e.clientX, y: e.clientY };

    rotationTargetRef.current.y += dx * 0.006;
    rotationTargetRef.current.x = clamp(
      rotationTargetRef.current.x + dy * 0.006,
      -0.85,
      0.85
    );
  };

  const handlePointerUp = (e) => {
    isDraggingRef.current = false;
  };

  // ── 6. Wheel Zoom ──
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.002;
    const newTarget = clamp(cameraDistanceTargetRef.current + zoomDelta, 1.8, 4.2);
    cameraDistanceTargetRef.current = newTarget;
    setZoomLevel(Number(((4.2 - newTarget) / (4.2 - 1.8) + 0.6).toFixed(1)));
  };

  // ── 7. Click Raycasting: Select Geographic Coordinate on Globe ──
  const handleClick = (e) => {
    if (isGlobalView) return;
    // Don't treat a drag release as a click
    const distSq =
      Math.pow(e.clientX - pointerDownPosRef.current.x, 2) +
      Math.pow(e.clientY - pointerDownPosRef.current.y, 2);
    if (distSq > 25) return;

    const container = threeMountRef.current;
    if (!container || !cameraRef.current || !earthMeshRef.current || !earthGroupRef.current) return;

    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const intersects = raycaster.intersectObject(earthMeshRef.current);
    if (intersects.length > 0) {
      const hitPoint = intersects[0].point;
      const localPoint = earthGroupRef.current.worldToLocal(hitPoint.clone());
      const { lat, lon } = vector3ToLatLon(localPoint);
      const location = findNearestLocation(lat, lon);
      if (onSelectLocation) {
        onSelectLocation(location);
      }
    }
  };

  // Zoom Button Handlers
  const handleZoomIn = () => {
    cameraDistanceTargetRef.current = Math.max(1.8, cameraDistanceTargetRef.current - 0.4);
  };
  const handleZoomOut = () => {
    cameraDistanceTargetRef.current = Math.min(4.2, cameraDistanceTargetRef.current + 0.4);
  };
  const handleResetView = () => {
    cameraDistanceTargetRef.current = 2.75;
    rotationTargetRef.current = { x: 0.14, y: 0.9 };
    flyToTargetRef.current = null;
  };

  // ── 8. Render 2D Normal Map when isGlobalView === true ──
  useEffect(() => {
    if (!isGlobalView) return;
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const img = new Image();
    const texUrl = datasetKey === 'ocean'
      ? '/assets/earth_ocean_1024.jpg'
      : datasetKey === 'vegetation'
        ? '/assets/earth_veg_1024.jpg'
        : '/assets/earth_night_1024.jpg';

    img.onload = () => {
      ctx.clearRect(0, 0, width, height);
      // Draw smooth equirectangular map
      ctx.drawImage(img, 0, 0, width, height);

      // Subtle scientific latitude & longitude grid
      ctx.lineWidth = 1;

      // Equator
      ctx.strokeStyle = 'rgba(56, 217, 230, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Prime Meridian
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      // Latitude lines: 30N, 60N, 30S, 60S
      [30, 60, -30, -60].forEach((lat) => {
        const y = ((90 - lat) / 180) * height;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      });

      // Longitude lines: -120, -60, +60, +120
      [-120, -60, 60, 120].forEach((lon) => {
        const x = ((lon + 180) / 360) * width;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      });

      // Selected Location Marker in 2D
      if (selectedLocation) {
        const pinX = ((selectedLocation.lon + 180) / 360) * width;
        const pinY = ((90 - selectedLocation.lat) / 180) * height;

        // Outer reticle circle
        ctx.strokeStyle = '#38D9E6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pinX, pinY, 9, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        ctx.strokeStyle = 'rgba(56, 217, 230, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pinX - 14, pinY);
        ctx.lineTo(pinX + 14, pinY);
        ctx.moveTo(pinX, pinY - 14);
        ctx.lineTo(pinX, pinY + 14);
        ctx.stroke();

        // Center beacon dot
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(pinX, pinY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Location text badge
        const label = selectedLocation.name || 'Selected';
        ctx.font = '600 11px Inter, sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(6, 11, 24, 0.88)';
        ctx.fillRect(pinX + 10, pinY - 18, textWidth + 14, 20);
        ctx.strokeStyle = 'rgba(56, 217, 230, 0.45)';
        ctx.strokeRect(pinX + 10, pinY - 18, textWidth + 14, 20);
        ctx.fillStyle = '#38D9E6';
        ctx.fillText(label, pinX + 16, pinY - 4);
      }
    };
    img.src = texUrl;
  }, [isGlobalView, datasetKey, selectedLocation]);

  // Click handler for 2D Map Canvas
  const handleCanvas2DClick = (e) => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const lon = (clickX / rect.width) * 360 - 180;
    const lat = 90 - (clickY / rect.height) * 180;
    const loc = findNearestLocation(lat, lon);
    if (onSelectLocation) {
      onSelectLocation(loc);
    }
  };

  const currentEpochYear = dataset?.frames?.[frameIndex]?.label ||
    dataset?.frames?.[frameIndex]?.timestamp?.match(/\d{4}/)?.[0] ||
    dataset?.observation_date?.match(/\d{4}/)?.[0] ||
    '2023';

  const displayDatasetName = datasetKey === 'night_lights' ? 'Night Lights' :
    datasetKey === 'ocean' ? 'Ocean' :
    datasetKey === 'vegetation' ? 'Vegetation' :
    dataset?.title || 'Night Lights';

  return (
    <div className="earth-viewport-container">
      {/* Header with Title & View Toggle */}
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

      {/* Main Viewport Stage */}
      <div
        className="viewport-stage"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
      >
        {isGlobalView ? (
          <canvas
            ref={canvas2dRef}
            width={520}
            height={380}
            className="earth-canvas"
            onClick={handleCanvas2DClick}
            title="Click anywhere to inspect coordinates on 2D map"
          />
        ) : (
          <div ref={threeMountRef} className="three-globe-mount" />
        )}

        {/* Floating View & Zoom Controls */}
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

      {/* Footer with Dataset Label & Year */}
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
