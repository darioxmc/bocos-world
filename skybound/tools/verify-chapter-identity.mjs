import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
await mkdir('qa/chapter-identity', { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => { skybound.saves.create(0); skybound.scene.scene.restart({ slot: 0, area: 0 }); });
  await page.waitForFunction(() => skybound.scene.mode === 'playing');
  const report = await page.evaluate(async () => {
    skybound.game.loop.stop();
    const { LEVELS } = await import('/levels.js');
    const acts = LEVELS.slice(0, 3).flatMap(level => level.chapters.filter(chapter => chapter.kind === 'act'));
    const mechanics = [...new Set(acts.map(chapter => chapter.mechanic))].sort();
    const s = skybound.scene;
    const first = s.level.chapters.find(chapter => chapter.kind === 'act');
    const second = s.level.chapters.find(chapter => chapter.act === 2);
    s.currentChapter = s.level.chapters[0];
    s.player.body.reset(first.x + 2, s.level.terrain.find(rect => first.x + 2 >= rect.x && first.x + 2 < rect.x + rect.w).y);
    s.refreshHud();
    const intro = {
      mode: s.mode,
      visible: !document.querySelector('#chapter-card').hidden,
      number: document.querySelector('#chapter-number').textContent,
      name: document.querySelector('#chapter-name').textContent,
      style: document.querySelector('#chapter-style').textContent,
      backdrop: s.backdrop,
      musicChapter: skybound.audio._chapter,
    };
    s.finishChapterIntro();
    s.currentChapter = first;
    s.player.body.reset(second.x + 2, s.level.terrain.find(rect => second.x + 2 >= rect.x && second.x + 2 < rect.x + rect.w).y);
    s.refreshHud();
    const evolved = {
      mode: s.mode,
      musicChapter: skybound.audio._chapter,
      atmosphere: s.backdrop.chapter,
    };
    s.finishChapterIntro();
    const spring = s.springs.getChildren()[0];
    s.player.body.reset(spring.x, spring.body.top - 1);
    s.player.setVelocityY(20);
    s.springContact(spring);
    const springVelocity = s.player.body.velocity.y;
    const body = { width: s.boss.body.width, height: s.boss.body.height };
    s.bossEngaged = true;
    Object.assign(s.bossState, { phase: 'warn', started: 10, until: 99 });
    const frames = [];
    for (const time of [10, 10.15, 10.3, 10.45]) {
      s.clock = time; s.updateBoss(1 / 60); frames.push(s.boss.texture.key);
    }
    s.startChapterIntro(second);
    return { actCount: acts.length, mechanics, intro, evolved, springVelocity, body, frames };
  });
  await page.screenshot({ path: 'qa/chapter-identity/act-card-phone.png', fullPage: true });
  assert.equal(report.actCount, 18);
  assert.deepEqual(report.mechanics, ['duel', 'gust', 'lift', 'relay', 'spring', 'trail']);
  assert.equal(report.intro.mode, 'chapter');
  assert(report.intro.visible && report.intro.number === 'ACT 1 / 6' && report.intro.name && report.intro.style);
  assert.equal(report.evolved.mode, 'chapter');
  assert.equal(report.evolved.musicChapter, 1);
  assert.equal(report.evolved.atmosphere, 1);
  assert(report.springVelocity <= -360);
  assert.deepEqual(report.body, { width: 46, height: 44 });
  assert(new Set(report.frames).size >= 3, `boss animation did not advance: ${report.frames.join(', ')}`);
  assert.deepEqual(errors, []);
  console.log('Chapter identity passed: 18 act cards, six mechanics, evolving scenery/music, springs, animated boss, fixed collision body.');
} finally {
  await browser.close();
}
