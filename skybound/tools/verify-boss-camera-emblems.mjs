import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
await mkdir('qa/boss-camera-emblems', { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => {
    skybound.saves.create(0);
    skybound.saves.save(0, { checkpoint: 'meadow-checkpoint-boss' });
    skybound.scene.scene.restart({ slot: 0, area: 0 });
  });
  await page.waitForFunction(() => skybound.scene.mode === 'playing' && skybound.scene.checkpoint.id === 'meadow-checkpoint-boss');
  const started = await page.evaluate(() => {
    const s = skybound.scene, arena = s.level.boss.arena;
    s.invulnerableUntil = Infinity;
    s.player.body.reset(arena.x + 24, s.level.boss.y);
    s.updateBoss(1 / 60);
    return { mode: s.mode, phase: s.bossState.phase, alpha: s.boss.alpha, music: skybound.audio._musicMode };
  });
  assert.deepEqual(started, { mode: 'boss-intro', phase: 'intro', alpha: 0, music: 'boss' });
  await page.waitForTimeout(850);
  await page.screenshot({ path: 'qa/boss-camera-emblems/boss-reveal-phone.png', fullPage: true });
  const middle = await page.evaluate(() => {
    const s = skybound.scene, camera = s.cameras.main;
    return { alpha: s.boss.alpha, playerX: s.player.x - camera.scrollX, bossX: s.boss.x - camera.scrollX };
  });
  assert(middle.alpha > 0.9 && middle.playerX > -16 && middle.playerX < 336 && middle.bossX > -16 && middle.bossX < 336);
  await page.waitForFunction(() => skybound.scene.mode === 'playing' && skybound.scene.bossState.phase === 'warn');
  const returning = await page.evaluate(() => {
    const s = skybound.scene;
    s.health = 3; s.invulnerableUntil = 0; s.hurtUntil = 0;
    Object.assign(s.bossState, { phase: 'return', until: s.clock + 10, started: s.clock });
    s.player.body.reset(s.boss.x, s.boss.y);
    s.previousFeet = s.player.y; s.previousVelocityY = 0;
    const overlap = s.player.body.left < s.boss.body.right && s.player.body.right > s.boss.body.left &&
      s.player.body.top < s.boss.body.bottom && s.player.body.bottom > s.boss.body.top;
    s.bossContact();
    return { overlap, health: s.health };
  });
  assert.deepEqual(returning, { overlap: true, health: 2 });

  await page.evaluate(() => { skybound.saves.save(0, { area: 1, checkpoint: null }); skybound.scene.scene.restart({ slot: 0, area: 1 }); });
  await page.waitForFunction(() => skybound.scene.areaIndex === 1 && skybound.scene.mode === 'playing');
  const cameraPositions = [];
  for (const target of ['high', 'low']) {
    const point = await page.evaluate(target => {
      const s = skybound.scene;
      const high = [...s.level.terrain].sort((a, b) => a.y - b.y)[0];
      const low = s.level.terrain.find(rect => rect.x > high.x && rect.y >= high.y + 128) || s.level.terrain.at(-1);
      const rect = target === 'high' ? high : low;
      s.invulnerableUntil = Infinity;
      s.currentChapter = s.level.chapters.find(chapter => rect.x >= chapter.x && rect.x < chapter.endX) || s.currentChapter;
      s.player.body.reset(rect.x + Math.min(80, rect.w / 2), rect.y);
      return { x: s.player.x, y: s.player.y };
    }, target);
    await page.waitForTimeout(850);
    cameraPositions.push(await page.evaluate(point => {
      const s = skybound.scene, camera = s.cameras.main;
      return { target: point, screenY: s.player.y - camera.scrollY, scrollY: camera.scrollY };
    }, point));
  }
  for (const position of cameraPositions) assert(position.screenY >= 92 && position.screenY <= 156, JSON.stringify(cameraPositions));
  assert(Math.abs(cameraPositions[0].screenY - cameraPositions[1].screenY) <= 24, JSON.stringify(cameraPositions));
  await page.screenshot({ path: 'qa/boss-camera-emblems/cliff-camera-phone.png', fullPage: true });

  const emblemReport = await page.evaluate(async () => {
    const { LEVELS } = await import('/levels.js');
    const counts = LEVELS.map(level => level.emblems.length);
    skybound.shell.updateHud({ area: 'Test', health: 3, maxHealth: 3, emblems: 5 });
    const hud = document.querySelector('#hud-emblems').textContent;
    skybound.saves.save(0, { area: 2, defeated: ['meadow', 'cliff', 'canopy'], emblems: Array.from({ length: 11 }, (_, i) => `legacy-${i}`) });
    skybound.shell.showWorld(0);
    const row = () => [...document.querySelectorAll('.world-row')].find(button => button.textContent.includes('Starlight Roost'));
    const locked = row().disabled;
    skybound.saves.save(0, { emblems: Array.from({ length: 12 }, (_, i) => `legacy-${i}`) });
    skybound.shell.showWorld(0);
    const unlocked = !row().disabled;
    return { counts, hud, locked, unlocked, note: document.querySelector('.menu-note')?.textContent || '' };
  });
  assert.deepEqual(emblemReport.counts, [7, 7, 7, 2]);
  assert.equal(emblemReport.hud, 'Emblems 5/12');
  assert(emblemReport.locked && emblemReport.unlocked);
  assert.deepEqual(errors, []);
  console.log('Boss reveal, return damage, vertical camera centering, 12-emblem Roost gate, and reduced collectible counts passed.');
} finally {
  await browser.close();
}
