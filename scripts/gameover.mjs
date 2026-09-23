// Natural game over: nobody swats, mosquitoes bite until the lives run out → results overlay.
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';
const out = process.argv[2] ?? '/tmp';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5176/komari/?debug', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Rozumím' }).click();
await page.getByRole('button', { name: 'Hrát' }).first().click();
let shotBite = false;
for (let t = 0; t < 120; t++) {
  const s = await page.evaluate(() => window.__komari.state());
  if (!shotBite && s.lives < 3) { await page.screenshot({ path: `${out}/mobile-light-bite.png` }); shotBite = true; }
  if (s.phase === 'over') break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(2500);
const st = await page.evaluate(() => ({ ...window.__komari.state(), results: !!document.querySelector('.g92-overlay--results'), title: document.querySelector('.g92-overlay__title')?.textContent }));
console.log(JSON.stringify({ phase: st.phase, lives: st.lives, wave: st.wave, screen: st.screen, results: st.results, title: st.title }));
await page.screenshot({ path: `${out}/mobile-light-gameover.png` });
// "Hrát znovu" starts a new game.
await page.getByRole('button', { name: 'Hrát znovu' }).click();
await page.waitForTimeout(800);
console.log('after again', JSON.stringify(await page.evaluate(() => { const s = window.__komari.state(); return { phase: s.phase, lives: s.lives, wave: s.wave }; })));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
