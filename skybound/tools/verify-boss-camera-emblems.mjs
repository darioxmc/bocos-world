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
  assert.deepEqual(returning, { overlap: true, health: 3 });

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

  const bossSignal = await page.evaluate(() => {
    const s = skybound.scene;
    s.bossEngaged = true;
    s.bossDefeated = false;
    s.bossState.openingShown = false;
    s.bossRecover(1.5);
    s.updateBoss(1 / 60);
    s.refreshHud();
    const open = {
      cue: s.bossOpenCue.visible,
      label: document.querySelector('#hud-boss-name').textContent,
      className: document.querySelector('#hud-boss').className,
    };
    s.cameras.main.stopFollow();
    s.cameras.main.centerOn(s.boss.x, s.boss.y - 50);
    return open;
  });
  assert(bossSignal.cue && bossSignal.label.endsWith(' - OPEN') && bossSignal.className.includes('vulnerable'));
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'qa/boss-camera-emblems/galeweaver-open-phone.png', fullPage: true });

  const textureReport = await page.evaluate(async () => {
    const { LEVELS } = await import('/levels.js');
    const counts = { idle: 4, warn: 4, attack: 6, recover: 4, return: 4 };
    const missing = [];
    for (const type of new Set(LEVELS.map(level => level.boss.type))) {
      for (const [phase, count] of Object.entries(counts)) for (let frame = 0; frame < count; frame++) {
        const suffixes = phase === 'recover' ? ['', '-hit'] : [''];
        for (const suffix of suffixes) {
          const key = `boss-${type}-${phase}${frame}${suffix}`;
          if (!skybound.scene.textures.exists(key)) missing.push(key);
        }
      }
    }
    const s = skybound.scene;
    Object.assign(s.bossState, { phase: 'recover', until: s.clock, started: s.clock - 0.1,
      flashUntil: s.clock + 0.2, hitUntil: s.clock + 0.2 });
    s.updateBoss(1 / 60);
    return { missing, phase: s.bossState.phase, texture: s.boss.texture.key,
      textureExists: s.textures.exists(s.boss.texture.key), cue: s.bossOpenCue.visible };
  });
  assert.deepEqual(textureReport.missing, []);
  assert(textureReport.phase === 'return' && textureReport.texture.endsWith('-hit') && textureReport.textureExists && !textureReport.cue,
    JSON.stringify(textureReport));

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
    skybound.shell.hide();
    const s = skybound.scene;
    const first = s.pickups.getChildren().find(pickup => pickup.getData('kind') === 'emblem');
    s.save = skybound.saves.save(0, { emblems: ['legacy-0', 'legacy-1', 'legacy-2'], assists: { extraHealth: false } });
    s.collected = new Set(s.save.emblems); s.maxHealth = 3; s.health = 2; s.pickup(first);
    const firstBlessing = { max: s.maxHealth, health: s.health, active: first.active };
    const second = s.pickups.getChildren().find(pickup => pickup.active && pickup.getData('kind') === 'emblem');
    s.save = skybound.saves.save(0, { defeated: ['meadow', 'cliff', 'canopy'],
      emblems: Array.from({ length: 11 }, (_, i) => `legacy-${i}`), assists: { extraHealth: false } });
    s.collected = new Set(s.save.emblems); s.maxHealth = 4; s.health = 2; s.pickup(second); s.refreshHud();
    const emblemRect = document.querySelector('#hud-emblems').getBoundingClientRect();
    const soundRect = document.querySelector('#sound-button').getBoundingClientRect();
    const completion = { max: s.maxHealth, health: s.health,
      remaining: s.pickups.getChildren().filter(pickup => pickup.active && pickup.getData('kind') === 'emblem').length,
      hud: document.querySelector('#hud-emblems').textContent, fits: emblemRect.right <= soundRect.left };
    return { counts, hud, locked, unlocked, firstBlessing, completion, note: document.querySelector('.menu-note')?.textContent || '' };
  });
  assert.deepEqual(emblemReport.counts, [4, 4, 4, 0]);
  assert.equal(emblemReport.hud, 'Emblems 5/12');
  assert(emblemReport.locked && emblemReport.unlocked);
  assert.deepEqual(emblemReport.firstBlessing, { max: 4, health: 4, active: false });
  assert.deepEqual(emblemReport.completion, { max: 5, health: 5, remaining: 0, hud: 'Crest 12/12', fits: true });
  const crestReport = await page.evaluate(() => {
    const s = skybound.scene;
    const target = [...s.enemyData].find(([, state]) => state.type !== 'shellback' && !state.dead);
    const [enemy, state] = target;
    state.hp = 2;
    s.facing = 1;
    s.launchWindStrike();
    const strike = s.windStrikes.getChildren()[0];
    const texture = strike.texture.key;
    strike.body.reset(enemy.body.center.x, enemy.body.center.y);
    s.updateWindStrikes();
    const enemyHit = state.hp === 1 && s.windStrikes.countActive() === 0;

    s.bossEngaged = true; s.bossDefeated = false; s.bossState.hp = s.bossState.max; s.bossState.hitUntil = 0;
    s.bossState.phase = 'warn';
    s.launchWindStrike();
    s.windStrikes.getChildren()[0].body.reset(s.boss.body.center.x, s.boss.body.center.y);
    s.updateWindStrikes();
    const armoredBossHealth = s.bossState.hp;
    s.bossState.phase = 'recover'; s.bossState.hitUntil = 0;
    s.launchWindStrike();
    s.windStrikes.getChildren()[0].body.reset(s.boss.body.center.x, s.boss.body.center.y);
    s.updateWindStrikes();
    return { texture, enemyHit, armoredBossHealth, openBossHealth: s.bossState.hp, max: s.bossState.max };
  });
  assert.deepEqual(crestReport, { texture: 'wind-strike', enemyHit: true, armoredBossHealth: crestReport.max,
    openBossHealth: crestReport.max - 1, max: crestReport.max });
  await page.evaluate(() => skybound.scene.scene.restart({ slot: 0, area: 1 }));
  await page.waitForFunction(() => skybound.scene.areaIndex === 1 && skybound.scene.mode === 'playing');
  const completedReload = await page.evaluate(() => ({ max: skybound.scene.maxHealth,
    emblems: skybound.scene.pickups.getChildren().filter(pickup => pickup.getData('kind') === 'emblem').length }));
  assert.deepEqual(completedReload, { max: 5, emblems: 0 });
  assert.deepEqual(errors, []);
  console.log('Boss reveal, complete damage frames, OPEN signal, vertical camera, exact 12-emblem economy, Wind Crest, health blessings, and Roost gate passed.');
} finally {
  await browser.close();
}
