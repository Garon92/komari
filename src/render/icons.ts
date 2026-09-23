import type { PowerKind } from '../game/config';

/** 24×24 stroke icons shared by the canvas (Path2D) and the DOM (inline SVG). */
export const ICONS = {
  big: 'M9 3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM10 7h.01M13 7h.01M16 7h.01M10 10h.01M13 10h.01M16 10h.01M10 13h.01M13 13h.01M16 13h.01M8.5 17 4 21.5',
  electric: 'M13 2 4 14h7l-1 8 9-12h-7z',
  spray: 'M8 8h7v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zM9 8V5h5v3M14 5h3M19 3v.01M21 5v.01M19 7v.01M11.5 13v4',
  lamp: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z',
  net: 'M3 5h18M3 12h18M3 19h18M5 3v18M12 3v18M19 3v18',
  frost: 'M12 2v20M4.9 6l14.2 12M4.9 18 19.1 6M9 3l3 3 3-3M9 21l3-3 3 3',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  time: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M9 2h6',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15l12-7.5z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  swatter: 'M8 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 14v7M9.5 6.5h.01M12 6.5h.01M14.5 6.5h.01M9.5 9h.01M12 9h.01M14.5 9h.01M9.5 11.5h.01M12 11.5h.01M14.5 11.5h.01',
  back: 'M15 18l-6-6 6-6',
  restart: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  check: 'M5 12l5 5 9-10',
  sound: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  menu: 'M4 6h16M4 12h16M4 18h16',
} as const;

export type IconName = keyof typeof ICONS;

export function iconSvg(name: IconName, size = 24, extra = ''): string {
  return `<svg class="icon ${extra}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

const pathCache = new Map<string, Path2D>();

export function drawPowerIcon(g: CanvasRenderingContext2D, kind: PowerKind, size: number, color: string): void {
  let p = pathCache.get(kind);
  if (!p) {
    p = new Path2D(ICONS[kind]);
    pathCache.set(kind, p);
  }
  g.save();
  const s = size / 24;
  g.scale(s, s);
  g.translate(-12, -12);
  g.strokeStyle = color;
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke(p);
  g.restore();
}
