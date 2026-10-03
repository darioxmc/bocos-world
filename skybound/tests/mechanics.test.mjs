import test from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, canLand, isStomp, attackBox, approach, MOVE } from '../mechanics.js';

test('platforms allow ascending passage but support descending landings', () => {
  assert.equal(canLand(100, -80, 100, 0, 2), false);
  assert.equal(canLand(98, 80, 100, 0, 2), true);
  assert.equal(canLand(120, 80, 100, 0, 2), false);
  assert.equal(canLand(98, 80, 100, 3, 2), false);
});

test('stomps require previous feet above the enemy and downward motion', () => {
  assert.equal(isStomp(88, 160, 90), true);
  assert.equal(isStomp(110, 160, 90), false);
  assert.equal(isStomp(88, -160, 90), false);
});

test('attack reach mirrors around the player and excludes distant enemies', () => {
  const right = attackBox(100, 200, 1, false);
  const left = attackBox(100, 200, -1, false);
  assert.equal(right.x + right.width - 100, 100 - left.x);
  assert.equal(overlaps(right, { x: 120, y: 180, width: 10, height: 10 }), true);
  assert.equal(overlaps(left, { x: 120, y: 180, width: 10, height: 10 }), false);
  assert.equal(overlaps(right, { x: 150, y: 180, width: 10, height: 10 }), false);
});

test('acceleration approaches target without overshoot', () => {
  assert.equal(approach(100, MOVE.speed, 50), MOVE.speed);
  assert.equal(approach(100, 0, 150), 0);
  assert.equal(approach(-100, -MOVE.speed, 50), -MOVE.speed);
});
