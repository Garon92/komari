// Keyboard-only smoke test: start, steer the swatter with arrows, swat with Enter, pause/resume, restart.
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5176/komari/?debug', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const st = () => page.evaluate(() => ({ ...window.__komari.state(), focus: document.activeElement?.textContent?.trim().slice(0, 24) ?? '' }));
const log = async (label) => {
  const s = await st();
  console.log(label.padEnd(22), JSON.stringify({ phase: s.phase, mode: s.mode, paused: s.paused, screen: s.screen, kills: s.kills, focus: s.focus }));
};

await log('load (how-to)');
await page.keyboard.press('Enter'); // "Rozumím"
await page.waitForTimeout(400);
await log('after Rozumím');
await page.keyboard.press('Enter'); // "Hrát" is the focused primary button
await page.waitForTimeout(2600);
await log('after Enter = Hrát');

// Steer to the nearest mosquito with the arrow keys (620 px/s) and swat with Enter.
for (let i = 0; i < 25; i++) {
  const s = await page.evaluate(() => {
    const k = window.__komari;
    const m = k.game.mosquitoes.find((q) => q.state === 'fly' || q.state === 'dive');
    const p = k.pointer.visible ? k.pointer : { x: k.renderer.w / 2, y: k.renderer.h / 2 };
    return m ? { dx: m.x - p.x, dy: m.y - p.y } : null;
  });
  if (!s) {
    await page.waitForTimeout(250);
    continue;
  }
  const keys = [];
  if (Math.abs(s.dx) > 10) keys.push([s.dx > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(s.dx) / 620]);
  if (Math.abs(s.dy) > 10) keys.push([s.dy > 0 ? 'ArrowDown' : 'ArrowUp', Math.abs(s.dy) / 620]);
  for (const [k, t] of keys) {
    await page.keyboard.down(k);
    await page.waitForTimeout(Math.min(900, t * 1000));
    await page.keyboard.up(k);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
}
await log('after keyboard swats');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await log('Esc → pause');
await page.keyboard.press('Space');
await page.waitForTimeout(500);
await log('Space → resume');
await page.keyboard.press('p');
await page.waitForTimeout(500);
await log('P → pause');
await page.keyboard.press('p');
await page.waitForTimeout(500);
await log('P → resume');
await page.keyboard.press('r');
await page.waitForTimeout(500);
await log('R → restart');
console.log('errors', errors.length ? errors : 'none');
await browser.close();
