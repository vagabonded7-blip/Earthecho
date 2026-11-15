import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initAudio,
  stopAudio,
  setMasterVolume,
  getMasterVolume,
  isAudioMuted,
  muteAudio,
  unmuteAudio,
  AUDIO_PRESETS,
  setAudioPreset,
  getAudioPreset,
  getAvailableAudioPresets,
  SCENARIO_PROFILES,
  getDatasetScenario,
  setActiveScenario,
  getActiveScenario,
  selectDatasetPreset,
  playLocation,
  playComparison,
  generateAudioFingerprint,
  playFingerprint,
  stopPlayback
} from '../src/audio/audioEngine.js';

test('audio presets catalog exposes scientific, ambient, and cinematic styles', () => {
  const presets = getAvailableAudioPresets();
  assert.equal(presets.length, 3);
  const ids = presets.map(p => p.id);
  assert.ok(ids.includes('scientific'));
  assert.ok(ids.includes('ambient'));
  assert.ok(ids.includes('cinematic'));

  for (const preset of presets) {
    assert.ok(typeof preset.name === 'string' && preset.name.length > 0);
    assert.ok(typeof preset.description === 'string' && preset.description.length > 0);
  }
});

test('preset selection switches active style and rejects unknown presets', () => {
  const initial = getAudioPreset();
  assert.ok(initial === 'ambient' || initial === 'scientific' || initial === 'cinematic');

  setAudioPreset('scientific');
  assert.equal(getAudioPreset(), 'scientific');

  setAudioPreset('cinematic');
  assert.equal(getAudioPreset(), 'cinematic');

  setAudioPreset('ambient');
  assert.equal(getAudioPreset(), 'ambient');

  // Case insensitive
  setAudioPreset('SCIENTIFIC');
  assert.equal(getAudioPreset(), 'scientific');

  // Rejects invalid preset
  assert.throws(() => setAudioPreset('rock_and_roll'), RangeError);
  assert.throws(() => setAudioPreset(''), RangeError);
  assert.throws(() => setAudioPreset(null), RangeError);
});

test('master volume getter, mute, and unmute helpers behave reliably', () => {
  // Set volume to known level
  setMasterVolume(0.8);
  assert.equal(getMasterVolume(), 0.8);
  assert.equal(isAudioMuted(), false);

  // Mute audio
  muteAudio();
  assert.equal(getMasterVolume(), 0);
  assert.equal(isAudioMuted(), true);

  // Unmute restores previous level
  unmuteAudio();
  assert.equal(getMasterVolume(), 0.8);
  assert.equal(isAudioMuted(), false);

  // setMasterVolume directly to 0 also sets muted
  setMasterVolume(0);
  assert.equal(isAudioMuted(), true);

  // Restore
  setMasterVolume(0.7);
  assert.equal(getMasterVolume(), 0.7);
  assert.equal(isAudioMuted(), false);
});

test('master volume rejects out-of-range values', () => {
  assert.throws(() => setMasterVolume(-0.05), RangeError);
  assert.throws(() => setMasterVolume(1.05), RangeError);
  assert.throws(() => setMasterVolume(NaN), RangeError);
});

test('preset configuration properties maintain expected musical and spatial settings', () => {
  assert.equal(AUDIO_PRESETS.scientific.waveform, 'sine');
  assert.equal(AUDIO_PRESETS.scientific.useSpatialPanning, false);
  assert.equal(AUDIO_PRESETS.scientific.useFilter, false);

  assert.equal(AUDIO_PRESETS.ambient.waveform, 'triangle');
  assert.equal(AUDIO_PRESETS.ambient.useSpatialPanning, true);
  assert.equal(AUDIO_PRESETS.ambient.useFilter, true);
  assert.ok(AUDIO_PRESETS.ambient.releaseSeconds > AUDIO_PRESETS.scientific.releaseSeconds);

  assert.equal(AUDIO_PRESETS.cinematic.waveform, 'triangle');
  assert.equal(AUDIO_PRESETS.cinematic.useSpatialPanning, true);
  assert.equal(AUDIO_PRESETS.cinematic.useFilter, true);
  assert.ok(AUDIO_PRESETS.cinematic.releaseSeconds >= AUDIO_PRESETS.ambient.releaseSeconds);
});

test('environmental scenarios provide suitable musical and acoustic profiles', () => {
  // 1. Night Lights — Electronic / Synth Music
  assert.ok(SCENARIO_PROFILES.night_lights);
  assert.equal(SCENARIO_PROFILES.night_lights.genre, 'Electronic / Synth Music');
  assert.equal(SCENARIO_PROFILES.night_lights.waveform, 'sawtooth');
  assert.equal(SCENARIO_PROFILES.night_lights.filterDynamic, true);
  assert.equal(SCENARIO_PROFILES.night_lights.periodicWaveKey, 'electronic_synth');

  // 2. Ocean — Ambient / Flowing Music
  assert.ok(SCENARIO_PROFILES.ocean);
  assert.equal(SCENARIO_PROFILES.ocean.genre, 'Ambient / Flowing Music');
  assert.equal(SCENARIO_PROFILES.ocean.waveform, 'sine');
  assert.ok(SCENARIO_PROFILES.ocean.attackSeconds > 0.05); // Rolling slow swell attack
  assert.ok(SCENARIO_PROFILES.ocean.releaseSeconds > 0.35); // Long fluid decay
  assert.equal(SCENARIO_PROFILES.ocean.periodicWaveKey, 'ambient_flowing');

  // 3. Vegetation — Organic / Nature-Inspired Music
  assert.ok(SCENARIO_PROFILES.vegetation);
  assert.equal(SCENARIO_PROFILES.vegetation.genre, 'Organic / Nature-Inspired Music');
  assert.equal(SCENARIO_PROFILES.vegetation.waveform, 'triangle');
  assert.ok(SCENARIO_PROFILES.vegetation.attackSeconds <= 0.01); // Instant acoustic wooden mallet attack
  assert.equal(SCENARIO_PROFILES.vegetation.periodicWaveKey, 'organic_nature');
});

