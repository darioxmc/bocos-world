import test from 'node:test';
import assert from 'node:assert/strict';

let sequence = 0;
async function fresh(storage) {
  globalThis.localStorage = storage;
  return (await import(`../saves.js?instance=${++sequence}`)).SaveStore;
}
function memory() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('three slots remain isolated and exported saves restore progress', async () => {
  const store = await fresh(memory());
  assert.deepEqual(store.slots(), [null, null, null]);
  store.create(0); store.create(1); store.create(2);
  store.save(0, { area: 2, defeated: ['meadow', 'cliff'], emblems: ['meadow-emblem'], playtime: 300 });
  assert.equal(store.get(1).area, 0);
  const exported = store.export(0);
  store.import(2, exported);
  assert.equal(store.get(2).area, 2);
  store.delete(0);
  assert.equal(store.get(2).emblems.length, 1);
  assert.equal(store.get(0), null);
});

test('replays do not regress unlocked areas and partial assists preserve siblings', async () => {
  const store = await fresh(memory());
  store.create(0);
  store.save(0, { area: 2, assists: { extraHealth: true } });
  store.save(0, { area: 0, assists: { toggleGlide: true } });
  assert.equal(store.get(0).area, 2);
  assert.deepEqual(store.get(0).assists, { extraHealth: true, reducedDamage: false, toggleGlide: true });
});

test('malformed imports are rejected without replacing the existing adventure', async () => {
  const store = await fresh(memory());
  const original = store.create(1);
  const invalid = JSON.parse(store.export(1));
  invalid.area = 99;
  assert.throws(() => store.import(1, JSON.stringify(invalid)));
  assert.throws(() => store.import(1, '{"__proto__":{}}'));
  assert.throws(() => store.import(1, 'x'.repeat(70000)));
  assert.throws(() => store.get(-1));
  assert.deepEqual(store.get(1), original);
});

test('blocked storage preserves in-session progress and export backups', async () => {
  const store = await fresh({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  store.create(0);
  store.save(0, { area: 1 });
  assert.equal(store.storageAvailable, false);
  assert.equal(JSON.parse(store.export(0)).area, 1);
});

test('persisted state survives a reload and corrupt records recover safely', async () => {
  const storage = memory();
  const store = await fresh(storage);
  store.create(0); store.save(0, { checkpoint: 'meadow-checkpoint-1' });
  const reloaded = await fresh(storage);
  assert.equal(reloaded.get(0).checkpoint, 'meadow-checkpoint-1');
  const corrupt = await fresh({ getItem: () => 'not JSON', setItem() {} });
  assert.deepEqual(corrupt.slots(), [null, null, null]);
});
