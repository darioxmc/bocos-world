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

await mkdir('qa/opening-art', { recursive: true });
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
    await page.waitForFunction(() => window.skybound?.shell);
    for (let slide = 0; slide < 3; slide++) {
      await page.evaluate(slide => skybound.shell.showOpening(0, slide), slide);
      await page.waitForFunction(() => {
        const image = document.querySelector('.story-picture');
        return image?.complete && image.naturalWidth > 0;
      });
      const layout = await page.evaluate(() => {
        const bounds = selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        return {
          screen: bounds('.screen'), overlay: bounds('#overlay'), menu: bounds('.opening .menu'),
          image: bounds('.story-picture'), copy: bounds('.opening .story-copy'), actions: bounds('.opening .menu-actions'),
          alt: document.querySelector('.story-picture').alt,
          src: document.querySelector('.story-picture').getAttribute('src')
        };
      });
      assert(layout.alt.length > 30, `${size.name} slide ${slide + 1} needs descriptive alt text`);
      assert(layout.src.endsWith('.webp'), `${size.name} slide ${slide + 1} uses compressed art`);
      assert(layout.image.width >= 250 && layout.image.height >= 78, JSON.stringify(layout));
      assert(layout.menu.left >= layout.overlay.left - 1 && layout.menu.right <= layout.overlay.right + 1, JSON.stringify(layout));
      assert(layout.menu.top >= layout.overlay.top - 1 && layout.menu.bottom <= layout.overlay.bottom + 1, JSON.stringify(layout));
      assert(layout.actions.bottom <= layout.screen.bottom + 1, JSON.stringify(layout));
      await page.screenshot({ path: `qa/opening-art/${size.name}-${slide + 1}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Opening art passed: all three painted slides load and fit desktop and iPhone layouts.');
} finally {
  await browser.close();
}
