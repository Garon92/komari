import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from './config';
import { Game, type GameEvent } from './game';
import { createMosquito, updateMosquito } from './mosquito';
import { mulberry32 } from './rng';

const RECT = { x: 0, y: 60, w: 1000, h: 700 };

function newGame(seed = 1): Game {
  const g = new Game(mulberry32(seed));
  g.setRect(RECT);
  return g;
}

function step(g: Game, seconds: number, dt = 1 / 60): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += dt) {
    g.update(dt);
    events.push(...g.drainEvents());
  }
  return events;
}

function until(g: Game, cond: () => boolean, maxSeconds = 60, dt = 1 / 60): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < maxSeconds && !cond(); t += dt) {
    g.update(dt);
    events.push(...g.drainEvents());
  }
  return events;
}

/** Swats the first visible mosquito (waits out the cooldown). */
function swatOne(g: Game, touch = false): boolean {
  const m = g.mosquitoes.find((q) => q.state === 'fly' || q.state === 'dive');
  if (!m) return false;
  step(g, 0.2);
  const target = g.mosquitoes.find((q) => q.id === m.id);
  if (!target) return false;
  g.swat(target.x, target.y, touch);
  return true;
}

describe('game flow', () => {
  it('starts wave 1 with an intro, then spawns mosquitoes', () => {
    const g = newGame();
    g.start('waves', 'normal');
    expect(g.phase).toBe('intro');
    expect(g.wave).toBe(1);
    expect(g.lives).toBe(DIFFICULTIES.normal.lives);
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'waveStart')).toBe(true);
    until(g, () => g.phase === 'playing');
    until(g, () => g.mosquitoes.some((m) => m.state === 'fly'), 20);
    expect(g.mosquitoes.length).toBeGreaterThan(0);
  });

  it('swatting a mosquito kills it, scores and builds a combo', () => {
    const g = newGame(2);
    g.start('waves', 'easy');
    until(g, () => g.mosquitoes.some((m) => m.state === 'fly'), 30);
    expect(swatOne(g)).toBe(true);
    const ev = g.drainEvents();
    const kill = ev.find((e) => e.type === 'kill');
    expect(kill).toBeDefined();
    expect(g.kills).toBe(1);
    expect(g.combo).toBe(1);
    expect(g.score).toBeGreaterThan(0);
  });

  it('a miss breaks the combo on normal but not on easy', () => {
    for (const [diff, expected] of [['normal', 0], ['easy', 1]] as const) {
      const g = newGame(3);
      g.start('waves', diff);
      until(g, () => g.mosquitoes.some((m) => m.state === 'fly'), 30);
      swatOne(g);
      expect(g.combo).toBe(1);
      step(g, 0.2);
      g.swat(-500, -500); // nothing there
      expect(g.combo).toBe(expected);
    }
  });

  it('clears a wave after the quota and moves on', () => {
    const g = newGame(4);
    g.start('waves', 'easy');
    let guard = 0;
    while (g.wave === 1 && guard++ < 4000) {
      if (g.phase === 'playing') swatOne(g);
      step(g, 0.05);
    }
    expect(g.wave).toBe(2);
    expect(g.kills).toBeGreaterThanOrEqual(g.quota > 0 ? 6 : 0);
  });

  it('an ignored mosquito dives, bites and costs a life', () => {
    const g = newGame(5);
    g.start('waves', 'normal');
    const ev = until(g, () => g.bites > 0, 60);
    expect(ev.some((e) => e.type === 'dive')).toBe(true);
    expect(ev.some((e) => e.type === 'bite' && !e.blocked)).toBe(true);
    expect(g.lives).toBeLessThan(DIFFICULTIES.normal.lives);
    expect(g.welts.length).toBeGreaterThan(0);
  });

  it('runs out of lives → dying → game over with a summary', () => {
    const g = newGame(6);
    g.start('waves', 'hard');
    const ev = until(g, () => g.phase === 'over', 240);
    expect(g.phase).toBe('over');
    const over = ev.find((e) => e.type === 'gameOver');
    expect(over && over.type === 'gameOver' && over.summary.bites).toBeGreaterThanOrEqual(DIFFICULTIES.hard.lives);
  });

  it('the net blocks bites', () => {
    const g = newGame(7);
    g.start('waves', 'normal');
    g.powers.net = 999;
    const ev = until(g, () => g.drainEvents().length < 0, 40); // run 40 s
    void ev;
    expect(g.lives).toBe(DIFFICULTIES.normal.lives);
  });

  it('swatting the mosquito that bit you gives the life back', () => {
    const g = newGame(8);
    g.start('waves', 'normal');
    until(g, () => g.bites > 0, 60);
    const livesAfterBite = g.lives;
    const fed = g.mosquitoes.find((m) => m.fed && !m.dead);
    expect(fed).toBeDefined();
    step(g, 0.2);
    const again = g.mosquitoes.find((m) => m.id === fed!.id);
    if (again) {
      g.swat(again.x, again.y);
      expect(g.lives).toBe(Math.min(g.maxLives, livesAfterBite + 1));
      expect(g.stats.revenge).toBe(1);
    }
  });

  it('zen mode never bites and can be finished', () => {
    const g = newGame(9);
    g.start('zen', 'normal');
    step(g, 60);
    expect(g.bites).toBe(0);
    expect(g.mosquitoes.every((m) => m.state !== 'dive')).toBe(true);
    g.finish();
    expect(g.phase).toBe('over');
  });

  it('minute clock waits for the countdown (holdIntro)', () => {
    const g = newGame(15);
    g.start('minute', 'normal');
    g.holdIntro = true;
    step(g, 4);
    expect(g.phase).toBe('intro');
    expect(g.timeLeft).toBe(60);
    expect(g.mosquitoes.length).toBe(0);
    g.holdIntro = false;
    step(g, 0.05);
    expect(g.phase).toBe('playing');
  });

  it('mosquitoes never enter through the HUD strip at the top', () => {
    const rng = mulberry32(31);
    for (let i = 0; i < 200; i++) {
      for (const kind of ['common', 'fast', 'queen'] as const) {
        const m = createMosquito(kind, RECT, rng, { speedMul: 1, patience: 99, diveDuration: 2 });
        expect(m.y).toBeGreaterThanOrEqual(RECT.y);
      }
    }
  });

  it('minute mode ends when the time is up', () => {
    const g = newGame(10);
    g.start('minute', 'normal');
    const ev = until(g, () => g.phase === 'over', 80);
    expect(g.phase).toBe('over');
    expect(ev.filter((e) => e.type === 'tick').length).toBeGreaterThanOrEqual(5);
  });

  it('boss wave spawns the queen; killing her clears the wave', () => {
    const g = newGame(11);
    g.start('waves', 'easy');
    g.jumpToWave(5);
    until(g, () => g.mosquitoes.some((m) => m.kind === 'queen' && m.state === 'fly'), 30);
    const q = g.mosquitoes.find((m) => m.kind === 'queen')!;
    expect(q.maxHp).toBeGreaterThan(3);
    let guard = 0;
    while (!q.dead && guard++ < 200) {
      step(g, 0.15);
      g.swat(q.x, q.y);
    }
    const ev = g.drainEvents();
    expect(q.dead).toBe(true);
    expect(g.stats.queens).toBe(1);
    step(g, 0.1);
    expect(g.phase === 'clear' || ev.some((e) => e.type === 'queenDown')).toBe(true);
  });

  it('electric swatter chains to nearby mosquitoes', () => {
    const g = newGame(12);
    g.start('zen', 'normal');
    until(g, () => g.phase === 'playing');
    g.mosquitoes = [];
    const rng = mulberry32(3);
    for (let i = 0; i < 4; i++) {
      const m = createMosquito('common', RECT, rng, { speedMul: 0, patience: Infinity, diveDuration: 2, at: { x: 400 + i * 60, y: 300 } });
      m.speed = 0;
      g.mosquitoes.push(m);
    }
    g.powers.electric = 10;
    step(g, 0.2);
    g.swat(400, 300);
    const zaps = g.drainEvents().filter((e) => e.type === 'zap');
    expect(zaps.length).toBeGreaterThan(0);
    expect(g.kills).toBeGreaterThanOrEqual(2);
  });

  it('menu attract mode never scores', () => {
    const g = newGame(13);
    g.startMenu('kitchen');
    until(g, () => g.mosquitoes.some((m) => m.state === 'fly'), 20);
    swatOne(g);
    expect(g.score).toBe(0);
    expect(g.mosquitoes.every((m) => m.patience === Infinity || m.kind === 'golden')).toBe(true);
  });

  it('swat cooldown prevents machine-gun clicking', () => {
    const g = newGame(14);
    g.start('zen', 'normal');
    expect(g.swat(10, 10)).not.toBeNull();
    expect(g.swat(10, 10)).toBeNull();
    step(g, 0.2);
    expect(g.swat(10, 10)).not.toBeNull();
  });
});

