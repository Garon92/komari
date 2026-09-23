import { POWER_ORDER } from './game/config';
import type { Summary } from './game/game';
import type { SaveData } from './storage';

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', title: 'První plácnutí', desc: 'Zaplácni prvního komára.', icon: '🦟' },
  { id: 'double', title: 'Dvojplesk', desc: 'Dva komáři jednou ranou.', icon: '✌️' },
  { id: 'triple', title: 'Trojplesk', desc: 'Tři a víc komárů jednou ranou.', icon: '🎯' },
  { id: 'combo10', title: 'Na vlně', desc: 'Udělej kombo 10.', icon: '🔥' },
  { id: 'combo25', title: 'Nezastavitelný', desc: 'Udělej kombo 25.', icon: '🚀' },
  { id: 'wave5', title: 'Pátá vlna', desc: 'Dostaň se do 5. vlny.', icon: '🌊' },
  { id: 'wave10', title: 'Desátá vlna', desc: 'Dostaň se do 10. vlny.', icon: '🌙' },
  { id: 'wave15', title: 'Noční hlídka', desc: 'Dostaň se do 15. vlny.', icon: '⛺' },
  { id: 'queen', title: 'Královrah', desc: 'Poraz královnu komárů.', icon: '👑' },
  { id: 'flawless', title: 'Bez štípance', desc: 'Dokonči vlnu, aniž by tě něco štíplo.', icon: '🛡️' },
  { id: 'sharp', title: 'Ostrostřelec', desc: 'Vlna s přesností aspoň 90 % (min. 10 ran).', icon: '🎖️' },
  { id: 'electric', title: 'Elektrikář', desc: 'Zapal 10 komárů bleskem v jedné hře.', icon: '⚡' },
  { id: 'golden', title: 'Zlatokop', desc: 'Chyť zlatého komára.', icon: '✨' },
  { id: 'lastSecond', title: 'Na poslední chvíli', desc: 'Plácni komára těsně předtím, než štípne.', icon: '⏱️' },
  { id: 'revenge', title: 'Krev zpět', desc: 'Dostihni komára, který tě štípl.', icon: '❤️' },
  { id: 'ninja', title: 'Lovec nindžů', desc: 'Zaplácni celkem 10 nindža komárů.', icon: '🥷' },
  { id: 'hundred', title: 'Stovka', desc: 'Zaplácni celkem 100 komárů.', icon: '💯' },
  { id: 'thousand', title: 'Tisícovka', desc: 'Zaplácni celkem 1000 komárů.', icon: '🏆' },
  { id: 'minute40', title: 'Minutový mistr', desc: 'V Minutovce zaplácni 40 komárů.', icon: '⏰' },
  { id: 'zen100', title: 'Zenový mistr', desc: 'V Pohodě zaplácni 100 komárů v jedné hře.', icon: '🧘' },
  { id: 'collector', title: 'Sběratel', desc: 'Seber každé vylepšení aspoň jednou.', icon: '🎒' },
];

export const achievementById = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);

/** Live checks during a game (so the toast pops right away). */
export interface LiveProgress {
  kills: number;
  maxMulti: number;
  bestCombo: number;
  wave: number;
  queens: number;
  flawlessWaves: number;
  sharpWaves: number;
  chainKills: number;
  golden: number;
  lastSecond: number;
  revenge: number;
  mode: Summary['mode'];
}

export function checkLive(p: LiveProgress, save: SaveData): string[] {
  const has = (id: string) => Boolean(save.achievements[id]);
  const out: string[] = [];
  const add = (id: string, cond: boolean) => {
    if (cond && !has(id)) out.push(id);
  };
  add('first', p.kills >= 1);
  add('double', p.maxMulti >= 2);
  add('triple', p.maxMulti >= 3);
  add('combo10', p.bestCombo >= 10);
  add('combo25', p.bestCombo >= 25);
  if (p.mode === 'waves') {
    add('wave5', p.wave >= 5);
    add('wave10', p.wave >= 10);
    add('wave15', p.wave >= 15);
  }
  add('queen', p.queens >= 1);
  add('flawless', p.flawlessWaves >= 1);
  add('sharp', p.sharpWaves >= 1);
  add('electric', p.chainKills >= 10);
  add('golden', p.golden >= 1);
  add('lastSecond', p.lastSecond >= 1);
  add('revenge', p.revenge >= 1);
  return out;
}

/** Checks that need lifetime stats (after the save was updated with the game). */
export function checkLifetime(s: Summary, save: SaveData): string[] {
  const has = (id: string) => Boolean(save.achievements[id]);
  const out: string[] = [];
  const add = (id: string, cond: boolean) => {
    if (cond && !has(id)) out.push(id);
  };
  add('ninja', (save.stats.kindKills.ninja ?? 0) >= 10);
  add('hundred', save.stats.totalKills >= 100);
  add('thousand', save.stats.totalKills >= 1000);
  add('minute40', s.mode === 'minute' && s.kills >= 40);
  add('zen100', s.mode === 'zen' && s.kills >= 100);
  const needed = POWER_ORDER.filter((k) => k !== 'time' && k !== 'heart');
  add('collector', needed.every((k) => save.stats.powers.includes(k)));
  return out;
}

export function unlock(save: SaveData, ids: string[]): void {
  const now = new Date().toISOString();
  for (const id of ids) if (!save.achievements[id]) save.achievements[id] = now;
}
