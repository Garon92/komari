/** The plastic fly swatter cursor (ported from the original game, with power-up looks). */

export type SwatterShape = 'round' | 'square' | 'heart' | 'star';

export interface SwatterLook {
  shape: SwatterShape;
  color: string;
  electric: boolean;
  big: boolean;
}

function headPath(g: CanvasRenderingContext2D, shape: SwatterShape, w: number, h: number): void {
  g.beginPath();
  if (shape === 'round') {
    g.ellipse(0, 0, w * 0.55, w * 0.55, 0, 0, Math.PI * 2);
  } else if (shape === 'heart') {
    const s = w * 0.62;
    g.moveTo(0, s * 0.85);
    g.bezierCurveTo(-s * 1.25, s * 0.05, -s * 0.85, -s * 1.0, 0, -s * 0.45);
    g.bezierCurveTo(s * 0.85, -s * 1.0, s * 1.25, s * 0.05, 0, s * 0.85);
    g.closePath();
  } else if (shape === 'star') {
    const ro = w * 0.62;
    const ri = ro * 0.5;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? ro : ri;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  } else {
    g.roundRect(-w * 0.5, -h * 0.5, w, h, Math.min(10, w * 0.12));
  }
}

/**
 * Draws the swatter centred on (0,0) = the hit centre.
 * `press` 0..1 animates the slap (head squashes, handle tilts).
 */
export function drawSwatter(g: CanvasRenderingContext2D, radius: number, look: SwatterLook, press: number, now: number): void {
  const headW = radius * 2.1;
  const headH = radius * 1.6;
  const handleLen = radius * 2.4;
  const handleW = Math.max(6, radius * 0.3);
  const color = look.color;

  g.save();
  const squash = 1 - 0.1 * press;
  g.scale(squash, squash);
  g.rotate(-0.18 + 0.12 * press);

  // Handle
  g.save();
  g.globalAlpha = 0.75;
  g.fillStyle = color;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(-handleW * 0.5, radius * 0.85, handleW, handleLen, Math.min(6, handleW * 0.6));
  g.fill();
  g.stroke();
  g.globalAlpha = 0.25;
  g.strokeStyle = '#ffffff';
  for (let i = 1; i < 6; i++) {
    const yy = radius * 0.85 + handleLen * (0.45 + 0.1 * i);
    g.beginPath();
    g.moveTo(-handleW * 0.4, yy);
    g.lineTo(handleW * 0.4, yy);
    g.stroke();
  }
  g.restore();

  // Head
  g.save();
  headPath(g, look.shape, headW, headH);
  g.globalAlpha = 0.42;
  g.fillStyle = color;
  g.fill();
  g.globalAlpha = 0.9;
  g.strokeStyle = look.electric ? '#bfdbfe' : 'rgba(0,0,0,0.45)';
  g.lineWidth = look.electric ? 2.5 : 2;
  g.stroke();
  // Perforated mesh – holes punched out of the tinted head.
  g.clip();
  g.globalAlpha = 0.5;
  g.globalCompositeOperation = 'destination-out';
  const step = Math.max(7, radius * 0.24);
  const hole = Math.max(1.4, radius * 0.075);
  for (let y = -headH; y <= headH; y += step) {
    for (let x = -headW; x <= headW; x += step) {
      g.beginPath();
      g.arc(x, y, hole, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // Highlight
  g.globalAlpha = 0.18;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(-radius * 0.25, -radius * 0.45, headW * 0.32, headH * 0.16, -0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Electric crackle around the rim.
  if (look.electric) {
    g.save();
    g.strokeStyle = 'rgba(147,197,253,0.95)';
    g.shadowColor = '#60a5fa';
    g.shadowBlur = 10;
    g.lineWidth = 1.6;
    const seed = Math.floor(now / 60);
    for (let k = 0; k < 3; k++) {
      const a0 = ((seed * 1.7 + k * 2.1) % (Math.PI * 2));
      g.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = a0 + i * 0.16;
        const rr = radius * (1.02 + ((Math.sin(seed * 13.1 + i * 7.3 + k) + 1) * 0.08));
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
    g.restore();
  }
  g.restore();

  // Hit area ring (subtle – helps aiming).
  g.save();
  g.globalAlpha = 0.28 + 0.4 * press;
  g.strokeStyle = look.big ? '#16a34a' : 'rgba(15,23,42,0.9)';
  g.setLineDash([4, 6]);
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, radius, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** Colours; `unlock` = achievement id needed (null = free). */
export const SWATTER_COLORS: ReadonlyArray<{ id: string; name: string; color: string; unlock: string | null }> = [
  { id: 'blue', name: 'Modrá', color: '#60a5fa', unlock: null },
  { id: 'green', name: 'Zelená', color: '#4ade80', unlock: null },
  { id: 'red', name: 'Červená', color: '#f43f5e', unlock: null },
  { id: 'yellow', name: 'Žlutá', color: '#facc15', unlock: null },
  { id: 'purple', name: 'Fialová', color: '#a78bfa', unlock: 'wave5' },
  { id: 'orange', name: 'Oranžová', color: '#fb923c', unlock: 'combo10' },
  { id: 'pink', name: 'Růžová', color: '#f472b6', unlock: 'flawless' },
  { id: 'teal', name: 'Tyrkysová', color: '#2dd4bf', unlock: 'golden' },
  { id: 'gold', name: 'Zlatá', color: '#f59e0b', unlock: 'thousand' },
];

export const SWATTER_SHAPES: ReadonlyArray<{ id: SwatterShape; name: string; unlock: string | null }> = [
  { id: 'round', name: 'Kulatá', unlock: null },
  { id: 'square', name: 'Klasická', unlock: null },
  { id: 'heart', name: 'Srdíčko', unlock: 'hundred' },
  { id: 'star', name: 'Hvězda', unlock: 'queen' },
];
