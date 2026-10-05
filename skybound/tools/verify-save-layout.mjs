import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
await mkdir('qa/save-layout', { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.SKYBOUND_URL || 'http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player);
  await page.evaluate(() => {
    for (let index = 0; index < 3; index++) {
      skybound.saves.create(index);
      skybound.saves.save(index, {
        name: `Boco Adventure ${index + 1}`,
        area: 2,
        checkpoint: 'canopy-checkpoint-boss',
        emblems: Array.from({ length: 12 }, (_, emblem) => `layout-${index}-${emblem}`),
        playtime: 7322 + index * 100,
        completed: index === 2,
      });
    }
    skybound.shell.startTitle();
    skybound.shell.showSlots();
  });

  const viewports = [[568, 320], [667, 375], [844, 390], [932, 430]];
  const reports = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const overlay = document.querySelector('#overlay');
      const screen = document.querySelector('.screen');
      const rows = [...document.querySelectorAll('.slot-row')];
      const controls = document.querySelector('#touch-controls');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        overlay: rect(overlay),
        screen: rect(screen),
        rows: rows.map(rect),
        back: rect(document.querySelector('.slots .menu-actions button')),
        overlayOverflow: overlay.scrollHeight - overlay.clientHeight,
        menuOverflow: document.querySelector('.slots .menu').scrollHeight - document.querySelector('.slots .menu').clientHeight,
        controlsDisplay: getComputedStyle(controls).display,
      };
    });
    const inside = box => box.x >= layout.screen.x - 1 && box.right <= layout.screen.right + 1 && box.y >= layout.screen.y - 1 && box.bottom <= layout.screen.bottom + 1;
    assert(inside(layout.overlay), `${width}x${height}: overlay must stay inside game screen`);
    assert(layout.rows.every(inside) && inside(layout.back), `${width}x${height}: every save control must remain visible`);
    assert(layout.rows.every(row => row.height >= 34), `${width}x${height}: save targets must remain usable`);
    assert(layout.overlayOverflow <= 1 && layout.menuOverflow <= 1, `${width}x${height}: save menu must not scroll or clip`);
    assert.equal(layout.controlsDisplay, 'none', `${width}x${height}: hidden controls must not squeeze menus`);
    assert(layout.screen.width >= Math.min(400, width - 20), `${width}x${height}: menu screen should reclaim control space`);
    reports.push(layout);
    await page.screenshot({ path: `qa/save-layout/${width}x${height}.png` });
  }
  assert.deepEqual(errors, []);
  await writeFile('qa/save-layout/report.json', JSON.stringify(reports, null, 2));
  console.log('Landscape save layout passed: four iPhone widths, all slots and tools visible, no scrolling, controls removed from menu layout.');
} finally {
  await browser.close();
}
