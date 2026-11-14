import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let moduleSequence = 0;

async function loadEngine({ exposePrivateScheduler = false } = {}) {
  moduleSequence += 1;
  if (exposePrivateScheduler) {
    const source = await readFile(new URL('../src/audio/audioEngine.js', import.meta.url), 'utf8');
    const declaration = 'function scheduleTone(';
    assert.ok(source.includes(declaration), 'Private scheduler declaration was not found.');
    const mappingUrl = new URL('../src/audio/mapping.js', import.meta.url).href;
    const instrumentedSource = source
      .replace("from './mapping.js';", `from '${mappingUrl}';`)
      .replace(declaration, 'export function scheduleTone(');
    const moduleUrl = `data:text/javascript,${encodeURIComponent(instrumentedSource)}#test=${moduleSequence}`;
    return import(moduleUrl);
  }

  return import(`../src/audio/audioEngine.js?test=${moduleSequence}`);
}

function restoreAudioContextGlobals(t) {
  const originalAudioContext = globalThis.AudioContext;
  const originalWebkitAudioContext = globalThis.webkitAudioContext;

  t.after(() => {
    if (originalAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalAudioContext;

    if (originalWebkitAudioContext === undefined) delete globalThis.webkitAudioContext;
    else globalThis.webkitAudioContext = originalWebkitAudioContext;
  });
}

class FakeAudioParam {
  constructor(value = 1) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: 'setValueAtTime', value, time });
  }

  setTargetAtTime(value, time, timeConstant) {
    this.value = value;
    this.events.push({ type: 'setTargetAtTime', value, time, timeConstant });
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: 'linearRampToValueAtTime', value, time });
  }

  cancelScheduledValues(time) {
    this.events.push({ type: 'cancelScheduledValues', time });
  }
}

class FakeAudioNode {
  constructor({ connectError = null } = {}) {
    this.connections = [];
    this.disconnectCount = 0;
    this.connectError = connectError;
  }

  connect(node) {
    if (this.connectError) {
      const error = this.connectError;
      this.connectError = null;
      throw error;
    }
    this.connections.push(node);
  }

  disconnect() {
    this.disconnectCount += 1;
  }
}

class FakeGainNode extends FakeAudioNode {
  constructor(options) {
    super(options);
    this.gain = new FakeAudioParam(1);
  }
}

class FakeOscillator extends FakeAudioNode {
  constructor(context, { stopErrors = [] } = {}) {
    super();
    this.context = context;
    this.frequency = new FakeAudioParam(440);
    this.stopErrors = [...stopErrors];
    this.startCalls = [];
    this.stopCalls = [];
    this.stopGeneration = 0;
    this.onended = null;
    this.type = 'sine';
  }

  start(time) {
    this.startCalls.push(time);
  }

  stop(time) {
    this.stopCalls.push(time);
    if (this.stopErrors.length > 0) {
      throw this.stopErrors.shift();
    }
    this.stopGeneration += 1;
    const generation = this.stopGeneration;
    const delay = Math.max(0, (time - this.context.currentTime) * 1000);
    setTimeout(() => {
      if (generation === this.stopGeneration && this.onended) this.onended();
    }, delay);
  }
}

class FakeAudioContext {
  static instances = [];

  constructor(initialState = 'suspended') {
    this.state = initialState;
    this._currentTime = 0;
    this.clockStartedAt = performance.now();
    this.autoAdvance = false;
    this.destination = new FakeAudioNode();
    this.gainNodes = [];
    this.oscillators = [];
    this.resumeCount = 0;
    this.closeCount = 0;
    this.nextGainConnectError = null;
    this.nextOscillatorOptions = {};
    FakeAudioContext.instances.push(this);
  }

  get currentTime() {
    if (!this.autoAdvance || this.state !== 'running') return this._currentTime;
    return this._currentTime + (performance.now() - this.clockStartedAt) / 1000;
  }

  set currentTime(value) {
    this._currentTime = value;
    this.clockStartedAt = performance.now();
  }

  createGain() {
    const gain = new FakeGainNode({ connectError: this.nextGainConnectError });
    this.nextGainConnectError = null;
    this.gainNodes.push(gain);
    return gain;
  }

  createOscillator() {
    const oscillator = new FakeOscillator(this, this.nextOscillatorOptions);
    this.nextOscillatorOptions = {};
    this.oscillators.push(oscillator);
    return oscillator;
  }

