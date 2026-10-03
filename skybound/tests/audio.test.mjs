import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine, MUSIC_THEMES } from '../audio.js';

test('a later gesture retries a suspended controller-initiated audio unlock', async () => {
  const engine = new AudioEngine();
  let resumeCalls = 0;
  const pending = Promise.withResolvers();
  engine.context = { state: 'suspended', resume() { resumeCalls++; return Promise.resolve(); } };
  engine._unlockPromise = pending.promise;
  const unlocking = engine.unlock();
  assert.equal(resumeCalls, 1);
  pending.resolve(true);
  assert.equal(await unlocking, true);
  engine.context = null;
  engine.destroy();
});

test('destroyed audio engine cannot reopen or start music timers', async () => {
  const engine = new AudioEngine();
  engine.destroy();
  assert.equal(await engine.unlock(), false);
  engine.startMusic('meadow');
  assert.equal(engine._timer, null);
  assert.equal(engine.context, null);
});

test('areas and chapters produce distinct musical arrangements', () => {
  const signature = (area, chapter, mode = 'level') => {
    const engine = new AudioEngine();
    const notes = [];
    engine._chapter = chapter;
    engine._musicMode = mode;
    engine._voice = (...args) => notes.push(args.slice(2, 7).map(value => typeof value === 'number' ? Math.round(value * 1000) : value).join(':'));
    for (let step = 0; step < 64; step++) engine._musicStep(MUSIC_THEMES[area], step, step / 8, 0.125);
    engine.destroy();
    return notes.join('|');
  };
  for (let area = 0; area < MUSIC_THEMES.length; area++) {
    assert.equal(new Set(Array.from({ length: 6 }, (_, chapter) => signature(area, chapter))).size, 6);
    assert.notEqual(signature(area, 5), signature(area, 6, 'boss'));
  }
  assert.equal(new Set(MUSIC_THEMES.map((_, area) => signature(area, 3))).size, MUSIC_THEMES.length);
});
