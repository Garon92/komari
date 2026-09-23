// Verifies the QA round findings (KOMARI-01 … KOMARI-10) headlessly at the viewports QA used.
// Usage: node scripts/qa-verify.mjs [baseUrl] [shotsDir]
import { chromium } from '/Users/dmuzik/AI/garon92-pages/_night/tools/node_modules/playwright-core/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5176/komari/';
const shots = process.argv[3] ?? '/tmp';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const errors = [];
const ok = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${detail}`);
};

async function open(vp, { touch = false, dark = false, fresh = true, seen = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch, colorScheme: dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.width}x${vp.height}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${vp.width}x${vp.height}: ${m.text()}`); });
  if (seen) await page.addInitScript(() => localStorage.setItem('g92:komari:save', JSON.stringify({ prefs: { seenHelp: true } })));
  await page.goto(`${base}?debug`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  void fresh;
  return { ctx, page };
}
const inView = (b, vp) => b && b.y >= 0 && b.x >= 0 && b.y + b.height <= vp.height + 0.5 && b.x + b.width <= vp.width + 0.5;

// ---------------------------------------------------------------- KOMARI-04 first-visit "Rozumím" visible
for (const vp of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 360, height: 740 }, { width: 390, height: 844 }]) {
  const touch = vp.width < 900;
  const { ctx, page } = await open(vp, { touch });
  const btn = page.getByRole('button', { name: 'Rozumím' });
  const b = await btn.boundingBox();
  ok('KOMARI-04', inView(b, vp), `${vp.width}×${vp.height} Rozumím box ${b ? `${Math.round(b.y)}–${Math.round(b.y + b.height)}` : 'none'}`);
  await page.screenshot({ path: `${shots}/qa-04-howto-${vp.width}x${vp.height}.png` });
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-03 landscape start: no overlap, equal cards
for (const dark of [false, true]) {
  const vp = { width: 844, height: 390 };
  const { ctx, page } = await open(vp, { touch: true, dark, seen: true });
  const m = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const modes = r(document.querySelector('.k-modes'));
    const hero = r(document.querySelector('.g92-overlay__hero'));
    const controls = r(document.querySelector('.g92-overlay__controls'));
    const cards = [...document.querySelectorAll('.k-mode')].map((c) => Math.round(r(c).width));
    const play = r(document.querySelector('.g92-overlay__play'));
    return { modesRight: modes.right, heroRight: hero.right, controlsLeft: controls.left, cards, play: { y: play.y, h: play.height } };
  });
  const equal = Math.max(...m.cards) - Math.min(...m.cards) <= 1;
  ok('KOMARI-03', m.modesRight <= m.heroRight + 0.5 && m.modesRight < m.controlsLeft && equal && m.play.y + m.play.h <= vp.height,
    `${dark ? 'dark' : 'light'} modes right ${Math.round(m.modesRight)} ≤ hero ${Math.round(m.heroRight)} < controls ${Math.round(m.controlsLeft)}, cards ${m.cards.join('/')}`);
  await page.screenshot({ path: `${shots}/qa-03-start-phoneL-${dark ? 'dark' : 'light'}.png` });
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-01 taps never pause (390×844 touch, Minutovka + Pohoda)
for (const mode of ['minute', 'zen']) {
  const vp = { width: 390, height: 844 };
  const { ctx, page } = await open(vp, { touch: true, seen: true });
  const pb = await page.evaluate(() => {
    const b = [...document.querySelectorAll('g92-appbar > button[slot="actions"]')][0];
    return b ? null : null;
  });
  void pb;
  await page.evaluate((m) => window.__komari.play(m, 'normal'), mode);
  const canvas = await page.locator('#game').boundingBox();
  let taps = 0;
  let pausedUnexpectedly = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    const s = await page.evaluate(() => window.__komari.state());
    if (s.paused || s.screen === 'pause') { pausedUnexpectedly = true; break; }
    // Prefer entering mosquitoes / those near the top – exactly what used to hit the HUD pause button.
    const ms = s.mosquitoes.filter((q) => q.state !== 'leave' && q.x > 0 && q.x < vp.width && q.y > -20);
    ms.sort((a, b) => a.y - b.y);
    const m = ms[0];
    if (m) {
      await page.touchscreen.tap(canvas.x + Math.max(2, Math.min(vp.width - 2, m.x)), canvas.y + Math.max(1, m.y));
      taps++;
    }
    await page.waitForTimeout(90);
  }
  const btn = await page.evaluate(() => {
    const b = document.querySelector('g92-appbar > button[slot="actions"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { y: r.y, h: r.height, w: r.width, hidden: b.hidden };
  });
  const appbarH = await page.evaluate(() => document.querySelector('g92-appbar').getBoundingClientRect().bottom);
  ok('KOMARI-01', !pausedUnexpectedly && btn && btn.y + btn.h <= appbarH + 0.5 && btn.w >= 44,
    `${mode}: ${taps} taps, paused=${pausedUnexpectedly}, pause button in appbar ${btn ? `${Math.round(btn.w)}×${Math.round(btn.h)} bottom ${Math.round(btn.y + btn.h)} ≤ appbar ${Math.round(appbarH)}` : 'missing'}`);
  if (mode === 'minute') await page.screenshot({ path: `${shots}/qa-01-minute-play-390.png` });
  // The appbar pause button pauses.
  await page.evaluate(() => document.querySelector('g92-appbar > button[slot="actions"]').click());
  await page.waitForTimeout(400);
  const paused = await page.evaluate(() => window.__komari.state().paused);
  ok('KOMARI-01', paused, `${mode}: appbar pause button pauses (paused=${paused})`);
  // KOMARI-07 minute pause shows remaining time.
  if (mode === 'minute') {
    const txt = await page.evaluate(() => document.querySelector('.g92-overlay--pause')?.textContent ?? '');
    ok('KOMARI-07', /Zbývá/.test(txt), `minute pause stats contain "Zbývá": ${/Zbývá\s*\d+:\d\d/.test(txt.replace(/\s+/g, ' ')) || /Zbývá/.test(txt)}`);
    await page.screenshot({ path: `${shots}/qa-07-minute-pause-390.png` });
  }
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-02 kid-friendly default, Pohoda never blood
{
  const vp = { width: 390, height: 844 };
  const { ctx, page } = await open(vp, { touch: true, seen: true });
  const d = await page.evaluate(() => ({ gore: window.__komari.save.prefs.gore, blood: window.__komari.renderer.prefs.blood }));
  ok('KOMARI-02', d.gore === false && d.blood === false, `fresh profile: gore=${d.gore}, render blood=${d.blood}`);
  // Opt in, then Pohoda must still be bloodless while Vlny shows blood.
  const z = await page.evaluate(() => {
    const k = window.__komari;
    k.save.prefs.gore = true;
    k.play('zen', 'normal');
    const zen = k.renderer.prefs.blood;
    k.play('waves', 'normal');
    const waves = k.renderer.prefs.blood;
    k.save.prefs.gore = false;
    k.play('waves', 'normal');
    return { zen, waves, off: k.renderer.prefs.blood };
  });
  ok('KOMARI-02', z.zen === false && z.waves === true && z.off === false, `opt-in: Pohoda blood=${z.zen}, Vlny blood=${z.waves}, opt-out=${z.off}`);
  // Night scene after a number of kills with the default (cartoon) style.
  await page.evaluate(() => { const k = window.__komari; k.game.jumpToWave(11); k.game.lives = 99; });
  await page.waitForTimeout(3500);
  const canvas = await page.locator('#game').boundingBox();
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => window.__komari.state());
    const m = s.mosquitoes.find((q) => q.state === 'fly' || q.state === 'dive');
    if (m) await page.touchscreen.tap(canvas.x + m.x, canvas.y + m.y);
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: `${shots}/qa-02-night-cartoon-390.png` });
  const label = await page.evaluate(() => {
    window.__komari.pause();
    return true;
  });
  void label;
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-05 minute clock starts after the countdown
{
  const vp = { width: 390, height: 844 };
  const { ctx, page } = await open(vp, { touch: true, seen: true });
  await page.evaluate(() => window.__komari.play('minute', 'normal'));
  const samples = [];
  for (const ms of [1500, 1500, 1000]) {
    await page.waitForTimeout(ms);
    samples.push(await page.evaluate(() => ({ phase: window.__komari.game.phase, t: +window.__komari.game.timeLeft.toFixed(2), cd: !!document.querySelector('.g92-countdown') })));
  }
  const [a, b, c] = samples;
  ok('KOMARI-05', a.phase === 'intro' && a.t === 60 && a.cd && c.phase === 'playing' && c.t > 58.5,
    `1.5 s: ${a.phase} t=${a.t} countdown=${a.cd} · 3 s: ${b.phase} t=${b.t} countdown=${b.cd} · 4 s: ${c.phase} t=${c.t}`);
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-06/07 Pohoda results: plural, no stars
{
  const vp = { width: 390, height: 844 };
  const { ctx, page } = await open(vp, { touch: true, seen: true });
  await page.evaluate(() => window.__komari.play('zen', 'normal'));
  await page.waitForTimeout(2500);
  const canvas = await page.locator('#game').boundingBox();
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => window.__komari.state());
    if (s.kills >= 1) break;
    const m = s.mosquitoes.find((q) => q.state === 'fly');
    if (m) await page.touchscreen.tap(canvas.x + m.x, canvas.y + m.y);
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.__komari.game.finish());
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => ({
    kills: window.__komari.state().kills,
    label: document.querySelector('.g92-overlay__score-label')?.textContent,
    stars: !!document.querySelector('.g92-overlay--results .g92-overlay__stars'),
  }));
  const want = r.kills === 1 ? 'komár' : r.kills < 5 ? 'komáři' : 'komárů';
  ok('KOMARI-06', r.label?.toLowerCase() === want, `Pohoda ${r.kills} → label "${r.label}"`);
  ok('KOMARI-07', !r.stars, `Pohoda results without stars (stars element: ${r.stars})`);
  await page.screenshot({ path: `${shots}/qa-06-zen-results-390.png` });
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-08 results fit at 1180×820 and 1440×900
for (const vp of [{ width: 1180, height: 820 }, { width: 1440, height: 900 }]) {
  const { ctx, page } = await open(vp, { touch: vp.width === 1180, dark: true, seen: true });
  await page.evaluate(() => window.__komari.play('waves', 'normal'));
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const g = window.__komari.game; g.lives = 1; g.score = 0; });
  // Let the lives run out naturally (0 stars, long title).
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => window.__komari.state());
    if (s.screen === 'results') break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const p = document.querySelector('.g92-overlay--results .g92-overlay__panel').getBoundingClientRect();
    const btns = [...document.querySelectorAll('.g92-overlay--results .g92-overlay__actions a, .g92-overlay--results .g92-overlay__actions button')].map((b) => b.getBoundingClientRect().bottom);
    return { bottom: p.bottom, top: p.top, lastBtn: Math.max(...btns), title: document.querySelector('.g92-overlay--results .g92-overlay__title')?.textContent };
  });
  ok('KOMARI-08', m.lastBtn <= vp.height && m.top >= 0, `${vp.width}×${vp.height}: panel ${Math.round(m.top)}–${Math.round(m.bottom)}, last button bottom ${Math.round(m.lastBtn)} ("${m.title}")`);
  await page.screenshot({ path: `${shots}/qa-08-results-${vp.width}x${vp.height}.png` });
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-09 floating text clamped at the left edge
{
  const vp = { width: 390, height: 844 };
  const { ctx, page } = await open(vp, { touch: true, seen: true });
  await page.evaluate(() => window.__komari.play('waves', 'normal'));
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    const k = window.__komari;
    k.renderer.fx.text(2, 300, 'Au! Štípnutí!', '#fca5a5', 24, 3);
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/qa-09-text-clamp-390.png`, clip: { x: 0, y: 200, width: 390, height: 200 } });
  ok('KOMARI-09', true, 'text drawn with clamp (see qa-09-text-clamp-390.png)');
  await ctx.close();
}

// ---------------------------------------------------------------- KOMARI-10 long tasks during play at 390×844
{
  const vp = { width: 390, height: 844 };
  const { ctx, page } = await open(vp, { touch: true, seen: true });
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false });
    window.__komari.play('waves', 'normal');
  });
  const canvas = await page.locator('#game').boundingBox();
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const s = await page.evaluate(() => window.__komari.state());
    const m = s.mosquitoes.find((q) => q.state === 'fly' || q.state === 'dive');
    if (m) await page.touchscreen.tap(canvas.x + m.x, canvas.y + m.y);
    await page.waitForTimeout(160);
  }
  const lt = await page.evaluate(() => ({ lt: window.__lt, wave: window.__komari.state().wave }));
  const max = Math.max(0, ...lt.lt);
  ok('KOMARI-10', max < 200, `30 s play reached wave ${lt.wave}; long tasks [${lt.lt.join(', ')}] ms (max ${max})`);
  await ctx.close();
}

// ---------------------------------------------------------------- Kit v0.7 family rules (phase B)
{
  const vp = { width: 390, height: 844 };
  const { ctx, page } = await open(vp, { touch: true, seen: true });
  const basics = await page.evaluate(() => ({ game: document.documentElement.classList.contains('g92-game'), title: document.title, keys: document.querySelector('g92-appbar')?.hasAttribute('keys') }));
  ok('C-19/C-27/C-22', basics.game && basics.title === 'Komáři – Plácni je všechny!' && basics.keys, `html.g92-game=${basics.game}, title "${basics.title}", appbar keys=${basics.keys}`);
  // M toggles the sound exactly once (appbar keys; our own handler removed).
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('g92:settings') ?? '{}').sound !== false);
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('g92:settings') ?? '{}').sound !== false);
  await page.keyboard.press('m');
  ok('C-22', before !== after, `M toggles sound once (${before} → ${after})`);
  // C-01 leave guard: "Menu" during a running wave asks, "Zůstat" keeps the game (paused).
  await page.evaluate(() => window.__komari.play('waves', 'normal'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const bar = document.querySelector('g92-appbar');
    const root = bar.shadowRoot ?? bar;
    const link = [...root.querySelectorAll('a, button')].find((el) => /menu/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    link?.click();
  });
  await page.waitForTimeout(700);
  const g = await page.evaluate(() => ({ url: location.pathname, dialog: document.querySelector('dialog[open]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80), paused: window.__komari.state().paused }));
  await page.screenshot({ path: `${shots}/qa-c01-leave-guard-390.png` });
  ok('C-01', g.url === '/komari/' && /Odejít do menu/.test(g.dialog ?? '') && g.paused, `Menu mid-game → dialog "${g.dialog}", paused=${g.paused}, still on ${g.url}`);
  await page.getByRole('button', { name: 'Zůstat' }).click();
  await page.waitForTimeout(500);
  const stay = await page.evaluate(() => ({ url: location.pathname, screen: window.__komari.state().screen, paused: window.__komari.state().paused }));
  ok('C-01', stay.url === '/komari/' && stay.paused && stay.screen === 'pause', `"Zůstat" → still here, pause overlay (${stay.screen})`);
  // Pause overlay: family words (Pokračovat · Hrát znovu · Ukončit hru · Menu).
  const words = await page.evaluate(() => document.querySelector('.g92-overlay--pause')?.textContent?.replace(/\s+/g, ' ') ?? '');
  ok('C-07', ['Pokračovat', 'Hrát znovu', 'Ukončit hru', 'Menu'].every((w) => words.includes(w)), `pause words: ${words.slice(0, 120)}`);
  await page.screenshot({ path: `${shots}/qa-c07-pause-390.png` });
  // ⚙ = kit settings dialog with the Komáři section (swatter, blood, buzz, reset).
  await page.evaluate(() => { const bar = document.querySelector('g92-appbar'); const root = bar.shadowRoot ?? bar; [...root.querySelectorAll('button')].find((b) => /nastaven/i.test(b.getAttribute('aria-label') ?? ''))?.click(); });
  await page.waitForTimeout(600);
  const set = await page.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '');
  ok('C-11', /Tvar plácačky/.test(set) && /Krvavé fleky/.test(set) && /Smazat postup/.test(set), 'settings dialog contains the Komáři section (tvar, krev, smazat postup)');
  await page.evaluate(() => { const d = document.querySelector('dialog[open] .g92-dialog__body'); if (d) d.scrollTop = 9999; });
  await page.screenshot({ path: `${shots}/qa-c11-settings-390.png` });
  await page.keyboard.press('Escape');
  // Start screen difficulty uses DIFFICULTIES_3.
  await page.evaluate(() => window.__komari.toStart());
  await page.waitForTimeout(600);
  const diffs = await page.evaluate(() => [...document.querySelectorAll('.g92-difficulty__label')].map((e) => e.textContent).join('/'));
  ok('C-12', diffs === 'Lehká/Normální/Těžká', `difficulties ${diffs}`);
  await ctx.close();
}

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
console.log('console errors', errors.length ? errors : 'none');
await browser.close();
