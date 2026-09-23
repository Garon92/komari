// Measures peak levels of every synthesized sound + the in-game buzz (headless Chrome, analyser on the master bus).
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto('http://localhost:5176/komari/?debug', { waitUntil: 'networkidle' });
await page.mouse.click(10, 300);
await page.waitForTimeout(300);
const res = await page.evaluate(async () => {
  const a = window.__komari.audio;
  a.unlock();
  await new Promise((r) => setTimeout(r, 200));
  const ctx = a.ctx;
  // Tap the master output with an analyser to measure levels.
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  a.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const peakOf = async (fn, ms = 350) => {
    fn();
    let peak = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      an.getFloatTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      await new Promise((r) => setTimeout(r, 20));
    }
    return +peak.toFixed(3);
  };
  const out = { state: ctx.state };
  const tests = {
    swatHit: () => a.swat(true, 0), swatMiss: () => a.swat(false, 0.5), splat: () => a.splat(1, 0), splatBig: () => a.splat(2.2, 0),
    hurt: () => a.hurt(0), multi: () => a.multi(4), comboUp: () => a.comboUp(5), comboBreak: () => a.comboBreak(), bite: () => a.bite(),
    blocked: () => a.blocked(), pickup: () => a.pickup(), drop: () => a.drop(), powerEnd: () => a.powerEnd(), zap: () => a.zap(-0.5),
    lampZap: () => a.lampZap(0), spray: () => a.spray(), frost: () => a.frost(), queenSpawn: () => a.queenSpawn(), queenDown: () => a.queenDown(),
    waveStart: () => a.waveStart(false), waveBoss: () => a.waveStart(true), waveClear: () => a.waveClear(), tick: () => a.tick(true),
    achievement: () => a.achievement(), click: () => a.click(),
  };
  for (const [k, fn] of Object.entries(tests)) out[k] = await peakOf(fn);
  window.__komari.play('waves', 'normal');
  await new Promise((r) => setTimeout(r, 4500));
  out.buzzInGame = await peakOf(() => {}, 1500);
  const g = window.__komari.game;
  g.mosquitoes.forEach((m) => { m.patience = 0; });
  await new Promise((r) => setTimeout(r, 800));
  out.buzzDiving = await peakOf(() => {}, 800);
  out.alive = g.mosquitoes.length;
  out.dbg = { active: a.buzzActive, voices: a.voices.length, bus: a.buzzBus.gain.value, g0: a.voices[0]?.gain.gain.value, enabled: a.enabled, be: a.buzzEnabled };
  a.setBuzzActive(false);
  return out;
});
console.log(JSON.stringify(res, null, 0));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
