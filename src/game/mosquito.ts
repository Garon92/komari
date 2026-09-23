import { DIVE_SCALE, KINDS, type MosquitoKind } from './config';
import { angleDiff, between, clamp, type Rng } from './rng';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MosquitoState = 'enter' | 'fly' | 'dive' | 'leave';

export interface Mosquito {
  id: number;
  kind: MosquitoKind;
  x: number;
  y: number;
  /** Body radius (unscaled). */
  r: number;
  heading: number;
  speed: number;
  hp: number;
  maxHp: number;
  state: MosquitoState;
  /** Seconds left before diving (Infinity = never). */
  patience: number;
  /** Dive progress 0..1. */
  dive: number;
  diveDuration: number;
  /** Visual scale (1 = normal, grows while diving). */
  scale: number;
  wing: number;
  flapSpeed: number;
  age: number;
  jitterT: number;
  /** Behaviour sub-state timer / flag (tiger: 0 = hover, 1 = dart). */
  mode: number;
  modeT: number;
  /** Visibility 0..1 (ninja cloak). */
  alpha: number;
  phase: number;
  /** Flash timer after a non-lethal hit. */
  hurtT: number;
  /** Knock-back velocity. */
  kx: number;
  ky: number;
  /** Full of blood after a bite – worth a revenge swat. */
  fed: boolean;
  /** Minion spawn timer (queen). */
  spawnT: number;
  /** Golden mosquito: direction of travel (+1 → right, -1 → left) and baseline y. */
  dir: number;
  baseY: number;
  /** Angry speed boost timer (after being hit). */
  angryT: number;
  dead: boolean;
}

let nextId = 1;

export interface SpawnOptions {
  speedMul: number;
  patience: number;
  diveDuration: number;
  hp?: number;
  /** Spawn at this position instead of off-screen (queen minions). */
  at?: { x: number; y: number };
}

/** Creates a mosquito just outside the play rect, heading inwards. */
export function createMosquito(kind: MosquitoKind, rect: Rect, rng: Rng, opt: SpawnOptions): Mosquito {
  const def = KINDS[kind];
  const r = between(rng, def.radius[0], def.radius[1]);
  const speed = between(rng, def.speed[0], def.speed[1]) * opt.speedMul;
  const m: Mosquito = {
    id: nextId++,
    kind,
    x: 0,
    y: 0,
    r,
    heading: 0,
    speed,
    hp: opt.hp ?? def.hp,
    maxHp: opt.hp ?? def.hp,
    state: 'enter',
    patience: def.bites ? opt.patience * def.patienceMul * between(rng, 0.85, 1.2) : Infinity,
    dive: 0,
    diveDuration: opt.diveDuration * (kind === 'fat' ? 1.25 : 1),
    scale: 1,
    wing: rng() * Math.PI * 2,
    flapSpeed: kind === 'queen' ? 11 : kind === 'fat' ? 14 : between(rng, 18, 28),
    age: 0,
    jitterT: between(rng, 0.15, 0.8),
    mode: 0,
    modeT: between(rng, 0.3, 0.8),
    alpha: 1,
    phase: rng() * Math.PI * 2,
    hurtT: 0,
    kx: 0,
    ky: 0,
    fed: false,
    spawnT: 3,
    dir: 1,
    baseY: 0,
    angryT: 0,
    dead: false,
  };

  if (opt.at) {
    m.x = opt.at.x;
    m.y = opt.at.y;
    m.heading = rng() * Math.PI * 2;
    m.state = 'fly';
    return m;
  }

  if (kind === 'golden') {
    m.dir = rng() < 0.5 ? 1 : -1;
    m.x = m.dir > 0 ? rect.x - 40 : rect.x + rect.w + 40;
    m.baseY = between(rng, rect.y + rect.h * 0.2, rect.y + rect.h * 0.8);
    m.y = m.baseY;
    m.heading = m.dir > 0 ? 0 : Math.PI;
    m.state = 'fly';
    return m;
  }

  // Pick a spot on a random edge, slightly outside the rect.
  const edge = Math.floor(rng() * 4);
  const out = 30 + r * 2;
  if (edge === 0) { m.x = rect.x - out; m.y = between(rng, rect.y, rect.y + rect.h); }
  else if (edge === 1) { m.x = rect.x + rect.w + out; m.y = between(rng, rect.y, rect.y + rect.h); }
  else if (edge === 2) { m.x = between(rng, rect.x, rect.x + rect.w); m.y = rect.y - out; }
  else { m.x = between(rng, rect.x, rect.x + rect.w); m.y = rect.y + rect.h + out; }
  if (kind === 'queen') { m.x = rect.x + rect.w / 2; m.y = rect.y - out; }
  const tx = between(rng, rect.x + rect.w * 0.2, rect.x + rect.w * 0.8);
  const ty = between(rng, rect.y + rect.h * 0.2, rect.y + rect.h * (kind === 'queen' ? 0.5 : 0.8));
  m.heading = Math.atan2(ty - m.y, tx - m.x);
  return m;
}

