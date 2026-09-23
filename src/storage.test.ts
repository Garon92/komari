import { describe, expect, it } from 'vitest';
import { checkLifetime, checkLive, unlock } from './achievements';
import type { Summary } from './game/game';
import { defaultSave, migrateLegacy, normalize } from './storage';

describe('save data', () => {
  it('normalizes garbage into defaults', () => {
    expect(normalize(null)).toEqual(defaultSave());
    expect(normalize('x')).toEqual(defaultSave());
    const n = normalize({ prefs: { shape: 'triangle', color: 'red', mode: 'nope', difficulty: 'hard' } });
    expect(n.prefs.shape).toBe('round');
    expect(n.prefs.color).toBe('#60a5fa');
    expect(n.prefs.mode).toBe('waves');
    expect(n.prefs.difficulty).toBe('hard');
  });

  it('migrates the original game keys', () => {
    const d = migrateLegacy(defaultSave(), '57', JSON.stringify({ type: 'square', color: '#ff0000' }));
    expect(d.bests['zen:normal']?.kills).toBe(57);
    expect(d.prefs.shape).toBe('square');
    expect(d.prefs.color).toBe('#ff0000');
    const e = migrateLegacy(defaultSave(), null, 'not json');
    expect(e.bests).toEqual({});
    expect(e.prefs.shape).toBe('round');
  });
});

describe('achievements', () => {
  const base = {
    kills: 0, maxMulti: 0, bestCombo: 0, wave: 0, queens: 0, flawlessWaves: 0, sharpWaves: 0,
    chainKills: 0, golden: 0, lastSecond: 0, revenge: 0, mode: 'waves' as const,
  };

  it('unlocks live achievements once', () => {
    const save = defaultSave();
    const found = checkLive({ ...base, kills: 1, maxMulti: 3, bestCombo: 12, wave: 5 }, save);
    expect(found).toEqual(expect.arrayContaining(['first', 'double', 'triple', 'combo10', 'wave5']));
    expect(found).not.toContain('combo25');
    unlock(save, found);
    expect(checkLive({ ...base, kills: 5, maxMulti: 3, bestCombo: 12, wave: 5 }, save)).toEqual([]);
  });

  it('wave achievements only count in waves mode', () => {
    expect(checkLive({ ...base, wave: 12, mode: 'zen' }, defaultSave())).not.toContain('wave10');
  });

  it('lifetime achievements use stats', () => {
    const save = defaultSave();
    save.stats.totalKills = 120;
    save.stats.kindKills.ninja = 11;
    save.stats.powers = ['big', 'electric', 'spray', 'lamp', 'net', 'frost'];
    const s = { mode: 'minute', kills: 41 } as Summary;
    expect(checkLifetime(s, save)).toEqual(expect.arrayContaining(['hundred', 'ninja', 'minute40', 'collector']));
  });
});
