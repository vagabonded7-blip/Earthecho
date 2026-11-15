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
  getActiveScenario
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

