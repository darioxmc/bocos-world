import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.js';
import { chapterAt } from '../campaign.js';
import { MOVE } from '../mechanics.js';

test('main campaign has over twenty minutes of travel without bosses or optional detours', () => {
  const seconds = LEVELS.slice(0, 3).reduce((sum, level) => sum + (level.boss.arena.x - level.spawn.x) / MOVE.speed, 0);
  assert(seconds >= 20 * 60, `${seconds.toFixed(1)} seconds at full running speed`);
  assert.equal(LEVELS.slice(0, 3).reduce((sum, level) => sum + level.chapters.length - 2, 0), 18);
  assert.equal(LEVELS[3].width, 2048, 'optional finale remains separate');
});

test('inserted chapters have distinct identities and route mechanics', () => {
  const acts = LEVELS.slice(0, 3).flatMap(level => level.chapters.filter(chapter => chapter.kind === 'act'));
  assert.equal(acts.length, 18);
  assert.deepEqual([...new Set(acts.map(chapter => chapter.mechanic))].sort(), ['duel', 'gust', 'lift', 'relay', 'spring', 'trail']);
  for (const chapter of acts) {
    assert(chapter.style && chapter.tagline && chapter.act >= 1 && chapter.act <= chapter.count);
  }
  for (const level of LEVELS.slice(0, 3)) assert(level.springs.length > 0, `${level.id}: no spring routes`);
});

test('required terrain has modest rises and gaps, and each area connects to its boss', () => {
  for (const level of LEVELS) {
    for (let i = 1; i < level.terrain.length; i++) {
      const a = level.terrain[i - 1], b = level.terrain[i];
      assert(b.x >= a.x + a.w, `${level.id}: overlapping terrain at ${b.x}`);
      assert(b.x - (a.x + a.w) <= 48, `${level.id}: large gap at ${b.x}`);
      assert(a.y - b.y <= 32, `${level.id}: high wall at ${b.x}`);
    }
    assert.equal(level.terrain.at(-1).x + level.terrain.at(-1).w, level.width);
    assert(level.exit.x > level.boss.arena.x + level.boss.arena.w);
  }
});

test('spawn points, healing and checkpoints have floor support, and identifiers fit saves', () => {
  const ids = new Set();
  for (const level of LEVELS) {
    const supported = point => [...level.terrain, ...level.platforms].some(rect => point.x >= rect.x && point.x < rect.x + rect.w && point.y === rect.y);
    for (const key of ['enemies', 'flowers', 'emblems', 'checkpoints']) {
      for (const point of level[key]) {
        assert(!ids.has(point.id), `duplicate ${point.id}`);
        ids.add(point.id);
        assert(point.id.length <= 80);
        assert(Number.isFinite(point.x) && Number.isFinite(point.y), point.id);
        if (!(key === 'enemies' && ['bird', 'moth'].includes(point.type))) assert(supported(point), `${point.id} has no support`);
      }
    }
    for (const chapter of level.chapters?.slice(1, -1) || []) {
      const checkpoints = level.checkpoints.filter(point => point.id.startsWith(`${chapter.id}-room-`));
      assert.equal(checkpoints.length, 3);
      assert.equal(chapterAt(level, chapter.x).id, chapter.id);
      for (let i = 1; i < checkpoints.length; i++) assert(checkpoints[i].x - checkpoints[i - 1].x <= MOVE.speed * 30);
    }
    const bossCheckpoint = level.checkpoints.find(point => point.id.endsWith('-boss'));
    assert(bossCheckpoint && bossCheckpoint.x < level.boss.arena.x && level.boss.arena.x - bossCheckpoint.x <= 160);
  }
  assert(LEVELS.reduce((sum, level) => sum + level.emblems.length, 0) <= 256, 'collectibles fit the save validator');
});