export const inside = (m: { x: number; y: number }, rect: Rect, pad = 0): boolean =>
  m.x >= rect.x + pad && m.x <= rect.x + rect.w - pad && m.y >= rect.y + pad && m.y <= rect.y + rect.h - pad;

/** Turn smoothly towards a heading. */
function steerTo(m: Mosquito, target: number, rate: number, dt: number): void {
  const d = angleDiff(m.heading, target);
  const step = rate * dt;
  m.heading += clamp(d, -step, step);
}

/** Soft steering that keeps the mosquito inside the rect. */
function keepInside(m: Mosquito, rect: Rect, dt: number): void {
  const margin = Math.min(80, rect.w * 0.15, rect.h * 0.15);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const nearEdge = m.x < rect.x + margin || m.x > rect.x + rect.w - margin || m.y < rect.y + margin || m.y > rect.y + rect.h - margin;
  if (nearEdge) steerTo(m, Math.atan2(cy - m.y, cx - m.x), 4.5, dt);
  // Hard limits as a fallback.
  const pad = m.r;
  if (m.x < rect.x + pad) { m.x = rect.x + pad; m.heading = Math.PI - m.heading; }
  else if (m.x > rect.x + rect.w - pad) { m.x = rect.x + rect.w - pad; m.heading = Math.PI - m.heading; }
  if (m.y < rect.y + pad) { m.y = rect.y + pad; m.heading = -m.heading; }
  else if (m.y > rect.y + rect.h - pad) { m.y = rect.y + rect.h - pad; m.heading = -m.heading; }
}

export interface WorldForces {
  /** Global speed factor (frost). */
  slow: number;
  /** Attractor (UV lamp). */
  lamp: { x: number; y: number; range: number } | null;
}

/** Nearest exit point heading for a leaving mosquito. */
function exitHeading(m: Mosquito, rect: Rect): number {
  const dl = m.x - rect.x;
  const dr = rect.x + rect.w - m.x;
  const dtp = m.y - rect.y;
  const db = rect.y + rect.h - m.y;
  const min = Math.min(dl, dr, dtp, db);
  if (min === dl) return Math.PI;
  if (min === dr) return 0;
  if (min === dtp) return -Math.PI / 2;
  return Math.PI / 2;
}

/**
 * Advances one mosquito. Returns 'bite' when a dive completes, 'gone' when it left the screen.
 */
