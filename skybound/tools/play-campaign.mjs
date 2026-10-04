import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  for (let area = 0; area < 3; area++) {
    await page.evaluate(({ area, checkpoint }) => {
      skybound.saves.create(0);
      skybound.saves.save(0, { area, checkpoint });
      skybound.scene.scene.restart({ slot: 0, area });
    }, { area, checkpoint: process.env.SKYBOUND_CHECKPOINT || null });
    await page.waitForFunction(area => skybound.scene.areaIndex === area && skybound.scene.mode === 'playing', area);
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => {
      // Accelerate wall time, not game time. Ordinary controls, health, enemies,
      // checkpoints and Arcade collisions stay active throughout this route.
      skybound.game.loop.stop();
      const s = skybound.scene, c = skybound.controls;
      let holdUntil = -1, nextAttack = 0, stalled = 0, previousX = s.player.x;
      let deaths = 0, wasDying = false, jumps = 0;
      const deathLog = [];
      const trail = [];
      let firstFall;
      const target = s.level.boss.arena.x - 48;
      for (let frame = 0; frame < 120000; frame++) {
        const p = s.player, grounded = p.body.blocked.down || p.body.touching.down;
        const surfaces = [...s.level.terrain, ...s.ledges.getChildren().filter(platform => platform.body.enable).map(platform => ({ x: platform.x, y: platform.y, w: platform.width, h: platform.height }))];
        const opening = p.x < s.level.chapters[1].x;
        const current = opening ? s.level.terrain.find(r => p.x >= r.x && p.x < r.x + r.w) : surfaces.filter(r => p.x >= r.x - 2 && p.x < r.x + r.w + 2 && Math.abs(r.y - p.body.bottom) < 4).sort((a, b) => a.y - b.y)[0];
        const next = opening ? s.level.terrain.find(r => r.x > p.x + 2) : surfaces.filter(r => r.x > p.x + 2 && r.x - p.x < 120).sort((a, b) => a.x - b.x || a.y - b.y)[0];
        const danger = [...s.enemyData].find(([e, d]) => e.active && !d.dead && e.body.enable && e.x > p.x - 15 && e.x < p.x + 65 && e.body.top < p.y + 5 && e.y > p.y - 60);
        const step = next && next.y < p.body.bottom - 4 && next.x - p.x < (opening ? 28 : 42);
        const gap = current && current.x + current.w - p.x < (opening ? 22 : 24);
        const ledgeEnd = s.ledges.getChildren().some(ledge => ledge.body.enable && Math.abs(ledge.body.top - p.body.bottom) < 2 && p.x >= ledge.body.left && p.x < ledge.body.right && ledge.body.right - p.x < 22);
        if (!s.deathUntil && grounded && (step || gap || ledgeEnd || danger || stalled > 20)) {
          c.pending.add('jump'); holdUntil = frame + 24; jumps++;
        }
        if (danger && frame >= nextAttack) { c.pending.add('attack'); nextAttack = frame + 20; }
        const glide = !grounded;
        c.sources.set('qa:route', new Set(s.deathUntil ? [] : ['right', ...(frame <= holdUntil ? ['jump'] : []), ...(glide ? ['glide'] : [])]));
        if (frame % 4 === 0) { trail.push({ x: Math.round(p.x), y: Math.round(p.y), vy: Math.round(p.body.velocity.y), grounded, jump: frame <= holdUntil, glide, step, gap, danger: danger?.[1].type }); if (trail.length > 60) trail.shift(); }
        if (!firstFall && p.y > (current?.y || next?.y || s.level.height) + 12) firstFall = [...trail];
        s.physics.world.update(frame * 1000 / 60, 1000 / 60);
        s.physics.world.postUpdate();
        s.update(frame * 1000 / 60, 1000 / 60);
        if (s.deathUntil && !wasDying) { deaths++; firstFall ||= [...trail]; deathLog.push({ x: p.x, y: p.y, hp: s.health, checkpoint: s.checkpoint.id }); }
        wasDying = Boolean(s.deathUntil);
        stalled = Math.abs(p.x - previousX) < 0.1 ? stalled + 1 : 0;
        previousX = p.x;
        if (p.x >= target) return { area: s.level.id, reached: true, minutes: s.clock / 60, deaths, damage: s.damageCount, jumps, checkpoints: s.visitedCheckpoints.size };
        if ((stalled > 300 && grounded) || deaths > 30) return { area: s.level.id, reached: false, deaths, deathLog, firstFall, x: p.x, y: p.y, checkpoint: s.checkpoint.id, reason: stalled > 300 ? 'stalled' : 'repeated deaths' };
      }
      return { area: s.level.id, reached: false, reason: 'timeout', deaths, x: s.player.x };
    });
    console.log(JSON.stringify(result));
    assert(result.reached, `${result.area}: bot can reach boss with ordinary health and combat`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.skybound?.scene?.player);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
