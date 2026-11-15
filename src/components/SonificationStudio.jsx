import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  initAudio,
  playGrid,
  playSoundscape,
  scanGrid,
  stopAudio,
  setMasterVolume
} from '../audio/audioEngine.js';

export default function SonificationStudio({
  dataset,
  frameIndex,
  onPlaybackStateChange
}) {
  const [mode, setMode] = useState(null); // 'listen' | 'scan' | 'timelapse' | null
  const [audioError, setAudioError] = useState('');
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const playPromiseRef = useRef(null);

  const frameCount = dataset?.frames?.length || 1;
  const currentPeriod = dataset?.frames?.[frameIndex]?.label ||
    dataset?.frames?.[frameIndex]?.timestamp ||
    dataset?.observation_date ||
    'Standard';

  const channel = dataset?.channels?.[0];
  const profile = dataset?.sonification_profile;

  // Stop audio and reset visualizer on unmount or dataset switch
  useEffect(() => {
    if (mode) {
      stopAudio();
      setMode(null);
      onPlaybackStateChange?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id, frameIndex]);

  useEffect(() => () => {
    stopAudio();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  // Handle master volume adjustments
  const handleVolumeChange = useCallback((e) => {
    const val = Number(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    try {
      setMasterVolume(val);
    } catch {
      // ignore before init
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      const restoreVol = volume > 0 ? volume : 0.7;
      setIsMuted(false);
      setVolume(restoreVol);
      try { setMasterVolume(restoreVol); } catch {}
    } else {
      setIsMuted(true);
      try { setMasterVolume(0); } catch {}
    }
  }, [isMuted, volume]);

  const handleStop = useCallback(() => {
    stopAudio();
    setMode(null);
    onPlaybackStateChange?.(null);
  }, [onPlaybackStateChange]);

  const startPlayback = useCallback(async (newMode) => {
    if (mode) {
      stopAudio();
      setMode(null);
      onPlaybackStateChange?.(null);
      await playPromiseRef.current;
      playPromiseRef.current = null;
    }
    setAudioError('');

    try {
      await initAudio();
      setMasterVolume(isMuted ? 0 : volume);
    } catch (err) {
      setAudioError(`Audio initialization failed: ${err.message}`);
      return;
    }

    setMode(newMode);
    const playbackInfo = newMode === 'listen' ? { start: performance.now(), duration: 14 } : null;
    onPlaybackStateChange?.(playbackInfo);

    try {
      let promise;
      if (newMode === 'listen') {
        promise = playSoundscape(dataset, frameIndex, { durationSeconds: 14 });
      } else if (newMode === 'scan') {
        promise = scanGrid(dataset, frameIndex);
      } else if (newMode === 'timelapse') {
        promise = playGrid(dataset, 0, { frameIntervalSeconds: 1.5 });
      }

      playPromiseRef.current = promise;
      await promise;
    } catch (err) {
      if (err?.message !== 'Playback cancelled.') {
        setAudioError(`Audio playback error: ${err.message}`);
      }
    } finally {
      setMode(null);
      onPlaybackStateChange?.(null);
      playPromiseRef.current = null;
    }
  }, [dataset, frameIndex, mode, volume, isMuted, onPlaybackStateChange]);

  // Audio Spectrum / Waveform Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    let t = 0;

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      const isPlaying = mode !== null;

      // Draw background cosmic gridlines
      ctx.strokeStyle = 'rgba(56, 217, 230, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 16) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Draw frequency spectrum bars
      const barCount = 36;
      const barWidth = (w - (barCount - 1) * 3) / barCount;

      for (let i = 0; i < barCount; i++) {
        let barHeight;
        if (isPlaying) {
          // Dynamic simulated frequency energy during playback
          const primaryWave = Math.sin(t * 0.12 + i * 0.35) * 0.5 + 0.5;
          const secondaryWave = Math.cos(t * 0.18 + i * 0.7) * 0.5 + 0.5;
          const modulation = Math.sin(t * 0.05) * 0.3 + 0.7;
          barHeight = (primaryWave * 0.6 + secondaryWave * 0.4) * (h - 12) * modulation;
        } else {
          // Idle ambient resting wave
          barHeight = (Math.sin(t * 0.03 + i * 0.2) * 0.15 + 0.15) * (h - 16);
        }

        const x = i * (barWidth + 3);
        const y = h - barHeight - 4;

        // Color gradient from electric cyan to cosmic violet
        const gradient = ctx.createLinearGradient(0, y, 0, h);
        if (isPlaying) {
          gradient.addColorStop(0, '#38D9E6');
          gradient.addColorStop(0.5, '#A78BFA');
          gradient.addColorStop(1, 'rgba(96, 165, 250, 0.2)');
        } else {
          gradient.addColorStop(0, 'rgba(148, 163, 184, 0.4)');
          gradient.addColorStop(1, 'rgba(30, 41, 59, 0.2)');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      t += isPlaying ? 1.4 : 0.4;
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [mode]);

  return (
    <section className="sonification-studio-card" aria-labelledby="studio-title">
      <div className="card-header">
        <div>
          <span className="card-kicker">PLANETARY AUDIO LABORATORY</span>
          <h2 id="studio-title" className="card-title">Sonification Studio</h2>
        </div>

        <div className="active-period-badge">
          <span className="badge-dot" />
          <span>Epoch: <strong>{currentPeriod}</strong></span>
        </div>
      </div>

      {/* Visualizer Deck */}
      <div className="visualizer-deck" aria-label="Audio synthesis visualizer">
        <canvas
          ref={canvasRef}
          width={560}
          height={96}
          className="visualizer-canvas"
          aria-hidden="true"
        />
        <div className="visualizer-overlay">
          <span className="visualizer-status">
            {mode === 'listen' && '▶ 14s PLANETARY SOUNDSCAPE STREAM'}
            {mode === 'scan' && '⟶ SEQUENTIAL COORDINATE SCAN'}
            {mode === 'timelapse' && '⏱ CHRONOLOGICAL TIMELAPSE'}
            {mode === null && 'STANDBY · READY TO SYNTHESIZE'}
          </span>
          <span className="visualizer-scale">
            Scale: {profile?.scale || 'Pentatonic Major'} · {profile?.base_frequency || 220} Hz
          </span>
        </div>
      </div>
      <p className="visualizer-caption">
        Waveform displays data-driven Web Audio DSP synthesis activity in real-time.
      </p>

      {/* Transport Controls */}
      <div className="transport-controls" role="group" aria-label="Playback Transport Controls">
        <button
          type="button"
          className={`transport-btn primary ${mode === 'listen' ? 'active' : ''}`}
          onClick={() => mode === 'listen' ? handleStop() : startPlayback('listen')}
          disabled={!dataset}
          title="Play a 14-second musical soundscape of this observation"
        >
          <span className="btn-icon">{mode === 'listen' ? '⏹' : '▶'}</span>
          <span>{mode === 'listen' ? 'Stop' : 'Listen (Soundscape)'}</span>
        </button>

        <button
          type="button"
          className={`transport-btn ${mode === 'scan' ? 'active' : ''}`}
          onClick={() => mode === 'scan' ? handleStop() : startPlayback('scan')}
          disabled={!dataset}
          title="Scan grid column-by-column from West to East"
        >
          <span className="btn-icon">{mode === 'scan' ? '⏹' : '⟶'}</span>
          <span>{mode === 'scan' ? 'Stop' : 'Scan Grid'}</span>
        </button>

        {frameCount > 1 && (
          <button
            type="button"
            className={`transport-btn ${mode === 'timelapse' ? 'active' : ''}`}
            onClick={() => mode === 'timelapse' ? handleStop() : startPlayback('timelapse')}
            disabled={!dataset}
            title="Play time-lapse sequence across all observation epochs"
          >
            <span className="btn-icon">{mode === 'timelapse' ? '⏹' : '⏱'}</span>
            <span>{mode === 'timelapse' ? 'Stop' : 'Timelapse'}</span>
          </button>
        )}

        {mode !== null && (
          <button
            type="button"
            className="transport-btn stop"
            onClick={handleStop}
            title="Silence all active voices immediately"
          >
            <span>⏹ Stop Audio</span>
          </button>
        )}
      </div>

      {/* Volume & Master Gain */}
      <div className="volume-control-strip">
        <button
          type="button"
          className="mute-btn"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute master audio' : 'Mute master audio'}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </button>

        <label htmlFor="master-volume-slider" className="volume-label">
          GAIN
        </label>
        <input
          id="master-volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.02"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="cosmic-range volume-slider"
          aria-label="Master volume level"
        />
        <span className="volume-readout" aria-hidden="true">
          {isMuted ? 'MUTED' : `${Math.round(volume * 100)}%`}
        </span>
      </div>

      {audioError && (
        <div className="error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{audioError}</span>
        </div>
      )}

      {/* Accordion Legend Drawer */}
      <div className="legend-drawer">
        <button
          type="button"
          className="legend-toggle"
          onClick={() => setShowLegend(!showLegend)}
          aria-expanded={showLegend}
        >
          <span>Sonification Physics & Musical Mapping</span>
          <span className="drawer-arrow" aria-hidden="true">{showLegend ? '▲' : '▼'}</span>
        </button>

        {showLegend && (
          <div className="legend-content">
            <dl className="legend-grid">
              <div>
                <dt>Pitch (Frequency)</dt>
                <dd>{profile?.legend?.pitch || 'Higher numerical values map to higher equal-tempered pentatonic pitches.'}</dd>
              </div>
              <div>
                <dt>Spatial Stereo</dt>
                <dd>{profile?.legend?.stereo || 'Horizontal coordinates (longitude) map smoothly to left-to-right stereo panning.'}</dd>
              </div>
              <div>
                <dt>Silence (Nulls)</dt>
                <dd>{profile?.legend?.silence || 'Masked cells (ocean fill, polar ice, missing data) remain silent — not zero value.'}</dd>
              </div>
              <div>
                <dt>Synthesis Architecture</dt>
                <dd>Native Web Audio API polyphonic oscillators with smooth envelope scheduling & voice limiting.</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
