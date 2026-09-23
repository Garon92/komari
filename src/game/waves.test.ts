import { describe, expect, it } from 'vitest';
import { SCENE_ORDER } from './config';
import { isBossWave, KIND_UNLOCK, kindWeights, minuteSpec, newKindsForWave, sceneForWave, sceneForZen, waveSpec, zenSpec } from './waves';

describe('waves', () => {
  it('every fifth wave is a boss wave with quota 1', () => {
    for (let n = 1; n <= 30; n++) {
      const s = waveSpec(n, 'normal');
      expect(s.boss).toBe(n % 5 === 0);
      expect(isBossWave(n)).toBe(n % 5 === 0);
      if (s.boss) expect(s.quota).toBe(1);
    }
  });

  it('difficulty ramps up: bigger quota, faster spawns, less patience', () => {
    const a = waveSpec(1, 'normal');
    const b = waveSpec(9, 'normal');
    expect(b.quota).toBeGreaterThan(a.quota);
    expect(b.interval).toBeLessThan(a.interval);
    expect(b.maxAlive).toBeGreaterThan(a.maxAlive);
    expect(b.patience).toBeLessThan(a.patience);
    expect(b.speedMul).toBeGreaterThan(a.speedMul);
  });

  it('stays within sane bounds even very late', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = waveSpec(99, d);
      expect(s.quota).toBeLessThanOrEqual(60);
      expect(s.maxAlive).toBeLessThanOrEqual(28);
      expect(s.interval).toBeGreaterThanOrEqual(0.22);
      expect(s.patience).toBeGreaterThan(3);
      expect(s.speedMul).toBeLessThan(2.1);
    }
  });

  it('easy is gentler than hard', () => {
    const e = waveSpec(4, 'easy');
    const h = waveSpec(4, 'hard');
    expect(e.quota).toBeLessThan(h.quota);
    expect(e.patience).toBeGreaterThan(h.patience);
    expect(e.speedMul).toBeLessThan(h.speedMul);
    expect(e.bossHp).toBeLessThan(waveSpec(5, 'hard').bossHp + 1);
  });

  it('introduces kinds progressively', () => {
    expect(Object.keys(kindWeights(1))).toEqual(['common']);
    expect(kindWeights(2).fast).toBeGreaterThan(0);
    expect(kindWeights(2).tiger).toBeUndefined();
    expect(kindWeights(KIND_UNLOCK.ninja).ninja).toBeGreaterThan(0);
    expect(kindWeights(KIND_UNLOCK.fat).fat).toBeGreaterThan(0);
    expect(newKindsForWave(2)).toEqual(['fast']);
    expect(newKindsForWave(5)).toEqual(['queen']);
    expect(newKindsForWave(7)).toEqual([]);
  });

  it('cycles scenes every five waves', () => {
    expect(sceneForWave(1)).toBe('kitchen');
    expect(sceneForWave(5)).toBe('kitchen');
    expect(sceneForWave(6)).toBe('garden');
    expect(sceneForWave(11)).toBe('bedroom');
    expect(sceneForWave(16)).toBe('camp');
    expect(sceneForWave(21)).toBe(SCENE_ORDER[0]);
    expect(sceneForZen(0)).toBe('kitchen');
    expect(sceneForZen(50)).toBe('garden');
  });

  it('minute mode speeds up over time; zen never bites', () => {
    expect(minuteSpec(50, 'normal').interval).toBeLessThan(minuteSpec(0, 'normal').interval);
    expect(minuteSpec(30, 'normal').weights.ninja).toBeGreaterThan(0);
    expect(zenSpec(0, 'normal').patience).toBe(Infinity);
    expect(zenSpec(200, 'normal').maxAlive).toBeLessThanOrEqual(22);
  });
});
