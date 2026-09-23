// Landscape-phone check of overlays: node scripts/landscape.mjs <outDir>
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';
const out = process.argv[2] ?? '/tmp';
const browser = await chromium.launch({ channel: 'chrome' });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto('http://localhost:5176/komari/?debug', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/landscape-${scheme}-00-howto.png` });
  await page.getByRole('button', { name: 'Rozumím' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/landscape-${scheme}-01-start.png` });
  await page.evaluate(() => window.__komari.play('waves', 'normal'));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__komari.pause());
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/landscape-${scheme}-09-pause.png` });
  await page.evaluate(() => { window.__komari.resume(); window.__komari.game.score = 1234; window.__komari.game.finish(); });
  await page.waitForTimeout(3300);
  await page.screenshot({ path: `${out}/landscape-${scheme}-11-results.png` });
  await ctx.close();
}
await browser.close();