describe('mosquito movement', () => {
  it('spawns outside the play area and flies in', () => {
    const rng = mulberry32(21);
    for (let i = 0; i < 20; i++) {
      const m = createMosquito('common', RECT, rng, { speedMul: 1, patience: 99, diveDuration: 2 });
      const outside = m.x < RECT.x || m.x > RECT.x + RECT.w || m.y < RECT.y || m.y > RECT.y + RECT.h;
      expect(outside).toBe(true);
      for (let t = 0; t < 10 && m.state === 'enter'; t += 1 / 60) updateMosquito(m, 1 / 60, RECT, rng, { slow: 1, lamp: null });
      expect(m.state).toBe('fly');
      // …and stays in the room for a while.
      for (let t = 0; t < 5; t += 1 / 60) updateMosquito(m, 1 / 60, RECT, rng, { slow: 1, lamp: null });
      expect(m.x).toBeGreaterThanOrEqual(RECT.x);
      expect(m.x).toBeLessThanOrEqual(RECT.x + RECT.w);
      expect(m.y).toBeGreaterThanOrEqual(RECT.y);
      expect(m.y).toBeLessThanOrEqual(RECT.y + RECT.h);
    }
  });

  it('golden mosquito crosses the screen and leaves', () => {
    const rng = mulberry32(22);
    const m = createMosquito('golden', RECT, rng, { speedMul: 1, patience: 99, diveDuration: 2 });
    let res: string | null = null;
    for (let t = 0; t < 15 && res !== 'gone'; t += 1 / 60) res = updateMosquito(m, 1 / 60, RECT, rng, { slow: 1, lamp: null });
    expect(res).toBe('gone');
  });

  it('frost slows everything down', () => {
    const a = createMosquito('common', RECT, mulberry32(5), { speedMul: 1, patience: 99, diveDuration: 2, at: { x: 500, y: 400 } });
    const b = createMosquito('common', RECT, mulberry32(5), { speedMul: 1, patience: 99, diveDuration: 2, at: { x: 500, y: 400 } });
    const ra = mulberry32(9);
    const rb = mulberry32(9);
    updateMosquito(a, 0.1, RECT, ra, { slow: 1, lamp: null });
    updateMosquito(b, 0.1, RECT, rb, { slow: 0.4, lamp: null });
    expect(Math.hypot(b.x - 500, b.y - 400)).toBeLessThan(Math.hypot(a.x - 500, a.y - 400));
  });
});
