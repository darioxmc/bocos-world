import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.js';
import { chapterAt, ROOST_EMBLEM_GOAL } from '../campaign.js';
import { MOVE } from '../mechanics.js';

test('shorter main campaign retains substantial travel before combat and platforming', () => {
  const seconds = LEVELS.slice(0, 3).reduce((sum, level) => sum + (level.boss.arena.x - level.spawn.x) / MOVE.speed, 0);
  assert(seconds >= 18 * 60 && seconds < 20 * 60, `${seconds.toFixed(1)} seconds at full running speed`);
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

test('ordinary terrain stays forgiving while each act contains a landmark platform gap', () => {
  for (const level of LEVELS) {
    for (let i = 1; i < level.terrain.length; i++) {
      const a = level.terrain[i - 1], b = level.terrain[i];
      assert(b.x >= a.x + a.w, `${level.id}: overlapping terrain at ${b.x}`);
      const gap = b.x - (a.x + a.w);
      if (gap <= 48) assert(a.y - b.y <= 32, `${level.id}: high wall at ${b.x}`);
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
        if (key === 'emblems') {
          const reachable = [...level.terrain, ...level.platforms].some(rect => point.x >= rect.x - 9 && point.x <= rect.x + rect.w + 9 && rect.y - point.y >= 0 && rect.y - point.y <= 64);
          assert(reachable, `${point.id} is not reachable from a surface`);
        }
        else if (!(key === 'enemies' && ['bird', 'moth'].includes(point.type))) assert(supported(point), `${point.id} has no support`);
      }
    }
    for (const chapter of level.chapters?.slice(1, -1) || []) {
      const checkpoints = level.checkpoints.filter(point => point.x >= chapter.x && point.x < chapter.endX);
      assert.equal(checkpoints.length, 2);
      assert(checkpoints.some(point => point.name.endsWith('Midway')) && checkpoints.some(point => point.name.endsWith('End')));
      assert.equal(chapterAt(level, chapter.x).id, chapter.id);
      assert.equal(chapter.endX - chapter.x, 6 * 1024);
      const landmarkTerrain = level.terrain.filter(rect => rect.x >= chapter.landmarkX && rect.x < chapter.landmarkX + 1024);
      const largestGap = Math.max(...landmarkTerrain.slice(1).map((rect, index) => rect.x - (landmarkTerrain[index].x + landmarkTerrain[index].w)));
      assert(largestGap >= (chapter.mechanic === 'lift' ? 200 : 300), `${chapter.id} lacks a memorable platform gap`);
    }
    const bossCheckpoint = level.checkpoints.find(point => point.id.endsWith('-boss'));
    assert(bossCheckpoint && bossCheckpoint.x < level.boss.arena.x && level.boss.arena.x - bossCheckpoint.x <= 160);
  }
  for (const level of LEVELS.slice(0, 3)) assert.equal(level.emblems.length, 4, `${level.id}: expected four meaningful emblems`);
  for (const level of LEVELS) assert(level.flowers.length <= 2, `${level.id}: too many guaranteed flowers`);
  assert.deepEqual(LEVELS.map(level => level.emblems.length), [4, 4, 4, 0]);
  assert.equal(LEVELS.reduce((sum, level) => sum + level.emblems.length, 0), ROOST_EMBLEM_GOAL, 'the world contains exactly the required emblems');
});
