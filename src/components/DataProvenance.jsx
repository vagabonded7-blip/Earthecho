import React from 'react';

export default function DataProvenance({ dataset }) {
  return (
    <section className="provenance-panel" aria-labelledby="provenance-title">
      <div className="card-header">
        <div>
          <span className="card-kicker">SCIENTIFIC TRANSPARENCY & METHODOLOGY</span>
          <h2 id="provenance-title" className="card-title">Data Sources & Provenance</h2>
        </div>
        <div className="status-pill active">
          <span>PEER-AUDITED SOURCES</span>
        </div>
      </div>

      <div className="provenance-grid">
        {/* Source 1: Night Lights */}
        <article className="provenance-card">
          <div className="prov-card-header">
            <span className="prov-icon">🌃</span>
            <div>
              <h3>NASA Night Lights (2012–2023)</h3>
              <span className="prov-badge">NASA SVS #5313</span>
            </div>
          </div>
          <div className="prov-body">
            <p>
              Captured via the Day/Night Band of the Visible Infrared Imaging Radiometer Suite
              (VIIRS) on the Suomi National Polar-orbiting Partnership (NPP) satellite.
            </p>
            <dl className="prov-meta">
              <div>
                <dt>Measurement Nature</dt>
                <dd>Visualization-Derived Display Luma (ITU-R BT.709)</dd>
              </div>
              <div>
                <dt>Physical Limitation</dt>
                <dd>Values reflect rendered display brightness, not calibrated physical microwatts/cm²/sr.</dd>
              </div>
              <div>
                <dt>Downsampling</dt>
                <dd>Area-averaged 3840×2160 source imagery to standard 64×32 equirectangular grid.</dd>
              </div>
            </dl>
          </div>
        </article>

        {/* Source 2: Ocean */}
        <article className="provenance-card">
          <div className="prov-card-header">
            <span className="prov-icon">🌊</span>
            <div>
              <h3>Sea Surface Currents & Temp</h3>
              <span className="prov-badge">NASA SVS #3912 / ECCO2</span>
            </div>
          </div>
          <div className="prov-body">
            <p>
              Derived from the Estimating the Circulation and Climate of the Ocean, Phase II (ECCO2)
              high-resolution global ocean and sea-ice state simulation.
            </p>
            <dl className="prov-meta">
              <div>
                <dt>Measurement Nature</dt>
                <dd>High-Resolution Numerical Model Simulation Output</dd>
              </div>
              <div>
                <dt>Physical Limitation</dt>
                <dd>Synthesized from numerical state estimates, not continuous point-source in-situ buoys.</dd>
              </div>
              <div>
                <dt>Masking Policy</dt>
                <dd>Continental land masses are strictly masked as null (silence), not zero temperature.</dd>
              </div>
            </dl>
          </div>
        </article>

        {/* Source 3: Vegetation */}
        <article className="provenance-card">
          <div className="prov-card-header">
            <span className="prov-icon">🌿</span>
            <div>
              <h3>Global Vegetation (NDVI)</h3>
              <span className="prov-badge">MODIS Terra MOD13C2 v6.1</span>
            </div>
          </div>
          <div className="prov-body">
            <p>
              Normalized Difference Vegetation Index (NDVI) produced by NASA's Land Processes
              Distributed Active Archive Center (LP DAAC) from MODIS Terra observations.
            </p>
            <dl className="prov-meta">
              <div>
                <dt>Measurement Nature</dt>
                <dd>Dimensionless Physical Index: (NIR − Red) / (NIR + Red)</dd>
              </div>
              <div>
                <dt>Valid Range</dt>
                <dd>[-0.2, 1.0] scaled from raw int16 with 10,000 scale factor. Fill value -3000 masked.</dd>
              </div>
              <div>
                <dt>Masking Policy</dt>
                <dd>Oceans, snow/ice, and cloud-obscured areas are preserved as silent null values.</dd>
              </div>
            </dl>
          </div>
        </article>
      </div>

      {/* Sonification Physics & Principles */}
      <div className="sonification-principles-section">
        <h3>Principles of Scientific Sonification</h3>
        <div className="principles-grid">
          <div className="principle-item">
            <h4>1. Monotonic Pitch Mapping</h4>
            <p>
              Within any active observation, higher numerical values (brightness or physical index)
              always map monotonically to higher equal-tempered musical pitches on the Pentatonic Major scale.
            </p>
          </div>
          <div className="principle-item">
            <h4>2. Silence for Unavailable Data</h4>
            <p>
              Cells masked as missing, clouded, or geographically inapplicable (e.g. land in ocean feeds)
              produce <em>complete silence</em>, guaranteeing that absence of data is never misinterpreted as zero.
            </p>
          </div>
          <div className="principle-item">
            <h4>3. Spatial Coordinate Panning</h4>
            <p>
              Horizontal longitudinal position (-180° to +180°) maps to stereo directional panning,
              allowing listeners to perceive geographic trajectory across the soundscape.
            </p>
          </div>
          <div className="principle-item">
            <h4>4. Differential Polar Registers</h4>
            <p>
              When comparing epochs, increases voice in the upper musical register while decreases
              voice in the lower register, making environmental changes intuitively audible.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

