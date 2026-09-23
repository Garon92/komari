import './kit/kit.css';
import './style.css';
import { checkLifetime, checkLive, unlock } from './achievements';
import { Audio } from './audio/audio';
import { DIFFICULTIES, MODES, type Difficulty, type Mode, type SceneId } from './game/config';
import { Game, type GameEvent, type Summary } from './game/game';
import {
  autoPause, countdown, haptic, openSettingsDialog, prefersReducedMotion, recordActivity, resolvedTheme, setHelp, settings,
} from './kit';
import { Renderer, type PointerState } from './render/renderer';
import { bestKey, loadSave, writeSave, type Prefs, type SaveData } from './storage';
import { Hud } from './ui/hud';
import { rankFor } from './ranks';
import { HOW_TO, KEYS, Screens, type ResultInfo } from './ui/screens';

// ------------------------------------------------------------------ setup

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = $<HTMLElement>('stage');
const canvas = $<HTMLCanvasElement>('game');
const appbar = document.querySelector('g92-appbar');

const save: SaveData = loadSave();
const game = new Game();
const renderer = new Renderer(canvas);
const audio = new Audio();
const screens = new Screens($('banner'));
const hud = new Hud($('hud'), () => pause());

const pointer: PointerState = { x: -100, y: -100, visible: false, touch: false };
const keysHeld = new Set<string>();
let paused = false;
let gameAchievements: string[] = [];
let resultsTimer = 0;
let lastSummary: { s: Summary; info: ResultInfo } | null = null;

function applyPrefs(): void {
  renderer.prefs = {
    shape: save.prefs.shape,
    color: save.prefs.color,
    blood: save.prefs.blood,
    reducedMotion: prefersReducedMotion(),
  };
  audio.setBuzzEnabled(save.prefs.buzz);
}

function applySound(): void {
  const s = settings.get();
  audio.setVolume(s.volume);
  audio.setEnabled(s.sound);
}

applyPrefs();
applySound();
settings.subscribe(() => {
  applySound();
  applyPrefs();
  // Theme switched in the g92 settings → matching attract-mode scene behind the start screen.
  if (game.phase === 'menu' && game.scene !== menuScene()) {
    game.startMenu(menuScene());
    renderer.setScene(game.scene, true);
  }
});

function changePrefs(p: Partial<Prefs>): void {
  Object.assign(save.prefs, p);
  writeSave(save);
  applyPrefs();
}

// ------------------------------------------------------------------ appbar

// The appbar "?" opens the kit's pictogram help (setHelp); we only pause the game first.
setHelp({
  title: 'Jak hrát',
  intro: 'Plácej komáry dřív, než tě štípnou. Kdo dlouho nedostane ránu, zvětší se a letí na tebe!',
  howTo: HOW_TO,
  keys: KEYS,
  extra: helpExtra(),
});
function helpExtra(): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'g92-btn g92-btn--soft g92-btn--block';
  b.textContent = 'Druhy komárů a vylepšení';
  b.addEventListener('click', () => screens.showHelp());
  return b;
}
appbar?.addEventListener('g92-help', () => {
  if (game.isActive && !paused) pause();
});
appbar?.addEventListener('g92-settings', (e) => {
  e.preventDefault();
  if (game.isActive && !paused) pause();
  openSettingsDialog({ extra: settingsExtra() });
});

function settingsExtra(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'k-settings-extra';
  const h = document.createElement('h3');
  h.className = 'g92-label';
  h.textContent = 'Komáři';
  wrap.append(h, screens.swatterPanel(save, changePrefs, true));
  return wrap;
}

function toggleFullscreen(): void {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement || doc.webkitFullscreenElement) {
    if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
    else doc.webkitExitFullscreen?.();
  } else if (el.requestFullscreen) {
    void el.requestFullscreen().catch(() => undefined);
  } else {
    el.webkitRequestFullscreen?.();
  }
}

