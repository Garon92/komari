/** Static game data: mosquito kinds, difficulties, power-ups, modes, scenes. */

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Mode = 'waves' | 'minute' | 'zen';
export type MosquitoKind = 'common' | 'fast' | 'tiger' | 'ninja' | 'fat' | 'golden' | 'queen';
export type PowerKind = 'big' | 'electric' | 'spray' | 'lamp' | 'net' | 'frost' | 'heart' | 'time';
export type SceneId = 'kitchen' | 'garden' | 'bedroom' | 'camp';

export interface KindDef {
  name: string;
  /** Short kid-friendly description for the "new mosquito" card. */
  desc: string;
  radius: [number, number];
  speed: [number, number];
  hp: number;
  points: number;
  /** Multiplier of the wave patience (time before a mosquito dives to bite). */
  patienceMul: number;
  /** Buzz base frequency (Hz). */
  buzz: number;
  /** Can this kind get hungry and bite? */
  bites: boolean;
}

export const KINDS: Record<MosquitoKind, KindDef> = {
  common: {
    name: 'Komár',
    desc: 'Obyčejný otravný komár. Plácni ho!',
    radius: [9, 12], speed: [60, 130], hp: 1, points: 10, patienceMul: 1, buzz: 560, bites: true,
  },
  fast: {
    name: 'Rychlík',
    desc: 'Malý a hrozně rychlý. Za to je za 20 bodů.',
    radius: [7, 8.5], speed: [160, 220], hp: 1, points: 20, patienceMul: 0.9, buzz: 760, bites: true,
  },
  tiger: {
    name: 'Tygřík',
    desc: 'Pruhovaný tygří komár. Chvíli visí, pak cukne jinam – cik cak!',
    radius: [9, 11], speed: [90, 140], hp: 1, points: 25, patienceMul: 1, buzz: 640, bites: true,
  },
  ninja: {
    name: 'Nindža',
    desc: 'Umí se zneviditelnit. Hledej ho pořádně – a svítí na něj plácačka.',
    radius: [9, 11], speed: [70, 120], hp: 1, points: 30, patienceMul: 1.1, buzz: 600, bites: true,
  },
  fat: {
    name: 'Tlouštík',
    desc: 'Velký a pomalý, ale vydrží tři rány.',
    radius: [15, 18], speed: [40, 70], hp: 3, points: 50, patienceMul: 1.3, buzz: 330, bites: true,
  },
  golden: {
    name: 'Zlatý komár',
    desc: 'Vzácný! Proletí jen jednou – chyť ho a dostaneš dárek.',
    radius: [9, 10], speed: [230, 280], hp: 1, points: 100, patienceMul: 1, buzz: 900, bites: false,
  },
  queen: {
    name: 'Královna',
    desc: 'Šéfová všech komárů. Vypouští další komáry a vydrží spoustu ran.',
    radius: [30, 30], speed: [45, 60], hp: 12, points: 400, patienceMul: 1, buzz: 190, bites: false,
  },
};

export interface DifficultyDef {
  name: string;
  lives: number;
  speedMul: number;
  /** Seconds a mosquito wanders before it dives to bite. */
  patience: number;
  /** Seconds the dive (approach) takes – the reaction window. */
  dive: number;
  spawnMul: number;
  quotaMul: number;
  /** Swatter hit radius in CSS px. */
  swatRadius: number;
  missBreaksCombo: boolean;
  comboWindow: number;
  bossHpMul: number;
  /** Minimal ninja visibility (0..1). */
  ninjaMinAlpha: number;
  /** Score multiplier applied to all points (fair-ish records across difficulties). */
  scoreMul: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: {
    name: 'Snadná', lives: 5, speedMul: 0.72, patience: 13, dive: 2.8, spawnMul: 0.8, quotaMul: 0.8,
    swatRadius: 60, missBreaksCombo: false, comboWindow: 3, bossHpMul: 0.6, ninjaMinAlpha: 0.32, scoreMul: 1,
  },
  normal: {
    name: 'Normální', lives: 3, speedMul: 1, patience: 9.5, dive: 2.1, spawnMul: 1, quotaMul: 1,
    swatRadius: 48, missBreaksCombo: true, comboWindow: 2.2, bossHpMul: 1, ninjaMinAlpha: 0.14, scoreMul: 1.5,
  },
  hard: {
    name: 'Těžká', lives: 3, speedMul: 1.25, patience: 7, dive: 1.6, spawnMul: 1.25, quotaMul: 1.15,
    swatRadius: 40, missBreaksCombo: true, comboWindow: 1.8, bossHpMul: 1.4, ninjaMinAlpha: 0.06, scoreMul: 2,
  },
};

