import {
  BITE_TIME_PENALTY, DIFFICULTIES, KINDS, MAX_LIVES, MINUTE_LENGTH, POWERS, SWAT_COOLDOWN, TOUCH_BONUS,
  type Difficulty, type DifficultyDef, type Mode, type MosquitoKind, type PowerKind, type SceneId,
} from './config';
import { hitTest, hits, nearestWithin } from './hit';
import { createMosquito, hitRadius, inside, updateMosquito, type Mosquito, type Rect } from './mosquito';
import { between, pickWeighted, type Rng } from './rng';
import {
  accuracy, comboMultiplier, killPoints, multiKillBonus, multiKillLabel, starsFor, waveBonus, type WaveBonus,
} from './scoring';
import { minuteSpec, sceneForWave, sceneForZen, waveSpec, zenSpec, type SpawnSpec, type WaveSpec } from './waves';

export type Phase = 'menu' | 'intro' | 'playing' | 'clear' | 'dying' | 'over';
export type KillSource = 'swat' | 'chain' | 'spray' | 'lamp';

export interface Bubble {
  id: number;
  kind: PowerKind;
  x: number;
  y: number;
  baseX: number;
  age: number;
  life: number;
  r: number;
}

export interface Cloud {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  tick: number;
}

export interface Lamp {
  x: number;
  y: number;
  zapT: number;
}

export interface Welt {
  x: number;
  y: number;
  age: number;
  fade: number;
}

export type GameEvent =
  | { type: 'swat'; x: number; y: number; r: number; hit: boolean; touch: boolean }
  | {
    type: 'kill'; x: number; y: number; r: number; kind: MosquitoKind; points: number; source: KillSource;
    multiplier: number; combo: number; lastSecond: boolean; revenge: boolean; heading: number; scale: number; fed: boolean;
  }
  | { type: 'hurt'; x: number; y: number; r: number; kind: MosquitoKind; hp: number; maxHp: number }
  | { type: 'multi'; x: number; y: number; count: number; label: string; bonus: number }
  | { type: 'comboUp'; multiplier: number; combo: number }
  | { type: 'comboBreak'; combo: number }
  | { type: 'bite'; x: number; y: number; blocked: boolean; lives: number }
  | { type: 'dive'; id: number }
  | { type: 'powerDrop'; kind: PowerKind; x: number; y: number }
  | { type: 'powerPick'; kind: PowerKind; x: number; y: number }
  | { type: 'powerEnd'; kind: PowerKind }
  | { type: 'zap'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'lampZap'; x: number; y: number }
  | { type: 'queenSpawn'; x: number; y: number }
  | { type: 'queenDown'; x: number; y: number }
  | { type: 'waveStart'; wave: number; spec: WaveSpec | null }
  | { type: 'waveClear'; wave: number; bonus: WaveBonus; accuracy: number; bites: number }
  | { type: 'tick'; secondsLeft: number }
  | { type: 'gameOver'; summary: Summary }
  | { type: 'scene'; scene: SceneId };

export interface Summary {
  mode: Mode;
  difficulty: Difficulty;
  score: number;
  kills: number;
  /** Wave reached (waves mode), 0 otherwise. */
  wave: number;
  bestCombo: number;
  accuracy: number;
  swats: number;
  hits: number;
  bites: number;
  duration: number;
  stars: number;
  kindKills: Partial<Record<MosquitoKind, number>>;
  maxMulti: number;
  chainKills: number;
  golden: number;
  queens: number;
  lastSecond: number;
  revenge: number;
  powers: PowerKind[];
  flawlessWaves: number;
  sharpWaves: number;
}

export interface SwatResult {
  hitCount: number;
  kills: number;
  picked: PowerKind[];
}

let bubbleId = 1;

export class Game {
  rng: Rng;
  rect: Rect = { x: 0, y: 0, w: 800, h: 600 };
  phase: Phase = 'menu';
  phaseT = 0;
  mode: Mode = 'waves';
  difficulty: Difficulty = 'normal';
  diff: DifficultyDef = DIFFICULTIES.normal;
  scene: SceneId = 'kitchen';