// ------------------------------------------------------------------ layout

const hudVisible = (): boolean => !$('hud').hidden;

function layout(): void {
  const r = stage.getBoundingClientRect();
  renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  const top = hudVisible() ? hud.topInset() : 8;
  const pad = 6;
  game.setRect({ x: pad, y: top, w: Math.max(100, r.width - pad * 2), h: Math.max(100, r.height - top - pad) });
  if (paused || !rafId) renderer.render(game, pointer, 0);
}
new ResizeObserver(() => layout()).observe(stage);

// ------------------------------------------------------------------ flow

function menuScene(): SceneId {
  return resolvedTheme() === 'dark' ? 'garden' : 'kitchen';
}

function toStart(): void {
  window.clearTimeout(resultsTimer);
  paused = false;
  lastSummary = null;
  game.startMenu(menuScene());
  renderer.setScene(game.scene, true);
  hud.show(false);
  screens.hideBanner();
  stage.classList.remove('is-playing');
  audio.setBuzzActive(false);
  layout();
  showStart();
  startLoop();
}

function showStart(): void {
  screens.showStart(save, {
    play: (m, d) => play(m, d),
    changed: (m, d) => {
      if (save.prefs.mode !== m || save.prefs.difficulty !== d) {
        save.prefs.mode = m;
        save.prefs.difficulty = d;
        writeSave(save);
      }
    },
    help: () => screens.showHelp(),
    achievements: () => screens.showAchievements(save),
    swatter: () => screens.showSwatter(save, changePrefs),
    swatAt: (e) => {
      const p = localPoint(e);
      swatAt(p.x, p.y, e.pointerType === 'touch');
    },
  });
  // The kit shows the pictogram how-to on the very first visit.
  if (!save.prefs.seenHelp) {
    save.prefs.seenHelp = true;
    writeSave(save);
  }
}

function play(mode: Mode, difficulty: Difficulty): void {
  window.clearTimeout(resultsTimer);
  audio.unlock();
  save.prefs.mode = mode;
  save.prefs.difficulty = difficulty;
  writeSave(save);
  gameAchievements = [];
  lastSummary = null;
  paused = false;
  screens.hide();
  hud.reset();
  hud.show(true);
  stage.classList.add('is-playing');
  renderer.clearStains();
  game.start(mode, difficulty);
  renderer.setScene(game.scene, false);
  layout();
  startLoop();
  if (mode === 'minute') void countdown({ container: stage });
}

function pause(): void {
  if (!game.isActive || paused) return;
  paused = true;
  keysHeld.clear();
  audio.setBuzzActive(false);
  screens.hideBanner();
  screens.showPause(
    { mode: game.mode, score: game.score, wave: game.wave, kills: game.kills, difficulty: game.difficulty },
    {
      resume: () => resume(),
      restart: () => play(game.mode, game.difficulty),
      quit: () => {
        paused = false;
        game.finish();
        startLoop();
      },
      help: () => screens.showHelp(),
      swatter: () => screens.showSwatter(save, changePrefs),
    },
  );
}

function resume(): void {
  if (!paused) return;
  paused = false;
  screens.hide();
  audio.unlock();
  startLoop();
}

