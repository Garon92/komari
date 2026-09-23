import { KINDS, POWERS, SCENES, type PowerKind, type SceneId } from '../game/config';
import type { Game, GameEvent } from '../game/game';
import type { Mosquito } from '../game/mosquito';
import { BLOOD, Effects, GOO, paintSplat } from './effects';
import { drawPowerIcon } from './icons';
import { drawWings, SpriteCache } from './mosquitoArt';
import { drawAmbient, layoutFor, paintScene, sceneLights, type Firefly, type Layout, type Light } from './scenes';
import { drawSwatter, type SwatterShape } from './swatter';

export interface RenderPrefs {
  shape: SwatterShape;
  color: string;
  blood: boolean;
  reducedMotion: boolean;
}

export interface PointerState {
  x: number;
  y: number;
  /** Show the swatter cursor (mouse / keyboard). */
  visible: boolean;
  /** Last input was touch. */
  touch: boolean;
}

const FONT = 'Nunito, "Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  private bg: HTMLCanvasElement = document.createElement('canvas');
  private prevBg: HTMLCanvasElement | null = null;
  private fadeT = 1;
  private scene: SceneId | null = null;
  layout: Layout = layoutFor('kitchen', 1, 1);
  private stains: HTMLCanvasElement = document.createElement('canvas');
  private stainG: CanvasRenderingContext2D;
  private stainFade = 0;
  private dark: HTMLCanvasElement = document.createElement('canvas');
  private darkG: CanvasRenderingContext2D;
  private sprites = new SpriteCache();
  readonly fx = new Effects();
  private flies: Firefly[] = [];
  private shakeT = 0;
  private shakeMag = 0;
  private flash: { t: number; color: string } = { t: 0, color: '255,0,0' };
  private press = 0;
  private swatAnims: Array<{ x: number; y: number; t: number }> = [];
  private touchLight: { x: number; y: number; t: number } | null = null;
  private lightning = 0;
  private time = 0;
  prefs: RenderPrefs = { shape: 'round', color: '#60a5fa', blood: true, reducedMotion: false };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Canvas 2D není k dispozici');
    this.g = g;
    this.stainG = this.stains.getContext('2d')!;
    this.darkG = this.dark.getContext('2d')!;
    for (let i = 0; i < 14; i++) this.flies.push({ x: Math.random(), y: 0.35 + Math.random() * 0.55, phase: Math.random() * 10, speed: 0.3 + Math.random() * 0.6 });
  }

  resize(w: number, h: number, dpr: number): void {
    const d = Math.min(dpr, 2.5);
    if (w === this.w && h === this.h && d === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = d;
    this.canvas.width = Math.max(1, Math.round(w * d));
    this.canvas.height = Math.max(1, Math.round(h * d));
    this.sprites.setResolution(d);
    // Stains are screen-space; keep what we can.
    const old = this.stains;
    this.stains = document.createElement('canvas');
    this.stains.width = this.canvas.width;
    this.stains.height = this.canvas.height;
    this.stainG = this.stains.getContext('2d')!;
    if (old.width > 0) this.stainG.drawImage(old, 0, 0);
    this.stainG.setTransform(d, 0, 0, d, 0, 0);
    this.dark.width = Math.max(1, Math.round(w / 2));
    this.dark.height = Math.max(1, Math.round(h / 2));
    if (this.scene) this.paintBackground(this.scene, false);
  }

  setScene(id: SceneId, animate: boolean): void {
    if (id === this.scene) return;
    this.paintBackground(id, animate);
  }

  private paintBackground(id: SceneId, animate: boolean): void {
    if (animate && this.scene && !this.prefs.reducedMotion) {
      this.prevBg = this.bg;
      this.fadeT = 0;
      this.bg = document.createElement('canvas');
    } else {
      this.prevBg = null;
      this.fadeT = 1;
    }
    this.scene = id;
    this.layout = layoutFor(id, this.w, this.h);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const bg = this.bg.getContext('2d')!;
    bg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paintScene(bg, id, this.layout);
  }

  clearStains(): void {
    this.stainG.save();
    this.stainG.setTransform(1, 0, 0, 1, 0, 0);
    this.stainG.clearRect(0, 0, this.stains.width, this.stains.height);
    this.stainG.restore();
    this.fx.clear();
    this.swatAnims = [];
  }

  shake(mag: number, t = 0.25): void {
    if (this.prefs.reducedMotion) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
  }

  private splatColor() {
    return this.prefs.blood ? BLOOD : GOO;
  }

  /** Reacts to game events with visual effects. */
  onEvent(e: GameEvent, pointer: PointerState): void {
    switch (e.type) {
      case 'swat':
        this.press = 1;
        if (e.touch || !pointer.visible) this.swatAnims.push({ x: e.x, y: e.y, t: 0 });
        this.fx.ring(e.x, e.y, e.r * 0.4, e.r * 1.05, e.hit ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.35)', 0.28, e.hit ? 4 : 2);
        if (e.touch) this.touchLight = { x: e.x, y: e.y, t: 0 };
        break;
      case 'kill': {
        const big = e.kind === 'queen' ? 3.2 : e.kind === 'fat' || e.fed ? 1.8 : 1;
        const R = e.r * (e.fed ? 2.8 : 2.2) * (e.kind === 'queen' ? 1.1 : 1);
        const strength = Math.min(1, 0.3 + (e.source === 'swat' ? 0.4 : 0.1) + (big > 1 ? 0.3 : 0));
        if (e.source === 'lamp') {
          // Zapped: a small burnt mark and sparks instead of a splat.
          this.stainG.fillStyle = 'rgba(30,25,20,0.4)';
          this.stainG.beginPath();
          this.stainG.arc(e.x, e.y, e.r * 0.8, 0, Math.PI * 2);
          this.stainG.fill();
          this.fx.sparks(e.x, e.y, 14, '#c4b5fd', 220);
        } else {
          paintSplat(this.stainG, e.x, e.y, R, e.heading + Math.PI, strength, this.splatColor());
          this.fx.addDrips(e.x, e.y, R, strength, Math.round((1 + Math.random() * 2) * big));
          this.fx.bits(e.x, e.y, 5 + Math.round(big * 2), 'rgba(40,45,55,0.8)', 160 * Math.sqrt(big));
        }
        if (e.kind === 'golden') this.fx.stars(e.x, e.y, 18, '#fde047');
        if (e.source === 'spray') this.fx.stars(e.x, e.y, 5, '#e9d5ff');
        if (e.points > 0) {
          const col = e.multiplier >= 4 ? '#f472b6' : e.multiplier >= 3 ? '#fb923c' : e.multiplier >= 2 ? '#facc15' : '#ffffff';
          this.fx.text(e.x, e.y - 14, `+${e.points}`, col, 18 + Math.min(12, e.multiplier * 2));
        }
        if (e.lastSecond) this.fx.text(e.x, e.y - 44, 'Na poslední chvíli!', '#4ade80', 18, 1.2);
        if (e.revenge) this.fx.text(e.x, e.y - 44, 'Krev zpět! ❤', '#f87171', 22, 1.3);
        if (e.kind === 'queen') this.shake(12, 0.5);
        else if (big > 1) this.shake(4, 0.12);
        break;
      }
      case 'hurt':
        paintSplat(this.stainG, e.x, e.y, e.r * 1.2, Math.random() * 6, 0.2, this.splatColor());
        this.fx.bits(e.x, e.y, 4, 'rgba(40,45,55,0.8)');
        this.fx.ring(e.x, e.y, e.r, e.r * 2, 'rgba(255,255,255,0.8)', 0.2, 3);
        this.shake(3, 0.1);
        break;
      case 'multi':
        this.fx.text(e.x, e.y - 50, e.label, '#fde047', 30, 1.3);
        if (e.bonus > 0) this.fx.text(e.x, e.y - 22, `+${e.bonus}`, '#fde047', 20, 1.1);
        this.shake(3 + e.count, 0.2);
        break;
      case 'bite':
        if (e.blocked) {
          this.fx.text(e.x, e.y - 30, 'Síť chrání!', '#fbbf24', 22, 1.1);
          this.fx.ring(e.x, e.y, 10, 70, 'rgba(251,191,36,0.9)', 0.4, 4);
        } else {
          this.flash = { t: 0.45, color: '239,68,68' };
          this.fx.text(e.x, e.y - 30, 'Au! Štípnutí!', '#fca5a5', 24, 1.2);
          this.shake(10, 0.35);
        }
        break;
      case 'powerDrop':
        this.fx.ring(e.x, e.y, 6, 40, POWERS[e.kind].color, 0.5, 3);
        break;
      case 'powerPick':
        this.fx.stars(e.x, e.y, 14, POWERS[e.kind].color);
        this.fx.text(e.x, e.y - 34, POWERS[e.kind].name, POWERS[e.kind].color, 22, 1.4);
        if (e.kind === 'frost') {
          this.fx.flakes(this.w, this.h, this.prefs.reducedMotion ? 10 : 40);
          this.flash = { t: 0.35, color: '186,230,253' };
        }
        if (e.kind === 'electric') this.lightning = 0.12;
        break;
      case 'zap':
        this.fx.bolt(e.x1, e.y1, e.x2, e.y2);
        this.fx.sparks(e.x2, e.y2, 6, '#93c5fd');
        this.lightning = Math.max(this.lightning, 0.08);
        break;
      case 'lampZap':
        this.lightning = Math.max(this.lightning, 0.05);
        break;
      case 'queenSpawn':
        this.fx.ring(e.x, e.y, 10, 60, 'rgba(167,139,250,0.8)', 0.4, 3);
        break;
      case 'queenDown':
        this.fx.stars(e.x, e.y, 30, '#fbbf24');
        this.fx.text(e.x, e.y - 60, 'Královna padla!', '#fbbf24', 32, 1.8);
        break;
      default:
        break;
    }
  }

  private lights(game: Game, pointer: PointerState): Light[] {
    const out = sceneLights(this.layout ? this.scene ?? 'kitchen' : 'kitchen', this.layout, this.time);
    const m = Math.min(this.w, this.h);
    if (pointer.visible && !pointer.touch) out.push({ x: pointer.x, y: pointer.y, r: Math.max(150, m * 0.26) + game.swatRadius, power: 0.95, aim: true });
    if (this.touchLight) {
      const a = Math.max(0.25, 1 - this.touchLight.t / 2.5);
      out.push({ x: this.touchLight.x, y: this.touchLight.y, r: Math.max(150, m * 0.3), power: 0.9 * a, aim: true });
    }
    if (game.lamp) out.push({ x: game.lamp.x, y: game.lamp.y, r: Math.max(220, m * 0.45), power: 1 });
    for (const q of game.mosquitoes) if (q.kind === 'golden') out.push({ x: q.x, y: q.y, r: 90, power: 0.8 });
    for (const b of game.bubbles) out.push({ x: b.x, y: b.y, r: 70, power: 0.7 });
    return out;
  }

  render(game: Game, pointer: PointerState, dt: number): void {
    const g = this.g;
    this.time += dt;
    this.press = Math.max(0, this.press - dt * 7);
    if (this.fadeT < 1) this.fadeT = Math.min(1, this.fadeT + dt / 1.2);
    if (this.flash.t > 0) this.flash.t = Math.max(0, this.flash.t - dt);
    if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - dt);
    if (this.touchLight) {
      this.touchLight.t += dt;
      if (this.touchLight.t > 6) this.touchLight = null;
    }
    for (const s of this.swatAnims) s.t += dt;
    this.swatAnims = this.swatAnims.filter((s) => s.t < 0.35);
    this.fx.update(dt, this.stainG, this.splatColor());

    // Stains slowly soak away.
    this.stainFade += dt;
    if (this.stainFade > 0.5) {
      this.stainFade = 0;
      const sg = this.stainG;
      sg.save();
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.globalCompositeOperation = 'destination-out';
      sg.fillStyle = 'rgba(0,0,0,0.03)';
      sg.fillRect(0, 0, this.stains.width, this.stains.height);
      sg.restore();
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    let ox = 0;
    let oy = 0;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const m = this.shakeMag * (this.shakeT > 0 ? 1 : 0);
      ox = (Math.random() - 0.5) * m * 2;
      oy = (Math.random() - 0.5) * m * 2;
      if (this.shakeT === 0) this.shakeMag = 0;
    }
    // Background (cross-fade on scene change).
    g.drawImage(this.bg, 0, 0);
    if (this.prevBg && this.fadeT < 1) {
      g.globalAlpha = 1 - this.fadeT;
      g.drawImage(this.prevBg, 0, 0);
      g.globalAlpha = 1;
    } else if (this.prevBg) {
      this.prevBg = null;
    }
    const d = this.dpr;
    g.setTransform(d, 0, 0, d, ox * d, oy * d);
    const scene = this.scene ?? 'kitchen';
    const darkness = SCENES[scene].darkness;
    drawAmbient(g, scene, this.layout, this.time, this.flies, this.prefs.reducedMotion);

    // Stains.
    g.save();
    g.setTransform(1, 0, 0, 1, ox * d, oy * d);
    g.globalCompositeOperation = darkness < 0.5 ? 'multiply' : 'source-over';
    g.drawImage(this.stains, 0, 0);
    g.restore();

    this.drawLamp(game);
    this.drawClouds(game);

    // Mosquitoes: normal first, divers on top (they're closer to the camera).
    const ms = game.mosquitoes;
    const ninjaMin = game.diff.ninjaMinAlpha;
    const lightsForNinja = this.lights(game, pointer);
    for (const m of ms) if (m.state !== 'dive') this.drawMosquito(m, ninjaMin, lightsForNinja);
    const divers = ms.filter((m) => m.state === 'dive').sort((a, b) => a.dive - b.dive);
    for (const m of divers) this.drawMosquito(m, ninjaMin, lightsForNinja);

    this.drawBubbles(game);

    // Darkness with light holes.
    if (darkness >= 0.5) this.drawDarkness(darkness, lightsForNinja, game);

    // Glinting eyes in the dark + dive warnings are always visible.
    if (darkness >= 0.5) this.drawEyes(ms);
    for (const m of divers) this.drawDiveWarning(m);
    for (const m of ms) if (m.kind === 'queen') this.drawBossBar(m);
    this.drawWelts(game);

    this.fx.draw(g, FONT);

    // Swatter cursor or tap animation.
    const look = { shape: this.prefs.shape, color: this.prefs.color, electric: game.powers.electric > 0, big: game.powers.big > 0 };
    if (pointer.visible && !pointer.touch && game.phase !== 'over') {
      g.save();
      g.translate(pointer.x, pointer.y);
      drawSwatter(g, game.swatRadius, look, this.press, performance.now());
      g.restore();
    }
    for (const s of this.swatAnims) {
      const k = s.t / 0.35;
      g.save();
      g.globalAlpha = 1 - k;
      g.translate(s.x, s.y);
      drawSwatter(g, game.swatRadius + 12, look, 1 - k, performance.now());
      g.restore();
    }

    // Screen-space overlays.
    g.setTransform(d, 0, 0, d, 0, 0);
    if (game.powers.frost > 0) this.edgeTint('186,230,253', 0.35 * Math.min(1, game.powers.frost));
    if (game.powers.net > 0) this.drawNetEdge(Math.min(1, game.powers.net));
    if (this.flash.t > 0) this.edgeTint(this.flash.color, this.flash.t * 1.2);
    if (this.lightning > 0) {
      g.fillStyle = `rgba(220,235,255,${this.lightning * 1.5})`;
      g.fillRect(0, 0, this.w, this.h);
    }
    if (game.phase === 'dying') {
      g.fillStyle = `rgba(80,0,10,${Math.min(0.35, game.phaseT * 0.3)})`;
      g.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawMosquito(m: Mosquito, ninjaMin: number, lights: Light[]): void {
    const g = this.g;
    let alpha = 1;
    if (m.kind === 'ninja' && m.state !== 'dive') {
      let lit = 0;
      for (const l of lights) {
        const dd = Math.hypot(l.x - m.x, l.y - m.y);
        if (dd < l.r * 0.6) lit = Math.max(lit, (1 - dd / (l.r * 0.6)) * l.power);
      }
      alpha = Math.max(ninjaMin, m.alpha, Math.min(1, lit * 1.3));
    }
    if (m.state === 'enter' && m.age < 0.3) alpha *= m.age / 0.3;
    const s = m.scale;
    const r = m.r * s;
    const variant = m.hurtT > 0 && Math.floor(m.hurtT * 20) % 2 === 0 ? 'flash' : m.fed ? 'fed' : 'normal';
    const sprite = this.sprites.get(m.kind, variant);
    const k = (m.r / sprite.R) * s;
    const flapT = (Math.sin(m.wing) + 1) * 0.5;
    const roll = (flapT - 0.5) * 0.18;
    const bob = m.kind === 'fat' || m.kind === 'queen' ? Math.sin(m.age * 3) * 2 : 0;

    g.save();
    g.globalAlpha = alpha;
    // Soft shadow (light from top-right).
    g.save();
    g.translate(m.x - r * 0.36 * (1 + (s - 1) * 1.5), m.y + r * 0.32 * (1 + (s - 1) * 2) + 8 * (s - 1));
    g.rotate(m.heading + roll);
    g.globalAlpha = alpha * 0.13;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(0, 0, r * 1.55, r * 0.64, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.translate(m.x, m.y + bob);
    g.rotate(m.heading + roll);
    if (m.kind === 'golden') {
      const gl = g.createRadialGradient(0, 0, 0, 0, 0, r * 3);
      gl.addColorStop(0, 'rgba(255,230,120,0.55)');
      gl.addColorStop(1, 'rgba(255,230,120,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.arc(0, 0, r * 3, 0, Math.PI * 2);
      g.fill();
    }
    drawWings(g, r, m.wing, m.kind === 'golden' ? 'rgba(255,236,170,0.75)' : m.kind === 'queen' ? 'rgba(210,190,255,0.7)' : null);
    g.drawImage(sprite.canvas, -sprite.half * k, -sprite.half * k, sprite.half * 2 * k, sprite.half * 2 * k);
    g.restore();
  }

  private drawDiveWarning(m: Mosquito): void {
    const g = this.g;
    const r = m.r * m.scale;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (10 + m.dive * 14));
    g.save();
    g.strokeStyle = `rgba(239,68,68,${0.45 + 0.45 * pulse})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(m.x, m.y, r * 2.1 + pulse * 4, 0, Math.PI * 2);
    g.stroke();
    // Progress arc = how close the bite is.
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(m.x, m.y, r * 2.1 + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.dive);
    g.stroke();
    // "!" badge.
    const bx = m.x + r * 1.7;
    const by = m.y - r * 1.7;
    g.fillStyle = '#ef4444';
    g.beginPath();
    g.arc(bx, by, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `900 16px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', bx, by + 1);
    g.restore();
  }

  private drawEyes(ms: Mosquito[]): void {
    const g = this.g;
    g.save();
    for (const m of ms) {
      if (m.kind === 'ninja' && m.alpha < 0.5) continue;
      const r = m.r * m.scale;
      const ex = m.x + Math.cos(m.heading) * r;
      const ey = m.y + Math.sin(m.heading) * r;
      const tw = 0.45 + 0.35 * Math.sin(this.time * 5 + m.id);
      g.fillStyle = `rgba(255,120,120,${tw})`;
      g.beginPath();
      g.arc(ex, ey, Math.max(1.6, r * 0.16), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawDarkness(level: number, lights: Light[], game: Game): void {
    const dg = this.darkG;
    const s = 0.5;
    dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.globalCompositeOperation = 'source-over';
    dg.clearRect(0, 0, this.dark.width, this.dark.height);
    const lamp = game.powers.lamp > 0 ? 0.08 : 0;
    dg.fillStyle = `rgba(4,7,24,${Math.max(0, level - lamp)})`;
    dg.fillRect(0, 0, this.dark.width, this.dark.height);
    dg.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const rg = dg.createRadialGradient(l.x * s, l.y * s, 0, l.x * s, l.y * s, l.r * s);
      rg.addColorStop(0, `rgba(0,0,0,${l.power})`);
      rg.addColorStop(0.55, `rgba(0,0,0,${l.power * 0.6})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      dg.fillStyle = rg;
      dg.beginPath();
      dg.arc(l.x * s, l.y * s, l.r * s, 0, Math.PI * 2);
      dg.fill();
    }
    this.g.drawImage(this.dark, 0, 0, this.w, this.h);
    // A warm flashlight glow where the player aims.
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'screen';
    for (const l of lights) {
      if (!l.aim) continue;
      const rg = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.8);
      rg.addColorStop(0, `rgba(255,236,190,${0.16 * l.power})`);
      rg.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(l.x, l.y, l.r * 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawLamp(game: Game): void {
    const l = game.lamp;
    if (!l) return;
    const g = this.g;
    const t = game.powers.lamp;
    const blink = t < 2 ? (Math.floor(t * 6) % 2 === 0 ? 0.4 : 1) : 1;
    g.save();
    const gl = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, 140);
    gl.addColorStop(0, `rgba(167,139,250,${0.45 * blink})`);
    gl.addColorStop(1, 'rgba(167,139,250,0)');
    g.fillStyle = gl;
    g.beginPath();
    g.arc(l.x, l.y, 140, 0, Math.PI * 2);
    g.fill();
    // Lamp body: a caged UV tube.
    g.fillStyle = '#334155';
    g.beginPath();
    g.roundRect(l.x - 22, l.y - 36, 44, 10, 4);
    g.fill();
    g.beginPath();
    g.roundRect(l.x - 22, l.y + 26, 44, 10, 4);
    g.fill();
    g.fillStyle = `rgba(196,181,253,${0.9 * blink})`;
    g.shadowColor = '#8b5cf6';
    g.shadowBlur = 18;
    g.beginPath();
    g.roundRect(l.x - 9, l.y - 26, 18, 52, 9);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#475569';
    g.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(l.x + i * 9, l.y - 26);
      g.lineTo(l.x + i * 9, l.y + 26);
      g.stroke();
    }
    g.fillStyle = '#334155';
    g.fillRect(l.x - 1, l.y - 60, 2, 24);
    g.restore();
  }

  private drawClouds(game: Game): void {
    const g = this.g;
    for (const c of game.clouds) {
      const t = c.age / c.life;
      const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      const rr = c.r * (0.8 + 0.3 * Math.min(1, t * 3)) * (1 - 0.3 * t);
      g.save();
      g.globalAlpha = 0.5 * a;
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2 + c.age * 0.8;
        const px = c.x + Math.cos(an) * rr * 0.45;
        const py = c.y + Math.sin(an) * rr * 0.35;
        const gr = g.createRadialGradient(px, py, 0, px, py, rr * 0.7);
        gr.addColorStop(0, 'rgba(233,213,255,0.9)');
        gr.addColorStop(1, 'rgba(192,132,252,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(px, py, rr * 0.7, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  private drawBubbles(game: Game): void {
    const g = this.g;
    for (const b of game.bubbles) {
      const def = POWERS[b.kind];
      const appear = Math.min(1, b.age / 0.25);
      const blink = b.life < 2 && Math.floor(b.life * 6) % 2 === 0 ? 0.35 : 1;
      const r = b.r * (0.6 + 0.4 * appear) * (1 + Math.sin(b.age * 4) * 0.04);
      g.save();
      g.globalAlpha = blink;
      g.translate(b.x, b.y);
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.25);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.55, `${def.color}cc`);
      gr.addColorStop(1, `${def.color}33`);
      g.fillStyle = gr;
      g.shadowColor = def.color;
      g.shadowBlur = 16;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 2;
      g.stroke();
      drawPowerIcon(g, b.kind, r * 1.15, '#0f172a');
      g.restore();
    }
  }

  private drawBossBar(m: Mosquito): void {
    const g = this.g;
    const w = 90;
    const x = m.x - w / 2;
    const y = m.y - m.r * 2.6;
    g.save();
    g.fillStyle = 'rgba(15,23,42,0.7)';
    g.beginPath();
    g.roundRect(x - 3, y - 3, w + 6, 14, 7);
    g.fill();
    g.fillStyle = '#a78bfa';
    g.beginPath();
    g.roundRect(x, y, Math.max(0, (m.hp / m.maxHp) * w), 8, 4);
    g.fill();
    g.restore();
  }

  private drawWelts(game: Game): void {
    const g = this.g;
    for (const w of game.welts) {
      const a = Math.min(1, w.age * 4) * (w.fade > 0 ? Math.max(0, 1 - w.fade / 2.5) : 1);
      if (a <= 0) continue;
      const pulse = 1 + Math.sin(w.age * 6) * 0.05;
      g.save();
      g.globalAlpha = a;
      g.translate(w.x, w.y);
      g.scale(pulse, pulse);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      gr.addColorStop(0, 'rgba(244,114,182,0.85)');
      gr.addColorStop(0.5, 'rgba(251,113,133,0.5)');
      gr.addColorStop(1, 'rgba(251,113,133,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e11d48';
      g.beginPath();
      g.arc(0, 0, 4, 0, Math.PI * 2);
      g.fill();
      // Itch marks.
      g.strokeStyle = 'rgba(225,29,72,0.8)';
      g.lineWidth = 2;
      g.lineCap = 'round';
      for (const [a0, len] of [[-2.4, 10], [-0.7, 12], [0.9, 9]] as const) {
        const wig = Math.sin(w.age * 12 + a0) * 2;
        g.beginPath();
        g.moveTo(Math.cos(a0) * 34, Math.sin(a0) * 34);
        g.lineTo(Math.cos(a0) * (34 + len) + wig, Math.sin(a0) * (34 + len));
        g.stroke();
      }
      g.restore();
    }
  }

  private edgeTint(rgb: string, alpha: number): void {
    const g = this.g;
    const a = Math.min(1, alpha);
    const rg = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.6);
    rg.addColorStop(0, `rgba(${rgb},0)`);
    rg.addColorStop(1, `rgba(${rgb},${a})`);
    g.fillStyle = rg;
    g.fillRect(0, 0, this.w, this.h);
  }

  private drawNetEdge(a: number): void {
    const g = this.g;
    const band = Math.min(60, Math.min(this.w, this.h) * 0.08);
    g.save();
    g.globalAlpha = 0.5 * a;
    g.strokeStyle = '#fef3c7';
    g.lineWidth = 1;
    g.beginPath();
    g.rect(0, 0, this.w, this.h);
    g.rect(band, band, this.w - band * 2, this.h - band * 2);
    g.clip('evenodd');
    for (let x = -this.h; x < this.w; x += 14) {
      g.moveTo(x, 0);
      g.lineTo(x + this.h, this.h);
      g.moveTo(x + this.h, 0);
      g.lineTo(x, this.h);
    }
    g.stroke();
    g.restore();
  }

  /** Buzz sources for the audio engine: nearest mosquitoes to the listener. */
  buzzSources(game: Game, lx: number, ly: number): Array<{ level: number; pan: number; freq: number }> {
    const range = Math.max(this.w, this.h) * 0.75;
    const arr = game.mosquitoes.map((m) => {
      const d = Math.hypot(m.x - lx, m.y - ly);
      const prox = Math.max(0, 1 - d / range);
      const diveBoost = m.state === 'dive' ? 0.4 + m.dive * 0.8 : 0;
      const level = Math.min(1, prox * prox * 0.9 + diveBoost + (m.kind === 'queen' ? 0.3 : 0)) * (m.kind === 'ninja' ? 0.6 : 1);
      const freq = KINDS[m.kind].buzz * (m.state === 'dive' ? 1 + m.dive * 0.25 : 1) * (m.fed ? 0.8 : 1);
      return { level, pan: (m.x - this.w / 2) / (this.w / 2), freq };
    });
    arr.sort((a, b) => b.level - a.level);
    return arr.slice(0, 2);
  }

  static powerColor(k: PowerKind): string {
    return POWERS[k].color;
  }
}