  mosquitoes: Mosquito[] = [];
  bubbles: Bubble[] = [];
  clouds: Cloud[] = [];
  lamp: Lamp | null = null;
  welts: Welt[] = [];
  events: GameEvent[] = [];
  powers: Record<PowerKind, number> = { big: 0, electric: 0, spray: 0, lamp: 0, net: 0, frost: 0, heart: 0, time: 0 };

  score = 0;
  kills = 0;
  lives = 3;
  maxLives = 3;
  wave = 0;
  waveSpecCur: WaveSpec | null = null;
  spec: SpawnSpec = zenSpec(0, 'easy');
  waveProgress = 0;
  waveBites = 0;
  waveSwats = 0;
  waveHits = 0;
  spawnAcc = 0;
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  swats = 0;
  hitsTotal = 0;
  bites = 0;
  elapsed = 0;
  timeLeft = MINUTE_LENGTH;
  lastTickSecond = -1;
  cooldown = 0;
  stats = this.freshStats();

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
  }

  private freshStats() {
    return {
      kindKills: {} as Partial<Record<MosquitoKind, number>>,
      maxMulti: 0,
      chainKills: 0,
      golden: 0,
      queens: 0,
      lastSecond: 0,
      revenge: 0,
      powers: new Set<PowerKind>(),
      flawlessWaves: 0,
      sharpWaves: 0,
    };
  }

  setRect(rect: Rect): void {
    this.rect = rect;
    if (this.lamp) {
      this.lamp.x = Math.min(Math.max(this.lamp.x, rect.x + 40), rect.x + rect.w - 40);
      this.lamp.y = Math.min(Math.max(this.lamp.y, rect.y + 40), rect.y + rect.h - 40);
    }
  }

  get swatRadius(): number {
    return this.diff.swatRadius * (this.powers.big > 0 ? 1.6 : 1);
  }

  get multiplier(): number {
    return comboMultiplier(this.combo);
  }

  get quota(): number {
    return this.waveSpecCur?.quota ?? 0;
  }

  get livesMode(): boolean {
    return this.mode === 'waves';
  }

  get isActive(): boolean {
    return this.phase === 'intro' || this.phase === 'playing' || this.phase === 'clear' || this.phase === 'dying';
  }

  /** Attract mode behind the start screen: a few harmless mosquitoes. */
  startMenu(scene: SceneId = 'kitchen'): void {
    this.phase = 'menu';
    this.phaseT = 0;
    this.mode = 'zen';
    this.difficulty = 'easy';
    this.diff = DIFFICULTIES.easy;
    this.mosquitoes = [];
    this.bubbles = [];
    this.clouds = [];
    this.lamp = null;
    this.welts = [];
    this.resetPowers();
    this.spec = { ...zenSpec(0, 'easy'), maxAlive: 5, interval: 1.2, speedMul: 0.8 };
    this.setScene(scene);
  }

  start(mode: Mode, difficulty: Difficulty): void {
    this.mode = mode;
    this.difficulty = difficulty;
    this.diff = DIFFICULTIES[difficulty];
    this.mosquitoes = [];
    this.bubbles = [];
    this.clouds = [];
    this.lamp = null;
    this.welts = [];
    this.events = [];
    this.resetPowers();
    this.score = 0;
    this.kills = 0;
    this.lives = this.diff.lives;
    this.maxLives = Math.min(MAX_LIVES, this.diff.lives + 1);
    this.wave = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    this.swats = 0;
    this.hitsTotal = 0;
    this.bites = 0;
    this.elapsed = 0;
    this.timeLeft = MINUTE_LENGTH;
    this.lastTickSecond = -1;
    this.spawnAcc = 0;
    this.cooldown = 0;
    this.stats = this.freshStats();
    this.waveSpecCur = null;
    if (mode === 'waves') {
      this.beginWave(1);
    } else {
      this.spec = mode === 'minute' ? minuteSpec(0, difficulty) : zenSpec(0, difficulty);
      this.setScene(mode === 'minute' ? 'garden' : sceneForZen(0));
      this.phase = 'intro';
      this.phaseT = 0;
      this.events.push({ type: 'waveStart', wave: 0, spec: null });
    }
  }

  private resetPowers(): void {
    for (const k of Object.keys(this.powers) as PowerKind[]) this.powers[k] = 0;
  }

  private setScene(scene: SceneId): void {
    if (scene !== this.scene) {
      this.scene = scene;
      this.events.push({ type: 'scene', scene });
    }
  }

  private beginWave(n: number): void {
    this.wave = n;
    const spec = waveSpec(n, this.difficulty);
    this.waveSpecCur = spec;
    this.spec = spec;
    this.waveProgress = 0;
    this.waveBites = 0;
    this.waveSwats = 0;
    this.waveHits = 0;
    this.spawnAcc = spec.interval * 0.6;
    this.setScene(sceneForWave(n));
    // Old bite marks heal between waves.
    for (const w of this.welts) w.fade = Math.max(w.fade, 0.01);
    this.phase = 'intro';
    this.phaseT = 0;
    this.events.push({ type: 'waveStart', wave: n, spec });
  }

  /** Debug / testing: jump straight to wave n (waves mode). */
  jumpToWave(n: number): void {
    if (this.mode !== 'waves') return;
    for (const m of this.mosquitoes) m.dead = true;
    this.mosquitoes = [];
    this.beginWave(Math.max(1, Math.floor(n)));
  }

  /** Intro banner length per phase. */
  private introLength(): number {
    if (this.mode !== 'waves') return 1.4;
    return this.waveSpecCur && this.waveSpecCur.newKinds.length > 0 ? 2.8 : 2.0;
  }

  /** Player ends a zen game (or gives up). */
  finish(): void {
    if (this.phase === 'menu' || this.phase === 'over') return;
    this.gameOver();
  }

  private gameOver(): void {
    this.phase = 'over';
    this.phaseT = 0;
    for (const m of this.mosquitoes) if (!m.dead) m.state = 'leave';
    this.bubbles = [];
    this.clouds = [];
    this.lamp = null;
    this.resetPowers();
    this.events.push({ type: 'gameOver', summary: this.summary() });
  }

  summary(): Summary {
    return {
      mode: this.mode,
      difficulty: this.difficulty,
      score: this.score,
      kills: this.kills,
      wave: this.mode === 'waves' ? this.wave : 0,
      bestCombo: this.bestCombo,
      accuracy: accuracy(this.hitsTotal, this.swats),
      swats: this.swats,
      hits: this.hitsTotal,
      bites: this.bites,
      duration: this.elapsed,
      stars: starsFor(this.mode, { wave: this.wave, score: this.score, kills: this.kills }),
      kindKills: { ...this.stats.kindKills },
      maxMulti: this.stats.maxMulti,
      chainKills: this.stats.chainKills,
      golden: this.stats.golden,
      queens: this.stats.queens,
      lastSecond: this.stats.lastSecond,
      revenge: this.stats.revenge,
      powers: [...this.stats.powers],
      flawlessWaves: this.stats.flawlessWaves,
      sharpWaves: this.stats.sharpWaves,
    };
  }

  aliveCount(): number {
    let n = 0;
    for (const m of this.mosquitoes) if (!m.dead && m.state !== 'leave' && m.kind !== 'golden') n++;
    return n;
  }

  private spawn(kind: MosquitoKind, at?: { x: number; y: number }): Mosquito {
    const m = createMosquito(kind, this.rect, this.rng, {
      speedMul: this.spec.speedMul,
      patience: this.phase === 'menu' ? Infinity : this.spec.patience,
      diveDuration: this.diff.dive,
      hp: kind === 'queen' ? this.waveSpecCur?.bossHp ?? KINDS.queen.hp : undefined,
      at,
    });
    this.mosquitoes.push(m);
    return m;
  }

  // ---------------------------------------------------------------- input

  swat(x: number, y: number, touch = false): SwatResult | null {
    if (this.phase === 'over') return null;
    if (this.cooldown > 0) return null;
    this.cooldown = SWAT_COOLDOWN;
    const counting = this.phase === 'playing' || this.phase === 'intro' || this.phase === 'clear';
    const r = this.swatRadius + (touch ? TOUCH_BONUS : 0);
    const result: SwatResult = { hitCount: 0, kills: 0, picked: [] };

    // Power-up bubbles.
    for (const b of this.bubbles) {
      if (b.life <= 0) continue;
      if (hits(x, y, r, { x: b.x, y: b.y, r: b.r * 1.4 })) {
        b.life = 0;
        result.picked.push(b.kind);
        this.applyPower(b.kind, b.x, b.y);
      }
    }

    const visible = (m: Mosquito): boolean => !m.dead && inside(m, this.rect, -m.r * m.scale);
    const targets = this.mosquitoes.map((m) => ({ x: m.x, y: m.y, r: hitRadius(m), m }));
    const idx = hitTest(x, y, r, targets, (t) => visible(t.m));
    const hitSet = new Set<number>(idx);
    const killedAt: Array<{ x: number; y: number }> = [];
    for (const i of idx) {
      const m = targets[i]!.m;
      result.hitCount++;
      if (this.damage(m, 'swat', x, y)) {
        result.kills++;
        killedAt.push({ x: m.x, y: m.y });
      }
    }

    // Electric swatter: lightning jumps to nearby mosquitoes.
    if (this.powers.electric > 0 && result.hitCount > 0) {
      const origins = killedAt.length > 0 ? killedAt : [{ x, y }];
      for (const o of origins) {
        const near = nearestWithin(o.x, o.y, 190, targets, 3, hitSet, (t) => visible(t.m));
        for (const j of near) {
          hitSet.add(j);
          const m = targets[j]!.m;
          this.events.push({ type: 'zap', x1: o.x, y1: o.y, x2: m.x, y2: m.y });
          if (this.damage(m, 'chain', o.x, o.y)) {
            result.kills++;
            if (counting) this.stats.chainKills++;
          }
        }
      }
    }

    if (this.powers.spray > 0) {
      this.clouds.push({ x, y, r: r * 1.25, age: 0, life: 2.2, tick: 0 });
    }

    const anyHit = result.hitCount > 0 || result.picked.length > 0;
    if (counting) {
      this.swats++;
      this.waveSwats++;
      if (anyHit) {
        this.hitsTotal++;
        this.waveHits++;
      } else if (this.diff.missBreaksCombo && this.combo > 0) {
        this.breakCombo();
      }
      if (result.kills >= 2) {
        const bonus = Math.round(multiKillBonus(result.kills) * this.diff.scoreMul);
        this.score += bonus;
        this.stats.maxMulti = Math.max(this.stats.maxMulti, result.kills);
        this.events.push({ type: 'multi', x, y, count: result.kills, label: multiKillLabel(result.kills) ?? '', bonus });
      }
    }
    this.events.push({ type: 'swat', x, y, r, hit: anyHit, touch });
    return result;
  }

  private breakCombo(): void {
    if (this.combo >= 3) this.events.push({ type: 'comboBreak', combo: this.combo });
    this.combo = 0;
    this.comboT = 0;
  }

  /** Applies one point of damage. Returns true when the mosquito died. */
  private damage(m: Mosquito, source: KillSource, fromX: number, fromY: number): boolean {
    if (m.dead) return false;
    m.hp -= 1;
    if (m.hp > 0) {
      const a = Math.atan2(m.y - fromY, m.x - fromX);
      const push = m.kind === 'queen' ? 160 : 260;
      m.kx = Math.cos(a) * push;
      m.ky = Math.sin(a) * push;
      m.hurtT = 0.3;
      m.angryT = 1.2;
      // Hitting a diving mosquito knocks it back a bit.
      if (m.state === 'dive') m.dive = Math.max(0, m.dive - 0.35);
      this.events.push({ type: 'hurt', x: m.x, y: m.y, r: m.r * m.scale, kind: m.kind, hp: m.hp, maxHp: m.maxHp });
      return false;
    }
    this.kill(m, source);
    return true;
  }

  private kill(m: Mosquito, source: KillSource): void {
    m.dead = true;
    const lastSecond = m.state === 'dive' && m.dive >= 0.8;
    const revenge = m.fed;
    if (this.phase === 'menu') {
      this.events.push({
        type: 'kill', x: m.x, y: m.y, r: m.r * m.scale, kind: m.kind, points: 0, source, multiplier: 1, combo: 0,
        lastSecond: false, revenge: false, heading: m.heading, scale: m.scale, fed: m.fed,
      });
      return;
    }
    const prevMul = comboMultiplier(this.combo);
    this.combo++;
    this.comboT = 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mul = comboMultiplier(this.combo);
    if (mul > prevMul) this.events.push({ type: 'comboUp', multiplier: mul, combo: this.combo });
    const extra = (lastSecond ? 15 : 0) + (revenge ? 20 : 0);
    const points = killPoints(m.kind, this.combo, this.difficulty, extra);
    this.score += points;
    this.kills++;
    this.stats.kindKills[m.kind] = (this.stats.kindKills[m.kind] ?? 0) + 1;
    if (lastSecond) this.stats.lastSecond++;
    if (m.kind === 'golden') this.stats.golden++;
    if (revenge) {
      this.stats.revenge++;
      if (this.mode === 'waves') this.lives = Math.min(this.maxLives, this.lives + 1);
      else if (this.mode === 'minute') this.timeLeft += BITE_TIME_PENALTY;
    }
    if (this.mode === 'waves' && this.waveSpecCur) {
      if (!this.waveSpecCur.boss || m.kind === 'queen') this.waveProgress++;
    }
    this.events.push({
      type: 'kill', x: m.x, y: m.y, r: m.r * m.scale, kind: m.kind, points, source, multiplier: mul, combo: this.combo,
      lastSecond, revenge, heading: m.heading, scale: m.scale, fed: m.fed,
    });

    if (m.kind === 'queen') {
      this.stats.queens++;
      this.events.push({ type: 'queenDown', x: m.x, y: m.y });
      for (const o of this.mosquitoes) if (!o.dead && o !== m) o.state = 'leave';
    }

    // Power-up drops.
    const golden = m.kind === 'golden' || m.kind === 'queen';
    const chance = 0.055 + 0.012 * mul;
    if (golden || (this.bubbles.length < 2 && this.rng() < chance)) this.dropPower(m.x, m.y);
  }

  private dropPower(x: number, y: number): void {
    const w: Partial<Record<PowerKind, number>> = { big: 3, electric: 2.2, spray: 2, frost: 2 };
    if (this.mode !== 'zen') {
      w.lamp = 1.6;
      if (this.mode === 'waves') {
        w.net = 1.4;
        if (this.lives < this.maxLives) w.heart = this.lives <= 1 ? 3 : 1.2;
      } else {
        w.time = 2;
      }
    } else {
      w.lamp = 1.2;
    }
    // Avoid dropping something that's already running or floating.
    for (const b of this.bubbles) if (b.life > 0) w[b.kind] = (w[b.kind] ?? 0) * 0.3;
    const kind = pickWeighted(this.rng, w) ?? 'big';
    const bx = Math.min(Math.max(x, this.rect.x + 30), this.rect.x + this.rect.w - 30);
    const by = Math.min(Math.max(y, this.rect.y + 40), this.rect.y + this.rect.h - 30);
    this.bubbles.push({ id: bubbleId++, kind, x: bx, y: by, baseX: bx, age: 0, life: 7.5, r: 22 });
    this.events.push({ type: 'powerDrop', kind, x: bx, y: by });
  }

  private applyPower(kind: PowerKind, x: number, y: number): void {
    if (this.phase !== 'menu') this.stats.powers.add(kind);
    this.events.push({ type: 'powerPick', kind, x, y });
    if (kind === 'heart') {
      this.lives = Math.min(this.maxLives, this.lives + 1);
      return;
    }
    if (kind === 'time') {
      this.timeLeft += 5;
      return;
    }
    this.powers[kind] = POWERS[kind].duration;
    if (kind === 'lamp') {
      const r = this.rect;
      this.lamp = {
        x: Math.min(Math.max(x, r.x + r.w * 0.2), r.x + r.w * 0.8),
        y: Math.min(Math.max(y, r.y + r.h * 0.25), r.y + r.h * 0.75),
        zapT: 0,
      };
    }
  }

  // ---------------------------------------------------------------- simulation

  update(rawDt: number): void {
    const dt = this.phase === 'dying' ? rawDt * 0.35 : rawDt;
    this.phaseT += rawDt;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - rawDt);
    if (this.phase === 'over') {
      this.updateMosquitoes(dt, false);
      return;
    }

    const counting = this.phase !== 'menu';
    if (counting) this.elapsed += rawDt;

    // Power timers.
    for (const k of Object.keys(this.powers) as PowerKind[]) {
      if (this.powers[k] > 0) {
        this.powers[k] = Math.max(0, this.powers[k] - dt);
        if (this.powers[k] === 0) {
          this.events.push({ type: 'powerEnd', kind: k });
          if (k === 'lamp') this.lamp = null;
        }
      }
    }

    // Combo timeout.
    if (this.combo > 0) {
      this.comboT += dt;
      if (this.comboT > this.diff.comboWindow) this.breakCombo();
    }

    // Phase machine.
    if (this.phase === 'intro' && this.phaseT >= this.introLength()) {
      this.phase = 'playing';
      this.phaseT = 0;
      if (this.mode === 'waves' && this.waveSpecCur?.boss) {
        const q = this.spawn('queen');
        this.events.push({ type: 'queenSpawn', x: q.x, y: q.y });
      }
    } else if (this.phase === 'clear' && this.phaseT >= 2.6) {
      this.beginWave(this.wave + 1);
    } else if (this.phase === 'dying' && this.phaseT >= 1.3) {
      this.gameOver();
      return;
    }

    if (this.mode === 'minute' && this.phase === 'playing') {
      this.timeLeft -= dt;
      this.spec = minuteSpec(MINUTE_LENGTH - Math.min(MINUTE_LENGTH, this.timeLeft), this.difficulty);
      const s = Math.ceil(this.timeLeft);
      if (s <= 10 && s !== this.lastTickSecond && s > 0) {
        this.lastTickSecond = s;
        this.events.push({ type: 'tick', secondsLeft: s });
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.gameOver();
        return;
      }
    }
    if (this.mode === 'zen' && this.phase === 'playing') {
      this.spec = zenSpec(this.kills, this.difficulty);
      this.setScene(sceneForZen(this.kills));
    }

    if (this.phase === 'playing' || this.phase === 'menu') this.spawner(dt);
    this.updateMosquitoes(dt, true);
    this.updateEffects(dt);

    if (this.mode === 'waves' && this.phase === 'playing' && this.waveSpecCur && this.waveProgress >= this.waveSpecCur.quota) {
      this.clearWave();
    }
  }

  private spawner(dt: number): void {
    this.spawnAcc += dt;
    const spec = this.spec;
    if (this.spawnAcc < spec.interval) return;
    const alive = this.aliveCount();
    if (alive >= spec.maxAlive) {
      this.spawnAcc = spec.interval; // spawn as soon as there's room
      return;
    }
    if (this.mode === 'waves' && this.phase === 'playing' && this.waveSpecCur && !this.waveSpecCur.boss) {
      if (this.waveProgress + alive >= this.waveSpecCur.quota) {
        this.spawnAcc = spec.interval;
        return;
      }
    }
    this.spawnAcc -= spec.interval;
    // Occasionally a golden one.
    const hasGolden = this.mosquitoes.some((m) => m.kind === 'golden' && !m.dead);
    if (this.phase !== 'menu' && !hasGolden && this.rng() < spec.goldenChance) {
      this.spawn('golden');
      return;
    }
    const kind = pickWeighted(this.rng, spec.weights) ?? 'common';
    this.spawn(kind);
  }

  private updateMosquitoes(dt: number, live: boolean): void {
    const forces = {
      slow: this.powers.frost > 0 ? 0.4 : 1,
      lamp: this.lamp ? { x: this.lamp.x, y: this.lamp.y, range: 340 } : null,
    };
    for (const m of this.mosquitoes) {
      if (m.dead) continue;
      const wasDiving = m.state === 'dive';
      const res = updateMosquito(m, dt, this.rect, this.rng, forces);
      if (!wasDiving && m.state === 'dive') this.events.push({ type: 'dive', id: m.id });
      if (res === 'gone') m.dead = true;
      else if (res === 'bite' && live) this.bite(m);
      else if (res === 'bite') m.state = 'leave';
      if (live && m.kind === 'queen' && !m.dead && this.phase === 'playing') {
        m.spawnT -= dt;
        if (m.spawnT <= 0) {
          m.spawnT = m.hp < m.maxHp / 2 ? 3.2 : 4.6;
          if (this.aliveCount() < this.spec.maxAlive + 5) {
            for (let i = 0; i < 2; i++) this.spawn(this.rng() < 0.3 && this.wave >= 10 ? 'fast' : 'common', { x: m.x + between(this.rng, -20, 20), y: m.y + m.r });
            this.events.push({ type: 'queenSpawn', x: m.x, y: m.y });
          }
        }
      }
    }
    this.mosquitoes = this.mosquitoes.filter((m) => !m.dead);
  }

  private bite(m: Mosquito): void {
    m.state = 'leave';
    if (this.powers.net > 0) {
      this.events.push({ type: 'bite', x: m.x, y: m.y, blocked: true, lives: this.lives });
      return;
    }
    m.fed = true;
    this.bites++;
    this.waveBites++;
    this.breakCombo();
    this.welts.push({ x: m.x, y: m.y, age: 0, fade: 0 });
    if (this.welts.length > 12) this.welts.shift();
    if (this.mode === 'waves') this.lives = Math.max(0, this.lives - 1);
    else if (this.mode === 'minute') this.timeLeft = Math.max(0.01, this.timeLeft - BITE_TIME_PENALTY);
    this.events.push({ type: 'bite', x: m.x, y: m.y, blocked: false, lives: this.lives });
    if (this.mode === 'waves' && this.lives <= 0 && this.phase !== 'dying') {
      this.phase = 'dying';
      this.phaseT = 0;
    }
  }

  private updateEffects(dt: number): void {
    // Bubbles float up and pop after a while.
    for (const b of this.bubbles) {
      b.age += dt;
      b.life -= dt;
      b.y -= 12 * dt;
      b.x = b.baseX + Math.sin(b.age * 1.8) * 14;
      if (b.y < this.rect.y + 30) b.y = this.rect.y + 30;
    }
    this.bubbles = this.bubbles.filter((b) => b.life > 0);

    // Spray clouds kill what flies in.
    for (const c of this.clouds) {
      c.age += dt;
      c.tick -= dt;
      const rr = c.r * (1 - 0.3 * (c.age / c.life));
      for (const m of this.mosquitoes) {
        if (m.dead || !inside(m, this.rect, -m.r)) continue;
        if (Math.hypot(m.x - c.x, m.y - c.y) <= rr + m.r * m.scale * 0.5) {
          if (m.kind === 'queen' || m.kind === 'fat') {
            if (c.tick <= 0) {
              this.damage(m, 'spray', c.x, c.y);
              c.tick = 0.7;
            }
          } else {
            this.damage(m, 'spray', c.x, c.y);
          }
        }
      }
    }
    this.clouds = this.clouds.filter((c) => c.age < c.life);

    // UV lamp zaps whatever touches it.
    if (this.lamp) {
      const l = this.lamp;
      l.zapT -= dt;
      for (const m of this.mosquitoes) {
        if (m.dead || m.kind === 'queen') continue;
        if (Math.hypot(m.x - l.x, m.y - l.y) <= 30 + m.r) {
          this.events.push({ type: 'lampZap', x: m.x, y: m.y });
          this.kill(m, 'lamp');
        }
      }
    }

    for (const w of this.welts) {
      w.age += dt;
      if (w.fade > 0) w.fade += dt;
    }
    this.welts = this.welts.filter((w) => w.fade < 2.5);
  }

  private clearWave(): void {
    const bonus = waveBonus({ wave: this.wave, bites: this.waveBites, swats: this.waveSwats, hits: this.waveHits }, this.difficulty);
    this.score += bonus.total;
    // Achievements count only from wave 3 on (the first waves are a warm-up).
    if (bonus.flawless > 0 && this.wave >= 3) this.stats.flawlessWaves++;
    if (this.wave >= 3 && accuracy(this.waveHits, this.waveSwats) >= 0.9 && this.waveSwats >= 10) this.stats.sharpWaves++;
    this.events.push({ type: 'waveClear', wave: this.wave, bonus, accuracy: accuracy(this.waveHits, this.waveSwats), bites: this.waveBites });
    for (const m of this.mosquitoes) if (!m.dead && m.state !== 'leave') m.state = 'leave';
    this.phase = 'clear';
    this.phaseT = 0;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
