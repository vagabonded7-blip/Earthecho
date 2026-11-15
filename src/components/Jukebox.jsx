import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EarthGlobe from './EarthGlobe.jsx';
import FingerprintCard from './FingerprintCard.jsx';
import ComparisonLab from './ComparisonLab.jsx';
import {
  findNearestLocation,
  searchLocations
} from '../data/worldLocations.js';
import {
  initAudio,
  playGrid,
  playSoundscape,
  scanGrid,
  playComparison,
  playCell,
  stopAudio,
  setMasterVolume,
  getAudioAnalyser,
  setActiveScenario,
  getDatasetScenario,
  SCENARIO_PROFILES
} from '../audio/audioEngine.js';

// Clean vector iconography
function LogoSymbol() {
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" className="brand-svg" aria-hidden="true">
      <circle cx="14" cy="14" r="11" stroke="#38D9E6" strokeWidth="1.8" strokeDasharray="3 2" />
      <circle cx="14" cy="14" r="4.5" fill="#38D9E6" />
      <circle cx="21" cy="9" r="2" fill="#38D9E6" />
      <circle cx="7" cy="19" r="1.5" fill="#38D9E6" opacity="0.8" />
      <path d="M7 14 A7 7 0 0 1 21 14" stroke="#A78BFA" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function NightLightsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38D9E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function OceanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38D9E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function VegetationIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22v-8" />
      <path d="M12 14c-4 0-7-2.8-7-7 4 0 7 2.8 7 7z" />
      <path d="M12 10c4 0 7-2.8 7-7-4 0-7 2.8-7 7z" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#070B18" stroke="#070B18" strokeWidth="1" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#070B18" stroke="#070B18" strokeWidth="1" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function Jukebox({
  datasets,
  selectedId,
  onSelect,
  dataset,
  dataStatus,
  error,
  retryLabel,
  onRetry,
  onReplayIntro
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isGlobalView, setIsGlobalView] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState(null); // 'soundscape' | 'cell' | 'scan' | 'compare'
  const [volume, setVolume] = useState(0.75);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.75);

  const [showStudioDrawer, setShowStudioDrawer] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [audioError, setAudioError] = useState('');

  // Location Selection & Search State
  const [selectedLocation, setSelectedLocation] = useState(() =>
    findNearestLocation(19.0760, 72.8777) // Mumbai default as in prompt example
  );
  const [focusCoords, setFocusCoords] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);

  const visualizerCanvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const playPromiseRef = useRef(null);

  const frames = dataset?.frames || [];
  const currentYear = useMemo(() => {
    if (frames[frameIndex]?.label) return frames[frameIndex].label;
    if (frames[frameIndex]?.timestamp) {
      const match = frames[frameIndex].timestamp.match(/\d{4}/);
      return match ? match[0] : frames[frameIndex].timestamp;
    }
    if (dataset?.observation_date) {
      const match = dataset.observation_date.match(/\d{4}/);
      return match ? match[0] : dataset.observation_date;
    }
    return '2023';
  }, [frames, frameIndex, dataset]);

  // Primary NASA datasets with tailored scenario sound styles
  const primaryDatasets = [
    {
      id: 'night_lights_2012_2023',
      name: 'Night Lights',
      soundStyle: 'Electronic / Synth Music',
      icon: <NightLightsIcon />,
      theme: 'lights'
    },
    {
      id: 'sea_surface_temp',
      name: 'Ocean',
      soundStyle: 'Ambient / Flowing Music',
      icon: <OceanIcon />,
      theme: 'ocean'
    },
    {
      id: 'vegetation_ndvi_2020_2023',
      name: 'Vegetation',
      soundStyle: 'Organic / Nature-Inspired Music',
      icon: <VegetationIcon />,
      theme: 'veg'
    }
  ];

  const activeDatasetId = useMemo(() => {
    if (!selectedId) return primaryDatasets[0].id;
    if (selectedId.includes('night_lights')) return 'night_lights_2012_2023';
    if (selectedId.includes('sea_surface') || selectedId.includes('ocean')) return 'sea_surface_temp';
    if (selectedId.includes('veg') || selectedId.includes('ndvi')) return 'vegetation_ndvi_2020_2023';
    return selectedId;
  }, [selectedId]);

  const currentScenario = useMemo(() => {
    return getDatasetScenario(dataset);
  }, [dataset]);

  useEffect(() => {
    setActiveScenario(currentScenario);
  }, [currentScenario]);

  const scenarioMeta = useMemo(() => {
    if (currentScenario === 'ocean') {
      return {
        genre: 'Ambient / Flowing Music',
        icon: '🌊',
        desc: 'Deep hydroacoustic warmth, swell envelopes, and atmospheric ocean currents.'
      };
    }
    if (currentScenario === 'vegetation') {
      return {
        genre: 'Organic / Nature-Inspired Music',
        icon: '🌿',
        desc: 'Acoustic marimba, bamboo kalimba transients, and natural resonance.'
      };
    }
    return {
      genre: 'Electronic / Synth Music',
      icon: '⚡',
      desc: 'Punchy analog synth waveforms, dynamic filter sweeps, and energetic spatial panning.'
    };
  }, [currentScenario]);

  // Parse Shareable URL Query Parameters on Load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const latParam = params.get('lat');
      const lonParam = params.get('lon');
      const dsParam = params.get('dataset');

      if (latParam !== null && lonParam !== null) {
        const lat = parseFloat(latParam);
        const lon = parseFloat(lonParam);
        if (!isNaN(lat) && !isNaN(lon)) {
          const loc = findNearestLocation(lat, lon);
          setSelectedLocation(loc);
          setFocusCoords({ lat, lon });
        }
      }
      if (dsParam && dsParam !== selectedId) {
        onSelect(dsParam);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  // Compute Location Grid Coordinates & Environmental Data Value
  const locationData = useMemo(() => {
    if (!selectedLocation) return null;
    const { lat, lon } = selectedLocation;
    const w = dataset?.width || 64;
    const h = dataset?.height || 32;

    // Equirectangular cylindrical mapping
    const gridX = Math.min(w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * w) % w));
    const gridY = Math.min(h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * h)));

    // Channel value lookup
    const ch = dataset?.channels?.[0]?.id ||
      (frames[frameIndex]?.values ? Object.keys(frames[frameIndex].values)[0] : 'luma');

    const matrix = frames[frameIndex]?.values?.[ch] ?? dataset?.values ?? null;
    const rawVal = matrix ? matrix[gridY]?.[gridX] : null;

    let formattedVal = 'No data / Masked';
    let isAvailable = false;

    if (rawVal !== null && rawVal !== undefined) {
      isAvailable = true;
      if (activeDatasetId.includes('ocean')) {
        formattedVal = `${(rawVal * 32).toFixed(1)}°C (ECCO2 simulation)`;
      } else if (activeDatasetId.includes('veg')) {
        formattedVal = `NDVI ${rawVal.toFixed(3)} (MODIS MOD13C2)`;
      } else {
        formattedVal = `${(rawVal * 100).toFixed(1)}% (Luma: ${rawVal.toFixed(3)})`;
      }
    }

    return {
      gridX,
      gridY,
      channel: ch,
      value: rawVal,
      formattedVal,
      isAvailable
    };
  }, [selectedLocation, dataset, frames, frameIndex, activeDatasetId]);

  // Handle Location Selection from Globe (click or raycast)
  const handleSelectLocation = useCallback(({ lat, lon }) => {
    const loc = findNearestLocation(lat, lon);
    setSelectedLocation(loc);
  }, []);

  // Location Search Input Handlers
  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length > 0) {
      const results = searchLocations(q);
      setSearchResults(results);
      setIsSearchOpen(true);
    } else {
      setSearchResults([]);
      setIsSearchOpen(false);
    }
  };

  const handleSelectSearchResult = (loc) => {
    const resolved = findNearestLocation(loc.lat, loc.lon);
    setSelectedLocation(resolved);
    setFocusCoords({ lat: loc.lat, lon: loc.lon });
    setSearchQuery(`${resolved.name}, ${resolved.country}`);
    setIsSearchOpen(false);
  };

  // Close search suggestions on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Stop audio and reset frame when dataset changes
  const handleDatasetSelect = (id) => {
    stopAudio();
    setIsPlaying(false);
    setPlayMode(null);
    setFrameIndex(0);
    const scenarioKey = id.includes('ocean') || id.includes('sea')
      ? 'ocean'
      : id.includes('veg') || id.includes('ndvi')
        ? 'vegetation'
        : 'night_lights';
    setActiveScenario(scenarioKey);
    onSelect(id);
  };

  // Audio Playback Controls
  const handleStop = useCallback(() => {
    stopAudio();
    setIsPlaying(false);
    setPlayMode(null);
  }, []);

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying) {
      handleStop();
      return;
    }
    setAudioError('');

    try {
      await initAudio();
      setMasterVolume(isMuted ? 0 : volume);
    } catch (err) {
      setAudioError(`Audio error: ${err.message}`);
      return;
    }

    setIsPlaying(true);
    setPlayMode('soundscape');

    try {
      const promise = playSoundscape(dataset, frameIndex, { durationSeconds: 14 });
      playPromiseRef.current = promise;
      await promise;
    } catch (err) {
      if (err?.message !== 'Playback cancelled.') {
        setAudioError(err.message);
      }
    } finally {
      setIsPlaying(false);
      setPlayMode(null);
      playPromiseRef.current = null;
    }
  }, [isPlaying, dataset, frameIndex, volume, isMuted, handleStop]);

  // Listen to Selected Location
  const handleListenLocation = useCallback(async () => {
    if (!locationData) return;
    handleStop();
    setAudioError('');

    if (!locationData.isAvailable) {
      setAudioError('Selected location is masked or has no observation for this period.');
      return;
    }

    try {
      await initAudio();
      setMasterVolume(isMuted ? 0 : volume);
      setIsPlaying(true);
      setPlayMode('cell');
      await playCell(dataset, frameIndex, locationData.gridX, locationData.gridY);
      setTimeout(() => {
        setIsPlaying(false);
        setPlayMode(null);
      }, 700);
    } catch (err) {
      setAudioError(err.message);
      setIsPlaying(false);
      setPlayMode(null);
    }
  }, [locationData, dataset, frameIndex, volume, isMuted, handleStop]);

  const handleScan = useCallback(async () => {
    handleStop();
    setAudioError('');
    try {
      await initAudio();
      setMasterVolume(isMuted ? 0 : volume);
      setIsPlaying(true);
      setPlayMode('scan');
      await scanGrid(dataset, frameIndex);
    } catch (err) {
      if (err?.message !== 'Playback cancelled.') {
        setAudioError(err.message);
      }
    } finally {
      setIsPlaying(false);
      setPlayMode(null);
    }
  }, [dataset, frameIndex, volume, isMuted, handleStop]);

  const handlePrevious = () => {
    handleStop();
    if (frames.length > 1) {
      setFrameIndex((prev) => (prev > 0 ? prev - 1 : frames.length - 1));
    } else {
      handleTogglePlay();
    }
  };

  const handleSliderChange = (e) => {
    const idx = Number(e.target.value);
    setFrameIndex(idx);
    if (isPlaying) handleStop();
  };

  // Mute / Unmute handler
  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      try { setMasterVolume(prevVolume); } catch {}
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
      try { setMasterVolume(0); } catch {}
    }
  };

  // Slider fill percentage
  const sliderPercentage = frames.length > 1
    ? (frameIndex / (frames.length - 1)) * 100
    : 75;

  // Real-time Web Audio Analyser Waveform Visualizer
  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    let t = 0;

    const barCount = 42;
    const barWidth = 7;
    const totalBarsWidth = barCount * barWidth;
    const gap = (width - totalBarsWidth) / (barCount - 1);

    const getEnvelope = (i) => {
      const u = i / (barCount - 1);
      const wave1 = Math.sin(u * Math.PI * 4.2 - 0.4) * 0.42 + 0.58;
      const wave2 = Math.sin(u * Math.PI * 2.1) * 0.28 + 0.72;
      const windowEdge = Math.sin(u * Math.PI);
      return Math.pow(wave1 * wave2 * windowEdge, 0.85);
    };

    let freqArray = null;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const analyser = getAudioAnalyser();
      let hasRealAudio = false;

      if (isPlaying && analyser) {
        if (!freqArray) freqArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqArray);
        // Check if there is actual audio energy
        let sum = 0;
        for (let j = 0; j < Math.min(32, freqArray.length); j++) sum += freqArray[j];
        hasRealAudio = sum > 10;
      }

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        const baseEnv = getEnvelope(i);

        let amplitude;
        if (hasRealAudio && freqArray) {
          // React to real Web Audio Analyser frequency data
          const binIdx = Math.floor((i / barCount) * Math.min(48, freqArray.length));
          const freqVal = freqArray[binIdx] / 255;
          amplitude = Math.max(4, freqVal * (height * 0.48) * baseEnv * 1.5 + 4);
        } else if (isPlaying) {
          // Dynamic synthesized wave
          const dynamicWave = Math.sin(t * 0.2 + i * 0.45) * 0.4 + 0.6;
          const bounce = Math.sin(t * 0.12) * 0.2 + 0.8;
          amplitude = baseEnv * dynamicWave * bounce * (height * 0.45) + 4;
        } else {
          // Ambient breathing wave
          const ambientWave = Math.sin(t * 0.05 + i * 0.28) * 0.15 + 0.85;
          amplitude = baseEnv * ambientWave * (height * 0.44) + 4;
        }

        const isViolet = (i === 3 || i === 11 || i === 20 || i === 24 || i === 34 || i === 38);
        ctx.fillStyle = isViolet ? '#A78BFA' : '#38D9E6';

        const topY = centerY - amplitude;
        const barHeight = amplitude * 2;
        const radius = barWidth / 2;

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, topY, barWidth, barHeight, radius);
        } else {
          ctx.rect(x, topY, barWidth, barHeight);
        }
        ctx.fill();
      }

      t += isPlaying ? 0.9 : 0.3;
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="cosmic-jukebox-container">
      <main className="observatory-card">
        {/* ── Top Header Navigation ── */}
        <header className="observatory-header">
          <div
            className="brand-lockup"
            onClick={onReplayIntro}
            style={onReplayIntro ? { cursor: 'pointer' } : undefined}
            title={onReplayIntro ? 'Replay Cinematic Earth Orbit Intro' : undefined}
          >
            <div className="brand-symbol">
              <LogoSymbol />
            </div>
            <div className="brand-titles">
              <h1 className="main-logo-title">EARTH ECHO</h1>
              <p className="main-logo-subtitle">
                <span className={`brand-live-dot ${isPlaying ? 'is-live' : ''}`} aria-hidden="true" />
                HEAR THE PLANET CHANGE
              </p>
            </div>
          </div>

          {/* Location Search Bar */}
          <div className="location-search-container" ref={searchContainerRef}>
            <div className="search-input-wrapper">
              <SearchIcon />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchQuery.trim() && setIsSearchOpen(true)}
                placeholder="Search city, country, or coords..."
                className="search-location-input"
                aria-label="Search global location"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Autocomplete Suggestions */}
            {isSearchOpen && searchResults.length > 0 && (
              <div className="search-suggestions-dropdown" role="listbox">
                {searchResults.map((loc, idx) => (
                  <button
                    key={`${loc.name}-${idx}`}
                    type="button"
                    className="suggestion-item"
                    onClick={() => handleSelectSearchResult(loc)}
                  >
                    <span className="sugg-name">{loc.name}</span>
                    <span className="sugg-country">{loc.country} · {loc.region}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Header Pills */}
          <div className="header-action-group">
            {onReplayIntro && (
              <button
                type="button"
                className="header-action-pill orbit-pill"
                onClick={onReplayIntro}
                title="Replay Cinematic 13s Earth Orbit Animation"
              >
                <span>⟲ ORBIT INTRO</span>
              </button>
            )}
            {frames.length >= 2 && (
              <button
                type="button"
                className="header-action-pill compare-pill"
                onClick={() => setShowCompareModal(true)}
                title="Open Environmental Time Comparison Laboratory"
              >
                <span>⚖ COMPARE</span>
              </button>
            )}

            <button
              type="button"
              className="nasa-data-pill"
              onClick={() => setShowDataModal(true)}
              title="Click to view NASA mission source details"
            >
              <span className="pill-status-dot" />
              <span>NASA DATA</span>
            </button>
          </div>
        </header>

        {error && (
          <div className="telemetry-error-strip" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onRetry}>{retryLabel}</button>
          </div>
        )}

        {/* ── Main Dashboard: 3D Earth & Control Stacks ── */}
        <section className="top-dashboard-grid" aria-label="Earth Observation and Dataset Controls">
          {/* Left Column: 3D Earth Observation Deck */}
          <div className="observation-deck">
            <EarthGlobe
              dataset={dataset}
              frameIndex={frameIndex}
              selectedLocation={selectedLocation}
              onSelectLocation={handleSelectLocation}
              isGlobalView={isGlobalView}
              onToggleView={() => setIsGlobalView(!isGlobalView)}
              focusCoords={focusCoords}
            />
          </div>

          {/* Right Column: Location Details, Fingerprint & Dataset Controls */}
          <div className="selection-sidebar">
            {/* Card 1: SELECTED LOCATION & DATA EXTRACTION */}
            <div className="control-panel location-details-card">
              <span className="panel-kicker">SELECTED LOCATION</span>
              <div className="location-name-header">
                <h3 className="location-display-name">{selectedLocation?.name || 'Mumbai, India'}</h3>
                <span className="location-region-badge">{selectedLocation?.region || 'Global'}</span>
              </div>

              <div className="location-coords-row">
                <div className="coord-item">
                  <span className="coord-kicker">LATITUDE</span>
                  <span className="coord-value">{selectedLocation?.latStr || '19.0760° N'}</span>
                </div>
                <div className="coord-item">
                  <span className="coord-kicker">LONGITUDE</span>
                  <span className="coord-value">{selectedLocation?.lonStr || '72.8777° E'}</span>
                </div>
              </div>

              <div className="location-data-cell-strip">
                <div className="cell-metric">
                  <span className="metric-kicker">MEASUREMENT ({currentYear})</span>
                  <span className={`metric-value ${locationData?.isAvailable ? 'available' : 'unavailable'}`}>
                    {locationData?.formattedVal || 'Loading...'}
                  </span>
                </div>
                <div className="data-availability-bar" aria-hidden="true">
                  <span className={`data-availability-fill ${locationData?.isAvailable ? 'available' : 'unavailable'}`} />
                </div>
                <button
                  type="button"
                  className={`listen-location-btn ${!locationData?.isAvailable ? 'disabled' : ''}`}
                  onClick={handleListenLocation}
                  disabled={!locationData?.isAvailable}
                  title="Sonify this specific geographical coordinate"
                >
                  ♫ LISTEN TO LOCATION
                </button>
              </div>
            </div>

            {/* Card 2: EARTH AUDIO FINGERPRINT PREVIEW */}
            <div className="control-panel fingerprint-preview-card">
              <span className="panel-kicker">EARTH AUDIO FINGERPRINT</span>
              <FingerprintCard
                dataset={dataset}
                frameIndex={frameIndex}
                selectedLocation={selectedLocation}
                dataValue={locationData?.value}
                size={160}
              />
            </div>

            {/* Card 3: SELECT DATASET */}
            <div className="control-panel select-dataset-card">
              <span className="panel-kicker">SELECT DATASET</span>
              <div className="dataset-list" role="radiogroup" aria-label="Available NASA Datasets">
                {primaryDatasets.map((ds) => {
                  const isSelected = activeDatasetId === ds.id;
                  return (
                    <button
                      key={ds.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`dataset-row-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleDatasetSelect(ds.id)}
                    >
                      <span className="row-icon">{ds.icon}</span>
                      <div className="row-text-group">
                        <span className="row-label">{ds.name}</span>
                        <span className="row-sound-tag">{ds.soundStyle}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card 4: TIME PERIOD SCRUBBER */}
            <div className="control-panel time-period-card">
              <span className="panel-kicker">TIME PERIOD</span>
              
              <div className="time-display-row">
                <span className="time-display-val">{currentYear}</span>
                <span className="time-display-meta">
                  {frames.length > 1 ? `EPOCH ${frameIndex + 1} / ${frames.length}` : 'SINGLE EPOCH'}
                </span>
              </div>

              <div className="slider-wrapper">
                <div className="slider-ticks" aria-hidden="true">
                  {frames.map((f, i) => (
                    <span
                      key={i}
                      className={`slider-tick ${i <= frameIndex ? 'passed' : ''}`}
                      style={{ left: `${frames.length > 1 ? (i / (frames.length - 1)) * 100 : 50}%` }}
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, frames.length - 1)}
                  step="1"
                  value={frameIndex}
                  onChange={handleSliderChange}
                  className="time-scrub-slider"
                  style={{ '--slider-pct': `${sliderPercentage}%` }}
                  aria-label="Observation period slider"
                  disabled={frames.length <= 1}
                />
                <span
                  className="slider-thumb-label"
                  style={{ left: `${sliderPercentage}%` }}
                  aria-hidden="true"
                >
                  {currentYear}
                </span>
              </div>

              <p className="panel-caption">Choose an available observation year</p>
            </div>
          </div>
        </section>

        {/* ── Bottom Section: Planetary Sonification Player ── */}
        <section className="sonification-deck" aria-label="Planetary Sonification Studio">
          <div className="sonification-header">
            <div className="sonification-header-left">
              <h2 className="sonification-title">PLANETARY SONIFICATION</h2>
              <span className="sonification-status-pill">
                {isPlaying ? `● LIVE SYNTHESIS (${playMode?.toUpperCase() || 'AUDIO'})` : '○ READY'}
              </span>
              <span className="sonification-genre-badge" title={scenarioMeta.desc}>
                {scenarioMeta.icon} {scenarioMeta.genre}
              </span>
            </div>

            <button
              type="button"
              className="audio-studio-link"
              onClick={() => setShowStudioDrawer(!showStudioDrawer)}
              aria-expanded={showStudioDrawer}
            >
              AUDIO STUDIO {showStudioDrawer ? '▲' : '▼'}
            </button>
          </div>

          {/* Real-time Analyser Waveform Visualizer */}
          <div className="waveform-visualizer-frame">
            <canvas
              ref={visualizerCanvasRef}
              width={760}
              height={140}
              className="visualizer-canvas-element"
              aria-hidden="true"
            />
          </div>

          {/* Center Player Transport & Volume Deck */}
          <div className="player-transport-deck">
            <div className="transport-now-playing" aria-live="polite">
              <span className="transport-np-kicker">NOW PLAYING</span>
              <span className="transport-np-title">
                {isPlaying
                  ? `${playMode === 'soundscape' ? 'Global Soundscape' : playMode === 'cell' ? 'Location Cell' : playMode === 'scan' ? 'Grid Scan' : 'Comparison'} · ${scenarioMeta.genre} (${currentYear})`
                  : `${scenarioMeta.genre} · Ready to sonify`}
              </span>
            </div>

            <div className="transport-controls">
              <button
                type="button"
                className="transport-icon-btn transport-icon-btn--aux"
                onClick={handlePrevious}
                title="Previous epoch / Restart"
                aria-label="Previous epoch"
              >
                <PrevIcon />
              </button>

              <button
                type="button"
                className={`main-play-btn ${isPlaying ? 'playing' : ''}`}
                onClick={handleTogglePlay}
                title={isPlaying ? 'Pause / Stop Soundscape' : 'Play Global Soundscape'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <button
                type="button"
                className="transport-icon-btn transport-icon-btn--aux"
                onClick={handleStop}
                title="Stop audio playback"
                aria-label="Stop playback"
              >
                <StopIcon />
              </button>
            </div>

            <div className="transport-volume-group">
              <button
                type="button"
                className={`mute-btn ${isMuted ? 'muted' : ''}`}
                onClick={handleToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                  try { setMasterVolume(val); } catch {}
                }}
                className="transport-volume-slider"
                style={{ '--slider-pct': `${(isMuted ? 0 : volume) * 100}%` }}
                aria-label="Master volume"
              />
              <span className="volume-percent-badge">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
            </div>
          </div>

          {audioError && (
            <p className="audio-error-text" role="alert">{audioError}</p>
          )}

          {/* Expandable Audio Studio Drawer */}
          {showStudioDrawer && (
            <div className="audio-studio-drawer" aria-label="Audio Studio Settings">
              <div className="studio-columns">
                <div className="studio-col">
                  <span className="drawer-label">SYNTHESIS MODES</span>
                  <div className="mode-btn-group">
                    <button
                      type="button"
                      className={`sub-mode-btn ${playMode === 'scan' ? 'active' : ''}`}
                      onClick={handleScan}
                    >
                      ⟶ Scan Grid (West to East)
                    </button>
                    {frames.length >= 2 && (
                      <button
                        type="button"
                        className="sub-mode-btn"
                        onClick={() => setShowCompareModal(true)}
                      >
                        ⚖ Time Comparison Lab
                      </button>
                    )}
                  </div>
                </div>

                <div className="studio-col">
                  <span className="drawer-label">SCENARIO SOUND STYLE</span>
                  <div className="mode-btn-group">
                    {[
                      { id: 'night_lights', label: '⚡ Electronic / Synth', sub: 'Night Lights' },
                      { id: 'ocean', label: '🌊 Ambient / Flowing', sub: 'Ocean' },
                      { id: 'vegetation', label: '🌿 Organic / Nature', sub: 'Vegetation' }
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`sub-mode-btn ${currentScenario === item.id ? 'active' : ''}`}
                        onClick={() => {
                          setActiveScenario(item.id);
                          const targetDs = item.id === 'ocean'
                            ? 'sea_surface_temp'
                            : item.id === 'vegetation'
                              ? 'vegetation_ndvi_2020_2023'
                              : 'night_lights_2012_2023';
                          if (activeDatasetId !== targetDs) {
                            handleDatasetSelect(targetDs);
                          }
                        }}
                        title={`Select ${item.label} for ${item.sub}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mockup-footer">
          <p>Earth Echo — NASA Space Apps Challenge · Hear the Planet Change</p>
        </footer>
      </main>

      {/* NASA Data Mission Provenance Modal */}
      {showDataModal && (
        <div className="modal-backdrop" onClick={() => setShowDataModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>NASA Earth Data Provenance</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowDataModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p><strong>NASA SVS #5313: Night Lights (2012–2023)</strong><br />
              Day/Night Band of Suomi NPP VIIRS. Values reflect ITU-R BT.709 perceived luminance index.</p>
              <p><strong>NASA SVS #3912: Sea Surface Currents & Temperature</strong><br />
              ECCO2 high-resolution numerical state simulation output.</p>
              <p><strong>NASA EOSDIS LP DAAC: Global Vegetation (NDVI)</strong><br />
              MODIS Terra MOD13C2 v6.1 normalized difference vegetation index.</p>
              <p className="modal-note">Masked cells (deep ocean, polar ice, clouds) remain silent to ensure absence of data is never confused with zero measurement.</p>
            </div>
          </div>
        </div>
      )}

      {/* Time Comparison Laboratory Modal */}
      {showCompareModal && (
        <div className="modal-backdrop" onClick={() => setShowCompareModal(false)}>
          <div className="modal-dialog compare-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>Environmental Time Comparison Laboratory</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowCompareModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <ComparisonLab dataset={dataset} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}