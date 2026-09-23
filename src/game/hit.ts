/** Pure hit testing helpers. */

export interface Circle {
  x: number;
  y: number;
  /** Radius of the target (already scaled). */
  r: number;
}

/**
 * Returns true when a swat at (sx, sy) with radius `swatR` hits the target.
 * A target counts as hit when the swat circle overlaps a generous part of its body
 * (60 % of its radius) – forgiving for kids but not silly.
 */
export function hits(sx: number, sy: number, swatR: number, t: Circle): boolean {
  const reach = swatR + t.r * 0.6;
  const dx = t.x - sx;
  const dy = t.y - sy;
  return dx * dx + dy * dy <= reach * reach;
}

/** Indices of all targets hit by the swat, nearest first. */
export function hitTest<T extends Circle>(sx: number, sy: number, swatR: number, targets: readonly T[], filter?: (t: T) => boolean): number[] {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (filter && !filter(t)) continue;
    if (hits(sx, sy, swatR, t)) out.push([i, (t.x - sx) ** 2 + (t.y - sy) ** 2]);
  }
  out.sort((a, b) => a[1] - b[1]);
  return out.map((o) => o[0]);
}

/** Up to `max` nearest targets within `range` of (x, y), excluding indices in `exclude`. */
export function nearestWithin<T extends Circle>(x: number, y: number, range: number, targets: readonly T[], max: number, exclude: ReadonlySet<number> = new Set(), filter?: (t: T) => boolean): number[] {
  const cand: Array<[number, number]> = [];
  for (let i = 0; i < targets.length; i++) {
    if (exclude.has(i)) continue;
    const t = targets[i]!;
    if (filter && !filter(t)) continue;
    const d2 = (t.x - x) ** 2 + (t.y - y) ** 2;
    if (d2 <= range * range) cand.push([i, d2]);
  }
  cand.sort((a, b) => a[1] - b[1]);
  return cand.slice(0, max).map((c) => c[0]);
}

/** Proximity 0..1 (1 = on top of the listener, 0 = at or beyond `range`). */
export function proximity(x: number, y: number, lx: number, ly: number, range: number): number {
  const d = Math.hypot(x - lx, y - ly);
  return d >= range ? 0 : 1 - d / range;
}
