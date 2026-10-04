import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('qa/landmarks', { recursive: true });

try {
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => {
    skybound.saves.create(0);
    skybound.scene.scene.restart({ slot: 0, area: 0 });
    skybound.shell.hide();
  });
  await page.waitForFunction(() => skybound.scene.mode === 'playing');
  const mechanics = await page.evaluate(() => skybound.scene.level.chapters.filter(chapter => chapter.kind === 'act').map(chapter => chapter.mechanic));
  assert.deepEqual([...new Set(mechanics)].sort(), ['duel', 'gust', 'lift', 'relay', 'spring', 'trail']);
  for (const mechanic of mechanics) {
    const view = await page.evaluate(mechanic => {
      const s = skybound.scene;
      const chapter = s.level.chapters.find(item => item.mechanic === mechanic);
      const roomStart = chapter.landmarkX;
      const spawnX = roomStart + 200;
      const floor = s.level.terrain.find(rect => spawnX >= rect.x && spawnX < rect.x + rect.w)?.y;
      s.mode = 'paused';
      s.player.body.reset(spawnX, floor);
      s.cameras.main.stopFollow();
      s.cameras.main.setScroll(roomStart + 240, Math.max(0, floor - 208));
      s.backdrop.update(s.cameras.main, s.clock);
      const terrain = s.level.terrain.filter(rect => rect.x >= roomStart && rect.x < roomStart + 1024);
      return {
        chapter: chapter.name,
        gap: Math.max(...terrain.slice(1).map((rect, index) => rect.x - (terrain[index].x + terrain[index].w))),
        platforms: s.level.platforms.filter(rect => rect.x >= roomStart && rect.x < roomStart + 1024).length,
      };
    }, mechanic);
    assert(view.gap >= (mechanic === 'lift' ? 200 : 300), `${mechanic} gap`);
    assert(view.platforms >= 4, `${mechanic} platforms`);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `qa/landmarks/${mechanic}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Landmark scrutiny passed: trail, duel, lift, spring, gust, and relay rooms rendered with substantial gaps and platform routes.');
} finally {
  await browser.close();
}