  async resume() {
    this.resumeCount += 1;
    this.state = 'running';
    this.clockStartedAt = performance.now();
  }

  async close() {
    this.closeCount += 1;
    this.state = 'closed';
  }
}

function installFakeAudioContext(t, initialState) {
  restoreAudioContextGlobals(t);
  FakeAudioContext.instances = [];
  globalThis.AudioContext = class extends FakeAudioContext {
    constructor() {
      super(initialState);
    }
  };
  delete globalThis.webkitAudioContext;
}

function syntheticTemperatureDataset(frameSpecs) {
  return {
    schema_version: '1.1',
    id: 'synthetic_temperature_fixture',
    title: 'Synthetic temperature fixture (not NASA data)',
    source: {
      organization: 'Synthetic test fixture',
      url: null,
      attribution: null
    },
    width: 2,
    height: 2,
    channels: [{
      id: 'surface_temperature',
      label: 'Surface temperature',
      quantity_type: 'scalar',
      units: 'degC',
      value_meaning: 'Synthetic illustrative values only',
      normalization: {
        method: 'linear',
        source_min: -10,
        source_max: 30
      },
      null_semantics: 'masked_or_unavailable'
    }],
    sonification_profiles: [{
      id: 'surface_temperature_pitch',
      channel_id: 'surface_temperature',
      is_default: true,
      mapping: 'linear_scalar_to_scale',
      scale: {
        mode: 'majorPentatonic',
        tonic_midi: 60,
        min_midi: 48,
        max_midi: 84
      },
      velocity: { min: 0.2, max: 0.8 },
      duration_seconds: { min: 0.01, max: 0.02 }
    }],
    frames: frameSpecs.map(spec => {
      const frame = {
        values: { surface_temperature: spec.values }
      };
      if (Object.prototype.hasOwnProperty.call(spec, 'timestamp')) {
        frame.timestamp = spec.timestamp;
      }
      return frame;
    })
  };
}

function legacyBrightnessDataset(value) {
  return {
    schema_version: '1.0',
    id: 'synthetic_legacy_brightness',
    width: 64,
    height: 32,
    values: Array.from({ length: 32 }, () => Array(64).fill(value))
  };
}

test('importing the engine does not create an AudioContext before user interaction', async t => {
  installFakeAudioContext(t, 'suspended');
  const engine = await loadEngine();

  assert.equal(FakeAudioContext.instances.length, 0);

  await engine.initAudio();
  assert.equal(FakeAudioContext.instances.length, 1);
});

test('initAudio reuses one context, connects one master gain, and resumes suspension', async t => {
  installFakeAudioContext(t, 'suspended');
  const engine = await loadEngine();

  await engine.initAudio();
  await engine.initAudio();

  const context = FakeAudioContext.instances[0];
  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(context.resumeCount, 1);
  assert.equal(context.gainNodes.length, 1);
  assert.deepEqual(context.gainNodes[0].connections, [context.destination]);
});

test('initAudio supports the WebKit AudioContext fallback', async t => {
  restoreAudioContextGlobals(t);
  FakeAudioContext.instances = [];
  delete globalThis.AudioContext;
  globalThis.webkitAudioContext = class extends FakeAudioContext {
    constructor() {
      super('running');
    }
  };
  const engine = await loadEngine();

  await engine.initAudio();

  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(FakeAudioContext.instances[0].resumeCount, 0);
});

test('master volume can be set before initialization and ramps after initialization', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();

  engine.setMasterVolume(0.35);
  assert.equal(FakeAudioContext.instances.length, 0);

  await engine.initAudio();
  const masterGain = FakeAudioContext.instances[0].gainNodes[0];
  assert.equal(masterGain.gain.value, 0.35);

  engine.setMasterVolume(0.65);
  assert.ok(masterGain.gain.events.some(event =>
    event.type === 'setTargetAtTime' && event.value === 0.65
  ));
});

test('master volume rejects invalid values without creating an AudioContext', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();

  for (const value of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => engine.setMasterVolume(value), RangeError);
  }
  assert.equal(FakeAudioContext.instances.length, 0);
});

test('unsupported browsers receive an explicit initialization error', async t => {
  restoreAudioContextGlobals(t);
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
  const engine = await loadEngine();

  await assert.rejects(engine.initAudio(), /Web Audio API is not supported/);
});

