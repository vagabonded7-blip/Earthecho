import React from 'react';

export default function TimelineSelector({ dataset, frameIndex, onSelectFrame }) {
  const frames = dataset?.frames || [];
  if (frames.length <= 1) return null;

  return (
    <div className="timeline-container" role="region" aria-label="Observation Period Timeline">
      <div className="timeline-header">
        <span className="timeline-kicker">TEMPORAL CHRONOLOGY</span>
        <span className="timeline-status">
          Observation {frameIndex + 1} of {frames.length}
        </span>
      </div>

      <div className="timeline-scrubber" role="tablist" aria-label="Observation Periods">
        {frames.map((frame, index) => {
          const isSelected = frameIndex === index;
          const label = frame.label || frame.timestamp || `Period ${index + 1}`;
          const timestamp = frame.timestamp ? `(${frame.timestamp})` : '';

          return (
            <button
              key={index}
              role="tab"
              aria-selected={isSelected}
              type="button"
              className={`timeline-pill ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectFrame(index)}
            >
              <span className="pill-dot" aria-hidden="true" />
              <span className="pill-label">{label}</span>
              {timestamp && <span className="pill-timestamp">{timestamp}</span>}
              {isSelected && <span className="pill-glow" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

