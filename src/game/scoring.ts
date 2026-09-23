import { DIFFICULTIES, KINDS, type Difficulty, type Mode, type MosquitoKind } from './config';

/** Combo thresholds → multiplier. combo = number of kills in the current chain. */
export const COMBO_STEPS: ReadonlyArray<readonly [number, number]> = [
  [35, 5],
  [20, 4],
  [10, 3],
  [5, 2],
  [0, 1],
];

export function comboMultiplier(combo: number): number {
  for (const [min, mul] of COMBO_STEPS) if (combo >= min) return mul;
  return 1;
}

/** Kills needed to reach the next multiplier (null when maxed). */
export function nextComboStep(combo: number): number | null {
  let next: number | null = null;
  for (const [min] of COMBO_STEPS) if (min > combo) next = min;
  return next;
}

/** Bonus for killing several mosquitoes with a single swat. */
export function multiKillBonus(count: number): number {
  if (count >= 4) return 25 * count;
  if (count === 3) return 40;
  if (count === 2) return 15;
  return 0;
}

export function multiKillLabel(count: number): string | null {
  if (count >= 5) return 'Megaplesk!';
  if (count === 4) return 'Čtyřplesk!';
  if (count === 3) return 'Trojplesk!';
  if (count === 2) return 'Dvojplesk!';
  return null;
}

export function killPoints(kind: MosquitoKind, combo: number, difficulty: Difficulty, extra = 0): number {
  const base = KINDS[kind].points + extra;
  return Math.round(base * comboMultiplier(combo) * DIFFICULTIES[difficulty].scoreMul);
}

export interface WaveResult {
  wave: number;
  bites: number;
  swats: number;
  hits: number;
}

export function accuracy(hits: number, swats: number): number {
  return swats <= 0 ? 1 : Math.min(1, hits / swats);
}

export interface WaveBonus {
  clear: number;
  flawless: number;
  sharp: number;
  total: number;
}

export function waveBonus(r: WaveResult, difficulty: Difficulty): WaveBonus {
  const mul = DIFFICULTIES[difficulty].scoreMul;
  const clear = Math.round((50 + 10 * r.wave) * mul);
  const flawless = r.bites === 0 ? Math.round(100 * mul) : 0;
  const sharp = r.swats >= 6 && accuracy(r.hits, r.swats) >= 0.8 ? Math.round(60 * mul) : 0;
  return { clear, flawless, sharp, total: clear + flawless + sharp };
}

/** 0–3 stars for the results screen. */
export function starsFor(mode: Mode, result: { wave: number; score: number; kills: number }): number {
  if (mode === 'waves') {
    const reached = result.wave - 1; // fully cleared waves
    if (reached >= 10) return 3;
    if (reached >= 5) return 2;
    if (reached >= 2) return 1;
    return 0;
  }
  if (mode === 'minute') {
    if (result.kills >= 55) return 3;
    if (result.kills >= 35) return 2;
    if (result.kills >= 18) return 1;
    return 0;
  }
  if (result.kills >= 100) return 3;
  if (result.kills >= 50) return 2;
  if (result.kills >= 20) return 1;
  return 0;
}
