import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const runtime = process.env.SKYBOUND_DEPENDENCIES ||
  'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('qa/boss-fights', { recursive: true });

const expectations = [
  { type: 'beetle', patterns: ['charge', 'stomp', 'feint'], hero: 'stomp', hazards: ['thorn-wave'] },
  { type: 'moth', patterns: ['dive', 'cyclone', 'sweep'], hero: 'cyclone', hazards: ['wind-shot'] },
  { type: 'plant', patterns: ['seed-fan', 'root-burst', 'vine-lash'], hero: 'root-burst', hazards: ['seed', 'root-spike', 'thorn-wave'] },
  { type: 'bird', patterns: ['star-dive', 'feather-orbit', 'sky-current'], hero: 'sky-current', hazards: ['star-shot'] },
];

try {
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  for (let area = 0; area < expectations.length; area++) {
    await page.evaluate(area => {
      const emblems = Array.from({ length: 12 }, (_, i) => `boss-audit-${i}`);
      skybound.saves.create(0);
      skybound.saves.save(0, { area, checkpoint: null, emblems,
        defeated: area === 3 ? ['meadow', 'cliff', 'canopy'] : [] });
      skybound.scene.scene.restart({ slot: 0, area });
    }, area);
    await page.waitForFunction(area => skybound.scene.areaIndex === area && skybound.scene.mode === 'playing', area);
    const report = await page.evaluate(async expected => {
      skybound.game.loop.stop();
      const s = skybound.scene;
      const spec = s.level.boss;
      const arena = spec.arena;
      s.bossEngaged = true;
      s.bossDefeated = false;
      s.mode = 'playing';
      s.physics.resume();
      s.invulnerableUntil = Infinity;
      s.cameras.main.stopFollow();
      s.cameras.main.setBounds(arena.x, Math.max(0, arena.y - 20), arena.w, Math.max(240, arena.h));
      s.player.body.reset(arena.x + 72, spec.y);
      const results = [];
      const allHazards = new Set();
      for (const pattern of expected.patterns) {
        s.seeds.clear(true, true);
        s.clearBossTelegraphs();
        s.boss.body.reset(spec.x, spec.y);
        s.boss.setVelocity(0, 0).clearTint().setAlpha(1);
        Object.assign(s.bossState, { hp: Math.max(2, s.bossState.max), tier: 3, phase: 'warn', pattern,
          started: s.clock, until: s.clock + 1, actionDone: false, volley: 0, openingHit: false,
          counterable: false, targetX: s.player.x, targetY: s.player.y - 12, hazardXs: [], shotOffsets: [], shotAngles: [] });
        s.prepareBossPattern();
        const warning = s.bossTelegraphs.length;
        s.startBossAttack();
        const start = s.clock;
        const phases = new Set(['attack']);
        for (let frame = 0; frame < 300 && s.bossState.phase === 'attack'; frame++) {
          const time = frame * 1000 / 60;
          s.physics.world.update(time, 1000 / 60);
          s.physics.world.postUpdate();
          s.clock += 1 / 60;
          s.updateBoss(1 / 60);
          phases.add(s.bossState.phase);
          for (const hazard of s.seeds.getChildren()) if (hazard.active) allHazards.add(hazard.texture.key);
        }
        const reachedOpening = s.bossState.phase === 'recover';
        const before = s.bossState.hp;
        if (reachedOpening) { s.hitBoss('attack'); s.hitBoss('attack'); }
        results.push({ pattern, warning, duration: s.clock - start, reachedOpening,
          oneHit: s.bossState.hp === before - 1, phases: [...phases] });
      }
      let counter = null;
      if (expected.type === 'bird') {
        s.seeds.clear(true, true); s.clearBossTelegraphs(); s.boss.body.reset(spec.x, spec.y);
        Object.assign(s.bossState, { hp: s.bossState.max, phase: 'warn', pattern: 'sky-current', tier: 3,
          counterable: true, openingHit: false, hitUntil: 0, started: s.clock, until: s.clock + 1 });
        const before = s.bossState.hp;
        const accepted = s.hitBoss('wind');
        counter = { accepted, phase: s.bossState.phase, hp: s.bossState.hp, before };
      }
      s.seeds.clear(true, true); s.clearBossTelegraphs(); s.boss.body.enable = true;
      s.boss.body.reset(spec.x, spec.y); s.boss.setAlpha(1).clearTint();
      s.bossDefeated = false;
      Object.assign(s.bossState, { hp: s.bossState.max, phase: 'sleep', pattern: '', patternIndex: 0, tier: 1,
        openingHit: false, hitUntil: 0, counterable: false, actionDone: false, volley: 0 });
      const natural = { patterns: [], openings: 0, max: s.bossState.max, defeated: false };
      s.beginBossWarning(0.01);
      natural.patterns.push(s.bossState.pattern);
      let warningStarted = s.bossState.started;
      for (let frame = 0; frame < 3600 && !s.bossDefeated; frame++) {
        const time = frame * 1000 / 60;
        s.physics.world.update(time, 1000 / 60);
        s.physics.world.postUpdate();
        s.clock += 1 / 60;
        s.updateBoss(1 / 60);
        if (s.bossState.phase === 'warn' && s.bossState.started !== warningStarted) {
          warningStarted = s.bossState.started;
          natural.patterns.push(s.bossState.pattern);
        }
        if (s.bossState.phase === 'recover' && !s.bossState.openingHit) {
          natural.openings++;
          s.hitBoss('attack');
        }
      }
      natural.defeated = s.bossDefeated;
      s.clearBossTelegraphs(); s.seeds.clear(true, true); s.boss.body.reset(spec.x, spec.y);
      s.boss.body.enable = true; s.bossDefeated = false; s.boss.setAlpha(1).clearTint();
      Object.assign(s.bossState, { hp: s.bossState.max, tier: 3, phase: 'warn', pattern: expected.hero,
        counterable: expected.type === 'bird', started: s.clock, until: s.clock + 2, actionDone: false,
        targetX: s.player.x, targetY: s.player.y - 12, hazardXs: [], shotOffsets: [], shotAngles: [] });
      s.prepareBossPattern();
      s.bossCue.setVisible(true).setPosition(s.boss.x, s.boss.y - 66)
        .setTexture(s.bossState.counterable ? 'boss-counter' : 'boss-warning');
      for (let i = 0; i < 60; i++) s.updateBossCamera();
      const camera = s.cameras.main;
      const framing = { player: s.player.x - camera.scrollX, boss: s.boss.x - camera.scrollX,
        width: camera.width / camera.zoom };
      return { type: spec.type, results, hazards: [...allHazards], counter, natural, framing };
    }, expectations[area]);
    assert.equal(report.type, expectations[area].type);
    for (const result of report.results) {
      assert(result.warning > 0, `${report.type}:${result.pattern} has a visible warning`);
      assert(result.reachedOpening, `${report.type}:${result.pattern} reaches recovery: ${JSON.stringify(result)}`);
      assert(result.oneHit, `${report.type}:${result.pattern} accepts exactly one hit per opening`);
      assert(result.duration >= 0.35 && result.duration <= 3.5,
        `${report.type}:${result.pattern} duration is readable: ${JSON.stringify(result)}`);
    }
    for (const texture of expectations[area].hazards) assert(report.hazards.includes(texture), `${report.type} uses ${texture}`);
    assert(report.natural.defeated, `${report.type} natural sequence reaches defeat: ${JSON.stringify(report.natural)}`);
    assert.equal(report.natural.openings, report.natural.max, `${report.type} uses one opening per health point`);
    for (const pattern of expectations[area].patterns) assert(report.natural.patterns.includes(pattern),
      `${report.type} natural sequence includes ${pattern}: ${JSON.stringify(report.natural.patterns)}`);
    assert(report.framing.player >= -4 && report.framing.player <= report.framing.width + 4, JSON.stringify(report.framing));
    assert(report.framing.boss >= -4 && report.framing.boss <= report.framing.width + 4, JSON.stringify(report.framing));
    if (report.counter) assert.deepEqual(report.counter,
      { accepted: true, phase: 'recover', hp: report.counter.before, before: report.counter.before });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.skybound?.scene?.player);
    await page.evaluate(area => skybound.scene.scene.restart({ slot: 0, area }), area);
    await page.waitForFunction(area => skybound.scene.areaIndex === area && skybound.scene.mode === 'playing', area);
    await page.evaluate(expected => {
      const s = skybound.scene, spec = s.level.boss, arena = spec.arena;
      s.bossEngaged = true; s.bossDefeated = false; s.mode = 'playing'; s.invulnerableUntil = Infinity;
      s.player.body.reset(arena.x + 72, spec.y); s.boss.body.reset(spec.x, spec.y);
      s.boss.setAlpha(1).clearTint(); s.cameras.main.stopFollow();
      s.cameras.main.setBounds(arena.x, Math.max(0, arena.y - 20), arena.w, Math.max(240, arena.h));
      Object.assign(s.bossState, { hp: s.bossState.max, tier: 3, phase: 'warn', pattern: expected.hero,
        counterable: expected.type === 'bird', started: s.clock, until: s.clock + 5, actionDone: false,
        targetX: s.player.x, targetY: s.player.y - 12, hazardXs: [], shotOffsets: [], shotAngles: [] });
      s.prepareBossPattern();
      s.bossCue.setVisible(true).setPosition(s.boss.x, s.boss.y - 66)
        .setTexture(s.bossState.counterable ? 'boss-counter' : 'boss-warning');
      s.refreshHud();
    }, expectations[area]);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `qa/boss-fights/${area}-${report.type}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('Boss fights passed: twelve distinct warned patterns, clean openings, one hit per opening, safe framing, unique hazards, and Crest counter.');
} finally {
  await browser.close();
}
