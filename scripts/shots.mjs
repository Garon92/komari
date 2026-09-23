// Screenshot matrix of every screen: node scripts/shots.mjs <outDir> [baseUrl]
// Viewports: desktop, mobile (portrait), landscape phone; light + dark. Reports console errors.
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';

const out = process.argv[2] ?? '/tmp/komari-shots';
const base = process.argv[3] ?? 'http://localhost:5176/komari/';
const only = process.argv[4]; // optional viewport filter
const VPS = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false },
  mobile: { viewport: { width: 390, height: 844 }, mobile: true },
  landscape: { viewport: { width: 844, height: 390 }, mobile: true },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function session(vpName, scheme) {
  const vp = VPS[vpName];
  const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile, colorScheme: scheme, locale: 'cs-CZ' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${vpName}/${scheme}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${vpName}/${scheme}: ${e.message}`));
  await page.goto(`${base}?debug`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const tag = `${vpName}-${scheme}`;
  const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });

  await shot('01-start');
  // Dialogs from the start screen.
  await page.click('[data-help]');
  await page.waitForTimeout(500);
  await shot('02-help');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.click('[data-ach]');
  await page.waitForTimeout(500);
  await shot('03-achievements');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.click('[data-swatter]');
  await page.waitForTimeout(500);
  await shot('04-swatter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Play waves; stage a busy moment: divers, a bubble, powers.
  await page.evaluate(() => window.__komari.play('waves', 'normal'));
  await page.waitForTimeout(700);
  await shot('05-wave-intro');
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const k = window.__komari;
    const g = k.game;
    g.jumpToWave(4);
  });
  await page.waitForTimeout(5200);
  await page.evaluate(() => {
    const g = window.__komari.game;
    g.mosquitoes.slice(0, 2).forEach((m) => { m.patience = 0; });
    g.dropPower(g.rect.x + g.rect.w * 0.3, g.rect.y + g.rect.h * 0.5);
    g.combo = 12;
    g.powers.electric = 8;
    g.powers.frost = 0;
  });
  const box = await page.locator('#game').boundingBox();
  if (!vpName.includes('mobile') && vpName !== 'landscape') await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55);
  await page.waitForTimeout(1300);
  await shot('06-midgame');
  // Night scene with the lamp + net.
  await page.evaluate(() => {
    const g = window.__komari.game;
    g.jumpToWave(12);
  });
  await page.waitForTimeout(5600);
  await page.evaluate(() => {
    const g = window.__komari.game;
    g.applyPower('lamp', g.rect.x + g.rect.w * 0.5, g.rect.y + g.rect.h * 0.5);
    g.applyPower('net', 0, 0);
    g.mosquitoes.slice(0, 1).forEach((m) => { m.patience = 0; });
  });
  await page.waitForTimeout(1500);
  await shot('07-night');
  // Boss.
  await page.evaluate(() => window.__komari.game.jumpToWave(5));
  await page.waitForTimeout(6000);
  await shot('08-boss');
  // Pause + settings dialog.
  await page.evaluate(() => window.__komari.pause());
  await page.waitForTimeout(600);
  await shot('09-pause');
  await page.evaluate(() => document.querySelector('g92-appbar')?.dispatchEvent(new CustomEvent('g92-settings', { bubbles: true, cancelable: true })));
  await page.waitForTimeout(600);
  await shot('10-settings');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Results.
  await page.evaluate(() => { window.__komari.resume(); window.__komari.game.finish(); });
  await page.waitForTimeout(3200);
  await shot('11-results');
  // Minute + zen quick looks.
  await page.evaluate(() => window.__komari.play('minute', 'easy'));
  await page.waitForTimeout(4500);
  await shot('12-minute');
  await page.evaluate(() => window.__komari.play('zen', 'easy'));
  await page.waitForTimeout(3500);
  await shot('13-zen');
  await ctx.close();
}

for (const vp of Object.keys(VPS)) {
  if (only && vp !== only) continue;
  for (const scheme of ['light', 'dark']) await session(vp, scheme);
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
