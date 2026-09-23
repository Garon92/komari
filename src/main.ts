import './style.css';
import { checkLifetime, checkLive, unlock } from './achievements';
import { Audio } from './audio/audio';
import type { Difficulty, Mode, SceneId } from './game/config';
import { Game, type GameEvent, type Summary } from './game/game';
import { iconSvg } from './render/icons';
import { Renderer, type PointerState } from './render/renderer';
import { bestKey, loadSave, writeSave, type SaveData } from './storage';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';

// ------------------------------------------------------------------ setup

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = $<HTMLElement>('stage');
const canvas = $<HTMLCanvasElement>('game');
const screenEl = $<HTMLElement>('screen');

const save: SaveData = loadSave();
const game = new Game();
const renderer = new Renderer(canvas);
const audio = new Audio();
const screens = new Screens(screenEl, $('banner'), $('toasts'));
const hud = new Hud($('hud'), () => pause());

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

const pointer: PointerState = { x: -100, y: -100, visible: false, touch: false };
const keysHeld = new Set<string>();
let paused = false;
let gameAchievements: string[] = [];
let resultsTimer = 0;

function applyPrefs(): void {
  renderer.prefs = {
    shape: save.prefs.shape,
    color: save.prefs.color,
    blood: save.prefs.blood,
    reducedMotion: reducedMotion.matches,
  };
  audio.setBuzzEnabled(save.prefs.buzz);
}
applyPrefs();

