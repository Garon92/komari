/** Tiny seedable PRNG helpers (deterministic in tests, Math.random in the game). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function pickWeighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K | null {
  let total = 0;
  for (const k in weights) total += Math.max(0, weights[k] ?? 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  let last: K | null = null;
  for (const k in weights) {
    const w = Math.max(0, weights[k] ?? 0);
    if (w <= 0) continue;
    last = k;
    if (roll < w) return k;
    roll -= w;
  }
  return last;
}

/** Shortest signed angle from a to b (radians). */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
