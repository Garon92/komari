import type { Difficulty, Mode, MosquitoKind, PowerKind } from './game/config';
import type { SwatterShape } from './render/swatter';

/** Persistent save (versioned, with migration from the original game's keys). */

export interface BestEntry {
  score: number;
  wave: number;
  kills: number;
  combo: number;
  stars: number;
  date: string;
}

export interface Prefs {
  shape: SwatterShape;
  color: string;
  blood: boolean;
  buzz: boolean;
  mode: Mode;
  difficulty: Difficulty;
  seenHelp: boolean;
}

export interface SaveData {
  v: 2;
  bests: Partial<Record<`${Mode}:${Difficulty}`, BestEntry>>;
  stats: {
    totalKills: number;
    games: number;
    bestCombo: number;
    kindKills: Partial<Record<MosquitoKind, number>>;
    powers: PowerKind[];
    playSeconds: number;
  };
  achievements: Record<string, string>;
  prefs: Prefs;
}

export const STORAGE_KEY = 'g92:komari:save';
const LEGACY_BEST = 'komari_bestScore';
const LEGACY_SWATTER = 'komari_swatter';

export function defaultSave(): SaveData {
  return {
    v: 2,
    bests: {},
    stats: { totalKills: 0, games: 0, bestCombo: 0, kindKills: {}, powers: [], playSeconds: 0 },
    achievements: {},
    prefs: { shape: 'round', color: '#60a5fa', blood: true, buzz: true, mode: 'waves', difficulty: 'normal', seenHelp: false },
  };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Normalises anything we find in storage into a valid SaveData. */
export function normalize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  if (r.bests && typeof r.bests === 'object') d.bests = r.bests;
  if (r.stats && typeof r.stats === 'object') d.stats = { ...d.stats, ...r.stats };
  if (r.achievements && typeof r.achievements === 'object') d.achievements = r.achievements;
  if (r.prefs && typeof r.prefs === 'object') d.prefs = { ...d.prefs, ...r.prefs };
  if (!['round', 'square', 'heart', 'star'].includes(d.prefs.shape)) d.prefs.shape = 'round';
  if (!['waves', 'minute', 'zen'].includes(d.prefs.mode)) d.prefs.mode = 'waves';
  if (!['easy', 'normal', 'hard'].includes(d.prefs.difficulty)) d.prefs.difficulty = 'normal';
  if (typeof d.prefs.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.prefs.color)) d.prefs.color = '#60a5fa';
  return d;
}

/** Migrates the original game's localStorage keys (best score + swatter look). */
export function migrateLegacy(d: SaveData, best: string | null, swatter: string | null): SaveData {
  const legacyBest = Number(best ?? '0');
  if (Number.isFinite(legacyBest) && legacyBest > 0) {
    const key = 'zen:normal' as const;
    const cur = d.bests[key];
    if (!cur || cur.kills < legacyBest) {
      d.bests[key] = { score: legacyBest, wave: 0, kills: legacyBest, combo: 0, stars: 0, date: new Date().toISOString() };
    }
  }
  if (swatter) {
    try {
      const o = JSON.parse(swatter) as { type?: string; color?: string };
      if (o.type === 'round' || o.type === 'square') d.prefs.shape = o.type;
      if (typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color)) d.prefs.color = o.color;
    } catch {
      /* ignore */
    }
  }
  return d;
}

export function loadSave(): SaveData {
  const raw = safeGet(STORAGE_KEY);
  if (raw) {
    try {
      return normalize(JSON.parse(raw));
    } catch {
      /* fall through */
    }
  }
  const d = migrateLegacy(defaultSave(), safeGet(LEGACY_BEST), safeGet(LEGACY_SWATTER));
  writeSave(d);
  return d;
}

export function writeSave(d: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* storage full / private mode – the game still works */
  }
}

export const bestKey = (m: Mode, d: Difficulty): `${Mode}:${Difficulty}` => `${m}:${d}`;
