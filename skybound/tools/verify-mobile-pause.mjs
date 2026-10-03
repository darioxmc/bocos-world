import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
async function start(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.SKYBOUND_URL || 'http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => { skybound.saves.create(0); skybound.scene.scene.restart({ slot: 0, area: 0 }); });
  await page.waitForFunction(() => skybound.scene.mode === 'playing');
  return page;
}
try {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await start(mobile);
  const cdp = await mobile.newCDPSession(page);
  const dpad = await page.locator('#dpad').boundingBox();
  const jump = await page.locator('[data-action="jump"]').boundingBox();
  const direction = { id: 1, x: dpad.x + dpad.width * .85, y: dpad.y + dpad.height * .5 };
  const leap = { id: 2, x: jump.x + jump.width * .5, y: jump.y + jump.height * .5 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [direction, leap] });
  await page.keyboard.down('KeyD');
  const visibleBlur = await page.evaluate(() => {
    for (let i = 0; i < 5; i++) { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); }
    return { hidden: document.hidden, mode: skybound.scene.mode, right: skybound.controls.down('right'), jump: skybound.controls.down('jump') };
  });
  assert.deepEqual(visibleBlur, { hidden: false, mode: 'playing', right: true, jump: true }, 'visible mobile blur must not pause or cancel held touches');
  assert.equal(await page.evaluate(() => skybound.controls.keys.size === 0 && ![...skybound.controls.sources.keys()].some(key => key.startsWith('key:'))), true, 'mobile keyboard holds are released without cancelling touch input');
  await page.keyboard.up('KeyD');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => skybound.scene.mode), 'paused', 'backgrounding pauses immediately');
  assert.equal(await page.evaluate(() => skybound.controls.sources.size), 0, 'backgrounding releases input');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.evaluate(() => skybound.scene.mode), 'paused', 'returning does not silently resume');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(() => skybound.scene.mode), 'playing', 'resuming does not immediately repause');
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(await page.evaluate(() => skybound.scene.mode), 'playing', 'phone rotation/viewport resizing does not pause');
  await page.locator('#pause-button').tap();
  assert.equal(await page.evaluate(() => skybound.scene.mode), 'paused', 'explicit pause remains available');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate(() => skybound.scene.mode), 'paused', 'pagehide also pauses for navigation/back-forward cache');
  await mobile.close();

  const desktop = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const computer = await start(desktop);
  await computer.keyboard.down('ArrowRight');
  await computer.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await computer.evaluate(() => skybound.scene.mode), 'paused', 'desktop focus-loss safety is preserved');
  assert.equal(await computer.evaluate(() => skybound.controls.sources.size), 0);
  await desktop.close();
  assert.deepEqual(errors, []);
  console.log('Mobile pause regression passed: visible blur with multi-touch, background/return, Resume, manual Pause, pagehide, desktop blur.');
} finally { await browser.close(); }