export function updateMosquito(m: Mosquito, dt: number, rect: Rect, rng: Rng, f: WorldForces): 'bite' | 'gone' | null {
  m.age += dt;
  const slow = f.slow;
  m.wing += dt * m.flapSpeed * Math.PI * 2 * (0.5 + 0.5 * slow);
  if (m.hurtT > 0) m.hurtT = Math.max(0, m.hurtT - dt);
  if (m.angryT > 0) m.angryT = Math.max(0, m.angryT - dt);

  // Knock-back decays quickly.
  if (m.kx !== 0 || m.ky !== 0) {
    m.x += m.kx * dt;
    m.y += m.ky * dt;
    const decay = Math.exp(-8 * dt);
    m.kx *= decay;
    m.ky *= decay;
    if (Math.abs(m.kx) + Math.abs(m.ky) < 2) { m.kx = 0; m.ky = 0; }
  }

  let speed = m.speed * slow * (m.angryT > 0 ? 1.6 : 1);

  if (m.state === 'leave') {
    steerTo(m, exitHeading(m, rect), 5, dt);
    const s = (m.fed ? 95 : Math.max(220, m.speed * 1.8)) * slow;
    m.x += Math.cos(m.heading) * s * dt;
    m.y += Math.sin(m.heading) * s * dt + (m.fed ? Math.sin(m.age * 5) * 20 * dt : 0);
    if (m.scale > 1) m.scale = Math.max(1, m.scale - dt * 2.5);
    if (!inside(m, rect, -80)) return 'gone';
    return null;
  }

  if (m.state === 'dive') {
    m.dive += (dt / m.diveDuration) * slow;
    const e = m.dive * m.dive;
    m.scale = 1 + (DIVE_SCALE - 1) * e;
    // Hover in place with a nervous jitter.
    m.jitterT -= dt;
    if (m.jitterT <= 0) {
      m.jitterT = between(rng, 0.08, 0.2);
      m.heading = rng() * Math.PI * 2;
    }
    const hs = 28 * slow * (1 - m.dive * 0.7);
    m.x += Math.cos(m.heading) * hs * dt;
    m.y += Math.sin(m.heading) * hs * dt;
    keepInside(m, rect, dt);
    if (m.dive >= 1) return 'bite';
    return null;
  }

  if (m.kind === 'golden') {
    m.x += m.dir * speed * dt;
    m.y = m.baseY + Math.sin(m.age * 3.2 + m.phase) * 40;
    m.heading = m.dir > 0 ? Math.cos(m.age * 3.2 + m.phase) * 0.5 : Math.PI - Math.cos(m.age * 3.2 + m.phase) * 0.5;
    if ((m.dir > 0 && m.x > rect.x + rect.w + 60) || (m.dir < 0 && m.x < rect.x - 60)) return 'gone';
    return null;
  }

  // Patience runs out → dive.
  if (m.state === 'fly' && Number.isFinite(m.patience)) {
    m.patience -= dt * slow;
    if (m.patience <= 0) {
      m.state = 'dive';
      m.dive = 0;
      m.jitterT = 0;
      return null;
    }
  }

  if (m.state === 'enter') {
    // Fly in towards the middle; start behaving normally once inside.
    steerTo(m, Math.atan2(rect.y + rect.h / 2 - m.y, rect.x + rect.w / 2 - m.x), 1.6, dt);
    const s = Math.max(speed, 90 * slow);
    m.x += Math.cos(m.heading) * s * dt;
    m.y += Math.sin(m.heading) * s * dt;
    if (inside(m, rect, m.r + 6) || m.age > 8) m.state = 'fly';
    return null;
  }

  // Behaviour per kind.
  switch (m.kind) {
    case 'tiger': {
      m.modeT -= dt;
      if (m.modeT <= 0) {
        if (m.mode === 0) {
          m.mode = 1;
          m.modeT = between(rng, 0.18, 0.32);
          m.heading += (rng() < 0.5 ? -1 : 1) * between(rng, 1.0, 2.1);
        } else {
          m.mode = 0;
          m.modeT = between(rng, 0.3, 0.75);
        }
      }
      speed *= m.mode === 1 ? 2.6 : 0.22;
      if (m.mode === 0) m.heading += Math.sin(m.age * 20 + m.phase) * 3 * dt;
      break;
    }
    case 'ninja': {
      // Cloak cycle: mostly faint, briefly visible.
      const s = 0.5 + 0.5 * Math.sin(m.age * 1.4 + m.phase);
      m.alpha = clamp((s - 0.45) / 0.4, 0, 1);
      wander(m, dt, rng, 0.9);
      break;
    }
    case 'queen': {
      wander(m, dt, rng, 0.5);
      break;
    }
    case 'fat': {
      wander(m, dt, rng, 0.6);
      break;
    }
    case 'fast': {
      wander(m, dt, rng, 1.5);
      break;
    }
    default:
      wander(m, dt, rng, 1);
  }

  if (f.lamp && m.kind !== 'queen') {
    const d = Math.hypot(f.lamp.x - m.x, f.lamp.y - m.y);
    if (d < f.lamp.range) steerTo(m, Math.atan2(f.lamp.y - m.y, f.lamp.x - m.x), 3.2, dt);
  }

  m.x += Math.cos(m.heading) * speed * dt;
  m.y += Math.sin(m.heading) * speed * dt;
  if (m.state === 'fly') {
    if (m.kind === 'queen') keepInside(m, { x: rect.x, y: rect.y, w: rect.w, h: rect.h * 0.7 }, dt);
    else keepInside(m, rect, dt);
  }
  return null;
}

function wander(m: Mosquito, dt: number, rng: Rng, nervous: number): void {
  m.jitterT -= dt;
  if (m.jitterT <= 0) {
    m.jitterT = between(rng, 0.2, 0.9) / nervous;
    m.heading += between(rng, -1, 1) * 0.6 * nervous;
  }
  m.heading += Math.sin(m.age * 5 + m.phase) * 1.1 * dt;
}

/** Radius used for hit testing (grows while diving). */
export const hitRadius = (m: Mosquito): number => m.r * m.scale * (m.kind === 'queen' ? 1.25 : 1);