function onGameOver(s: Summary): void {
  const key = bestKey(s.mode, s.difficulty);
  const prev = save.bests[key];
  const value = s.mode === 'zen' ? s.kills : s.score;
  const prevValue = prev ? (s.mode === 'zen' ? prev.kills : prev.score) : 0;
  const isRecord = value > prevValue && value > 0;
  if (isRecord) {
    save.bests[key] = { score: s.score, wave: s.wave, kills: s.kills, combo: s.bestCombo, stars: s.stars, date: new Date().toISOString() };
  }
  const st = save.stats;
  const rankBefore = rankFor(st.totalKills).index;
  st.totalKills += s.kills;
  const rankAfter = rankFor(st.totalKills);
  const rankUp = rankAfter.index > rankBefore ? rankAfter.rank : null;
  st.games += 1;
  st.bestCombo = Math.max(st.bestCombo, s.bestCombo);
  st.playSeconds += s.duration;
  for (const [k, v] of Object.entries(s.kindKills)) {
    const kk = k as keyof typeof st.kindKills;
    st.kindKills[kk] = (st.kindKills[kk] ?? 0) + (v ?? 0);
  }
  for (const p of s.powers) if (!st.powers.includes(p)) st.powers.push(p);
  const life = checkLifetime(s, save);
  unlock(save, life);
  gameAchievements.push(...life);
  writeSave(save);
  reportActivity(s);
  for (const id of life) screens.toastAchievement(id);
  lastSummary = { s, info: { best: Math.max(prevValue, value), isRecord, newAchievements: [...gameAchievements], rankUp } };
  resultsTimer = window.setTimeout(() => {
    stage.classList.remove('is-playing');
    hud.show(false);
    screens.hideBanner();
    showResults();
  }, 1100);
}

function showResults(): void {
  if (!lastSummary) {
    showStart();
    return;
  }
  const { s, info } = lastSummary;
  screens.showResults(s, info, {
    again: () => play(s.mode, s.difficulty),
    start: () => toStart(),
  });
}

/** "Best score" for the g92 menu card: the best Vlny score (any difficulty), else the mode just played. */
function reportActivity(s: Summary): void {
  const waveBests = (['easy', 'normal', 'hard'] as Difficulty[]).map((d) => save.bests[bestKey('waves', d)]?.score ?? 0);
  const bestWaves = Math.max(...waveBests);
  const cur = save.bests[bestKey(s.mode, s.difficulty)];
  const metric = bestWaves > 0
    ? { label: 'Rekord', value: bestWaves }
    : cur
      ? { label: s.mode === 'zen' ? 'Zaplácnuto' : 'Rekord', value: s.mode === 'zen' ? cur.kills : cur.score }
      : null;
  recordActivity('komari', { metric, note: `${MODES[s.mode].name} · ${DIFFICULTIES[s.difficulty].name}` });
}

// ------------------------------------------------------------------ events → sound/ui

function checkAchievements(): void {
  const found = checkLive(
    {
      kills: game.kills,
      maxMulti: game.stats.maxMulti,
      bestCombo: game.bestCombo,
      wave: game.mode === 'waves' ? game.wave : 0,
      queens: game.stats.queens,
      flawlessWaves: game.stats.flawlessWaves,
      sharpWaves: game.stats.sharpWaves,
      chainKills: game.stats.chainKills,
      golden: game.stats.golden,
      lastSecond: game.stats.lastSecond,
      revenge: game.stats.revenge,
      mode: game.mode,
    },
    save,
  );
  if (found.length === 0) return;
  unlock(save, found);
  gameAchievements.push(...found);
  writeSave(save);
  audio.achievement();
  for (const id of found) screens.toastAchievement(id);
}

