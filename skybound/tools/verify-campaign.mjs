import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'qa', process.env.SKYBOUND_QA_RUN || 'campaign');
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const base = process.env.SKYBOUND_URL || 'http://127.0.0.1:8770/';
const report = { started: new Date().toISOString(), base, isolation: 'Fresh nonpersistent contexts; no real profile or storageState', checks: [], hazards: [], checkpoints: [], screenshots: [], performance: [], errors: [] };
await mkdir(out, { recursive: true });
for (const name of ['campaign.js', 'game.js', 'shell.js', 'enemy-navigation.js']) {
  report[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
}
function check(ok, name, detail) {
  report.checks.push({ ok: Boolean(ok), name, detail });
  if (!ok) console.error('FAIL', name, JSON.stringify(detail));
}
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
report.browser = browser.version();
async function open(viewport, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  check(await page.evaluate(() => skybound.saves.slots().every(s => s === null)), 'context starts without saves', viewport);
  return { context, page };
}
async function load(page, area, checkpoint) {
  await page.evaluate(({ area, checkpoint }) => {
    skybound.scene.flushSave();
    skybound.saves.create(0);
    skybound.saves.save(0, { area, checkpoint, defeated: ['meadow', 'cliff', 'canopy'] });
    skybound.scene.scene.restart({ slot: 0, area });
  }, { area, checkpoint });
  await page.waitForFunction(({ area, checkpoint }) => skybound.scene.areaIndex === area && skybound.scene.mode === 'playing' && skybound.scene.checkpoint.id === checkpoint, { area, checkpoint });
  await page.waitForTimeout(65);
}
async function coordinates(page, point) {
  const actual = await page.evaluate(() => ({ x: skybound.scene.player.x, y: skybound.scene.player.y, checkpoint: skybound.scene.checkpoint.id, area: skybound.scene.areaIndex }));
  check(Math.abs(actual.x - point.x) < 1 && Math.abs(actual.y - point.y) < 2 && actual.checkpoint === point.id, `spawn ${point.id}`, { expected: point, actual });
  return actual;
}
async function layout(page, label) {
  const data = await page.evaluate(() => {
    const visible = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const nodes = [...document.querySelectorAll('.hud-row > *, #dpad, .touch-action')].filter(visible);
    const boxes = nodes.map(e => ({ name: e.id || e.getAttribute('aria-label'), ...rect(e) }));
    const overlaps = [];
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const x = boxes[a], y = boxes[b];
      if (Math.min(x.right, y.right) - Math.max(x.x, y.x) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.y, y.y) > 1) overlaps.push([x.name, y.name]);
    }
    const screen = rect(document.querySelector('.screen'));
    const controlsOverScreen = boxes.filter(b => ['dpad', 'Attack', 'Jump', 'Glide'].includes(b.name) && Math.min(b.right, screen.right) > Math.max(b.x, screen.x) && Math.min(b.bottom, screen.bottom) > Math.max(b.y, screen.y));
    const title = document.querySelector('#hud-area');
    const canvas = document.querySelector('canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 16) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return { boxes, overlaps, controlsOverScreen, screen, overflow: document.documentElement.scrollWidth > innerWidth, fits: [...boxes, screen].every(b => b.x >= -1 && b.y >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1), title: title.textContent, clippedTitle: title.scrollWidth > title.clientWidth, colors: colors.size, ratio: canvas.clientWidth / canvas.clientHeight };
  });
  check(data.fits && !data.overflow && !data.overlaps.length && !data.controlsOverScreen.length, `layout ${label}`, data);
  check(data.colors > 30 && Math.abs(data.ratio - 4 / 3) < 0.01, `canvas ${label}`, { colors: data.colors, ratio: data.ratio });
  if (data.clippedTitle) report.hazards.push({ type: 'chapter-label-ellipsis', label, title: data.title });
  const file = `${label}.png`;
  await page.screenshot({ path: path.join(out, file), fullPage: true });
  report.screenshots.push({ file, ...data });
}
async function performanceSnapshot(page, label) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const before = await cdp.send('Performance.getMetrics');
  const sample = await page.evaluate(async () => {
    const times = [], longTasks = [];
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration)));
    observer.observe({ type: 'longtask' });
    const s = skybound.scene, startX = s.player.x;
    skybound.controls.activate('campaign-perf', ['right']);
    const started = performance.now();
    let last = started;
    await new Promise(resolve => { function frame(now) { times.push(now - last); last = now; if (now - started < 3000) requestAnimationFrame(frame); else resolve(); } requestAnimationFrame(frame); });
    skybound.controls.clear(); observer.disconnect();
    times.shift(); times.sort((a, b) => a - b);
    return { elapsedMs: last - started, frames: times.length, medianMs: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1), over33ms: times.filter(t => t > 33.4).length, longTasks, movementPx: s.player.x - startX, mode: s.mode, enemies: s.enemyData.size, bodies: s.physics.world.bodies.size, enabledBodies: s.physics.world.bodies.entries.filter(b => b.enable).length, ledges: s.ledges.getLength(), enabledLedges: s.ledges.getChildren().filter(p => p.body.enable).length, staticBodies: s.physics.world.staticBodies.size, displayObjects: s.children.length };
  });
  const after = await cdp.send('Performance.getMetrics');
  const metrics = Object.fromEntries(after.metrics.map(m => [m.name, m.value]));
  const previous = Object.fromEntries(before.metrics.map(m => [m.name, m.value]));
  report.performance.push({ label, ...sample, jsHeapMB: metrics.JSHeapUsedSize / 1048576, taskDurationMs: (metrics.TaskDuration - previous.TaskDuration) * 1000, scriptDurationMs: (metrics.ScriptDuration - previous.ScriptDuration) * 1000, nodes: metrics.Nodes });
  check(sample.frames > 30 && sample.mode === 'playing', `live performance sample ${label}`, sample);
  if (sample.p95Ms > 33.4) report.hazards.push({ type: 'frame-budget', label, p95Ms: sample.p95Ms });
  await cdp.detach();
}
try {
  const { context, page } = await open({ width: 1280, height: 900 });
  const levels = await page.evaluate(async () => (await import('./levels.js')).LEVELS.map(l => ({ id: l.id, name: l.name, checkpoints: l.checkpoints, chapters: l.chapters || [], width: l.width })));
  check(levels.slice(0, 3).reduce((n, l) => n + l.chapters.length - 2, 0) === 18, '18 inserted chapters');
  for (let area = 0; area < levels.length; area++) {
    for (const point of levels[area].checkpoints) {
      await load(page, area, point.id);
      report.checkpoints.push({ id: point.id, area, ...await coordinates(page, point) });
    }
  }
  console.log(`Loaded ${report.checkpoints.length} new and legacy checkpoints.`);

  // Actual collision pickup, then disk-backed reload and user-facing resume.
  for (let area = 0; area < 3; area++) {
    const point = levels[area].checkpoints.filter(p => p.id.includes('chapter-'))[9];
    await load(page, area, null);
    await page.evaluate(p => { const s = skybound.scene; s.player.body.reset(p.x, p.y); s.previousFeet = p.y; }, point);
    await page.waitForFunction(id => skybound.saves.get(0).checkpoint === id, point.id);
    await page.reload({ waitUntil: 'networkidle' });
    if (await page.getByRole('button', { name: 'Start', exact: true }).count()) await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    check((await page.locator('.slot-main').first().innerText()).includes(point.name), `saved chapter name in slot ${area}`);
    await page.screenshot({ path: path.join(out, `saved-slot-${area}.png`), fullPage: true });
    await page.locator('.slot-main').first().click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForFunction(id => skybound.scene.mode === 'playing' && skybound.scene.checkpoint.id === id, point.id);
    await coordinates(page, point);
  }
  for (const area of [0, 3, 1, 3, 2, 3, 0]) {
    const point = levels[area].checkpoints.find(p => p.id.includes('chapter-')) || levels[area].checkpoints[0];
    await load(page, area, point.id);
    const hud = await page.locator('#hud-area').innerText();
    check(hud === (area === 3 ? levels[area].name : levels[area].chapters[1].name), `chapter HUD restart area ${area}`, hud);
  }
  for (let area = 0; area < 4; area++) {
    await load(page, area, levels[area].checkpoints[0].id);
    const probes = await page.evaluate(() => {
      const s = skybound.scene, results = [];
      const add = (ok, name, detail) => results.push({ ok, name, detail });
      const observer = new MutationObserver(() => {});
      s.refreshHud();
      observer.observe(document.querySelector('#hud'), { subtree: true, attributes: true, childList: true, characterData: true });
      for (let n = 0; n < 20; n++) s.refreshHud();
      add(observer.takeRecords().length === 0, 'unchanged HUD produces zero mutations');
      s.health = 2; s.maxHealth = 5; s.gliding = true; s.collected.add('qa-hud-emblem');
      s.bossEngaged = true; s.bossState.hp = 4; s.bossState.max = 6; s.refreshHud();
      add(document.querySelector('#hud-health').getAttribute('aria-label') === 'Health 2 of 5' && document.querySelector('#hud-health').children.length === 5, 'health and assist maximum invalidate HUD');
      add(document.querySelector('#hud-emblems').textContent.includes('1') && !document.querySelector('#hud-glide').hidden, 'emblem and glide invalidate HUD');
      add(!document.querySelector('#hud-boss').hidden && document.querySelector('#hud-boss-meter').value === 4 && document.querySelector('#hud-boss-meter').max === 6, 'boss meter invalidates HUD');
      s.bossDefeated = true; s.gliding = false; s.refreshHud();
      add(document.querySelector('#hud-boss').hidden && document.querySelector('#hud-glide').hidden, 'boss and glide hide after change');
      observer.disconnect();

      // Synchronous real Arcade stepping isolates suspension from AI/input timing.
      s.bossEngaged = false; s.invulnerableUntil = Infinity;
      const platform = s.ledges.getChildren().find(p => p.getData('motion') && !s.bossPlatforms.includes(p));
      if (platform) {
        s.player.body.reset(platform.x + 2000, platform.y - 100);
        s.updatePlatforms();
        const frozen = { x: platform.x, y: platform.y };
        for (let n = 0; n < 30; n++) { s.physics.world.update(n * 1000 / 60, 1000 / 60); s.physics.world.postUpdate(); }
        add(!platform.body.enable && platform.x === frozen.x && platform.y === frozen.y && platform.body.velocity.length() === 0, 'distant lift freezes', frozen);
        s.player.body.reset(platform.x + platform.width / 2, platform.y - 35);
        s.previousFeet = s.player.y; s.dropUntil = 0;
        s.updatePlatforms();
        add(platform.body.enable && Math.abs(platform.body.x - platform.x) < .1 && Math.abs(platform.body.y - platform.y) < .1, 'wake synchronizes lift body');
        let landed = false;
        for (let n = 0; n < 60; n++) {
          s.previousFeet = s.player.body.bottom;
          s.updatePlatforms();
          s.physics.world.update(n * 1000 / 60, 1000 / 60); s.physics.world.postUpdate();
          if (s.player.body.touching.down && Math.abs(s.player.body.bottom - platform.body.top) < 2) landed = true;
        }
        add(landed, 'real physics landing on awakened lift');
        const motion = platform.getData('motion');
        add(platform[motion.axis] !== frozen[motion.axis], 'awakened lift resumes motion');
      }
      for (const bossPlatform of s.bossPlatforms) {
        s.player.body.reset(bossPlatform.x, bossPlatform.y - 50);
        bossPlatform.body.enable = false; bossPlatform.setVisible(false); s.updatePlatforms();
        add(!bossPlatform.body.enable, 'proximity preserves disabled boss platform');
        bossPlatform.body.enable = true; bossPlatform.setVisible(true);
        s.player.body.reset(bossPlatform.x + 2000, bossPlatform.y - 50); s.updatePlatforms();
        add(bossPlatform.body.enable, 'distance preserves enabled boss platform');
      }
      return results;
    });
    for (const probe of probes) check(probe.ok, `${levels[area].id}: ${probe.name}`, probe.detail);
  }
  // Necessary reachability check only: static surfaces, full jump, no enemy timing.
  report.optionalRoutes = await page.evaluate(async () => {
    const { LEVELS } = await import('./levels.js');
    const results = [];
    for (const l of LEVELS.slice(0, 3)) for (const emblem of l.emblems.filter(e => e.id.includes('chapter-'))) {
      const chapter = l.chapters.find(c => emblem.x >= c.x && emblem.x < c.endX);
      const start = chapter.x + Math.floor((emblem.x - chapter.x) / 1024) * 1024;
      const surfaces = [...l.terrain, ...l.platforms.filter(p => !p.move)].filter(p => p.x < start + 1024 && p.x + p.w > start);
      const reachable = new Set(surfaces.map((p, i) => p.h > 8 ? i : -1).filter(i => i >= 0));
      let changed = true;
      while (changed) { changed = false; for (let i = 0; i < surfaces.length; i++) {
        if (reachable.has(i)) continue;
        const target = surfaces[i];
        for (const j of reachable) { const source = surfaces[j], rise = source.y - target.y;
          if (rise > 64) continue;
          const flight = (320 + Math.sqrt(320 * 320 - 1600 * rise)) / 800;
          const gap = Math.max(0, target.x - source.x - source.w, source.x - target.x - target.w);
          if (gap <= 115 * flight) { reachable.add(i); changed = true; break; }
        }
      } }
      const possible = [...reachable].some(i => { const p = surfaces[i]; return emblem.x >= p.x - 9 && emblem.x <= p.x + p.w + 9 && p.y - emblem.y >= 0 && p.y - emblem.y <= 64; });
      results.push({ id: emblem.id, possible });
    }
    return { method: 'Optimistic static jump graph: 64px rise, 115px/s, gravity 800, jump 320. Necessary geometry screen, not a traversal proof; moving lifts and gusts excluded.', results };
  });
  for (const route of report.optionalRoutes.results.filter(r => !r.possible)) report.hazards.push({ type: 'optional-route-needs-manual-probe', ...route });
  for (const spec of [{ name: 'desktop', viewport: { width: 1280, height: 900 } }, { name: 'portrait', viewport: { width: 390, height: 844 }, mobile: true }, { name: 'landscape', viewport: { width: 844, height: 390 }, mobile: true }]) {
    const session = spec.mobile ? await open(spec.viewport, true) : { context, page };
    for (let area = 0; area < 3; area++) for (const chapter of [1, 3, 6]) {
      const point = levels[area].checkpoints.find(p => p.id.startsWith(`${levels[area].id}-chapter-${chapter}-`));
      await load(session.page, area, point.id);
      await session.page.waitForTimeout(250);
      const label = `${spec.name}-${levels[area].id}-chapter-${chapter}`;
      check((await session.page.locator('#hud-area').innerText()) === levels[area].chapters[chapter].name, `chapter title ${label}`);
      await layout(session.page, label);
      if (chapter === 3) await performanceSnapshot(session.page, label);
    }
    if (spec.mobile) await session.context.close();
  }
  await context.close();
} catch (error) {
  report.errors.push(error.stack);
} finally {
  await browser.close();
  report.finished = new Date().toISOString();
  report.failures = report.checks.filter(c => !c.ok).length;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, failures: report.failures, errors: report.errors, hazards: report.hazards, performance: report.performance, output: out }, null, 2));
  if (report.failures || report.errors.length) process.exitCode = 1;
}