test('stopAudio is safe before initialization and does not close the reusable context', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();

  assert.doesNotThrow(() => engine.stopAudio());
  await engine.initAudio();
  engine.stopAudio();
  engine.stopAudio();
  await engine.initAudio();

  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(FakeAudioContext.instances[0].closeCount, 0);
  assert.equal(FakeAudioContext.instances[0].state, 'running');
});

test('scheduler cleans up partially connected nodes when gain connection fails', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine({ exposePrivateScheduler: true });
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  context.nextGainConnectError = new Error('gain connection failed');

  assert.throws(
    () => engine.scheduleTone({ frequencyHz: 440, velocity: 0.5, durationSeconds: 0.2 }),
    /gain connection failed/
  );

  assert.equal(context.oscillators.length, 1);
  assert.equal(context.oscillators[0].startCalls.length, 0);
  assert.equal(context.oscillators[0].disconnectCount, 1);
  assert.equal(context.gainNodes[1].disconnectCount, 1);
  engine.stopAudio();
  assert.equal(context.oscillators[0].disconnectCount, 1);
});

test('scheduler stops a started oscillator and disconnects nodes if its scheduled stop fails', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine({ exposePrivateScheduler: true });
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  const stopError = new Error('scheduled stop failed');
  context.nextOscillatorOptions = { stopErrors: [stopError] };

  assert.throws(
    () => engine.scheduleTone({ frequencyHz: 440, velocity: 0.5, durationSeconds: 0.2 }),
    error => error === stopError
  );

  const oscillator = context.oscillators[0];
  assert.equal(oscillator.startCalls.length, 1);
  assert.equal(oscillator.stopCalls.length, 2);
  assert.equal(oscillator.stopCalls[1], context.currentTime);
  assert.equal(oscillator.disconnectCount, 1);
  assert.equal(context.gainNodes[1].disconnectCount, 1);
});

test('stopAudio stops and cleans up active voices idempotently', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine({ exposePrivateScheduler: true });
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  engine.scheduleTone({ frequencyHz: 440, velocity: 0.5, durationSeconds: 0.2 });
  const oscillator = context.oscillators[0];
  const voiceGain = context.gainNodes[1];

  engine.stopAudio();
  oscillator.onended();
  engine.stopAudio();

  assert.equal(oscillator.stopCalls.length, 2);
  assert.equal(oscillator.stopCalls[1], context.currentTime);
  assert.equal(oscillator.disconnectCount, 1);
  assert.equal(voiceGain.disconnectCount, 1);
});

test('scheduler limits active voices to eight by stopping and cleaning up the oldest', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine({ exposePrivateScheduler: true });
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  const tone = { frequencyHz: 440, velocity: 0.5, durationSeconds: 0.2 };

  for (let index = 0; index < 9; index++) engine.scheduleTone(tone);

  assert.equal(context.oscillators.length, 9);
  assert.equal(context.oscillators[0].stopCalls.length, 2);
  assert.equal(context.oscillators[0].disconnectCount, 1);
  assert.ok(context.oscillators.slice(1).every(oscillator =>
    oscillator.stopCalls.length === 1 && oscillator.disconnectCount === 0
  ));

  engine.stopAudio();
  assert.ok(context.oscillators.every(oscillator => oscillator.disconnectCount === 1));
});

test('playGrid maps v1.1 frame means to ordered pitches and timestamp-based timing', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  context.autoAdvance = true;
  const dataset = syntheticTemperatureDataset([
    {
      values: [[-10, null], [10, 30]],
      timestamp: '2020-01-01T00:00:00Z'
    },
    {
      values: [[-10, -10], [-10, -10]],
      timestamp: '2020-01-01T00:00:01Z'
    },
    {
      values: [[30, 30], [30, 30]],
      timestamp: '2020-01-01T00:00:02Z'
    }
  ]);

  await engine.playGrid(dataset, 1, { secondsPerSourceSecond: 0.02 });

  assert.equal(context.oscillators.length, 2);
  assert.ok(context.oscillators[1].frequency.value >
    context.oscillators[0].frequency.value);
  assert.ok(Math.abs(
    context.oscillators[1].startCalls[0] - context.oscillators[0].startCalls[0] - 0.02
  ) < 0.006);
});