test('dataset scenario detection automatically categorizes environmental datasets', () => {
  assert.equal(getDatasetScenario({ comparison_group: 'night_lights' }), 'night_lights');
  assert.equal(getDatasetScenario({ id: 'night_lights_2012_2023' }), 'night_lights');

  assert.equal(getDatasetScenario({ comparison_group: 'ocean' }), 'ocean');
  assert.equal(getDatasetScenario({ id: 'sea_surface_temp' }), 'ocean');

  assert.equal(getDatasetScenario({ comparison_group: 'vegetation' }), 'vegetation');
  assert.equal(getDatasetScenario({ id: 'vegetation_ndvi_2020_2023' }), 'vegetation');

  setActiveScenario('ocean');
  assert.equal(getActiveScenario(), 'ocean');

  setActiveScenario('vegetation');
  assert.equal(getActiveScenario(), 'vegetation');

  setActiveScenario('night_lights');
  assert.equal(getActiveScenario(), 'night_lights');
});

test('SCENARIO_PROFILES includes atmospheric temperature configuration', () => {
  assert.ok(SCENARIO_PROFILES.temperature);
  assert.equal(SCENARIO_PROFILES.temperature.genre, 'Atmospheric / Warm Synth');
  assert.equal(SCENARIO_PROFILES.temperature.waveform, 'triangle');
  assert.equal(SCENARIO_PROFILES.temperature.periodicWaveKey, 'atmospheric_temperature');
});

test('selectDatasetPreset switches active scenario preset dynamically', () => {
  const nl = selectDatasetPreset('night_lights_2012_2023');
  assert.equal(nl.scenario, 'night_lights');
  assert.equal(getActiveScenario(), 'night_lights');

  const oc = selectDatasetPreset('sea_surface_temp');
  assert.equal(oc.scenario, 'ocean');
  assert.equal(getActiveScenario(), 'ocean');

  const vg = selectDatasetPreset('vegetation_ndvi_2020_2023');
  assert.equal(vg.scenario, 'vegetation');
  assert.equal(getActiveScenario(), 'vegetation');

  const tp = selectDatasetPreset('land_surface_temp');
  assert.equal(tp.scenario, 'temperature');
  assert.equal(getActiveScenario(), 'temperature');
});

test('generateAudioFingerprint produces deterministic reproducible motifs', () => {
  const mockDataset = {
    schema_version: '1.1',
    id: 'night_lights_2012_2023',
    width: 4,
    height: 4,
    channels: [{ id: 'radiance', label: 'Radiance', quantity_type: 'scalar', normalization: { source_min: 0, source_max: 1 } }],
    frames: [
      {
        timestamp: '2023-01-01T00:00:00Z',
        values: {
          radiance: [
            [0.1, 0.2, 0.3, 0.4],
            [0.2, 0.5, 0.7, 0.3],
            [0.4, 0.8, 0.9, 0.2],
            [0.1, 0.3, 0.2, 0.1]
          ]
        }
      }
    ]
  };

  const loc1 = { lat: 37.77, lon: -122.41 };
  const fp1 = generateAudioFingerprint(mockDataset, loc1, 0);
  const fp2 = generateAudioFingerprint(mockDataset, loc1, 0);

  // Determinism
  assert.equal(fp1.id, fp2.id);
  assert.equal(fp1.scenario, 'night_lights');
  assert.equal(fp1.motif.length, 4);
  assert.deepEqual(fp1.motif, fp2.motif);

  // Different locations yield different fingerprints
  const loc2 = { lat: 51.5, lon: 0.12 };
  const fp3 = generateAudioFingerprint(mockDataset, loc2, 0);
  assert.notEqual(fp1.id, fp3.id);

  // Missing dataset throws
  assert.throws(() => generateAudioFingerprint(null, loc1, 0), /dataset is required/);
});

test('playFingerprint validates input schema and motif presence', async () => {
  await assert.rejects(() => playFingerprint(null), /valid fingerprint object/);
  await assert.rejects(() => playFingerprint({}), /non-empty motif array/);
  await assert.rejects(() => playFingerprint({ motif: [] }), /non-empty motif array/);
});

test('playLocation validates arguments and dataset presence', async () => {
  await assert.rejects(() => playLocation(null), /selection must be an object/);
  await assert.rejects(() => playLocation({}), /selection.dataset is required/);
});

test('stopPlayback is idempotent and resolves safely', async () => {
  await assert.doesNotReject(() => stopPlayback());
  await assert.doesNotReject(() => stopPlayback());
});

