import type { SceneId } from '../game/config';
import { mulberry32, type Rng } from '../game/rng';

/** Procedurally painted backgrounds + their light sources and ambient animation. */

export interface Light {
  x: number;
  y: number;
  r: number;
  /** 0..1 how much darkness it removes. */
  power: number;
  flicker?: boolean;
  /** The player's own light (cursor / last tap) – gets a warm glow. */
  aim?: boolean;
}

export interface Layout {
  w: number;
  h: number;
  portrait: boolean;
  win: { x: number; y: number; w: number; h: number };
  clock: { x: number; y: number; r: number };
  kid: { x: number; y: number; r: number };
  fire: { x: number; y: number; s: number };
  tent: { x: number; y: number; w: number; h: number };
  pond: { x: number; y: number; rx: number; ry: number };
  horizon: number;
}

export function layoutFor(id: SceneId, w: number, h: number): Layout {
  const portrait = h > w * 1.05;
  const m = Math.min(w, h);
  const L: Layout = {
    w, h, portrait,
    win: { x: 0, y: 0, w: 0, h: 0 },
    clock: { x: 0, y: 0, r: 0 },
    kid: { x: 0, y: 0, r: 0 },
    fire: { x: 0, y: 0, s: 0 },
    tent: { x: 0, y: 0, w: 0, h: 0 },
    pond: { x: 0, y: 0, rx: 0, ry: 0 },
    horizon: h * 0.68,
  };
  if (id === 'kitchen') {
    L.win = portrait
      ? { x: w * 0.14, y: h * 0.15, w: w * 0.72, h: h * 0.22 }
      : { x: w * 0.56, y: h * 0.14, w: Math.min(w * 0.3, 440), h: Math.min(h * 0.36, 300) };
    L.clock = portrait ? { x: w * 0.24, y: h * 0.5, r: m * 0.1 } : { x: w * 0.2, y: h * 0.27, r: m * 0.07 };
  } else if (id === 'bedroom') {
    L.win = portrait
      ? { x: w * 0.16, y: h * 0.12, w: w * 0.68, h: h * 0.24 }
      : { x: w * 0.1, y: h * 0.13, w: Math.min(w * 0.28, 400), h: Math.min(h * 0.42, 340) };
    L.kid = portrait ? { x: w * 0.28, y: h * 0.7, r: m * 0.075 } : { x: w * 0.64, y: h * 0.62, r: m * 0.065 };
  } else if (id === 'camp') {
    L.horizon = h * (portrait ? 0.55 : 0.56);
    L.pond = { x: w * 0.5, y: L.horizon + h * 0.07, rx: w * 0.55, ry: h * 0.075 };
    L.tent = portrait
      ? { x: w * 0.04, y: h * 0.9, w: w * 0.46, h: h * 0.2 }
      : { x: w * 0.06, y: h * 0.92, w: Math.min(w * 0.26, 360), h: Math.min(h * 0.3, 250) };
    L.fire = portrait ? { x: w * 0.72, y: h * 0.9, s: m * 0.1 } : { x: w * 0.62, y: h * 0.9, s: m * 0.075 };
  } else if (id === 'garden') {
    L.horizon = h * 0.66;
    L.pond = portrait
      ? { x: w * 0.55, y: h * 0.87, rx: w * 0.34, ry: h * 0.05 }
      : { x: w * 0.76, y: h * 0.86, rx: w * 0.15, ry: h * 0.06 };
  }
  return L;
}

function grad(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const lg = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) lg.addColorStop(o, c);
  return lg;
}

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, color.replace('A', String(alpha)));
  rg.addColorStop(1, color.replace('A', '0'));
  g.fillStyle = rg;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------------ kitchen