test('playGrid requires timing for untimestamped v1.1 frames and follows frame cadence', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  context.autoAdvance = true;
  const dataset = syntheticTemperatureDataset([
    { values: [[-10, -10], [-10, -10]] },
    { values: [[30, 30], [30, 30]] }
  ]);

  await assert.rejects(engine.playGrid(dataset), /frameIntervalSeconds/);
  await engine.playGrid(dataset, 0, { frameIntervalSeconds: 0.015 });

  assert.equal(context.oscillators.length, 2);
  assert.ok(context.oscillators[1].startCalls[0] >
    context.oscillators[0].startCalls[0]);
  assert.ok(Math.abs(
    context.oscillators[1].startCalls[0] - context.oscillators[0].startCalls[0] - 0.015
  ) < 0.006);
});

test('playGrid rejects malformed timestamps, frames, and out-of-range measurements', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();
  const grid = [[0, 0], [0, 0]];
  const mixedTimestamps = syntheticTemperatureDataset([
    { values: grid, timestamp: '2020-01-01T00:00:00Z' },
    { values: grid }
  ]);
  const reversedTimestamps = syntheticTemperatureDataset([
    { values: grid, timestamp: '2020-01-02T00:00:00Z' },
    { values: grid, timestamp: '2020-01-01T00:00:00Z' }
  ]);
  const outOfRange = syntheticTemperatureDataset([
    { values: [[-11, 0], [0, 0]] }
  ]);

  await assert.rejects(
    engine.playGrid(mixedTimestamps, 0, { frameIntervalSeconds: 0.1 }),
    /either all have timestamps/
  );
  await assert.rejects(
    engine.playGrid(reversedTimestamps, 0, { secondsPerSourceSecond: 0.1 }),
    /strictly increasing/
  );
  await assert.rejects(
    engine.playGrid(outOfRange, 0, { frameIntervalSeconds: 0.1 }),
    /outside the declared range/
  );
  await assert.rejects(
    engine.playGrid(syntheticTemperatureDataset([{ values: grid }]), 1, {
      frameIntervalSeconds: 0.1
    }),
    /frameIndex/
  );
});

test('playGrid retains v1.0 brightness-grid support as a single frame', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();
  await engine.initAudio();
  FakeAudioContext.instances[0].autoAdvance = true;

  await engine.playGrid(legacyBrightnessDataset(0.5));

  assert.equal(FakeAudioContext.instances[0].oscillators.length, 1);
  await assert.rejects(engine.playGrid(legacyBrightnessDataset(0.5), 1), /frameIndex/);
});

test('scanGrid scans columns left to right and skips null cells', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  context.autoAdvance = true;
  const dataset = syntheticTemperatureDataset([
    { values: [[-10, 30], [10, null]] }
  ]);

  await engine.scanGrid(dataset);

  assert.equal(context.oscillators.length, 3);
  assert.ok(context.oscillators[1].frequency.value >
    context.oscillators[0].frequency.value);
  assert.ok(context.oscillators[2].frequency.value >
    context.oscillators[1].frequency.value);
  assert.ok(Math.abs(
    context.oscillators[2].startCalls[0] - context.oscillators[0].startCalls[0] - 0.24
  ) < 0.006);
});

test('stopAudio resolves the active playback promise and cleans up its voices', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  context.autoAdvance = true;
  const dataset = syntheticTemperatureDataset([
    { values: [[-10, -10], [-10, -10]] },
    { values: [[30, 30], [30, 30]] }
  ]);
  const playback = engine.playGrid(dataset, 0, { frameIntervalSeconds: 10 });

  await new Promise(resolve => setTimeout(resolve, 10));
  engine.stopAudio();
  await playback;

  assert.equal(context.oscillators.length, 1);
  assert.equal(context.oscillators[0].disconnectCount, 1);
  assert.equal(context.gainNodes[1].disconnectCount, 1);
});

test('playGrid never exceeds the eight-voice cap when scheduling dense frames', async t => {
  installFakeAudioContext(t, 'running');
  const engine = await loadEngine();
  await engine.initAudio();
  const context = FakeAudioContext.instances[0];
  context.autoAdvance = true;
  const dataset = syntheticTemperatureDataset(Array.from({ length: 12 }, (_, index) => ({
    values: [[index, index], [index, index]]
  })));
  const playback = engine.playGrid(dataset, 0, { frameIntervalSeconds: 0.001 });

  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(context.oscillators.length, 12);
  assert.equal(context.oscillators.filter(oscillator =>
    oscillator.disconnectCount === 0
  ).length, 8);

  await playback;
  assert.ok(context.oscillators.every(oscillator => oscillator.disconnectCount === 1));
});
