import { describe, expect, it } from 'vitest';
import { accuracy, comboMultiplier, killPoints, multiKillBonus, multiKillLabel, nextComboStep, starsFor, waveBonus } from './scoring';

describe('scoring', () => {
  it('combo multiplier steps', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(4)).toBe(1);
    expect(comboMultiplier(5)).toBe(2);
    expect(comboMultiplier(10)).toBe(3);
    expect(comboMultiplier(20)).toBe(4);
    expect(comboMultiplier(35)).toBe(5);
    expect(comboMultiplier(500)).toBe(5);
    expect(nextComboStep(0)).toBe(5);
    expect(nextComboStep(12)).toBe(20);
    expect(nextComboStep(40)).toBeNull();
  });

  it('kill points use kind, combo and difficulty', () => {
    expect(killPoints('common', 1, 'easy')).toBe(10);
    expect(killPoints('common', 5, 'easy')).toBe(20);
    expect(killPoints('fast', 1, 'normal')).toBe(30);
    expect(killPoints('queen', 1, 'hard')).toBe(800);
    expect(killPoints('common', 1, 'easy', 15)).toBe(25);
  });

  it('multi-kill bonus and labels', () => {
    expect(multiKillBonus(1)).toBe(0);
    expect(multiKillBonus(2)).toBe(15);
    expect(multiKillBonus(3)).toBe(40);
    expect(multiKillBonus(4)).toBe(100);
    expect(multiKillLabel(1)).toBeNull();
    expect(multiKillLabel(2)).toBe('Dvojplesk!');
    expect(multiKillLabel(7)).toBe('Megaplesk!');
  });

  it('accuracy is safe with zero swats', () => {
    expect(accuracy(0, 0)).toBe(1);
    expect(accuracy(3, 4)).toBe(0.75);
    expect(accuracy(9, 4)).toBe(1);
  });

  it('wave bonus rewards clean and precise waves', () => {
    const clean = waveBonus({ wave: 3, bites: 0, swats: 10, hits: 9 }, 'easy');
    expect(clean.clear).toBe(80);
    expect(clean.flawless).toBe(100);
    expect(clean.sharp).toBe(60);
    expect(clean.total).toBe(240);
    const messy = waveBonus({ wave: 3, bites: 2, swats: 10, hits: 3 }, 'easy');
    expect(messy.flawless).toBe(0);
    expect(messy.sharp).toBe(0);
    expect(messy.total).toBe(80);
  });

  it('stars per mode', () => {
    expect(starsFor('waves', { wave: 1, score: 0, kills: 0 })).toBe(0);
    expect(starsFor('waves', { wave: 3, score: 0, kills: 0 })).toBe(1);
    expect(starsFor('waves', { wave: 6, score: 0, kills: 0 })).toBe(2);
    expect(starsFor('waves', { wave: 11, score: 0, kills: 0 })).toBe(3);
    expect(starsFor('minute', { wave: 0, score: 0, kills: 20 })).toBe(1);
    expect(starsFor('minute', { wave: 0, score: 0, kills: 60 })).toBe(3);
    expect(starsFor('zen', { wave: 0, score: 0, kills: 50 })).toBe(2);
  });
});
