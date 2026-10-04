import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const runtime = process.env.SKYBOUND_DEPENDENCIES ||
  'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);

  const queued = await page.evaluate(() => ({
    mode: skybound.audio._musicMode,
    area: skybound.audio._area,
    context: skybound.audio.context?.state || null,
    timer: skybound.audio._timer,
  }));
  assert.equal(queued.mode, 'boco');
  assert.equal(queued.area, 0);
  assert.equal(queued.timer, null);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForFunction(() => skybound.audio.context?.state === 'running' && skybound.audio._timer !== null);
  const sounding = await page.evaluate(async () => {
    const audio = skybound.audio;
    const analyser = audio.context.createAnalyser();
    analyser.fftSize = 2048;
    audio._master.connect(analyser);
    await new Promise(resolve => setTimeout(resolve, 350));
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    audio._master.disconnect(analyser);
    analyser.disconnect();
    return { mode: audio._musicMode, state: audio.context.state, step: audio._step, rms };
  });
  assert.equal(sounding.mode, 'boco');
  assert.equal(sounding.state, 'running');
  assert(sounding.step > 0, 'menu sequencer advances after the first gesture');
  assert(sounding.rms > 0.0001, 'Boco theme produces an audible signal');

  await page.evaluate(() => {
    skybound.saves.create(0);
    skybound.scene.scene.restart({ slot: 0, area: 0 });
  });
  await page.waitForFunction(() => skybound.scene.mode === 'playing' && skybound.audio._musicMode === 'level');
  assert.equal(await page.evaluate(() => skybound.audio._area), 0);

  await page.evaluate(() => {
    skybound.audio.pause();
    skybound.audio.stopMusic();
    skybound.scene.scene.restart({ menu: 'slots' });
  });
  await page.waitForFunction(() => skybound.audio._musicMode === 'boco' && !skybound.audio._paused && skybound.audio._timer !== null);
  assert.deepEqual(errors, []);
  console.log(`Menu music passed: queued before gesture, audible at RMS ${sounding.rms.toFixed(4)}, and cleanly hands off in both directions.`);
} finally {
  await browser.close();
}
