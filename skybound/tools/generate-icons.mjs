import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  await page.goto(process.env.SKYBOUND_URL || 'http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.textures.exists('boco-idle'));
  const icons = await page.evaluate(() => {
    const source = skybound.scene.textures.get('boco-idle').getSourceImage();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 180;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#25494a'; ctx.fillRect(0, 0, 180, 180);
    ctx.fillStyle = '#496843'; ctx.fillRect(0, 154, 180, 26);
    ctx.fillStyle = '#a4c584'; ctx.fillRect(0, 154, 180, 4);
    ctx.drawImage(source, 26, 26, 128, 128);
    const pixels = ctx.getImageData(0, 0, 180, 180).data;
    const opaque = pixels.every((value, i) => i % 4 !== 3 || value === 255);
    const favicon = document.createElement('canvas'); favicon.width = favicon.height = 32;
    const small = favicon.getContext('2d'); small.imageSmoothingEnabled = false;
    small.drawImage(canvas, 0, 0, 32, 32);
    return { opaque, home: canvas.toDataURL('image/png'), favicon: favicon.toDataURL('image/png') };
  });
  assert(icons.opaque, 'Home Screen icon must be opaque');
  const directory = path.join(root, 'assets', 'icons');
  await mkdir(directory, { recursive: true });
  for (const [name, data] of [['apple-touch-icon.png', icons.home], ['favicon-32.png', icons.favicon]]) {
    await writeFile(path.join(directory, name), Buffer.from(data.split(',')[1], 'base64'));
  }
  for (const [rel, size] of [['apple-touch-icon', 180], ['icon', 32]]) {
    const link = page.locator(`link[rel="${rel}"]`);
    assert.equal(await link.getAttribute('sizes'), `${size}x${size}`);
    const response = await page.request.get(await link.evaluate(element => element.href));
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'], /image\/png/);
    const png = await response.body();
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
  console.log('Generated and verified opaque 180px iPhone Home Screen icon and 32px favicon from Boco sprite.');
} finally { await browser.close(); }
