import { describe, expect, it } from 'vitest';
import { RANKS, rankFor } from './ranks';

describe('ranks', () => {
  it('maps kills to ranks with progress', () => {
    expect(rankFor(0).rank.name).toBe('Nováček');
    expect(rankFor(0).toNext).toBe(25);
    expect(rankFor(24).index).toBe(0);
    expect(rankFor(25).rank.name).toBe('Plácal');
    expect(rankFor(40).progress).toBeCloseTo(0.2);
    expect(rankFor(40).toNext).toBe(60);
    expect(rankFor(99999).next).toBeNull();
    expect(rankFor(99999).progress).toBe(1);
    expect(rankFor(-5).index).toBe(0);
  });

  it('ranks are strictly increasing', () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.min).toBeGreaterThan(RANKS[i - 1]!.min);
  });
});