// Sound on/off is shared across g92 apps (kit settings); fall back to our own flag.
const SOUND_KEY = 'g92:settings';
function readSound(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(SOUND_KEY) ?? '{}') as { sound?: boolean };
    return s.sound !== false;
  } catch {
    return true;
  }
}
function writeSound(on: boolean): void {
  try {
    const s = JSON.parse(localStorage.getItem(SOUND_KEY) ?? '{}') as Record<string, unknown>;
    s.sound = on;
    localStorage.setItem(SOUND_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
audio.setEnabled(readSound());

// ------------------------------------------------------------------ appbar actions (local fallback)

const actions = $('appbar-actions');
actions.innerHTML = `
  <button class="icon-btn" type="button" data-act="sound" aria-label="Zvuk">${iconSvg('sound')}</button>
  <button class="icon-btn" type="button" data-act="fullscreen" aria-label="Celá obrazovka">${iconSvg('fullscreen')}</button>
  <button class="icon-btn" type="button" data-act="help" aria-label="Jak hrát">${iconSvg('help')}</button>`;
const soundBtn = actions.querySelector<HTMLButtonElement>('[data-act="sound"]')!;
function syncSoundBtn(): void {
  soundBtn.innerHTML = iconSvg(audio.enabled ? 'sound' : 'mute');
  soundBtn.setAttribute('aria-pressed', String(audio.enabled));
  soundBtn.title = audio.enabled ? 'Vypnout zvuk (M)' : 'Zapnout zvuk (M)';
}
syncSoundBtn();
function toggleSound(): void {
  audio.setEnabled(!audio.enabled);
  writeSound(audio.enabled);
  syncSoundBtn();
  if (audio.enabled) audio.click();
}
soundBtn.addEventListener('click', toggleSound);
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
actions.querySelector('[data-act="fullscreen"]')!.addEventListener('click', toggleFullscreen);
actions.querySelector('[data-act="help"]')!.addEventListener('click', () => {
  if (game.isActive && !paused) pause();
  openHelp();
});

// ------------------------------------------------------------------ layout

function layout(): void {
  const r = stage.getBoundingClientRect();
  renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  const top = hudVisible() ? hud.topInset() : 8;
  const pad = 6;
  game.setRect({ x: pad, y: top, w: Math.max(100, r.width - pad * 2), h: Math.max(100, r.height - top - pad) });
  if (paused || !rafId) renderer.render(game, pointer, 0);
}
const hudVisible = (): boolean => !$('hud').hidden;
new ResizeObserver(() => layout()).observe(stage);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

// ------------------------------------------------------------------ flow

function menuScene(): SceneId {
  return darkScheme.matches && document.documentElement.dataset.theme !== 'light' ? 'garden' : 'kitchen';
}

function toStart(): void {
  window.clearTimeout(resultsTimer);
  paused = false;
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
    help: () => openHelp(),
    achievements: () => {
      audio.click();
      screens.showAchievements(save, () => showStart());
    },
    swatter: () => openSwatter(),
    changed: (m, d) => {
      if (save.prefs.mode !== m || save.prefs.difficulty !== d) {
        save.prefs.mode = m;
        save.prefs.difficulty = d;
        writeSave(save);
      }
    },
  });
}

/** Where to go back from help/settings. */
function backTarget(): void {
  if (game.isActive && paused) showPause();
  else if (game.phase === 'over') showResultsAgain();
  else showStart();
}

function openHelp(): void {
  audio.click();
  if (!save.prefs.seenHelp) {
    save.prefs.seenHelp = true;
    writeSave(save);
  }
  screens.showHelp(() => backTarget());
}

function openSwatter(): void {
  audio.click();
  screens.showSwatter(save, {
    change: (p) => {
      Object.assign(save.prefs, p);
      writeSave(save);
      applyPrefs();
    },
    back: () => backTarget(),
  });
}

function play(mode: Mode, difficulty: Difficulty): void {
  window.clearTimeout(resultsTimer);
  audio.unlock();
  audio.click();
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
}

function pause(): void {
  if (!game.isActive || paused) return;
  paused = true;
  keysHeld.clear();
  audio.setBuzzActive(false);
  screens.hideBanner();
  showPause();
}

function showPause(): void {
  screens.showPause(
    { mode: game.mode, score: game.score, wave: game.wave, kills: game.kills },
    {
      resume: () => resume(),
      restart: () => play(game.mode, game.difficulty),
      quit: () => {
        paused = false;
        screens.hide();
        game.finish();
        startLoop();
      },
      help: () => openHelp(),
      swatter: () => openSwatter(),
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

let lastSummary: { s: Summary; info: { best: number; isRecord: boolean; newAchievements: string[] } } | null = null;

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
  st.totalKills += s.kills;
  st.games += 1;
  st.bestCombo = Math.max(st.bestCombo, s.bestCombo);
  st.playSeconds += s.duration;
  for (const [k, v] of Object.entries(s.kindKills)) st.kindKills[k as keyof typeof st.kindKills] = (st.kindKills[k as keyof typeof st.kindKills] ?? 0) + (v ?? 0);
  for (const p of s.powers) if (!st.powers.includes(p)) st.powers.push(p);
  const life = checkLifetime(s, save);
  unlock(save, life);
  gameAchievements.push(...life);
  writeSave(save);
  recordActivity(s, isRecord);
  const info = { best: Math.max(prevValue, value), isRecord, newAchievements: [...gameAchievements] };
  lastSummary = { s, info };
  if (isRecord && value > 0) audio.fanfare();
  else audio.gameOver();
  for (const id of life) screens.toastAchievement(id);
  resultsTimer = window.setTimeout(() => {
    stage.classList.remove('is-playing');
    hud.show(false);
    screens.hideBanner();
    showResultsAgain();
  }, 1100);
}

function showResultsAgain(): void {
  if (!lastSummary) {
    showStart();
    return;
  }
  const { s, info } = lastSummary;
  screens.showResults(s, info, {
    again: () => play(s.mode, s.difficulty),
    menu: () => toStart(),
  });
}

/** Writes "last played" info for the g92 menu (kit activity contract, local fallback). */
function recordActivity(s: Summary, isRecord: boolean): void {
  try {
    const best = save.bests[bestKey(s.mode, s.difficulty)];
    const entry = {
      app: 'komari',
      lastPlayed: new Date().toISOString(),
      metric: best ? (s.mode === 'zen' ? `${best.kills} komárů` : `rekord ${best.score.toLocaleString('cs-CZ')}`) : '',
      record: isRecord,
    };
    localStorage.setItem('g92:activity:komari', JSON.stringify(entry));
  } catch {
    /* ignore */
  }
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
      else audio.bite();
      if (!e.blocked && navigator.vibrate) {
        try {
          navigator.vibrate(120);
        } catch {
          /* ignore */
        }
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
  if (paused || screens.current) return;
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
// Swatting through the empty space around the start screen card.
screenEl.addEventListener('pointerdown', (e) => {
  if (e.target !== screenEl || screens.current !== 'start') return;
  const p = localPoint(e);
  swatAt(p.x, p.y, e.pointerType === 'touch');
});
// No pinch-zoom / double-tap zoom on the stage.
stage.addEventListener('touchmove', (e) => {
  if (!screens.current) e.preventDefault();
}, { passive: false });
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
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  const onControl = target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'A' || target.tagName === 'LABEL');
  if (e.code === 'KeyM') {
    toggleSound();
    return;
  }
  if (e.code === 'KeyF' && !onControl) {
    toggleFullscreen();
    return;
  }
  // Screens (menus).
  if (screens.current) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (screens.current === 'pause') resume();
      else if (screens.current === 'help' || screens.current === 'achievements' || screens.current === 'swatter') backTarget();
      return;
    }
    if (screens.current === 'pause' && !onControl && (e.code === 'Space' || e.code === 'KeyP')) {
      e.preventDefault();
      resume();
      return;
    }
    if (screens.current === 'pause' && e.code === 'KeyR') {
      play(game.mode, game.difficulty);
      return;
    }
    if (screens.current === 'results' && e.code === 'KeyR') {
      if (lastSummary) play(lastSummary.s.mode, lastSummary.s.difficulty);
      return;
    }
    return;
  }
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

// Auto-pause when the tab is hidden or the window loses focus.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    audio.suspend();
  } else {
    audio.resume();
    if (!paused) startLoop();
  }
});
window.addEventListener('blur', () => pause());
reducedMotion.addEventListener('change', applyPrefs);
darkScheme.addEventListener('change', () => {
  if (game.phase === 'menu') {
    game.startMenu(menuScene());
    renderer.setScene(game.scene, true);
  }
});

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
    play,
    pause,
    resume,
    toStart,
    swat: (x: number, y: number, touch = false) => swatAt(x, y, touch),
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
