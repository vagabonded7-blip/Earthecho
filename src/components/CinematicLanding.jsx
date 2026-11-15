import React, { useEffect, useRef, useState } from 'react';

export default function CinematicLanding({ onEnter, isTransitioning }) {
  const videoRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [hasTriggered, setHasTriggered] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Ensure video begins playing immediately upon landing
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Handled gracefully if browser restricts media autoplay
      });
    }
  }, []);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    const duration = video.duration || 13.4;
    setProgress(Math.min(100, (current / duration) * 100));

    // At 12.3s (when the planet dims into cosmic darkness as described in the sequence),
    // automatically initiate the seamless transition into the Jukebox experience
    if (current >= 12.3 && !hasTriggered) {
      setHasTriggered(true);
      onEnter();
    }
  };

  const handleEnded = () => {
    if (!hasTriggered) {
      setHasTriggered(true);
      onEnter();
    }
  };

  const handleManualEnter = (e) => {
    if (e) e.stopPropagation();
    if (!hasTriggered) {
      setHasTriggered(true);
      onEnter();
    }
  };

  return (
    <div
      className={`cinematic-landing-container ${isTransitioning ? 'transitioning' : ''}`}
      onClick={handleManualEnter}
      role="region"
      aria-label="Cinematic Earth Orbit Reveal Animation"
    >
      <div className="video-viewport-wrapper">
        {/* 60fps 13.4s Ultra-HD Earth Orbit Video */}
        <video
          ref={videoRef}
          className="cinematic-landing-video"
          src="/landing.mp4"
          autoPlay
          muted
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
        />

        {/* Permanent Top Mask: cleanly conceals all top HUD / program text */}
        <div className="landing-top-mask" aria-hidden="true" />

        {/* Permanent Bottom Mask: cleanly conceals NASA MAKING-OF and all telemetry text */}
        <div className="landing-bottom-mask" aria-hidden="true">
          <div className="landing-bottom-content" onClick={(e) => e.stopPropagation()}>
            <h1 className="landing-earthecho-title">EarthEcho</h1>
            <button
              type="button"
              className="enter-observatory-btn"
              onClick={handleManualEnter}
              title="Enter Earth Echo Observatory & Jukebox"
              autoFocus
            >
              <span className="btn-glow-aura" />
              <span className="btn-text">ENTER OBSERVATORY</span>
              <span className="btn-arrow" aria-hidden="true">⟶</span>
            </button>
          </div>
        </div>
      </div>

      {/* Telemetry Progress Indicator Strip */}
      <div className="mission-progress-strip" aria-hidden="true">
        <div className="mission-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
