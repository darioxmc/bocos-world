import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../audio.js';

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
