import type { MosquitoKind } from '../game/config';
import { KINDS } from '../game/config';

/**
 * Vector mosquito art (ported and extended from the original game).
 * The static body is pre-rendered into sprites per kind; wings are drawn live.
 * Local space: head points to +x, origin = thorax centre, R = body radius.
 */

interface Look {
  abd: [string, string, string];
  thorax: [string, string, string];
  head: [string, string, string];
  leg: string;
  stripes: string | null;
  stripeCount: number;
  slim: number;
  belly: number;
  bellyBlood: boolean;
  headband: boolean;
  crown: boolean;
  legBands: boolean;
}

const BASE: Look = {
  abd: ['#9aa6b7', '#5c6675', '#14171b'],
  thorax: ['#b6c1d3', '#657083', '#1a1e24'],
  head: ['#d5deea', '#7b8799', '#22262c'],
  leg: '#0f1216',
  stripes: 'rgba(207,216,227,0.22)',
  stripeCount: 3,
  slim: 1,
  belly: 1,
  bellyBlood: false,
  headband: false,
  crown: false,
  legBands: false,
};

const LOOKS: Record<MosquitoKind, Look> = {
  common: BASE,
  fast: {
    ...BASE,
    abd: ['#b3a58f', '#6d604f', '#1d1813'],
    thorax: ['#c9bba3', '#76685a', '#221c16'],
    head: ['#ddd2bf', '#85776a', '#241e18'],
    slim: 0.78,
    stripes: 'rgba(240,225,200,0.25)',
  },
  tiger: {
    ...BASE,
    abd: ['#50555e', '#1c1f24', '#050607'],
    thorax: ['#5a5f68', '#202329', '#060708'],
    head: ['#6a707a', '#25282e', '#08090a'],
    stripes: 'rgba(255,255,255,0.92)',
    stripeCount: 4,
    legBands: true,
  },
  ninja: {
    ...BASE,
    abd: ['#5b5575', '#2b2740', '#0b0914'],
    thorax: ['#6a6488', '#302b48', '#0d0b17'],
    head: ['#7a7398', '#35304f', '#0e0c18'],
    stripes: null,
    headband: true,
  },
  fat: {
    ...BASE,
    abd: ['#ff9a9a', '#c0303c', '#4a0710'],
    belly: 1.35,
    bellyBlood: true,
    stripes: 'rgba(255,220,220,0.25)',
  },
  golden: {
    ...BASE,
    abd: ['#fff6c2', '#f2b705', '#7a5200'],
    thorax: ['#fffbe0', '#f5c518', '#805a00'],
    head: ['#fffbe8', '#f7d046', '#86600a'],
    leg: '#6b4a00',
    stripes: 'rgba(255,255,255,0.5)',
  },
  queen: {
    ...BASE,
    abd: ['#c7a3ff', '#6d3fc0', '#1d0b3d'],
    thorax: ['#d8bfff', '#7a4fd0', '#221043'],
    head: ['#e6d6ff', '#8b62dd', '#27124a'],
    leg: '#1a0d33',
    stripes: 'rgba(255,215,120,0.55)',
    stripeCount: 4,
    crown: true,
    belly: 1.15,
  },
};

const FED: Partial<Look> = { abd: ['#ff8f8f', '#d11f2e', '#520812'], belly: 1.3, bellyBlood: true };

