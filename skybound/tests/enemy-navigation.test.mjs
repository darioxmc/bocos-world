import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationSurfaces, groundDirection } from '../enemy-navigation.js';

const floor = { x: 0, y: 200, w: 400, h: 120 };
const body = () => ({ width: 23, top: 179, bottom: 200, blocked: { down: true }, touching: {} });
const state = () => ({ startX: 100, range: 32, dir: -1, floorY: 200, worldWidth: 400, surfaces: [floor] });

test('a patrol beyond its range continues inward, including after a wall contact', () => {
  const enemy = { x: 140, body: body() }, patrol = state();
  enemy.body.blocked.right = true;
  for (let i = 0; i < 5; i++) assert.equal(groundDirection(enemy, patrol, 33, 1 / 60), -1);
});

test('a hopper brakes at its boundary in air, then turns after landing', () => {
  const enemy = { x: 132, body: body() }, patrol = { ...state(), type: 'hopper', dir: 1 };
  enemy.body.blocked.down = false;
  enemy.body.bottom = 175;
  enemy.body.top = 154;
  assert.equal(groundDirection(enemy, patrol, 65, 1 / 60), 0);
  assert.equal(patrol.dir, 1);
  enemy.body.blocked.down = true;
  enemy.body.bottom = 200;
  enemy.body.top = 179;
  assert.equal(groundDirection(enemy, patrol, 65, 1 / 60), -1);
});

test('one-way perches do not cage flyers or block ascending hoppers', () => {
  const perch = { x: 80, y: 160, w: 80, h: 8, oneWay: true };
  const level = { terrain: [floor], platforms: [perch] };
  assert.deepEqual(navigationSurfaces(level, { type: 'moth', x: 100 }), [floor]);
  const enemy = { x: 100, body: body() }, patrol = { ...state(), type: 'hopper', surfaces: [floor, perch] };
  enemy.body.blocked.down = false;
  enemy.body.top = 155;
  enemy.body.bottom = 176;
  assert.equal(groundDirection(enemy, patrol, 65, 1 / 60), -1);
});
