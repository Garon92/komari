import type { Difficulty, Mode, MosquitoKind, PowerKind } from './game/config';
import { createStore, type Store } from './kit/store';
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
  /**
   * Realistic blood splats – opt-in for older players (default off = cartoon puffs and stars).
   * Replaces the early `blood` flag, which defaulted to true and is deliberately ignored.
   */
  gore: boolean;
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

const LEGACY_BEST = 'komari_bestScore';
const LEGACY_SWATTER = 'komari_swatter';

export function defaultSave(): SaveData {
  return {
    v: 2,
    bests: {},
    stats: { totalKills: 0, games: 0, bestCombo: 0, kindKills: {}, powers: [], playSeconds: 0 },
    achievements: {},
    prefs: { shape: 'round', color: '#60a5fa', gore: false, buzz: true, mode: 'waves', difficulty: 'normal', seenHelp: false },
  };
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
  // Old saves carried `blood: true` only because it was the default – never carry it over.
  delete (d.prefs as Partial<Prefs> & { blood?: unknown }).blood;
  if (typeof d.prefs.gore !== 'boolean') d.prefs.gore = false;
  if (typeof d.prefs.buzz !== 'boolean') d.prefs.buzz = true;
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

type StoreShape = { save: SaveData };

let store: Store<StoreShape> | null = null;

/** Kit store: `g92:komari:save` (versioned; migrates the original game's keys once). */
function getStore(): Store<StoreShape> {
  if (!store) {
    store = createStore<StoreShape>('komari', {
      version: 2,
      defaults: { save: defaultSave() },
      migrate(from, m) {
        if (from < 2) {
          const current = m.legacyJSON<unknown>('g92:komari:save');
          const base = current ? normalize(current) : defaultSave();
          m.set('save', migrateLegacy(base, m.legacy(LEGACY_BEST), m.legacy(LEGACY_SWATTER)));
          m.removeLegacy(LEGACY_BEST);
          m.removeLegacy(LEGACY_SWATTER);
        }
      },
    });
  }
  return store;
}

export function loadSave(): SaveData {
  return normalize(getStore().get('save'));
}

export function writeSave(d: SaveData): void {
  getStore().set('save', d);
}

export const bestKey = (m: Mode, d: Difficulty): `${Mode}:${Difficulty}` => `${m}:${d}`;