/** Paints the static body (no wings) at the origin. */
export function paintBody(g: CanvasRenderingContext2D, R: number, kind: MosquitoKind, fed: boolean): void {
  const L: Look = fed ? { ...LOOKS[kind], ...FED } : LOOKS[kind];
  const lw = Math.max(0.8, R / 10);
  g.save();
  g.scale(1, L.slim);

  // LEGS (3 pairs) – behind the body.
  const drawLeg = (ax: number, ay: number, base: number, side: number, phase: number) => {
    const swing = Math.sin(phase) * 0.1;
    const len1 = R * 0.95;
    const len2 = R * 1.15;
    const a1 = base + side * (0.85 + swing);
    const a2 = a1 + side * (0.9 + swing * 0.6);
    const x1 = ax + Math.cos(a1) * len1;
    const y1 = ay + Math.sin(a1) * len1;
    const x2 = x1 + Math.cos(a2) * len2;
    const y2 = y1 + Math.sin(a2) * len2;
    g.strokeStyle = L.leg;
    g.lineWidth = lw * 1.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    if (L.legBands) {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = lw * 1.3;
      for (const t of [0.35, 0.7]) {
        const bx = x1 + (x2 - x1) * t;
        const by = y1 + (y2 - y1) * t;
        const nx = (x2 - x1) * 0.06;
        const ny = (y2 - y1) * 0.06;
        g.beginPath();
        g.moveTo(bx - nx, by - ny);
        g.lineTo(bx + nx, by + ny);
        g.stroke();
      }
    }
  };
  for (const side of [-1, 1]) {
    drawLeg(-R * 0.1, side * R * 0.2, 0.05, side, 0);
    drawLeg(-R * 0.2, side * R * 0.05, -0.1, side, 1.1);
    drawLeg(-R * 0.3, side * -R * 0.1, -0.3, side, 2.2);
  }

  // ABDOMEN
  const bx = -R * 0.95 * (0.9 + 0.1 * L.belly);
  const brx = R * 1.4 * (0.92 + 0.08 * L.belly);
  const bry = R * 0.62 * L.belly;
  const ag = g.createRadialGradient(bx - R * 0.05, -R * 0.3, R * 0.2, bx + R * 0.05, 0, R * 1.8);
  ag.addColorStop(0, L.abd[0]);
  ag.addColorStop(0.25, L.abd[1]);
  ag.addColorStop(1, L.abd[2]);
  g.fillStyle = ag;
  g.beginPath();
  g.ellipse(bx, 0, brx, bry, 0.04, 0, Math.PI * 2);
  g.fill();
  if (L.bellyBlood) {
    // Glossy highlight of a belly full of blood.
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(bx - brx * 0.1, -bry * 0.45, brx * 0.45, bry * 0.18, 0.1, 0, Math.PI * 2);
    g.fill();
  }
  if (L.stripes) {
    g.save();
    g.beginPath();
    g.ellipse(bx, 0, brx, bry, 0.04, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = L.stripes;
    g.lineWidth = L.stripeCount > 3 ? lw * 1.6 : lw;
    for (let k = 0; k < L.stripeCount; k++) {
      const f = (k + 0.5) / L.stripeCount;
      const sx = bx - brx * 0.8 + brx * 1.5 * f;
      g.beginPath();
      g.moveTo(sx - R * 0.15, -bry);
      g.lineTo(sx + R * 0.15, bry);
      g.stroke();
    }
    g.restore();
  }

  // THORAX
  const tg = g.createRadialGradient(-R * 0.2, -R * 0.25, R * 0.2, 0, 0, R);
  tg.addColorStop(0, L.thorax[0]);
  tg.addColorStop(0.35, L.thorax[1]);
  tg.addColorStop(1, L.thorax[2]);
  g.fillStyle = tg;
  g.beginPath();
  g.ellipse(0, 0, R * 0.95, R * 0.68, 0, 0, Math.PI * 2);
  g.fill();
  if (kind === 'tiger') {
    // The white dorsal line of the Asian tiger mosquito.
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = lw * 1.4;
    g.beginPath();
    g.moveTo(-R * 0.55, 0);
    g.lineTo(R * 0.6, 0);
    g.stroke();
  }

  // HEAD
  const hg = g.createRadialGradient(R * 0.75, -R * 0.3, R * 0.1, R * 0.9, 0, R * 0.6);
  hg.addColorStop(0, L.head[0]);
  hg.addColorStop(0.45, L.head[1]);
  hg.addColorStop(1, L.head[2]);
  g.fillStyle = hg;
  g.beginPath();
  g.ellipse(R * 0.9, 0, R * 0.46, R * 0.46, 0, 0, Math.PI * 2);
  g.fill();

  if (L.headband) {
    // Red ninja headband with two ribbons flying back.
    g.fillStyle = '#e11d48';
    g.beginPath();
    g.ellipse(R * 0.82, 0, R * 0.14, R * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e11d48';
    g.lineWidth = lw * 1.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(R * 0.7, -R * 0.1);
    g.quadraticCurveTo(R * 0.2, -R * 0.9, -R * 0.4, -R * 0.75);
    g.moveTo(R * 0.7, R * 0.05);
    g.quadraticCurveTo(R * 0.25, -R * 0.5, -R * 0.2, -R * 0.35);
    g.stroke();
  }

  // Eye
  const eyeScale = kind === 'queen' ? 1.2 : 1;
  g.fillStyle = '#0c0f14';
  g.beginPath();
  g.ellipse(R * 1.0, -R * 0.08, R * 0.22 * eyeScale, R * 0.26 * eyeScale, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(R * 1.08, -R * 0.2, R * 0.06 * eyeScale, 0, Math.PI * 2);
  g.fill();

  // PROBOSCIS
  g.strokeStyle = kind === 'golden' ? '#5a3d00' : '#0e1116';
  g.lineWidth = lw * 1.3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(R * 1.18, 0);
  g.lineTo(R * 2.15, 0);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = lw * 0.6;
  g.beginPath();
  g.moveTo(R * 1.2, -lw * 0.5);
  g.lineTo(R * 1.9, -lw * 0.5);
  g.stroke();

  // ANTENNAE
  g.strokeStyle = L.leg;
  g.lineWidth = lw;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(R * 0.85, side * R * 0.1);
    g.quadraticCurveTo(R * 1.15, side * -R * 0.45, R * 0.5, side * -R * 0.6);
    g.stroke();
  }

  if (L.crown) {
    g.save();
    g.translate(R * 0.8, 0);
    g.rotate(Math.PI / 2);
    // Crown drawn "above" the head (towards -y in rotated space = -x side view from top).
    g.fillStyle = '#fbbf24';
    g.strokeStyle = '#92400e';
    g.lineWidth = lw * 0.8;
    const cw = R * 0.62;
    const ch = R * 0.42;
    g.beginPath();
    g.moveTo(-cw, 0);
    g.lineTo(-cw, -ch);
    g.lineTo(-cw * 0.5, -ch * 0.45);
    g.lineTo(0, -ch * 1.15);
    g.lineTo(cw * 0.5, -ch * 0.45);
    g.lineTo(cw, -ch);
    g.lineTo(cw, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#ef4444';
    g.beginPath();
    g.arc(0, -ch * 0.35, R * 0.08, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.restore();
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Reference body radius the sprite was painted at. */
  R: number;
  /** Half size of the sprite in reference units (CSS px at R). */
  half: number;
}

/** Caches body sprites per kind (+ fed + white-flash variants). */
export class SpriteCache {
  private map = new Map<string, Sprite>();
  private res = 2;

  /** Returns true when the cache was reset (sprites need re-rendering). */
  setResolution(dpr: number): boolean {
    const res = Math.min(5, Math.max(2, dpr * 2.2));
    if (Math.abs(res - this.res) > 0.01 || this.map.size === 0) {
      this.res = res;
      this.map.clear();
      return true;
    }
    return false;
  }

  get(kind: MosquitoKind, variant: 'normal' | 'fed' | 'flash'): Sprite {
    const key = `${kind}:${variant}`;
    let s = this.map.get(key);
    if (!s) {
      s = this.build(kind, variant);
      this.map.set(key, s);
    }
    return s;
  }

  private build(kind: MosquitoKind, variant: 'normal' | 'fed' | 'flash'): Sprite {
    const R = KINDS[kind].radius[1];
    const half = R * 2.6;
    const px = Math.ceil(half * 2 * this.res);
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    const g = c.getContext('2d')!;
    g.setTransform(this.res, 0, 0, this.res, half * this.res, half * this.res);
    paintBody(g, R, kind, variant === 'fed');
    if (variant === 'flash') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(0, 0, px, px);
    }
    return { canvas: c, R, half };
  }
}

/** Live-drawn translucent wings (behind the body). */
export function drawWings(g: CanvasRenderingContext2D, r: number, wingPhase: number, tint: string | null): void {
  const flapT = (Math.sin(wingPhase) + 1) * 0.5;
  const flutter = Math.sin(wingPhase) * 0.22;
  for (const sign of [-1, 1]) {
    g.save();
    g.globalAlpha *= 0.78 + 0.22 * flapT;
    const wingMajor = r * (1.1 + 0.35 * flapT);
    const wingMinor = r * (0.28 + 0.22 * flapT);
    g.translate(-r * 0.1, sign * r * 0.6);
    g.rotate(-Math.PI / 2 + sign * flutter);
    g.fillStyle = tint ?? 'rgba(185,202,220,0.7)';
    g.beginPath();
    g.ellipse(0, 0, wingMajor, wingMinor, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(50,90,130,0.75)';
    g.lineWidth = Math.max(0.7, r / 9);
    g.stroke();
    // Veins
    g.globalAlpha *= 0.55;
    g.strokeStyle = 'rgba(110,140,170,0.8)';
    g.lineWidth = Math.max(0.5, r / 14);
    g.beginPath();
    g.moveTo(-wingMajor * 0.8, 0);
    g.lineTo(wingMajor * 0.8, 0);
    g.moveTo(-wingMajor * 0.5, -wingMinor * 0.2);
    g.lineTo(wingMajor * 0.6, wingMinor * 0.45);
    g.stroke();
    // Highlight
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-wingMajor * 0.08, -wingMinor * 0.22, wingMajor * 0.32, wingMinor * 0.2, 0.1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

/** Standalone portrait (for UI cards): draws a mosquito into a small canvas. */
export function paintPortrait(canvas: HTMLCanvasElement, kind: MosquitoKind, dpr: number): void {
  const size = canvas.width / dpr;
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  const R = KINDS[kind].radius[1];
  const s = (size * 0.36) / (R * 2.2);
  g.translate(size / 2 + R * s * 0.1, size / 2 + R * s * 0.1);
  g.scale(s, s);
  g.rotate(-Math.PI / 5);
  drawWings(g, R, 1.2, kind === 'golden' ? 'rgba(255,236,170,0.75)' : null);
  paintBody(g, R, kind, false);
}