export interface ModeDef {
  name: string;
  desc: string;
}

export const MODES: Record<Mode, ModeDef> = {
  waves: { name: 'Vlny', desc: 'Vlna za vlnou, každá pátá s královnou. Nenech se poštípat!' },
  minute: { name: 'Minutovka', desc: 'Jedna minuta. Kolik jich stihneš? Štípnutí bere čas.' },
  zen: { name: 'Pohoda', desc: 'Pro nejmenší: žádné štípání, žádný spěch. Jen plácej.' },
};

export interface PowerDef {
  name: string;
  desc: string;
  /** Effect duration in seconds (0 = instant). */
  duration: number;
  color: string;
}

export const POWERS: Record<PowerKind, PowerDef> = {
  big: { name: 'Velká plácačka', desc: 'Plácačka na chvíli pořádně vyroste.', duration: 10, color: '#4fe18c' },
  electric: { name: 'Elektrická plácačka', desc: 'Zásah přeskočí bleskem na komáry okolo.', duration: 12, color: '#60a5fa' },
  spray: { name: 'Sprej', desc: 'Každá rána nechá obláček, který komáry skolí.', duration: 10, color: '#c084fc' },
  lamp: { name: 'UV lampa', desc: 'Láká komáry a sama je zapaluje. Svítí i ve tmě.', duration: 10, color: '#a78bfa' },
  net: { name: 'Síť', desc: 'Moskytiéra – komáři tě chvíli nemůžou štípnout.', duration: 15, color: '#fbbf24' },
  frost: { name: 'Mráz', desc: 'Ochladí se a komáři zpomalí.', duration: 8, color: '#7dd3fc' },
  heart: { name: 'Srdíčko', desc: 'Jeden život navíc.', duration: 0, color: '#f43f5e' },
  time: { name: 'Hodiny', desc: 'Pět vteřin navíc.', duration: 0, color: '#f59e0b' },
};

export const POWER_ORDER: PowerKind[] = ['big', 'electric', 'spray', 'lamp', 'net', 'frost', 'heart', 'time'];

export interface SceneDef {
  name: string;
  /** 0 = bright day, 1 = pitch night (darkness overlay strength). */
  darkness: number;
}

export const SCENES: Record<SceneId, SceneDef> = {
  kitchen: { name: 'Kuchyň', darkness: 0 },
  garden: { name: 'Zahrada za soumraku', darkness: 0.28 },
  bedroom: { name: 'Ložnice v noci', darkness: 0.8 },
  camp: { name: 'Stan u rybníka', darkness: 0.72 },
};

export const SCENE_ORDER: SceneId[] = ['kitchen', 'garden', 'bedroom', 'camp'];

/** Visual scale a diving mosquito reaches right before it bites. */
export const DIVE_SCALE = 2.5;
/** Extra hit radius for touch input (finger covers the target). */
export const TOUCH_BONUS = 12;
/** Minimal time between swats (ms). */
export const SWAT_COOLDOWN = 0.13;
export const MINUTE_LENGTH = 60;
export const BITE_TIME_PENALTY = 3;
export const MAX_LIVES = 6;
