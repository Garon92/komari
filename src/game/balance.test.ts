/**
 * Balance simulation with human-like bots. Skipped by default; run with
 *   BALANCE=1 npx vitest run src/game/balance.test.ts
 */
import { describe, it } from 'vitest';
import type { Difficulty, Mode } from './config';
import { Game } from './game';
import { mulberry32, type Rng } from './rng';

interface Profile {
  name: string;
  /** Reaction delay range (s) between deciding and clicking. */
  delay: [number, number];
  /** Aim error sigma (px). */
  sigma: number;
  /** Chance to notice a faint ninja. */
  ninjaEye: number;
  /** Pause between swats (s). */
  gap: [number, number];
}

const PROFILES: Profile[] = [
  { name: 'dítě', delay: [0.55, 0.9], sigma: 16, ninjaEye: 0.35, gap: [0.25, 0.6] },
  { name: 'běžný', delay: [0.35, 0.6], sigma: 11, ninjaEye: 0.55, gap: [0.15, 0.35] },
  { name: 'zkušený', delay: [0.22, 0.38], sigma: 7, ninjaEye: 0.8, gap: [0.08, 0.2] },
];

const gauss = (rng: Rng) => {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function simulate(mode: Mode, diff: Difficulty, p: Profile, seed: number, maxTime = 900) {
  const g = new Game(mulberry32(seed));
  const bot = mulberry32(seed * 7 + 1);
  g.setRect({ x: 6, y: 60, w: 1280, h: 740 });
  g.start(mode, diff);
  const dt = 1 / 60;
  let t = 0;
  let cursor = { x: 640, y: 400 };
  let pending: { at: number; x: number; y: number } | null = null;
  let nextDecision = 0.5;
  while (g.phase !== 'over' && t < maxTime) {
    g.update(dt);
    g.drainEvents();
    t += dt;
    if (pending && t >= pending.at) {
      g.swat(pending.x, pending.y, false);
      cursor = { x: pending.x, y: pending.y };
      pending = null;
      nextDecision = t + p.gap[0] + bot() * (p.gap[1] - p.gap[0]);
    }
    if (!pending && t >= nextDecision && (g.phase === 'playing' || g.phase === 'clear' || g.phase === 'dying')) {
      const visible = g.mosquitoes.filter((m) => !m.dead && m.state !== 'enter' && (m.kind !== 'ninja' || m.alpha > 0.5 || bot() < p.ninjaEye));
      const bubble = g.bubbles[0];
      const divers = visible.filter((m) => m.state === 'dive' && m.dive > 0.25);
      let target: { x: number; y: number; speed: number } | null = null;
      if (bubble && bot() < 0.7) target = { x: bubble.x, y: bubble.y, speed: 10 };
      else if (divers.length) target = { x: divers[0]!.x, y: divers[0]!.y, speed: 20 };
      else if (visible.length) {
        visible.sort((a, b) => Math.hypot(a.x - cursor.x, a.y - cursor.y) - Math.hypot(b.x - cursor.x, b.y - cursor.y));
        const m = visible[0]!;
        target = { x: m.x, y: m.y, speed: m.speed };
      }
      if (target) {
        const delay = p.delay[0] + bot() * (p.delay[1] - p.delay[0]);
        const err = p.sigma + target.speed * 0.03;
        pending = { at: t + delay, x: target.x + gauss(bot) * err, y: target.y + gauss(bot) * err };
      } else {
        nextDecision = t + 0.2;
      }
    }
  }
  return g.summary();
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe.skipIf(!env.BALANCE)('balance', () => {
  it('prints outcome tables', () => {
    const rows: string[] = [];
    for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
      for (const p of PROFILES) {
        const res = Array.from({ length: 12 }, (_, i) => simulate('waves', diff, p, 100 + i));
        const waves = res.map((r) => r.wave).sort((a, b) => a - b);
        const med = waves[Math.floor(waves.length / 2)];
        const avgScore = Math.round(res.reduce((s, r) => s + r.score, 0) / res.length);
        const acc = Math.round((res.reduce((s, r) => s + r.accuracy, 0) / res.length) * 100);
        const stars = res.reduce((s, r) => s + r.stars, 0) / res.length;
        const dur = Math.round(res.reduce((s, r) => s + r.duration, 0) / res.length);
        rows.push(`${diff.padEnd(7)} ${p.name.padEnd(8)} vlna med ${String(med).padStart(2)} (min ${waves[0]}, max ${waves[waves.length - 1]})  skóre ⌀ ${String(avgScore).padStart(6)}  přesnost ${acc} %  hvězdy ⌀ ${stars.toFixed(1)}  délka ⌀ ${dur} s`);
      }
    }
    for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
      for (const p of PROFILES) {
        const res = Array.from({ length: 8 }, (_, i) => simulate('minute', diff, p, 300 + i));
        const kills = Math.round(res.reduce((s, r) => s + r.kills, 0) / res.length);
        const stars = res.reduce((s, r) => s + r.stars, 0) / res.length;
        rows.push(`minuta ${diff.padEnd(7)} ${p.name.padEnd(8)} zaplácnuto ⌀ ${kills}  hvězdy ⌀ ${stars.toFixed(1)}`);
      }
    }
    (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`${rows.join("\n")}\n`);
  }, 600_000);
});