function paintKitchen(g: CanvasRenderingContext2D, L: Layout, rng: Rng): void {
  const { w, h } = L;
  const counterY = h * (L.portrait ? 0.8 : 0.76);
  g.fillStyle = grad(g, 0, 0, 0, counterY, [[0, '#fff9ee'], [1, '#f5e5c9']]);
  g.fillRect(0, 0, w, counterY);
  // Wallpaper stripes.
  g.fillStyle = 'rgba(214,170,110,0.07)';
  for (let x = 0; x < w; x += 44) g.fillRect(x, 0, 18, counterY);
  // Tiny flowers on the wallpaper.
  g.fillStyle = 'rgba(214,150,110,0.12)';
  for (let y = 30; y < counterY - 80; y += 60) {
    for (let x = ((y / 60) % 2) * 22 + 9; x < w; x += 44) {
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Window with sky and hills.
  const W = L.win;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.fillRect(W.x - 10, W.y - 6, W.w + 26, W.h + 26);
  g.beginPath();
  g.rect(W.x, W.y, W.w, W.h);
  g.clip();
  g.fillStyle = grad(g, 0, W.y, 0, W.y + W.h, [[0, '#7cc7ff'], [1, '#e2f4ff']]);
  g.fillRect(W.x, W.y, W.w, W.h);
  glow(g, W.x + W.w * 0.78, W.y + W.h * 0.22, W.w * 0.35, 'rgba(255,244,190,A)', 0.9);
  g.fillStyle = '#fff6c9';
  g.beginPath();
  g.arc(W.x + W.w * 0.78, W.y + W.h * 0.22, Math.min(W.w, W.h) * 0.08, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < 3; i++) {
    const cx = W.x + W.w * (0.15 + 0.3 * i + rng() * 0.1);
    const cy = W.y + W.h * (0.2 + rng() * 0.25);
    const s = Math.min(W.w, W.h) * 0.07;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.ellipse(cx + (k - 1.5) * s * 0.9, cy + (k % 2) * s * 0.2, s * 1.1, s * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = '#86c77a';
  g.beginPath();
  g.moveTo(W.x, W.y + W.h);
  for (let x = 0; x <= W.w; x += 8) g.lineTo(W.x + x, W.y + W.h * 0.78 - Math.sin(x / W.w * 5) * W.h * 0.06);
  g.lineTo(W.x + W.w, W.y + W.h);
  g.fill();
  g.fillStyle = '#5ea85a';
  g.beginPath();
  g.moveTo(W.x, W.y + W.h);
  for (let x = 0; x <= W.w; x += 8) g.lineTo(W.x + x, W.y + W.h * 0.88 - Math.sin(x / W.w * 3 + 1) * W.h * 0.05);
  g.lineTo(W.x + W.w, W.y + W.h);
  g.fill();
  g.restore();
  // Frame + mullions.
  g.strokeStyle = '#ffffff';
  g.lineWidth = 12;
  g.strokeRect(W.x, W.y, W.w, W.h);
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(W.x + W.w / 2, W.y);
  g.lineTo(W.x + W.w / 2, W.y + W.h);
  g.moveTo(W.x, W.y + W.h * 0.45);
  g.lineTo(W.x + W.w, W.y + W.h * 0.45);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  g.strokeRect(W.x - 6, W.y - 6, W.w + 12, W.h + 12);
  // Sill.
  g.fillStyle = '#c98f5a';
  g.fillRect(W.x - 18, W.y + W.h + 6, W.w + 36, 10);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(W.x - 18, W.y + W.h + 16, W.w + 36, 4);
  // Potted herb on the sill.
  const px = W.x + W.w * 0.2;
  const py = W.y + W.h + 6;
  g.fillStyle = '#d9774b';
  g.beginPath();
  g.moveTo(px - 16, py - 26);
  g.lineTo(px + 16, py - 26);
  g.lineTo(px + 12, py);
  g.lineTo(px - 12, py);
  g.fill();
  g.fillStyle = '#3f9b4f';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32;
    g.beginPath();
    g.ellipse(px + Math.cos(a) * 16, py - 30 + Math.sin(a) * 16, 9, 4.5, a, 0, Math.PI * 2);
    g.fill();
  }

  // Curtains (red gingham).
  const cw = Math.max(34, W.w * 0.2);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? W.x - 22 : W.x + W.w + 22;
    g.save();
    g.beginPath();
    g.moveTo(x0, W.y - 16);
    g.lineTo(x0 - side * cw, W.y - 16);
    g.quadraticCurveTo(x0 - side * cw * 0.35, W.y + W.h * 0.55, x0 - side * cw * 0.55, W.y + W.h + 18);
    g.lineTo(x0 + side * 4, W.y + W.h + 18);
    g.closePath();
    g.fillStyle = '#e8605c';
    g.fill();
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let yy = W.y - 16; yy < W.y + W.h + 20; yy += 14) g.fillRect(Math.min(x0, x0 - side * cw) - 4, yy, cw + 30, 6);
    for (let xx = Math.min(x0, x0 - side * cw) - 4; xx < Math.max(x0, x0 - side * cw) + 30; xx += 14) g.fillRect(xx, W.y - 16, 6, W.h + 40);
    g.restore();
  }
  // Curtain rod.
  g.fillStyle = '#8b5a3c';
  g.fillRect(W.x - cw - 30, W.y - 22, W.w + cw * 2 + 60, 6);

  // Clock face (hands are drawn as ambient animation).
  const C = L.clock;
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.beginPath();
  g.arc(C.x + 4, C.y + 5, C.r + 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#334155';
  g.beginPath();
  g.arc(C.x, C.y, C.r + 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(C.x, C.y, C.r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#334155';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 === 0 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(C.x + Math.cos(a) * C.r * 0.78, C.y + Math.sin(a) * C.r * 0.78);
    g.lineTo(C.x + Math.cos(a) * C.r * 0.92, C.y + Math.sin(a) * C.r * 0.92);
    g.stroke();
  }

  // Shelf with jars.
  const sx = L.portrait ? w * 0.52 : w * 0.07;
  const sw = L.portrait ? w * 0.4 : Math.min(w * 0.3, 380);
  const sy = L.portrait ? h * 0.52 : h * 0.52;
  const jarColors = ['#e0484f', '#f0a830', '#7cb342', '#8d6e63'];
  const jars = Math.max(3, Math.floor(sw / 70));
  for (let i = 0; i < jars; i++) {
    const jx = sx + 18 + i * ((sw - 36) / jars);
    const jh = 34 + (i % 2) * 12;
    const jw = 30;
    g.fillStyle = 'rgba(210,235,245,0.55)';
    g.beginPath();
    g.roundRect(jx, sy - jh, jw, jh, 6);
    g.fill();
    g.fillStyle = jarColors[i % jarColors.length]!;
    g.beginPath();
    g.roundRect(jx + 3, sy - jh * 0.7, jw - 6, jh * 0.7 - 3, 4);
    g.fill();
    g.fillStyle = '#e2e8f0';
    g.fillRect(jx - 1, sy - jh - 6, jw + 2, 7);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(jx + 5, sy - jh + 6, 4, jh - 14);
  }
  g.fillStyle = '#a86b3c';
  g.fillRect(sx, sy, sw, 10);
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(sx, sy + 10, sw, 5);
  g.fillStyle = '#7c4a24';
  g.fillRect(sx + 12, sy + 10, 6, 20);
  g.fillRect(sx + sw - 18, sy + 10, 6, 20);

  // Tiled backsplash.
  const tileTop = counterY - Math.min(110, h * 0.12);
  const ts = 30;
  g.fillStyle = '#f8fbff';
  g.fillRect(0, tileTop, w, counterY - tileTop);
  g.strokeStyle = '#c9dde8';
  g.lineWidth = 2;
  for (let y = tileTop; y <= counterY; y += ts) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let x = 0; x <= w; x += ts) {
    g.beginPath();
    g.moveTo(x, tileTop);
    g.lineTo(x, counterY);
    g.stroke();
  }
  g.fillStyle = 'rgba(80,150,210,0.25)';
  for (let y = tileTop; y < counterY - 4; y += ts) {
    for (let x = 0; x < w; x += ts) {
      if (rng() < 0.12) {
        g.beginPath();
        g.moveTo(x + ts / 2, y + 5);
        g.lineTo(x + ts - 5, y + ts / 2);
        g.lineTo(x + ts / 2, y + ts - 5);
        g.lineTo(x + 5, y + ts / 2);
        g.fill();
      }
    }
  }

  // Counter + cabinets.
  g.fillStyle = '#d9a86c';
  g.fillRect(0, counterY, w, 16);
  g.fillStyle = '#b98449';
  g.fillRect(0, counterY + 16, w, 5);
  g.fillStyle = '#9cc7b5';
  g.fillRect(0, counterY + 21, w, h - counterY - 21);
  const doorW = Math.max(110, w / Math.round(w / 170));
  for (let x = 0; x < w; x += doorW) {
    g.strokeStyle = 'rgba(40,80,70,0.35)';
    g.lineWidth = 2;
    g.strokeRect(x + 10, counterY + 32, doorW - 20, h - counterY - 44);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.strokeRect(x + 18, counterY + 40, doorW - 36, h - counterY - 60);
    g.fillStyle = '#e5e7eb';
    g.beginPath();
    g.arc(x + doorW - 26, counterY + 50, 5, 0, Math.PI * 2);
    g.fill();
  }

  // Fruit bowl and kettle on the counter.
  const bx = L.portrait ? w * 0.3 : w * 0.36;
  const bw = 70;
  const fruit: Array<[number, number, number, string]> = [
    [-26, -16, 14, '#fb923c'], [0, -24, 15, '#ef4444'], [24, -15, 13, '#84cc16'], [-8, -8, 13, '#f59e0b'],
  ];
  for (const [dx, dy, r, c] of fruit) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(bx + dx, counterY + dy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(bx + dx - r * 0.35, counterY + dy - r * 0.35, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#3b82f6';
  g.beginPath();
  g.ellipse(bx, counterY - 4, bw / 2, 20, 0, 0, Math.PI);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(bx - bw / 2 + 6, counterY - 2, bw - 12, 3);

  const kx = L.portrait ? w * 0.74 : w * 0.8;
  g.fillStyle = '#ef4444';
  g.beginPath();
  g.ellipse(kx, counterY - 28, 32, 28, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(kx - 34, counterY - 10, 68, 10);
  g.strokeStyle = '#1f2937';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(kx, counterY - 56, 20, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();
  g.fillStyle = '#ef4444';
  g.beginPath();
  g.moveTo(kx + 26, counterY - 34);
  g.lineTo(kx + 52, counterY - 50);
  g.lineTo(kx + 54, counterY - 44);
  g.lineTo(kx + 30, counterY - 20);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.beginPath();
  g.ellipse(kx - 12, counterY - 38, 8, 12, -0.4, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------------ garden

function paintGarden(g: CanvasRenderingContext2D, L: Layout, rng: Rng): void {
  const { w, h } = L;
  const hy = L.horizon;
  g.fillStyle = grad(g, 0, 0, 0, hy, [[0, '#1f2461'], [0.42, '#6b3f86'], [0.7, '#e0708a'], [0.86, '#ffa66b'], [1, '#ffd58a']]);
  g.fillRect(0, 0, w, hy + 2);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i++) {
    const x = rng() * w;
    const y = rng() * hy * 0.35;
    g.globalAlpha = 0.2 + rng() * 0.5;
    g.fillRect(x, y, 1.6, 1.6);
  }
  g.globalAlpha = 1;
  const sunX = w * 0.62;
  glow(g, sunX, hy - 8, Math.min(w, h) * 0.4, 'rgba(255,200,120,A)', 0.55);
  g.fillStyle = '#ffd27a';
  g.beginPath();
  g.arc(sunX, hy - 8, Math.min(w, h) * 0.07, 0, Math.PI * 2);
  g.fill();
  // Hills.
  const hill = (base: number, amp: number, freq: number, phase: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) g.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x / w * freq + phase)) - amp * 0.3 * Math.sin(x / w * freq * 2.7 + phase * 2));
    g.lineTo(w, h);
    g.fill();
  };
  hill(hy, h * 0.06, 5, 1, '#8a4f78');
  hill(hy + h * 0.02, h * 0.05, 7, 3, '#5a3663');
  // Trees.
  const tree = (x: number, base: number, s: number) => {
    g.fillStyle = '#2a1d3a';
    g.fillRect(x - s * 0.07, base - s * 0.55, s * 0.14, s * 0.55);
    const blobs: Array<[number, number, number]> = [[0, -0.75, 0.38], [-0.28, -0.6, 0.3], [0.3, -0.62, 0.3], [-0.12, -0.95, 0.28], [0.16, -0.92, 0.26]];
    for (const [dx, dy, r] of blobs) {
      g.beginPath();
      g.arc(x + dx * s, base + dy * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  };
  tree(w * 0.1, hy + h * 0.08, Math.min(h * 0.5, w * 0.35));
  tree(w * 0.9, hy + h * 0.06, Math.min(h * 0.36, w * 0.26));
  // Fence.
  const fy = hy + h * 0.03;
  const fh = h * 0.1;
  g.fillStyle = '#5b3a2e';
  g.fillRect(0, fy + fh * 0.3, w, 7);
  g.fillRect(0, fy + fh * 0.72, w, 7);
  for (let x = 6; x < w; x += 26) {
    g.fillStyle = '#6b4636';
    g.beginPath();
    g.moveTo(x, fy + fh);
    g.lineTo(x, fy + 10);
    g.lineTo(x + 8, fy);
    g.lineTo(x + 16, fy + 10);
    g.lineTo(x + 16, fy + fh);
    g.fill();
    g.fillStyle = 'rgba(255,170,110,0.35)';
    g.fillRect(x + 11, fy + 10, 5, fh - 10);
  }
  // Grass.
  const gy = fy + fh * 0.8;
  g.fillStyle = grad(g, 0, gy, 0, h, [[0, '#3a6b45'], [1, '#17301f']]);
  g.fillRect(0, gy, w, h - gy);
  g.strokeStyle = 'rgba(20,45,28,0.8)';
  g.lineWidth = 1.5;
  for (let i = 0; i < w / 3; i++) {
    const x = rng() * w;
    const y = gy + rng() * (h - gy);
    const l = 6 + rng() * 12;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 3, y - l * 0.6, x + (rng() - 0.5) * 8, y - l);
    g.stroke();
  }
  // Pond.
  const P = L.pond;
  g.fillStyle = grad(g, 0, P.y - P.ry, 0, P.y + P.ry, [[0, '#f0a080'], [0.5, '#7a4f8c'], [1, '#2d2a55']]);
  g.beginPath();
  g.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,220,180,0.35)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(P.x + (i - 1.5) * P.rx * 0.3, P.y + (i % 2) * P.ry * 0.3, P.rx * 0.18, P.ry * 0.12, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // Flowers.
  const colors = ['#f472b6', '#fde047', '#fb7185', '#c4b5fd'];
  for (let i = 0; i < Math.floor(w / 60); i++) {
    const x = rng() * w;
    const y = gy + 20 + rng() * (h - gy - 30);
    if (Math.hypot((x - P.x) / P.rx, (y - P.y) / P.ry) < 1.2) continue;
    g.strokeStyle = '#1f4a2a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y + 14);
    g.lineTo(x, y);
    g.stroke();
    g.fillStyle = colors[i % colors.length]!;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fef3c7';
    g.beginPath();
    g.arc(x, y, 2.4, 0, Math.PI * 2);
    g.fill();
  }
  // String lights.
  const y0 = h * 0.11;
  const sag = h * 0.09;
  g.strokeStyle = 'rgba(20,20,30,0.7)';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = 0; x <= w; x += 8) {
    const t = x / w;
    const y = y0 + sag * 4 * t * (1 - t);
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const bulbColors = ['255,214,120', '255,160,110', '255,120,170', '160,230,255'];
  let bi = 0;
  for (let x = 20; x < w; x += 46) {
    const t = x / w;
    const y = y0 + sag * 4 * t * (1 - t) + 7;
    const c = bulbColors[bi++ % bulbColors.length]!;
    glow(g, x, y, 22, `rgba(${c},A)`, 0.5);
    g.fillStyle = `rgb(${c})`;
    g.beginPath();
    g.ellipse(x, y, 4, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
}

// ------------------------------------------------------------------ bedroom

function paintBedroom(g: CanvasRenderingContext2D, L: Layout, rng: Rng): void {
  const { w, h } = L;
  const floorY = h * 0.84;
  g.fillStyle = grad(g, 0, 0, 0, floorY, [[0, '#26336b'], [1, '#1a2350']]);
  g.fillRect(0, 0, w, floorY);
  // Wallpaper: tiny stars.
  g.fillStyle = 'rgba(200,210,255,0.08)';
  for (let y = 24; y < floorY; y += 48) {
    for (let x = ((y / 48) % 2) * 24 + 12; x < w; x += 48) {
      g.save();
      g.translate(x, y);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? 5 : 2;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.fill();
      g.restore();
    }
  }
  // Floor.
  g.fillStyle = grad(g, 0, floorY, 0, h, [[0, '#3a2a3a'], [1, '#231824']]);
  g.fillRect(0, floorY, w, h - floorY);
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 2;
  for (let y = floorY + 16; y < h; y += 18) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.fillStyle = '#2b2038';
  g.fillRect(0, floorY - 8, w, 10);

  // Window with the moon.
  const W = L.win;
  g.save();
  g.beginPath();
  g.rect(W.x, W.y, W.w, W.h);
  g.clip();
  g.fillStyle = grad(g, 0, W.y, 0, W.y + W.h, [[0, '#070b24'], [1, '#1b2a62']]);
  g.fillRect(W.x, W.y, W.w, W.h);
  for (let i = 0; i < 50; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.6})`;
    const s = rng() < 0.15 ? 2.2 : 1.3;
    g.fillRect(W.x + rng() * W.w, W.y + rng() * W.h, s, s);
  }
  const mx = W.x + W.w * 0.68;
  const my = W.y + W.h * 0.3;
  const mr = Math.min(W.w, W.h) * 0.14;
  glow(g, mx, my, mr * 4, 'rgba(200,215,255,A)', 0.35);
  g.fillStyle = '#fdf6d8';
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(200,190,150,0.45)';
  for (const [dx, dy, r] of [[-0.3, -0.2, 0.2], [0.25, 0.1, 0.15], [-0.05, 0.35, 0.12]] as const) {
    g.beginPath();
    g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2);
    g.fill();
  }
  // Rooftops silhouette.
  g.fillStyle = '#0a0f26';
  g.beginPath();
  g.moveTo(W.x, W.y + W.h);
  let x = W.x;
  while (x < W.x + W.w) {
    const bw = 30 + rng() * 50;
    const bh = W.h * (0.12 + rng() * 0.18);
    g.lineTo(x, W.y + W.h - bh);
    g.lineTo(x + bw, W.y + W.h - bh);
    x += bw;
  }
  g.lineTo(W.x + W.w, W.y + W.h);
  g.fill();
  g.fillStyle = 'rgba(255,220,130,0.8)';
  for (let i = 0; i < 6; i++) g.fillRect(W.x + rng() * W.w, W.y + W.h * (0.9 + rng() * 0.06), 4, 5);
  g.restore();
  g.strokeStyle = '#3a4580';
  g.lineWidth = 12;
  g.strokeRect(W.x, W.y, W.w, W.h);
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(W.x + W.w / 2, W.y);
  g.lineTo(W.x + W.w / 2, W.y + W.h);
  g.stroke();
  g.fillStyle = '#4a5596';
  g.fillRect(W.x - 16, W.y + W.h + 6, W.w + 32, 9);
  // Curtains.
  const cw = Math.max(30, W.w * 0.18);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? W.x - 18 : W.x + W.w + 18;
    g.fillStyle = '#5b3f8c';
    g.beginPath();
    g.moveTo(x0, W.y - 18);
    g.lineTo(x0 - side * cw, W.y - 18);
    g.quadraticCurveTo(x0 - side * cw * 0.2, W.y + W.h * 0.6, x0 - side * cw * 0.5, W.y + W.h + 24);
    g.lineTo(x0 + side * 6, W.y + W.h + 24);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo(x0 - side * cw * (k / 4), W.y - 16);
      g.quadraticCurveTo(x0 - side * cw * (k / 8), W.y + W.h * 0.6, x0 - side * cw * (0.1 + k / 10), W.y + W.h + 20);
      g.stroke();
    }
  }
  // Moonlight shaft.
  g.fillStyle = grad(g, 0, W.y + W.h, 0, floorY + 30, [[0, 'rgba(190,210,255,0.14)'], [1, 'rgba(190,210,255,0.02)']]);
  g.beginPath();
  g.moveTo(W.x, W.y + W.h);
  g.lineTo(W.x + W.w, W.y + W.h);
  g.lineTo(W.x + W.w * 1.5, floorY + 30);
  g.lineTo(W.x + W.w * 0.3, floorY + 30);
  g.closePath();
  g.fill();

  // Poster (rocket).
  const px = L.portrait ? w * 0.66 : w * 0.46;
  const py = L.portrait ? h * 0.42 : h * 0.2;
  const pw = Math.min(110, w * 0.2);
  const ph = pw * 1.3;
  g.fillStyle = '#f2e8cf';
  g.fillRect(px, py, pw, ph);
  g.fillStyle = '#20295a';
  g.fillRect(px + 6, py + 6, pw - 12, ph - 12);
  g.fillStyle = '#e2e8f0';
  g.beginPath();
  g.ellipse(px + pw / 2, py + ph / 2, pw * 0.13, ph * 0.28, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ef4444';
  g.beginPath();
  g.moveTo(px + pw / 2, py + ph * 0.18);
  g.lineTo(px + pw * 0.4, py + ph * 0.33);
  g.lineTo(px + pw * 0.6, py + ph * 0.33);
  g.fill();
  g.fillStyle = '#60a5fa';
  g.beginPath();
  g.arc(px + pw / 2, py + ph * 0.45, pw * 0.06, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f59e0b';
  g.beginPath();
  g.moveTo(px + pw * 0.43, py + ph * 0.76);
  g.lineTo(px + pw * 0.5, py + ph * 0.92);
  g.lineTo(px + pw * 0.57, py + ph * 0.76);
  g.fill();

  // Bed with a sleeping kid.
  const K = L.kid;
  const bedX = L.portrait ? w * 0.06 : w * 0.52;
  const bedW = L.portrait ? w * 0.88 : Math.min(w * 0.42, 560);
  const bedTop = K.y + K.r * 0.2;
  const bedBottom = floorY + 6;
  g.fillStyle = '#5a3b2c';
  g.beginPath();
  g.roundRect(bedX - 10, bedTop - K.r * 2.2, 26, bedBottom - bedTop + K.r * 2.2, 8);
  g.fill();
  g.fillStyle = '#6d4a38';
  g.fillRect(bedX + bedW - 14, bedTop + K.r * 0.4, 20, bedBottom - bedTop - K.r * 0.4);
  g.fillStyle = '#c7cfe8';
  g.fillRect(bedX, bedTop + K.r * 0.6, bedW, (bedBottom - bedTop) * 0.45);
  // Pillow.
  g.fillStyle = '#dfe5f6';
  g.beginPath();
  g.ellipse(bedX + K.r * 2.2, bedTop + K.r * 0.2, K.r * 1.9, K.r * 0.95, 0, 0, Math.PI * 2);
  g.fill();
  // Kid's head.
  g.fillStyle = '#d8ae8e';
  g.beginPath();
  g.arc(K.x, K.y, K.r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#6b3f22';
  g.beginPath();
  g.arc(K.x, K.y - K.r * 0.15, K.r * 1.02, Math.PI * 0.95, Math.PI * 2.05);
  g.fill();
  g.strokeStyle = '#5b3a24';
  g.lineWidth = 2;
  for (const dx of [-0.38, 0.38]) {
    g.beginPath();
    g.arc(K.x + dx * K.r, K.y + K.r * 0.1, K.r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  g.fillStyle = 'rgba(240,120,120,0.45)';
  for (const dx of [-0.55, 0.55]) {
    g.beginPath();
    g.arc(K.x + dx * K.r, K.y + K.r * 0.42, K.r * 0.14, 0, Math.PI * 2);
    g.fill();
  }
  // Blanket.
  g.fillStyle = '#3f5bb5';
  g.beginPath();
  g.moveTo(bedX + K.r * 0.2, bedTop + K.r * 0.95);
  g.quadraticCurveTo(bedX + bedW * 0.5, bedTop + K.r * 0.2, bedX + bedW, bedTop + K.r * 0.7);
  g.lineTo(bedX + bedW + 4, bedBottom - (bedBottom - bedTop) * 0.2);
  g.lineTo(bedX - 4, bedBottom - (bedBottom - bedTop) * 0.2);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,230,140,0.55)';
  for (let i = 0; i < 12; i++) {
    const sx = bedX + 20 + rng() * (bedW - 40);
    const sy = bedTop + K.r * 1.2 + rng() * ((bedBottom - bedTop) * 0.5 - K.r * 0.8);
    g.beginPath();
    g.arc(sx, sy, 2.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#34489a';
  g.fillRect(bedX - 4, bedBottom - (bedBottom - bedTop) * 0.2, bedW + 8, (bedBottom - bedTop) * 0.2);

  // Nightstand + lamp (off).
  const nx = L.portrait ? w * 0.72 : bedX - 90;
  const ny = L.portrait ? bedTop - K.r * 2.6 : floorY - 70;
  if (!L.portrait) {
    g.fillStyle = '#5a3b2c';
    g.fillRect(nx, ny, 70, 70);
    g.fillStyle = '#6d4a38';
    g.fillRect(nx + 6, ny + 10, 58, 22);
    g.fillStyle = '#e5c07b';
    g.beginPath();
    g.arc(nx + 35, ny + 21, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#94a3b8';
    g.fillRect(nx + 32, ny - 30, 6, 30);
    g.fillStyle = '#8b5cf6';
    g.beginPath();
    g.moveTo(nx + 16, ny - 28);
    g.lineTo(nx + 54, ny - 28);
    g.lineTo(nx + 46, ny - 58);
    g.lineTo(nx + 24, ny - 58);
    g.fill();
  }
}

// ------------------------------------------------------------------ camp

function paintCamp(g: CanvasRenderingContext2D, L: Layout, rng: Rng): void {
  const { w, h } = L;
  const hy = L.horizon;
  g.fillStyle = grad(g, 0, 0, 0, hy, [[0, '#040716'], [0.6, '#0d1636'], [1, '#1c2a55']]);
  g.fillRect(0, 0, w, hy + 2);
  // Milky way + stars.
  for (let i = 0; i < 260; i++) {
    const t = rng();
    const bx = t * w;
    const by = hy * 0.9 - t * hy * 0.8 + (rng() - 0.5) * hy * 0.25;
    g.fillStyle = `rgba(210,220,255,${0.05 + rng() * 0.12})`;
    g.fillRect(bx, by, 2, 2);
  }
  for (let i = 0; i < 140; i++) {
    const s = rng() < 0.1 ? 2.2 : 1.2;
    g.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.7})`;
    g.fillRect(rng() * w, rng() * hy * 0.95, s, s);
  }
  // Crescent moon.
  const mx = w * 0.8;
  const my = h * 0.16;
  const mr = Math.min(w, h) * 0.05;
  glow(g, mx, my, mr * 5, 'rgba(190,205,255,A)', 0.25);
  g.save();
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#fdf6d8';
  g.beginPath();
  g.rect(mx - mr, my - mr, mr * 2, mr * 2);
  g.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, Math.PI * 2);
  g.fill('evenodd');
  g.restore();
  // Forest silhouette.
  g.fillStyle = '#06110d';
  g.beginPath();
  g.moveTo(0, hy + 4);
  for (let x = 0; x <= w + 20; x += 14 + rng() * 10) {
    const th = h * (0.05 + rng() * 0.08);
    g.lineTo(x - 8, hy - th * 0.35);
    g.lineTo(x, hy - th);
    g.lineTo(x + 8, hy - th * 0.35);
  }
  g.lineTo(w, hy + 4);
  g.fill();
  // Ground + pond.
  g.fillStyle = grad(g, 0, hy, 0, h, [[0, '#0e2217'], [1, '#07130c']]);
  g.fillRect(0, hy, w, h - hy);
  const P = L.pond;
  g.fillStyle = grad(g, 0, P.y - P.ry, 0, P.y + P.ry, [[0, '#1c2c5e'], [1, '#0a1233']]);
  g.beginPath();
  g.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, Math.PI * 2);
  g.fill();
  // Moon reflection.
  g.fillStyle = 'rgba(253,246,216,0.45)';
  for (let i = 0; i < 7; i++) {
    const ww = mr * (1.4 - i * 0.12);
    g.fillRect(mx - ww / 2 + (rng() - 0.5) * 8, P.y - P.ry * 0.7 + i * P.ry * 0.22, ww, 2.5);
  }
  // Reeds.
  g.strokeStyle = '#040a07';
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = P.x + side * P.rx * (0.75 + rng() * 0.3);
    const y = P.y + (rng() - 0.3) * P.ry;
    const l = 20 + rng() * 34;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + side * 4, y - l * 0.6, x + side * (rng() * 6), y - l);
    g.stroke();
    if (rng() < 0.4) {
      g.fillStyle = '#1a0f08';
      g.beginPath();
      g.ellipse(x + side * 3, y - l * 0.85, 2.5, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Tent.
  const T = L.tent;
  g.fillStyle = '#c2410c';
  g.beginPath();
  g.moveTo(T.x, T.y);
  g.lineTo(T.x + T.w * 0.5, T.y - T.h);
  g.lineTo(T.x + T.w, T.y);
  g.fill();
  g.fillStyle = '#ea8a1a';
  g.beginPath();
  g.moveTo(T.x + T.w * 0.5, T.y - T.h);
  g.lineTo(T.x + T.w, T.y);
  g.lineTo(T.x + T.w * 0.62, T.y);
  g.fill();
  g.fillStyle = '#ffcf6b';
  g.beginPath();
  g.moveTo(T.x + T.w * 0.38, T.y);
  g.lineTo(T.x + T.w * 0.5, T.y - T.h * 0.62);
  g.lineTo(T.x + T.w * 0.62, T.y);
  g.fill();
  glow(g, T.x + T.w * 0.5, T.y - T.h * 0.2, T.w * 0.45, 'rgba(255,200,110,A)', 0.4);
  g.strokeStyle = '#3b1d06';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(T.x + T.w * 0.5, T.y - T.h);
  g.lineTo(T.x + T.w * 0.5, T.y - T.h - 12);
  g.stroke();
  // Fire pit (flames are ambient).
  const F = L.fire;
  g.fillStyle = '#4b5563';
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    g.beginPath();
    g.ellipse(F.x + Math.cos(a) * F.s * 0.75, F.y + 4 + Math.sin(a) * -F.s * 0.12, F.s * 0.16, F.s * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#5b3a1e';
  g.save();
  g.translate(F.x, F.y);
  g.rotate(0.35);
  g.fillRect(-F.s * 0.6, -F.s * 0.07, F.s * 1.2, F.s * 0.14);
  g.rotate(-0.7);
  g.fillRect(-F.s * 0.6, -F.s * 0.07, F.s * 1.2, F.s * 0.14);
  g.restore();
}

export function paintScene(g: CanvasRenderingContext2D, id: SceneId, L: Layout): void {
  const rng = mulberry32(id.length * 7919 + 13);
  switch (id) {
    case 'kitchen': paintKitchen(g, L, rng); break;
    case 'garden': paintGarden(g, L, rng); break;
    case 'bedroom': paintBedroom(g, L, rng); break;
    case 'camp': paintCamp(g, L, rng); break;
  }
}

export function sceneLights(id: SceneId, L: Layout, t: number): Light[] {
  if (id === 'bedroom') {
    const W = L.win;
    return [
      { x: W.x + W.w / 2, y: W.y + W.h / 2, r: Math.max(W.w, W.h) * 0.9, power: 0.85 },
      { x: W.x + W.w * 0.9, y: L.h * 0.84, r: W.w * 0.8, power: 0.35 },
    ];
  }
  if (id === 'camp') {
    const F = L.fire;
    const fl = 1 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23) * 0.03;
    return [
      { x: F.x, y: F.y - F.s * 0.5, r: Math.min(L.w, L.h) * 0.42 * fl, power: 0.95, flicker: true },
      { x: L.tent.x + L.tent.w / 2, y: L.tent.y - L.tent.h * 0.3, r: L.tent.w * 0.8, power: 0.6 },
      { x: L.w * 0.8, y: L.h * 0.16, r: Math.min(L.w, L.h) * 0.22, power: 0.4 },
    ];
  }
  return [];
}

export interface Firefly {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

/** Small animated bits drawn over the cached background. */
export function drawAmbient(g: CanvasRenderingContext2D, id: SceneId, L: Layout, t: number, flies: Firefly[], reduced: boolean): void {
  if (id === 'kitchen') {
    const C = L.clock;
    const d = new Date();
    const sec = d.getSeconds() + (reduced ? 0 : d.getMilliseconds() / 1000);
    const min = d.getMinutes() + sec / 60;
    const hr = (d.getHours() % 12) + min / 60;
    const hand = (a: number, len: number, width: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(C.x, C.y);
      g.lineTo(C.x + Math.cos(a - Math.PI / 2) * len, C.y + Math.sin(a - Math.PI / 2) * len);
      g.stroke();
    };
    hand((hr / 12) * Math.PI * 2, C.r * 0.5, 4, '#1e293b');
    hand((min / 60) * Math.PI * 2, C.r * 0.72, 3, '#334155');
    hand((sec / 60) * Math.PI * 2, C.r * 0.8, 1.5, '#ef4444');
    g.fillStyle = '#1e293b';
    g.beginPath();
    g.arc(C.x, C.y, 4, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (id === 'garden' || id === 'camp') {
    for (const f of flies) {
      const x = f.x * L.w + Math.sin(t * f.speed + f.phase) * 30;
      const y = f.y * L.h + Math.cos(t * f.speed * 0.7 + f.phase * 2) * 20;
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 + f.phase * 3));
      glow(g, x, y, 12, 'rgba(210,255,120,A)', 0.5 * a);
      g.fillStyle = `rgba(240,255,170,${a})`;
      g.beginPath();
      g.arc(x, y, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (id === 'camp') {
    const F = L.fire;
    glow(g, F.x, F.y - F.s * 0.3, F.s * 2.2, 'rgba(255,150,60,A)', 0.35 + Math.sin(t * 11) * 0.05);
    const tongues = 7;
    for (let i = 0; i < tongues; i++) {
      const off = (i - (tongues - 1) / 2) / tongues;
      const hgt = F.s * (0.9 + 0.5 * Math.sin(t * (7 + i) + i * 1.7)) * (1 - Math.abs(off) * 1.2);
      const x = F.x + off * F.s * 0.9;
      const col = i % 2 === 0 ? 'rgba(255,170,50,0.9)' : 'rgba(255,90,30,0.85)';
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x - F.s * 0.16, F.y);
      g.quadraticCurveTo(x - F.s * 0.12, F.y - hgt * 0.6, x + Math.sin(t * 6 + i) * F.s * 0.1, F.y - hgt);
      g.quadraticCurveTo(x + F.s * 0.12, F.y - hgt * 0.6, x + F.s * 0.16, F.y);
      g.fill();
    }
    g.fillStyle = 'rgba(255,240,180,0.9)';
    g.beginPath();
    g.ellipse(F.x, F.y - F.s * 0.12, F.s * 0.22, F.s * 0.2, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (id === 'bedroom') {
    const K = L.kid;
    g.font = `800 ${Math.round(K.r * 0.55)}px Nunito, system-ui, sans-serif`;
    g.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const p = ((t * 0.35 + i / 3) % 1);
      g.fillStyle = `rgba(220,230,255,${Math.sin(p * Math.PI) * 0.8})`;
      g.fillText('z', K.x + K.r * (0.9 + p * 1.2), K.y - K.r * (0.8 + p * 2.2) + Math.sin(p * 8) * 4);
    }
  }
}