function handle(e: GameEvent): boolean {
  const pan = (x: number) => (renderer.w > 0 ? (x - renderer.w / 2) / (renderer.w / 2) : 0) * 0.7;
  switch (e.type) {
    case 'swat':
      audio.swat(e.hit, pan(e.x));
      return false;
    case 'kill':
      if (e.source === 'lamp') audio.lampZap(pan(e.x));
      else audio.splat(e.kind === 'fat' || e.fed ? 1.6 : e.kind === 'queen' ? 2.2 : 1, pan(e.x));
      if (e.kind === 'golden') audio.pickup();
      if (e.revenge && game.mode === 'minute') renderer.fx.text(e.x, e.y - 72, '+3 s', '#86efac', 22, 1.3);
      return game.phase !== 'menu';
    case 'hurt':
      audio.hurt(pan(e.x));
      return false;
    case 'multi':
      audio.multi(e.count);
      return true;
    case 'comboUp':
      audio.comboUp(e.multiplier);
      return true;
    case 'comboBreak':
      audio.comboBreak();
      return false;
    case 'bite':
      if (e.blocked) audio.blocked();
      else {
        audio.bite();
        haptic('error');
        if (game.mode === 'minute') renderer.fx.text(e.x, e.y - 60, '−3 s', '#fca5a5', 24, 1.3);
      }
      return false;
    case 'powerDrop':
      audio.drop();
      return false;
    case 'powerPick':
      audio.pickup();
      if (e.kind === 'frost') audio.frost();
      if (e.kind === 'spray') audio.spray();
      return false;
    case 'powerEnd':
      audio.powerEnd();
      return false;
    case 'zap':
      audio.zap(pan(e.x2));
      return false;
    case 'lampZap':
      return false;
    case 'queenSpawn':
      audio.queenSpawn();
      return false;
    case 'queenDown':
      audio.queenDown();
      haptic('success');
      return true;
    case 'waveStart':
      if (game.mode === 'waves' && e.spec) audio.waveStart(e.spec.boss);
      screens.bannerWave(e.spec, game.mode, e.wave);
      return true;
    case 'waveClear':
      audio.waveClear();
      screens.bannerClear(e.wave, e.bonus, e.accuracy);
      return true;
    case 'tick':
      audio.tick(e.secondsLeft <= 3);
      return false;
    case 'gameOver':
      audio.setBuzzActive(false);
      checkAchievements();
      onGameOver(e.summary);
      return false;
    case 'scene':
      renderer.setScene(e.scene, true);
      return false;
    default:
      return false;
  }
}

function processEvents(): void {
  const events = game.drainEvents();
  if (events.length === 0) return;
  let check = false;
  for (const e of events) {
    renderer.onEvent(e, pointer);
    if (handle(e)) check = true;
  }
  if (check && game.phase !== 'menu') checkAchievements();
}

// ------------------------------------------------------------------ loop

let rafId = 0;
let last = 0;

function frame(t: number): void {
  rafId = 0;
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  if (!paused) {
    moveKeyboardCursor(dt);
    game.update(dt);
    processEvents();
  }
  renderer.render(game, pointer, paused ? 0 : dt);
  if (hudVisible()) hud.update(game);
  const buzzing = !paused && (game.phase === 'playing' || game.phase === 'intro' || game.phase === 'clear' || game.phase === 'dying');
  audio.setBuzzActive(buzzing);
  if (buzzing) {
    const lx = pointer.visible ? pointer.x : renderer.w / 2;
    const ly = pointer.visible ? pointer.y : renderer.h / 2;
    audio.updateBuzz(renderer.buzzSources(game, lx, ly));
  }
  if (!paused && !document.hidden) rafId = requestAnimationFrame(frame);
}

function startLoop(): void {
  if (rafId) return;
  last = performance.now();
  rafId = requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ input

function localPoint(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function swatAt(x: number, y: number, touch: boolean): void {
  audio.unlock();
  game.swat(x, y, touch);
  processEvents();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (paused || screens.current || screens.dialogOpen) return;
  e.preventDefault();
  const p = localPoint(e);
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.touch = e.pointerType !== 'mouse' && e.pointerType !== 'pen';
  pointer.visible = !pointer.touch && game.phase !== 'menu';
  swatAt(p.x, p.y, pointer.touch);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const p = localPoint(e);
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.touch = false;
  pointer.visible = game.phase !== 'menu';
});
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'touch') pointer.visible = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

