import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = process.env.SKYBOUND_URL || 'http://127.0.0.1:8770/';

async function checkpoint() {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => {
    skybound.saves.create(0);
    skybound.saves.save(0, { checkpoint: 'meadow-checkpoint-boss' });
    skybound.scene.scene.restart({ slot: 0, area: 0 });
  });
  await page.waitForFunction(() => skybound.scene.mode === 'playing' && skybound.scene.checkpoint.id === 'meadow-checkpoint-boss');
}

try {
  await checkpoint();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Music', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Effects');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Music');
  const music = Number(await page.getByRole('slider', { name: 'Music', exact: true }).inputValue());
  await page.keyboard.press('ArrowRight');
  assert(Number(await page.getByRole('slider', { name: 'Music', exact: true }).inputValue()) > music);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#overlay').getAttribute('aria-label'), 'Paused');
  console.log('Settings: sliders adjust normally, arrow navigation and Escape work.');

  // Real Arcade integration and input edges, with combat enabled and no damage immunity.
  for (const distance of [100, 120, 130]) {
    await checkpoint();
    const result = await page.evaluate(distance => {
      const s = skybound.scene, controls = skybound.controls;
      skybound.game.loop.stop();
      let jumpAt = null;
      for (let frame = 0; frame < 600; frame++) {
        const dx = s.boss.x - s.player.x;
        const actions = !s.bossEngaged || s.bossState.phase === 'attack' ? ['right'] : [];
        if (jumpAt === null && s.bossEngaged && s.bossState.phase === 'attack' && dx < distance) jumpAt = s.clock;
        if (jumpAt !== null && s.clock - jumpAt < 0.45) actions.push('jump');
        controls.activate('playtest', actions);
        s.physics.world.update(frame * 1000 / 60, 1000 / 60);
        s.physics.world.postUpdate();
        s.update(frame * 1000 / 60, 1000 / 60);
        if (s.health < 3) return { clear: false, health: s.health };
        if (jumpAt !== null && s.player.x > s.boss.x + 35) return { clear: true, health: s.health };
      }
      return { clear: false, health: s.health };
    }, distance);
    assert(result.clear && result.health === 3, `Jump starting ${distance}px away clears Brambleback's charge`);
  }
  console.log('Brambleback: three distinct jump timings clear the charge without damage.');

  for (const phase of ['recover', 'return', 'warn', 'attack']) {
    await checkpoint();
    const health = await page.evaluate(phase => {
      const s = skybound.scene;
      skybound.game.loop.stop();
      s.bossEngaged = true;
      Object.assign(s.bossState, { phase, until: 999, targetX: s.boss.x - 100, targetY: s.boss.y });
      s.player.body.reset(s.boss.x, s.boss.y);
      s.previousFeet = s.player.y;
      s.previousVelocityY = 0;
      s.physics.world.update(0, 1000 / 60);
      s.physics.world.postUpdate();
      s.update(0, 1000 / 60);
      return s.health;
    }, phase);
    assert.equal(health, phase === 'warn' || phase === 'attack' ? 2 : 3, `Contact damage during ${phase}`);
  }
  console.log('Boss contact: warning and attack deal damage; recovery and return are safe.');

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const touch = await phone.newPage();
  touch.on('pageerror', error => errors.push(error.message));
  await touch.goto(base, { waitUntil: 'networkidle' });
  if (await touch.getByRole('button', { name: 'Start', exact: true }).count()) await touch.getByRole('button', { name: 'Start', exact: true }).tap();
  await touch.getByRole('button', { name: 'Play', exact: true }).tap();
  await touch.getByRole('button', { name: '1 New Game Empty' }).tap();
  await touch.getByRole('button', { name: 'Skip', exact: true }).tap();
  await touch.waitForFunction(() => skybound.scene.mode === 'playing' && skybound.scene.player.body.blocked.down);
  const dpad = await touch.locator('#dpad').boundingBox();
  const jump = await touch.getByRole('button', { name: 'Jump', exact: true }).boundingBox();
  const start = await touch.evaluate(() => ({ x: skybound.scene.player.x, y: skybound.scene.player.y }));
  const cdp = await phone.newCDPSession(touch);
  const move = { id: 1, x: dpad.x + dpad.width * 0.82, y: dpad.y + dpad.height * 0.5 };
  const leap = { id: 2, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, leap] });
  await touch.waitForTimeout(250);
  const airborne = await touch.evaluate(() => ({ x: skybound.scene.player.x, y: skybound.scene.player.y }));
  assert(airborne.x > start.x + 10 && airborne.y < start.y - 30, 'Two real touch contacts move and jump simultaneously');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [leap] });
  await touch.waitForTimeout(100);
  assert(await touch.evaluate(() => skybound.controls.down('right') && !skybound.controls.down('jump')), 'Releasing Jump preserves movement');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.waitForTimeout(100);
  assert(await touch.evaluate(() => !skybound.controls.down('right')), 'Releasing the d-pad clears movement');
  await phone.close();
  assert.deepEqual(errors, []);
  console.log('Mobile: simultaneous touch movement/jump and independent release passed.');
} finally { await browser.close(); }
