import { DIFFICULTIES, SCENE_ORDER, type Difficulty, type MosquitoKind, type SceneId } from './config';
import { clamp } from './rng';

/** Everything the spawner needs to know about the current phase of the game. */
export interface SpawnSpec {
  /** Seconds between spawns. */
  interval: number;
  /** Maximum number of (non-leaving) mosquitoes on screen. */
  maxAlive: number;
  /** Relative weights of kinds to spawn. */
  weights: Partial<Record<MosquitoKind, number>>;
  /** Global speed multiplier. */
  speedMul: number;
  /** Seconds before a mosquito gets hungry and dives (Infinity = never). */
  patience: number;
  /** Chance (per spawn) of a golden mosquito. */
  goldenChance: number;
}

export interface WaveSpec extends SpawnSpec {
  index: number;
  /** Kills needed to clear the wave (boss wave: 1 = the queen). */
  quota: number;
  boss: boolean;
  bossHp: number;
  scene: SceneId;
  /** Kinds that appear for the first time in this wave (for the intro card). */
  newKinds: MosquitoKind[];
}

/** Wave at which each kind is introduced. */
export const KIND_UNLOCK: Record<MosquitoKind, number> = {
  common: 1,
  fast: 2,
  tiger: 3,
  ninja: 4,
  queen: 5,
  fat: 6,
  golden: 2,
};

export const WAVES_PER_SCENE = 5;

export const isBossWave = (n: number): boolean => n > 0 && n % WAVES_PER_SCENE === 0;

export function sceneForWave(n: number): SceneId {
  const idx = Math.floor((Math.max(1, n) - 1) / WAVES_PER_SCENE) % SCENE_ORDER.length;
  return SCENE_ORDER[idx] ?? 'kitchen';
}

export function kindWeights(n: number): Partial<Record<MosquitoKind, number>> {
  const c = n - 1;
  const w: Partial<Record<MosquitoKind, number>> = { common: 10 };
  if (n >= KIND_UNLOCK.fast) w.fast = Math.min(6, 2.5 + 0.35 * c);
  if (n >= KIND_UNLOCK.tiger) w.tiger = Math.min(6, 2.5 + 0.3 * (n - KIND_UNLOCK.tiger));
  if (n >= KIND_UNLOCK.ninja) w.ninja = Math.min(5, 2 + 0.3 * (n - KIND_UNLOCK.ninja));
  if (n >= KIND_UNLOCK.fat) w.fat = Math.min(3.5, 1.2 + 0.2 * (n - KIND_UNLOCK.fat));
  // Common ones slowly give way to the interesting kinds.
  w.common = Math.max(4, 10 - 0.4 * c);
  return w;
}

export function newKindsForWave(n: number): MosquitoKind[] {
  return (Object.keys(KIND_UNLOCK) as MosquitoKind[]).filter((k) => KIND_UNLOCK[k] === n && k !== 'golden');
}

export function waveSpec(n: number, difficulty: Difficulty): WaveSpec {
  const d = DIFFICULTIES[difficulty];
  const c = Math.max(0, n - 1);
  const boss = isBossWave(n);
  const bossNo = Math.floor(n / WAVES_PER_SCENE);
  const quota = boss ? 1 : Math.round(clamp((8 + 3 * c) * d.quotaMul, 5, 60));
  const interval = clamp((1.35 * Math.pow(0.91, c)) / d.spawnMul, 0.22, 1.6);
  const maxAlive = Math.round(clamp((5 + 1.6 * c) * d.spawnMul, 4, 28));
  const speedMul = d.speedMul * Math.min(1.55, 1 + 0.035 * c);
  const patience = d.patience * Math.max(0.62, 1 - 0.028 * c);
  const weights = boss ? { common: 6, fast: n >= 10 ? 3 : 1 } : kindWeights(n);
  return {
    index: n,
    quota,
    boss,
    bossHp: Math.round((12 + 5 * (bossNo - 1)) * d.bossHpMul),
    interval: boss ? interval * 1.6 : interval,
    maxAlive: boss ? Math.max(3, Math.round(maxAlive * 0.5)) : maxAlive,
    weights,
    speedMul,
    patience,
    goldenChance: n >= KIND_UNLOCK.golden ? 0.035 : 0,
    scene: sceneForWave(n),
    newKinds: newKindsForWave(n),
  };
}

/** Minute mode: difficulty ramps with elapsed time (0..60 s). */
export function minuteSpec(elapsed: number, difficulty: Difficulty): SpawnSpec {
  const d = DIFFICULTIES[difficulty];
  const t = clamp(elapsed / 60, 0, 1);
  const w: Partial<Record<MosquitoKind, number>> = { common: 10 - 4 * t, fast: 2 + 4 * t };
  if (elapsed > 12) w.tiger = 3 + 2 * t;
  if (elapsed > 24) w.ninja = 2.5;
  if (elapsed > 36) w.fat = 1.5;
  return {
    interval: clamp((0.75 - 0.45 * t) / d.spawnMul, 0.18, 1),
    maxAlive: Math.round((8 + 12 * t) * d.spawnMul),
    weights: w,
    speedMul: d.speedMul * (1 + 0.3 * t),
    patience: d.patience * 0.9,
    goldenChance: 0.05,
  };
}

/** Zen mode: calm, endless, density grows slowly with kills (like the original game). */
export function zenSpec(kills: number, difficulty: Difficulty): SpawnSpec {
  const d = DIFFICULTIES[difficulty];
  const w: Partial<Record<MosquitoKind, number>> = { common: 10 };
  if (kills >= 15) w.fast = 2;
  if (kills >= 30) w.tiger = 2;
  if (kills >= 50) w.ninja = 1.5;
  if (kills >= 70) w.fat = 1.5;
  return {
    interval: clamp(1.1 - kills * 0.006, 0.35, 1.1),
    maxAlive: Math.round(clamp(6 + kills * 0.12, 6, 22)),
    weights: w,
    speedMul: Math.min(d.speedMul, 1) * Math.min(1.3, 1 + kills * 0.002),
    patience: Infinity,
    goldenChance: 0.03,
  };
}

export const ZEN_KILLS_PER_SCENE = 50;

export function sceneForZen(kills: number): SceneId {
  return SCENE_ORDER[Math.floor(kills / ZEN_KILLS_PER_SCENE) % SCENE_ORDER.length] ?? 'kitchen';
}
