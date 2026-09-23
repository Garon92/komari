import { describe, expect, it } from 'vitest';
import { hits, hitTest, nearestWithin, proximity } from './hit';

describe('hit testing', () => {
  it('counts a hit when the swat overlaps 60 % of the body', () => {
    expect(hits(0, 0, 40, { x: 45, y: 0, r: 10 })).toBe(true); // 40 + 6 = 46 ≥ 45
    expect(hits(0, 0, 40, { x: 47, y: 0, r: 10 })).toBe(false);
    expect(hits(0, 0, 40, { x: 30, y: 30, r: 10 })).toBe(true);
  });

  it('bigger (diving) mosquitoes are easier to hit', () => {
    expect(hits(0, 0, 40, { x: 55, y: 0, r: 10 })).toBe(false);
    expect(hits(0, 0, 40, { x: 55, y: 0, r: 25 })).toBe(true);
  });

  it('hitTest returns nearest first and respects the filter', () => {
    const t = [
      { x: 30, y: 0, r: 10, alive: true },
      { x: 5, y: 0, r: 10, alive: true },
      { x: 200, y: 0, r: 10, alive: true },
      { x: 1, y: 1, r: 10, alive: false },
    ];
    expect(hitTest(0, 0, 40, t)).toEqual([3, 1, 0]);
    expect(hitTest(0, 0, 40, t, (m) => m.alive)).toEqual([1, 0]);
    expect(hitTest(500, 500, 40, t)).toEqual([]);
  });

  it('nearestWithin excludes and limits', () => {
    const t = [
      { x: 10, y: 0, r: 5 },
      { x: 20, y: 0, r: 5 },
      { x: 30, y: 0, r: 5 },
      { x: 300, y: 0, r: 5 },
    ];
    expect(nearestWithin(0, 0, 100, t, 2)).toEqual([0, 1]);
    expect(nearestWithin(0, 0, 100, t, 5, new Set([0]))).toEqual([1, 2]);
    expect(nearestWithin(0, 0, 25, t, 5)).toEqual([0, 1]);
  });

  it('proximity falls off linearly', () => {
    expect(proximity(0, 0, 0, 0, 100)).toBe(1);
    expect(proximity(50, 0, 0, 0, 100)).toBeCloseTo(0.5);
    expect(proximity(150, 0, 0, 0, 100)).toBe(0);
  });
});