function moveKeyboardCursor(dt: number): void {
  if (keysHeld.size === 0 || game.phase === 'menu') return;
  let dx = 0;
  let dy = 0;
  if (keysHeld.has('left')) dx -= 1;
  if (keysHeld.has('right')) dx += 1;
  if (keysHeld.has('up')) dy -= 1;
  if (keysHeld.has('down')) dy += 1;
  if (dx === 0 && dy === 0) return;
  const len = Math.hypot(dx, dy);
  const speed = 620;
  if (!pointer.visible || pointer.x < 0) {
    pointer.x = renderer.w / 2;
    pointer.y = renderer.h / 2;
  }
  pointer.visible = true;
  pointer.touch = false;
  pointer.x = Math.min(renderer.w, Math.max(0, pointer.x + (dx / len) * speed * dt));
  pointer.y = Math.min(renderer.h, Math.max(0, pointer.y + (dy / len) * speed * dt));
}

const DIRS: Record<string, string> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
};

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if (screens.dialogOpen) return; // kit dialogs handle their own keys
  const target = e.target as HTMLElement | null;
  const onControl = Boolean(target && /^(BUTTON|INPUT|A|LABEL|SELECT|TEXTAREA)$/.test(target.tagName));
  if (e.code === 'KeyM') {
    settings.set({ sound: !settings.get().sound });
    return;
  }
  if (e.code === 'KeyF' && !onControl) {
    toggleFullscreen();
    return;
  }
  if (screens.current === 'pause') {
    if (e.code === 'Space' && !onControl) {
      e.preventDefault();
      screens.resumeFromKey();
    } else if (e.code === 'KeyR') {
      play(game.mode, game.difficulty);
    }
    return;
  }
  if (screens.current === 'results') {
    if (e.code === 'KeyR' && lastSummary) play(lastSummary.s.mode, lastSummary.s.difficulty);
    return;
  }
  if (screens.current) return;
  if (!game.isActive) return;
  if (e.key === 'Escape' || e.code === 'KeyP' || e.code === 'Space') {
    e.preventDefault();
    pause();
    return;
  }
  if (e.code === 'KeyR') {
    play(game.mode, game.difficulty);
    return;
  }
  const dir = DIRS[e.code];
  if (dir) {
    e.preventDefault();
    keysHeld.add(dir);
    return;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyX' || e.code === 'KeyK') {
    e.preventDefault();
    if (e.repeat) return;
    if (!pointer.visible) {
      pointer.x = renderer.w / 2;
      pointer.y = renderer.h / 2;
      pointer.visible = true;
    }
    swatAt(pointer.x, pointer.y, false);
  }
});
window.addEventListener('keyup', (e) => {
  const dir = DIRS[e.code];
  if (dir) keysHeld.delete(dir);
});

// Auto-pause when the tab is hidden or the window loses focus (kit helper) + silence audio.
autoPause(() => pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend();
  else {
    audio.resume();
    if (!paused) startLoop();
  }
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (game.phase === 'menu') {
    game.startMenu(menuScene());
    renderer.setScene(game.scene, true);
  }
});
// Unlock our audio on the first gesture anywhere.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

// ------------------------------------------------------------------ debug hook (tests / playwright)

declare global {
  interface Window {
    __komari?: unknown;
  }
}
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  window.__komari = {
    game,
    renderer,
    save,
    pointer,
    audio,
    play,
    pause,
    resume,
    toStart,
    swat: (x: number, y: number, touch = false) => swatAt(x, y, touch),
    jump: (n: number) => game.jumpToWave(n),
    state: () => ({
      phase: game.phase,
      mode: game.mode,
      wave: game.wave,
      score: game.score,
      lives: game.lives,
      kills: game.kills,
      combo: game.combo,
      paused,
      screen: screens.current,
      mosquitoes: game.mosquitoes.map((m) => ({ id: m.id, kind: m.kind, x: m.x, y: m.y, r: m.r * m.scale, state: m.state, hp: m.hp })),
      bubbles: game.bubbles.map((b) => ({ kind: b.kind, x: b.x, y: b.y })),
    }),
  };
}

// ------------------------------------------------------------------ boot

layout();
toStart();
