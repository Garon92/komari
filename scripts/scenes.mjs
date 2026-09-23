// Screenshots of every scene mid-game (jumps waves via the debug hook).
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? '/tmp';
const flag = (n) => args.includes(`--${n}`);
const vp = flag('mobile') ? { width: 390, height: 844 } : flag('landscape') ? { width: 844, height: 390 } : { width: 1440, height: 900 };
const tag = flag('mobile') ? 'mobile' : flag('landscape') ? 'landscape' : 'desktop';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: !!(flag('mobile') || flag('landscape')), hasTouch: !!(flag('mobile') || flag('landscape')), colorScheme: flag('dark') ? 'dark' : 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5176/komari/?debug', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
for (const [wave, name] of [[1, 'kitchen'], [6, 'garden'], [11, 'bedroom'], [16, 'camp'], [15, 'boss-bedroom']]) {
  await page.evaluate((n) => { window.__komari.play('waves', 'normal'); window.__komari.jump(n); }, wave);
  await page.waitForTimeout(wave === 15 ? 6500 : 5200);
  const box = await page.locator('#game').boundingBox();
  if (!flag('mobile') && !flag('landscape')) await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/scene-${name}-${tag}${flag('dark') ? '-dark' : ''}.png` });
}
console.log('errors', errors.length ? errors : 'none');
await browser.close();
