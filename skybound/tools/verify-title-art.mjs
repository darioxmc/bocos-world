import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const runtime = process.env.SKYBOUND_DEPENDENCIES ||
  'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const sizes = [
  { name: 'desktop', width: 960, height: 720, mobile: false },
  { name: 'iphone-portrait', width: 390, height: 844, mobile: true },
  { name: 'iphone-landscape', width: 844, height: 390, mobile: true }
];

await mkdir('qa/title-art', { recursive: true });
try {
  for (const size of sizes) {
    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      isMobile: size.mobile,
      hasTouch: size.mobile
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#overlay.title:not([hidden])');
    const layout = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        screen: box('.screen'), overlay: box('#overlay'), menu: box('.title .menu'), actions: box('.title .menu-actions'),
        background: getComputedStyle(document.querySelector('#overlay')).backgroundImage,
        title: document.querySelector('.wordmark')?.textContent?.replace(/\s+/g, ' ').trim()
      };
    });
    assert(layout.background.includes('skybound-key-art.webp'), layout.background);
    assert.equal(layout.title, "Boco's WorldSKYBOUND");
    assert(layout.menu.left >= layout.screen.left && layout.menu.right <= layout.screen.right, JSON.stringify(layout));
    assert(layout.actions.bottom <= layout.screen.bottom && layout.actions.top >= layout.screen.top, JSON.stringify(layout));
    assert(layout.menu.bottom <= layout.screen.bottom && layout.menu.top >= layout.screen.top, JSON.stringify(layout));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `qa/title-art/${size.name}.png`, fullPage: true });
    await page.close();
  }
  console.log('Title art passed: full-bleed key art and controls fit desktop and iPhone layouts.');
} finally {
  await browser.close();
}
