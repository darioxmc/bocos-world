import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
await mkdir('qa/touch-zoom', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.SKYBOUND_URL || 'http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => {
    skybound.saves.create(0); skybound.scene.scene.restart({ slot: 0, area: 0 });
    window.controlEnds = [];
    document.addEventListener('touchend', event => {
      if (event.target.closest('#touch-controls')) controlEnds.push(event.defaultPrevented);
    });
  });
  await page.waitForFunction(() => skybound.scene.mode === 'playing');
  const cdp = await context.newCDPSession(page);
  for (const [width, height] of [[844, 390], [932, 430], [667, 375], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      return { scale: visualViewport.scale, screen: box('.screen'), left: box('.control-left'), right: box('.control-right'),
        dpad: box('#dpad'), jump: box('[data-action="jump"]'), label: box('[data-action="attack"] span'),
        policies: ['.touch-controls', '.control-left', '.control-right'].map(s => getComputedStyle(document.querySelector(s)).touchAction),
        consolePolicy: getComputedStyle(document.querySelector('.console')).touchAction };
    });
    assert.deepEqual(layout.policies, ['none', 'none', 'none']);
    assert.equal(layout.consolePolicy, 'manipulation');
    const { left, right, jump, label, dpad } = layout;
    const points = [
      [jump.x + jump.width / 2, jump.y + jump.height / 2],
      [label.x + label.width / 2, label.y + label.height / 2],
      [right.x + right.width * .2, right.y + 10], // Empty grid cell above Attack.
      [dpad.x + 3, dpad.y + 3], // Clipped-out d-pad corner belongs to its column.
      [left.x + left.width / 2, left.y + 2],
    ];
    for (const [x, y] of points) {
      for (let tap = 0; tap < 2; tap++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(60);
      }
    }
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => visualViewport.scale), layout.scale, 'rapid control taps must not change viewport zoom');
    assert.equal(await page.evaluate(() => skybound.scene.mode), 'playing');
    for (const b of [layout.screen, left, right]) assert(b.x >= -1 && b.y >= -1 && b.right <= width + 1 && b.bottom <= height + 1, 'game and controls fit viewport');
    assert.equal(await page.evaluate(() => controlEnds.length > 0 && controlEnds.every(Boolean)), true, 'control touchend defaults are cancelled, including gaps');
    await page.screenshot({ path: `qa/touch-zoom/${width}x${height}.png` });
  }
  const dpad = await page.locator('#dpad').boundingBox(), jump = await page.locator('[data-action="jump"]').boundingBox();
  const direction = { id: 1, x: dpad.x + dpad.width * .85, y: dpad.y + dpad.height * .5 };
  const leap = { id: 2, x: jump.x + jump.width * .5, y: jump.y + jump.height * .5 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [direction, leap] });
  assert(await page.evaluate(() => skybound.controls.down('right') && skybound.controls.down('jump')));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [leap] });
  assert(await page.evaluate(() => skybound.controls.down('right') && !skybound.controls.down('jump')));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await page.evaluate(() => skybound.controls.sources.size), 0);
  await page.locator('#pause-button').tap();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const menuPolicy = await page.evaluate(() => {
    const overlay = document.querySelector('#overlay');
    const event = new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [] });
    overlay.dispatchEvent(event);
    return { cancelled: event.defaultPrevented, touchAction: getComputedStyle(overlay).touchAction, viewport: document.querySelector('meta[name="viewport"]').content };
  });
  assert.equal(menuPolicy.cancelled, false);
  assert.equal(menuPolicy.touchAction, 'auto');
  assert(!/user-scalable\s*=\s*no|maximum-scale/i.test(menuPolicy.viewport), 'menu pinch zoom remains available');
  assert.deepEqual(errors, []);
  console.log('Touch zoom checks passed: four viewport sizes, rapid taps in buttons/labels/gaps, stable scale, multi-touch release, accessible menus.');
} finally { await browser.close(); }
