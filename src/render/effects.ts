/** Blood stains (baked into a fading layer), drips and short-lived particles. */

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export interface SplatColor {
  base: string; // "r,g,b"
  dark: string;
}

export const BLOOD: SplatColor = { base: '110,7,12', dark: '90,6,10' };
export const GOO: SplatColor = { base: '70,78,58', dark: '52,58,44' };

/** Paints a splat blot (ported from the original Splat class) into the stain layer. */
export function paintSplat(g: CanvasRenderingContext2D, x: number, y: number, R: number, orient: number, strength: number, col: SplatColor): void {
  const s = Math.max(0, Math.min(1, strength));
  g.save();
  g.translate(x, y);
  g.rotate(orient + rand(-0.2, 0.2));
  // Irregular blot.
  g.fillStyle = `rgba(${col.base},0.55)`;
  g.beginPath();
  const n = Math.floor(16 + Math.random() * 8);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    let rr = R * (0.55 + 0.25 * s) + R * rand(-0.18, 0.22);
    rr *= 1 - (0.1 + 0.18 * s) * Math.cos(ang - Math.PI);
    const px = Math.cos(ang) * rr;
    const py = Math.sin(ang) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  // Streaks in the swing direction.
  const smear = R * (0.9 + 1.3 * s);
  g.strokeStyle = `rgba(${col.dark},0.6)`;
  g.lineCap = 'round';
  const streaks = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < streaks; i++) {
    const a = rand(-0.35, 0.35);
    const len = smear * (0.55 + Math.random() * 0.6);
    const w = R * (0.12 + 0.16 * Math.random() * (0.5 + s));
    const curve = rand(-0.35, 0.35);
    const so = rand(-R * 0.25, R * 0.25);
    for (let k = 0; k < 2; k++) {
      const ww = w * (1 - k * 0.55);
      const ll = len * (1 - k * 0.28);
      const sx = Math.cos(a) * (R * 0.2 + so);
      const sy = Math.sin(a) * (R * 0.2 + so);
      g.lineWidth = ww;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + Math.cos(a + curve) * ll * 0.45, sy + Math.sin(a + curve) * ll * 0.45, sx + Math.cos(a) * ll, sy + Math.sin(a) * ll);
      g.stroke();
    }
  }
  // Specks flung backwards.
  g.fillStyle = `rgba(${col.dark},0.6)`;
  const specks = Math.floor(10 + Math.random() * 12 + s * 8);
  for (let i = 0; i < specks; i++) {
    const ang = Math.PI + rand(-0.7, 0.7) * 0.6;
    const d = R * (0.5 + Math.random() * 1.8);
    g.beginPath();
    g.arc(Math.cos(ang) * d, Math.sin(ang) * d * 0.65, R * (0.05 + Math.random() * 0.12), 0, Math.PI * 2);
    g.fill();
  }
  // Wet gloss.
  g.globalAlpha = 0.25;
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(-R * 0.2, -R * 0.15, smear * 0.2, R * 0.12, 0.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export interface Drip {
  x: number;
  y: number;
  r: number;
  vy: number;
  age: number;
  life: number;
}

export type Particle =
  | { kind: 'bit'; x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; age: number; life: number; color: string }
  | { kind: 'spark'; x: number; y: number; vx: number; vy: number; age: number; life: number; color: string }
  | { kind: 'star'; x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; size: number }
  | { kind: 'text'; x: number; y: number; vy: number; age: number; life: number; text: string; color: string; size: number }
  | { kind: 'ring'; x: number; y: number; r0: number; r1: number; age: number; life: number; color: string; width: number }
  | { kind: 'bolt'; pts: Array<[number, number]>; age: number; life: number; color: string }
  | { kind: 'flake'; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number };

export class Effects {
  particles: Particle[] = [];
  drips: Drip[] = [];

  clear(): void {
    this.particles = [];
    this.drips = [];
  }

  addDrips(x: number, y: number, R: number, strength: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.drips.push({
        x: x + rand(-R * 0.5, R * 0.5),
        y: y + R * rand(0.2, 0.6),
        r: R * rand(0.1, 0.18) * (0.8 + strength * 0.4),
        vy: rand(14, 40) + strength * 30,
        age: 0,
        life: rand(0.4, 1.3),
      });
    }
    if (this.drips.length > 160) this.drips.splice(0, this.drips.length - 160);
  }

  bits(x: number, y: number, count: number, color: string, speed = 180): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(speed * 0.3, speed);
      this.particles.push({ kind: 'bit', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, rot: Math.random() * 6, vr: rand(-12, 12), size: rand(2, 5), age: 0, life: rand(0.4, 0.8), color });
    }
  }

  sparks(x: number, y: number, count: number, color: string, speed = 260): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(speed * 0.3, speed);
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: rand(0.2, 0.45), color });
    }
  }

  stars(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(40, 160);
      this.particles.push({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, age: 0, life: rand(0.5, 1), color, size: rand(3, 7) });
    }
  }

  flakes(w: number, h: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({ kind: 'flake', x: Math.random() * w, y: rand(-40, h * 0.3), vx: rand(-20, 20), vy: rand(30, 80), age: 0, life: rand(2, 4), size: rand(2, 5) });
    }
  }

  text(x: number, y: number, text: string, color: string, size = 20, life = 0.9): void {
    this.particles.push({ kind: 'text', x, y, vy: -60, age: 0, life, text, color, size });
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.3, width = 3): void {
    this.particles.push({ kind: 'ring', x, y, r0, r1, age: 0, life, color, width });
  }

  bolt(x1: number, y1: number, x2: number, y2: number, color = '#bfdbfe'): void {
    const pts: Array<[number, number]> = [[x1, y1]];
    const segs = 7;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = rand(-0.18, 0.18) * len;
      pts.push([x1 + (x2 - x1) * t + (nx / len) * off, y1 + (y2 - y1) * t + (ny / len) * off]);
    }
    pts.push([x2, y2]);
    this.particles.push({ kind: 'bolt', pts, age: 0, life: 0.25, color });
  }

  /** Advances drips (painting their trails into the stain layer) and particles. */
  update(dt: number, stain: CanvasRenderingContext2D | null, col: SplatColor): void {
    for (const d of this.drips) {
      d.age += dt;
      const t = d.age / d.life;
      if (t >= 1) continue;
      d.vy *= Math.exp(-1.2 * dt);
      d.y += d.vy * dt;
      const rr = d.r * (1 - t * 0.6);
      if (stain) {
        stain.fillStyle = `rgba(${col.dark},${0.35 * (1 - t)})`;
        stain.beginPath();
        stain.arc(d.x, d.y, rr, 0, Math.PI * 2);
        stain.fill();
      }
    }
    this.drips = this.drips.filter((d) => d.age < d.life);

    for (const p of this.particles) {
      p.age += dt;
      switch (p.kind) {
        case 'bit':
          p.vy += 500 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          break;
        case 'spark':
        case 'star':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= Math.exp(-3 * dt);
          p.vy *= Math.exp(-3 * dt);
          break;
        case 'flake':
          p.x += p.vx * dt + Math.sin(p.age * 3) * 12 * dt;
          p.y += p.vy * dt;
          break;
        case 'text':
          p.y += p.vy * dt;
          p.vy *= Math.exp(-2.5 * dt);
          break;
        default:
          break;
      }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  draw(g: CanvasRenderingContext2D, font: string): void {
    for (const p of this.particles) {
      const t = p.age / p.life;
      const a = 1 - t;
      switch (p.kind) {
        case 'bit':
          g.save();
          g.globalAlpha = a;
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 5, p.size, p.size / 2.5);
          g.restore();
          break;
        case 'spark':
          g.save();
          g.globalAlpha = a;
          g.strokeStyle = p.color;
          g.lineWidth = 2;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          g.stroke();
          g.restore();
          break;
        case 'star': {
          g.save();
          g.globalAlpha = a;
          g.fillStyle = p.color;
          g.translate(p.x, p.y);
          g.rotate(p.age * 4);
          const s = p.size * (1 - t * 0.5);
          g.beginPath();
          for (let i = 0; i < 8; i++) {
            const rr = i % 2 === 0 ? s : s * 0.35;
            const an = (i * Math.PI) / 4;
            if (i === 0) g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
            else g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
          }
          g.closePath();
          g.fill();
          g.restore();
          break;
        }
        case 'flake':
          g.save();
          g.globalAlpha = Math.min(1, a * 1.5) * 0.9;
          g.strokeStyle = '#e0f2fe';
          g.lineWidth = 1.2;
          g.translate(p.x, p.y);
          g.rotate(p.age);
          g.beginPath();
          for (let i = 0; i < 3; i++) {
            const an = (i * Math.PI) / 3;
            g.moveTo(-Math.cos(an) * p.size, -Math.sin(an) * p.size);
            g.lineTo(Math.cos(an) * p.size, Math.sin(an) * p.size);
          }
          g.stroke();
          g.restore();
          break;
        case 'text': {
          g.save();
          const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15));
          g.globalAlpha = t > 0.6 ? (1 - t) / 0.4 : 1;
          g.translate(p.x, p.y);
          g.scale(pop, pop);
          g.font = `900 ${p.size}px ${font}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineJoin = 'round';
          g.lineWidth = Math.max(3, p.size / 5);
          g.strokeStyle = 'rgba(15,23,42,0.85)';
          g.strokeText(p.text, 0, 0);
          g.fillStyle = p.color;
          g.fillText(p.text, 0, 0);
          g.restore();
          break;
        }
        case 'ring':
          g.save();
          g.globalAlpha = a;
          g.strokeStyle = p.color;
          g.lineWidth = p.width * (1 - t * 0.5);
          g.beginPath();
          g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - (1 - t) * (1 - t)), 0, Math.PI * 2);
          g.stroke();
          g.restore();
          break;
        case 'bolt':
          g.save();
          g.globalAlpha = a;
          g.strokeStyle = p.color;
          g.shadowColor = '#60a5fa';
          g.shadowBlur = 12;
          g.lineWidth = 3 * a + 1;
          g.lineJoin = 'round';
          g.beginPath();
          p.pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
          g.stroke();
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1.2;
          g.stroke();
          g.restore();
          break;
      }
    }
  }
}
