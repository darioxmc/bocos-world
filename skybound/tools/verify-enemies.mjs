import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { groundDirection, navigationSurfaces } from '../enemy-navigation.js';

const body = { width: 23, bottom: 200, top: 179, blocked: {}, touching: {} };
const state = { startX: 100, range: 32, dir: -1, floorY: 200, worldWidth: 500, surfaces: [{ x: 0, y: 200, w: 500, h: 100 }] };
assert.equal(groundDirection({ x: 140, body }, state, 33, 1 / 60), -1, 'outside range continues inward');
body.blocked.right = true;
assert.equal(groundDirection({ x: 140, body }, state, 33, 1 / 60), -1, 'opposite wall contact is ignored');
assert.equal(navigationSurfaces({ terrain: state.surfaces, platforms: [{ x: 99, y: 100, w: 40, move: {} }] }, { x: 100 }).length, 1);

const require = createRequire(import.meta.url);
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.SKYBOUND_URL || 'http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  const report = await page.evaluate(async () => {
    const { LEVELS } = await import('/levels.js');
    const s = skybound.scene;
    skybound.game.loop.stop();
    s.physics.resume();
    s.physics.world.colliders.destroy();
    for (const body of s.physics.world.bodies.entries) body.enable = false;
    s.physics.add.collider(s.enemies, s.ground, undefined, enemy => !enemy.getData('flying'));
    s.physics.add.collider(s.enemies, s.ledges, undefined, (enemy, platform) => !enemy.getData('flying') && enemy.body.velocity.y >= 0 && enemy.body.bottom <= platform.body.top + 8);
    s.fireSeed = () => { s.shots++; };
    const failures = [], results = [];
    const dt = 1 / 60;
    function tick() {
      s.clock += dt;
      s.updateEnemies(dt);
      s.physics.world.update(s.clock * 1000, dt * 1000);
      s.physics.world.postUpdate();
    }
    function run(level, entry, name, seconds = 30) {
      s.enemies.clear(true, true); s.ground.clear(true, true); s.ledges.clear(true, true); s.enemyData.clear();
      s.level = { ...level, enemies: [entry] };
      s.clock = 0; s.shots = 0;
      for (const r of level.terrain.filter(r => r.x < entry.x + 250 && r.x + r.w > entry.x - 250)) {
        s.ground.add(s.add.zone(r.x, r.y, r.w, r.h).setOrigin(0));
      }
      for (const r of level.platforms.filter(r => r.x < entry.x + 250 && r.x + r.w > entry.x - 250)) {
        const platform = s.add.zone(r.x, r.y, r.w, r.h || 8).setOrigin(0);
        s.ledges.add(platform); platform.body.setAllowGravity(false).setImmovable(true);
      }
      s.buildEnemies();
      const [enemy, state] = [...s.enemyData][0];
      enemy.body.updateFromGameObject();
      s.player.setPosition(entry.x + 70, entry.y + (enemy.getData('flying') ? 80 : 0));
      let minX = enemy.x, maxX = enemy.x, maxY = enemy.y, flips = 0, rapidFlips = 0, lastFlip = -100, oldDir = state.dir;
      let still = 0, maxStill = 0, lastX = enemy.x, hops = 0, lastVy = 0;
      const reasons = new Set();
      for (let n = 0; n < seconds * 60; n++) {
        // Alternate player side to exercise pursuit, warnings and repeated dives.
        s.player.x = entry.x + (Math.floor(n / 360) % 2 ? -70 : 70);
        tick();
        minX = Math.min(minX, enemy.x); maxX = Math.max(maxX, enemy.x); maxY = Math.max(maxY, enemy.y);
        if (state.dir !== oldDir) { flips++; if (n - lastFlip <= 2) rapidFlips++; lastFlip = n; oldDir = state.dir; }
        if (enemy.body.velocity.y < -100 && lastVy >= 0) hops++;
        lastVy = enemy.body.velocity.y;
        still = Math.abs(enemy.x - lastX) < 0.02 ? still + 1 : 0; maxStill = Math.max(maxStill, still); lastX = enemy.x;
        if (enemy.y > level.height + 10) reasons.add('void fall');
        if (enemy.body.left < -1 || enemy.body.right > level.width + 1) reasons.add('world boundary escape');
        if (enemy.getData('flying') && level.terrain.some(r => enemy.body.left < r.x + r.w && enemy.body.right > r.x && enemy.body.top < r.y + r.h && enemy.body.bottom > r.y + 0.1)) reasons.add('flight terrain overlap');
      }
      if (rapidFlips) reasons.add(`rapid reversals: ${rapidFlips}`);
      if (['beetle', 'shellback', 'moth'].includes(entry.type) && (maxX - minX < 15 || maxStill > 120)) reasons.add(`stuck: span=${maxX - minX}, still=${maxStill}`);
      if (entry.type === 'hopper' && (hops < 3 || maxX - minX < 15)) reasons.add(`inactive hopper: hops=${hops}, span=${maxX - minX}`);
      if (entry.type === 'plant' && (maxX - minX > 0.01 || s.shots < 3 || s.shots > 12)) reasons.add(`plant moved or cooldown changed: shots=${s.shots}`);
      // Disabled Arcade bodies must remain frozen, including gravity and AI cooldown.
      s.player.x = enemy.x + 2000; tick();
      const frozen = { x: enemy.x, y: enemy.y, timer: state.timer, hp: state.hp, phase: state.phase };
      for (let n = 0; n < 180; n++) tick();
      if (enemy.body.enable || enemy.x !== frozen.x || enemy.y !== frozen.y || state.timer !== frozen.timer) reasons.add('suspension drift');
      s.player.x = enemy.x + 50; tick();
      if (!enemy.body.enable || state.suspended || state.hp !== frozen.hp) reasons.add('resume failed');
      const result = { name, type: entry.type, span: +(maxX - minX).toFixed(2), maxY: +maxY.toFixed(2), flips, rapidFlips, hops, shots: s.shots };
      results.push(result);
      if (reasons.size) failures.push({ ...result, reasons: [...reasons] });
    }
    for (const level of LEVELS) for (const [i, entry] of level.enemies.entries()) run(level, entry, `${level.id}:${entry.id || i}`);
    const fixtures = [
      { name: 'range', terrain: [{ x: 0, y: 200, w: 400, h: 120 }], x: 180, range: 32 },
      { name: 'wall', terrain: [{ x: 0, y: 200, w: 240, h: 120 }, { x: 240, y: 100, w: 160, h: 220 }], x: 210, range: 64 },
      { name: 'ledge', terrain: [{ x: 100, y: 200, w: 100, h: 120 }], x: 150, range: 64 },
      { name: 'left-boundary', terrain: [{ x: 0, y: 200, w: 400, h: 120 }], x: 35, range: 64 },
    ];
    for (const fixture of fixtures) for (const type of ['beetle', 'shellback', 'hopper', 'plant', 'bird', 'moth']) {
      run({ width: 400, height: 320, terrain: fixture.terrain, platforms: [] }, { type, x: fixture.x, y: type === 'bird' || type === 'moth' ? 144 : 200, range: fixture.range }, `${fixture.name}:${type}`);
    }
    return { mapSpawns: LEVELS.reduce((n, l) => n + l.enemies.length, 0), fixtures: 24, secondsPerSpawn: 30, failures, results };
  });
  await mkdir('qa', { recursive: true });
  await writeFile('qa/enemies-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(report.failures, [], 'All enemies must remain mobile and terrain-safe');
} finally { await browser.close(); }
