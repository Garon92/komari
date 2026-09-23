// Headless play-test: plays the game through the debug hook and real mouse clicks.
// Usage: node scripts/playtest.mjs [url] [outDir] [--mobile] [--dark] [--mode=waves] [--diff=normal] [--waves=3] [--miss=0.2]
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5176/komari/?debug';
const out = args.find((a) => !a.startsWith('http') && !a.startsWith('--')) ?? '/tmp/komari-shots';
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) ?? `=${d}`).split('=')[1];
const mode = opt('mode', 'waves');
const diff = opt('diff', 'normal');
const targetWaves = Number(opt('waves', 3));
const missRate = Number(opt('miss', 0.15));
const maxSeconds = Number(opt('seconds', 120));
const prefix = opt('prefix', `${mode}-${diff}`);
const react = Number(opt('react', 1));
const delay = Number(opt('delay', 140));
const startWave = Number(opt('start', 1));

const vp = flag('mobile') ? { width: 390, height: 844 } : flag('landscape') ? { width: 844, height: 390 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: flag('mobile') || flag('landscape'), hasTouch: flag('mobile') || flag('landscape'), colorScheme: flag('dark') ? 'dark' : 'light', locale: 'cs-CZ' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.evaluate(([m, d]) => window.__komari.play(m, d), [mode, diff]);
if (startWave > 1) await page.evaluate((n) => window.__komari.jump(n), startWave);
const canvasBox = await page.locator('#game').boundingBox();
const shots = new Set();
const shot = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${out}/${prefix}-${name}.png` }); console.log('shot', name); };
const t0 = Date.now();
let lastWave = 0;
let clicks = 0;
let st;
while (Date.now() - t0 < maxSeconds * 1000) {
  st = await page.evaluate(() => window.__komari.state());
  if (st.phase === 'over') break;
  if (st.wave !== lastWave) { lastWave = st.wave; console.log(`wave ${st.wave} score ${st.score} lives ${st.lives}`); }
  if (mode === 'waves' && st.wave > targetWaves) break;
  if (st.phase === 'playing' && st.mosquitoes.length >= 4) await shot(`midgame-w${st.wave}`);
  if (st.phase === 'intro') await shot(`intro-w${st.wave}`);
  if (st.phase === 'clear') await shot(`clear-w${st.wave}`);
  if (st.mosquitoes.some((m) => m.kind === 'queen')) await shot('boss');
  if (st.mosquitoes.some((m) => m.state === 'dive')) await shot('dive');
  if (st.bubbles.length) await shot('bubble');
  // Prefer bubbles, then divers, then nearest on-screen mosquito.
  const vis = st.mosquitoes.filter((m) => m.state !== 'enter' && m.state !== 'leave' && m.x > 0 && m.y > 60 && m.x < canvasBox.width && m.y < canvasBox.height);
  let target = st.bubbles[0] ?? vis.find((m) => m.state === 'dive') ?? vis[0];
  if (target && Math.random() < react) {
    let { x, y } = target;
    if (Math.random() < missRate) { x += 150; y += 120; }
    if (flag('mobile') || flag('landscape')) await page.touchscreen.tap(canvasBox.x + x, canvasBox.y + y);
    else { await page.mouse.move(canvasBox.x + x - 20, canvasBox.y + y - 10); await page.mouse.move(canvasBox.x + x, canvasBox.y + y, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); }
    clicks++;
  }
  await page.waitForTimeout(delay + Math.random() * delay * 0.8);
}
await page.waitForTimeout(1500);
st = await page.evaluate(() => window.__komari.state());
console.log('final', JSON.stringify({ phase: st.phase, wave: st.wave, score: st.score, lives: st.lives, kills: st.kills, clicks, screen: st.screen }));
// Pause screen then results.
if (st.phase !== 'over') {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await shot('pause');
  await page.evaluate(() => { window.__komari.resume(); window.__komari.game.finish(); });
  await page.waitForTimeout(1800);
}
await shot('results');
console.log('errors', errors.length ? errors : 'none');
await browser.close();
