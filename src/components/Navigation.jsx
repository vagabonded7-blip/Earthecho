import React from 'react';

export default function Navigation({ activeTab, onSelectTab, dataStatus, datasetTitle }) {
  const navItems = [
    { id: 'observatory', label: 'Observatory', icon: '🛰️' },
    { id: 'compare', label: 'Comparison Lab', icon: '⚖️' },
    { id: 'fingerprint', label: 'Earth Fingerprint', icon: '🌀' },
    { id: 'provenance', label: 'Data & Science', icon: '📜' }
  ];

  return (
    <header className="cosmic-header" role="banner">
      <div className="header-inner">
        <div className="brand-group">
          <a
            href="#home"
            className="brand-logo"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('observatory');
            }}
            aria-label="Earth Echo Cosmic Observatory Home"
          >
            <span className="logo-ring" aria-hidden="true">
              <span className="logo-orb" />
            </span>
            <div className="brand-text">
              <span className="brand-title">EARTH ECHO</span>
              <span className="brand-subtitle">COSMIC OBSERVATORY</span>
            </div>
          </a>

          <div className="telemetry-pill" role="status" aria-label="System status">
            <span className={`status-dot ${dataStatus === 'loading' ? 'pulsing' : 'active'}`} />
            <span className="status-label">
              {dataStatus === 'loading' ? 'FETCHING TELEMETRY' : 'MISSION STREAM ACTIVE'}
            </span>
          </div>
        </div>

        <nav className="cosmic-nav" role="navigation" aria-label="Main Navigation">
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item.id} className="nav-item">
                <button
                  type="button"
                  className={`nav-button ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => onSelectTab(item.id)}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {activeTab === item.id && <span className="active-glow" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {datasetTitle && (
        <div className="sub-header-ticker" aria-live="polite">
          <span className="ticker-label">TARGET TARGET FEED:</span>
          <span className="ticker-title">{datasetTitle}</span>
          <span className="ticker-badge">SCHEMA v1.1 VALIDATED</span>
        </div>
      )}
    </header>
  );
}
