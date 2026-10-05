import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const runtime = process.env.SKYBOUND_DEPENDENCIES ||
  'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });

const safariAudioStub = () => {
  Object.defineProperty(navigator, 'audioSession', {
    configurable: true,
    value: { type: 'ambient' }
  });
  class AudioNode {
    constructor() { this.gain = { value: 0 }; }
    connect() { return this; }
    disconnect() {}
  }
  class SafariAudioContext {
    constructor() {
      window.__audioCreateEvent = window.event?.type || '';
      this.state = 'suspended';
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = new AudioNode();
    }
    createGain() { return new AudioNode(); }
    createDynamicsCompressor() {
      const node = new AudioNode();
      for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = { value: 0 };
      return node;
    }
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      return { buffer: null, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} };
    }
    resume() { return new Promise(() => {}); }
    addEventListener() {}
    removeEventListener() {}
    close() { return Promise.resolve(); }
  }
  window.AudioContext = SafariAudioContext;
  window.webkitAudioContext = SafariAudioContext;
};

try {
  const normal = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  normal.on('pageerror', error => errors.push(error.message));
  normal.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await normal.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await normal.waitForFunction(() => window.skybound?.shell);
  assert.equal(await normal.evaluate(() => Boolean(skybound.audio.context)), false,
    'title load must not create Web Audio before a user gesture');
  await normal.getByRole('button', { name: 'Start' }).click();
  await normal.getByRole('button', { name: 'Play' }).waitFor({ state: 'visible', timeout: 750 });
  const music = await normal.evaluate(() => ({
    area: skybound.audio._area,
    mode: skybound.audio._musicMode,
    state: skybound.audio.context?.state,
    scheduled: skybound.audio._timer !== null
  }));
  assert.equal(music.area, 0);
  assert.equal(music.mode, 'title');
  assert.equal(music.state, 'running');
  assert.equal(music.scheduled, true);
  await normal.getByRole('button', { name: 'Play' }).click();
  await normal.getByRole('heading', { name: 'Choose a Save' }).waitFor({ state: 'visible', timeout: 750 });
  assert.deepEqual(errors, []);
  await normal.close();

  const suspended = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await suspended.addInitScript(safariAudioStub);
  await suspended.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await suspended.waitForFunction(() => window.skybound?.shell);
  await suspended.getByRole('button', { name: 'Start' }).click();
  await suspended.getByRole('button', { name: 'Play' }).waitFor({ state: 'visible', timeout: 750 });
  assert.equal(await suspended.evaluate(() => skybound.shell.titleStarted), true,
    'a pending Safari resume promise must not block the title screen');
  const iosActivation = await suspended.evaluate(() => ({
    event: window.__audioCreateEvent,
    session: navigator.audioSession.type
  }));
  assert.equal(iosActivation.event, 'click', 'iPhone Web Audio must be created by the click gesture');
  assert.equal(iosActivation.session, 'playback', 'iPhone audio must not be muted by the Ring/Silent switch');
  await suspended.getByRole('button', { name: 'Play' }).click();
  await suspended.getByRole('heading', { name: 'Choose a Save' }).waitFor({ state: 'visible', timeout: 750 });
  await suspended.close();

  console.log('Startup passed: music schedules, Start advances, Safari cannot block play, and iPhone uses the playback audio session.');
} finally {
  await browser.close();
}
