import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const runtime = process.env.SKYBOUND_DEPENDENCIES ||
  'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
await mkdir('qa/backdrops', { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => skybound.saves.create(0));

  const expected = { meadow: 2, cliff: 3, canopy: 4, roost: 3 };
  for (let area = 0; area < 4; area++) {
    await page.evaluate(area => skybound.scene.scene.restart({ slot: 0, area }), area);
    await page.waitForFunction(area => skybound.scene.areaIndex === area && skybound.scene.mode === 'playing', area);
    const { before, after } = await page.evaluate(() => {
      const scene = skybound.scene;
      scene.backdrop.setChapter(6);
      scene.backdrop.update(scene.cameras.main, 0);
      const before = scene.backdrop.scenery;
      scene.backdrop.update(scene.cameras.main, 420);
      return { before, after: scene.backdrop.scenery };
    });
    await page.waitForTimeout(100);
    const key = await page.evaluate(() => skybound.scene.level.id);
    assert.equal(before.filter(prop => prop.visible).length, expected[key], `${key} visible scenery count`);
    assert(after.some((prop, index) => prop.visible && prop.frame !== before[index].frame), `${key} scenery should animate`);
    assert(after.every(prop => !prop.visible || Number.isInteger(prop.x) && Number.isInteger(prop.y)), `${key} scenery stays on the pixel grid`);
    const image = await page.evaluate(() => document.querySelector('#game-mount canvas').toDataURL('image/png'));
    await writeFile(`qa/backdrops/${key}-late.png`, Buffer.from(image.split(',')[1], 'base64'));
    const landscapeLayers = await page.evaluate(key => Object.fromEntries([3, 4, 5].map(index => {
      const source = skybound.scene.textures.get(`skybound-bg-${key}-${index}`).getSourceImage();
      return [index, source.toDataURL('image/png')];
    })), key);
    for (const [index, data] of Object.entries(landscapeLayers)) {
      await writeFile(`qa/backdrops/${key}-layer-${index}.png`, Buffer.from(data.split(',')[1], 'base64'));
    }
  }

  const assets = await page.evaluate(() => {
    const keys = ['windmill-0', 'kite-0', 'moth-0', 'feather-0'];
    return Object.fromEntries(keys.map(name => {
      const source = skybound.scene.textures.get(`skybound-scenery-${name}`).getSourceImage();
      const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
      let opaque = 0;
      let left = source.width;
      let right = 0;
      let top = source.height;
      let bottom = 0;
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        if (!pixels[(y * source.width + x) * 4 + 3]) continue;
        opaque++;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      return [name, { opaque, width: right - left + 1, height: bottom - top + 1 }];
    }));
  });
  assert(assets['windmill-0'].width >= 50 && assets['windmill-0'].height >= 70 && assets['windmill-0'].opaque >= 500);
  assert(assets['kite-0'].width >= 18 && assets['kite-0'].height >= 34 && assets['kite-0'].opaque >= 180);
  assert(assets['moth-0'].width >= 28 && assets['moth-0'].height >= 17 && assets['moth-0'].opaque >= 190);
  assert(assets['feather-0'].width >= 14 && assets['feather-0'].height >= 22 && assets['feather-0'].opaque >= 90);
  assert.deepEqual(errors, []);
  console.log('Backdrop scrutiny passed: four animated scenery families, pixel-grid motion, readable silhouettes, and all late-area renders captured.');
} finally {
  await browser.close();
}
