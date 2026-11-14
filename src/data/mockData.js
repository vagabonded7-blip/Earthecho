/**
 * Earth Echo — Synthetic Mock Data Generator
 *
 * Conforms strictly to Common Data Interface v1.0.
 * Generates deterministic 64x32 grids modeling global nighttime illumination
 * for 2012 and 2023 to enable independent frontend & audio DSP development
 * without depending on external network or unverified files.
 */

import { EXPECTED_WIDTH, EXPECTED_HEIGHT, EXPECTED_SCHEMA_VERSION } from './schema.js';

// Canonical cluster centers representing major population & industrial centers
// Coordinates on 64x32 grid: x in [0, 63] (roughly 180W to 180E), y in [0, 31] (roughly 90N to 90S)
const CLUSTERS = [
  // North America (US East & West Coast, Midwest)
  { name: 'US East', x: 17, y: 10, radius: 2.5, base2012: 0.85, growth: 0.04 },
  { name: 'US West', x: 10, y: 10, radius: 2.0, base2012: 0.75, growth: 0.05 },
  { name: 'US Midwest', x: 14, y: 9, radius: 2.2, base2012: 0.70, growth: 0.02 },
  // Europe
  { name: 'Western Europe', x: 32, y: 8, radius: 3.0, base2012: 0.90, growth: -0.02 },
  { name: 'Eastern Europe', x: 36, y: 7, radius: 2.5, base2012: 0.65, growth: 0.03 },
  // East Asia
  { name: 'East China Coast', x: 51, y: 11, radius: 3.2, base2012: 0.60, growth: 0.32 },
  { name: 'Japan', x: 55, y: 10, radius: 1.8, base2012: 0.88, growth: 0.01 },
  // South Asia
  { name: 'India Indo-Gangetic Plain', x: 44, y: 12, radius: 2.8, base2012: 0.45, growth: 0.40 },
  { name: 'South India', x: 44, y: 15, radius: 2.2, base2012: 0.40, growth: 0.35 },
  // Middle East & Nile
  { name: 'Nile Delta', x: 35, y: 12, radius: 1.5, base2012: 0.70, growth: 0.15 },
  { name: 'Persian Gulf', x: 38, y: 12, radius: 2.0, base2012: 0.65, growth: 0.20 },
  // South America
  { name: 'SE Brazil', x: 23, y: 22, radius: 2.2, base2012: 0.55, growth: 0.18 },
  // Africa
  { name: 'Nigeria / Gulf of Guinea', x: 32, y: 16, radius: 2.0, base2012: 0.30, growth: 0.25 },
  { name: 'South Africa', x: 35, y: 25, radius: 1.8, base2012: 0.50, growth: 0.08 },
  // Australia
  { name: 'SE Australia', x: 57, y: 24, radius: 1.5, base2012: 0.60, growth: 0.06 }
];

/**
 * Deterministically generates a 64x32 grid for a target year
 * @param {number} year - 2012 or 2023
 * @returns {number[][]}
 */
function generateSyntheticGrid(year) {
  const is2023 = year >= 2023;
  const grid = [];

  for (let y = 0; y < EXPECTED_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < EXPECTED_WIDTH; x++) {
      // Polar ice masks at extreme latitudes (Antarctica y >= 29, High Arctic y <= 2)
      if (y >= 29 || y <= 1) {
        row.push(null);
        continue;
      }

      // Base background illumination (oceans / deserts / rural: very low, 0.01 to 0.05)
      // Slight latitude/longitude pseudo-noise
      const pseudoNoise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      let brightness = Math.abs(pseudoNoise) * 0.03;

      // Accumulate contribution from urban / regional clusters
      for (const cluster of CLUSTERS) {
        const dx = x - cluster.x;
        const dy = y - cluster.y;
        const distSq = dx * dx + dy * dy;
        const influenceRadiusSq = cluster.radius * cluster.radius;

        if (distSq < influenceRadiusSq * 3) {
          const falloff = Math.exp(-distSq / (2 * influenceRadiusSq));
          let clusterIntensity = cluster.base2012;
          if (is2023) {
            clusterIntensity = Math.min(1.0, clusterIntensity + cluster.growth);
          }
          brightness += clusterIntensity * falloff;
        }
      }

      // Clamp strictly to [0.0, 1.0] and format to 4 decimal places
      const clamped = Math.max(0.0, Math.min(1.0, brightness));
      row.push(Number(clamped.toFixed(4)));
    }
    grid.push(row);
  }

  return grid;
}

export const mockNightLights2012 = {
  schema_version: EXPECTED_SCHEMA_VERSION,
  id: 'night_lights_2012',
  title: 'Night Lights 2012 (Synthetic Mock Baseline)',
  source: {
    organization: 'NASA Earth Observatory / Suomi NPP VIIRS',
    url: 'https://earthobservatory.nasa.gov/features/NightLights',
    attribution: 'NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román'
  },
  observation_date: '2012',
  width: EXPECTED_WIDTH,
  height: EXPECTED_HEIGHT,
  value_meaning: 'visualization-derived brightness index',
  normalization: {
    method: 'shared_linear',
    source_min: 0,
    source_max: 255
  },
  projection: 'equirectangular_unverified',
  description: 'Global nighttime illumination visualization synthetic mock baseline for 2012.',
  values: generateSyntheticGrid(2012)
};

export const mockNightLights2023 = {
  schema_version: EXPECTED_SCHEMA_VERSION,
  id: 'night_lights_2023',
  title: 'Night Lights 2023 (Synthetic Mock Comparison)',
  source: {
    organization: 'NASA Earth Observatory / Suomi NPP VIIRS / NOAA',
    url: 'https://earthobservatory.nasa.gov/features/NightLights',
    attribution: 'NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román'
  },
  observation_date: '2023',
  width: EXPECTED_WIDTH,
  height: EXPECTED_HEIGHT,
  value_meaning: 'visualization-derived brightness index',
  normalization: {
    method: 'shared_linear',
    source_min: 0,
    source_max: 255
  },
  projection: 'equirectangular_unverified',
  description: 'Global nighttime illumination visualization synthetic mock comparison for 2023 showing regional electrification & urban expansion.',
  values: generateSyntheticGrid(2023)
};

