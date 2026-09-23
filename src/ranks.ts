/** Long-term progression: a "hunter rank" based on all mosquitoes ever swatted. */

export interface Rank {
  min: number;
  name: string;
  icon: string;
}

export const RANKS: readonly Rank[] = [
  { min: 0, name: 'Nováček', icon: '🐣' },
  { min: 25, name: 'Plácal', icon: '👋' },
  { min: 100, name: 'Lovec komárů', icon: '🎯' },
  { min: 250, name: 'Postrach komárů', icon: '😠' },
  { min: 500, name: 'Mistr plácačky', icon: '🥋' },
  { min: 1000, name: 'Legenda', icon: '🏆' },
  { min: 2500, name: 'Komáří noční můra', icon: '👻' },
];

export interface RankInfo {
  index: number;
  rank: Rank;
  next: Rank | null;
  /** 0..1 progress towards the next rank (1 when maxed). */
  progress: number;
  /** Kills still needed for the next rank (0 when maxed). */
  toNext: number;
}

export function rankFor(totalKills: number): RankInfo {
  const k = Math.max(0, Math.floor(totalKills));
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (k >= RANKS[i]!.min) index = i;
  const rank = RANKS[index]!;
  const next = RANKS[index + 1] ?? null;
  const progress = next ? (k - rank.min) / (next.min - rank.min) : 1;
  return { index, rank, next, progress, toNext: next ? next.min - k : 0 };
}
