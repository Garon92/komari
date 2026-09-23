import { ACHIEVEMENTS, achievementById } from '../achievements';
import { DIFFICULTIES, KINDS, MODES, POWERS, type Difficulty, type Mode, type MosquitoKind, type PowerKind } from '../game/config';
import type { Summary } from '../game/game';
import type { WaveBonus } from '../game/scoring';
import type { WaveSpec } from '../game/waves';
import { iconSvg } from '../render/icons';
import { paintPortrait } from '../render/mosquitoArt';
import { drawSwatter, SWATTER_COLORS, SWATTER_SHAPES } from '../render/swatter';
import { bestKey, type SaveData } from '../storage';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number): string => n.toLocaleString('cs-CZ');

const MODE_ICON: Record<Mode, string> = { waves: '🌊', minute: '⏱️', zen: '🌼' };

export interface StartActions {
  play(mode: Mode, difficulty: Difficulty): void;
  help(): void;
  achievements(): void;
  swatter(): void;
  changed(mode: Mode, difficulty: Difficulty): void;
}

export interface PauseActions {
  resume(): void;
  restart(): void;
  quit(): void;
  help(): void;
  swatter(): void;
}

export interface ResultActions {
  again(): void;
  menu(): void;
}

export interface ResultInfo {
  best: number;
  isRecord: boolean;
  newAchievements: string[];
}

export interface SwatterActions {
  change(p: Partial<SaveData['prefs']>): void;
  back(): void;
}

function portraitCanvas(kind: MosquitoKind, size = 56): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  paintPortrait(c, kind, dpr);
  return c;
}

export class Screens {
  private root: HTMLElement;
  private bannerEl: HTMLElement;
  private toastsEl: HTMLElement;
  private bannerTimer = 0;
  current: string | null = null;

  constructor(root: HTMLElement, banner: HTMLElement, toasts: HTMLElement) {
    this.root = root;
    this.bannerEl = banner;
    this.toastsEl = toasts;
    // Clicks inside screens never reach the canvas.
    root.addEventListener('pointerdown', (e) => {
      if (e.target !== root) e.stopPropagation();
    });
  }

  hide(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.current = null;
  }

  private open(name: string, html: string, dim: boolean): HTMLElement {
    this.current = name;
    this.root.hidden = false;
    this.root.classList.toggle('is-dim', dim);
    this.root.innerHTML = html;
    this.root.scrollTop = 0;
    const focus = this.root.querySelector<HTMLElement>('[data-autofocus]');
    if (focus) requestAnimationFrame(() => focus.focus({ preventScroll: true }));
    return this.root;
  }

  // ------------------------------------------------------------------ start

  showStart(save: SaveData, act: StartActions): void {
    let mode = save.prefs.mode;
    let diff = save.prefs.difficulty;
    const unlocked = Object.keys(save.achievements).length;
    const bestLine = (m: Mode, d: Difficulty): string => {
      const b = save.bests[bestKey(m, d)];
      if (!b) return 'Zatím bez rekordu';
      if (m === 'zen') return `Rekord: ${fmt(b.kills)} 🦟`;
      if (m === 'waves') return `Rekord: ${fmt(b.score)} · vlna ${b.wave}`;
      return `Rekord: ${fmt(b.score)}`;
    };
    const root = this.open(
      'start',
      `<div class="card" role="dialog" aria-labelledby="start-title">
        <div class="hero">
          <canvas data-hero width="168" height="168" aria-hidden="true"></canvas>
          <div>
            <h1 id="start-title">Komáři</h1>
            <p>Bzzz… plácni je dřív, než štípnou!</p>
          </div>
        </div>
        <span class="label" id="mode-label">Režim</span>
        <div class="modes" role="radiogroup" aria-labelledby="mode-label">
          ${(Object.keys(MODES) as Mode[])
            .map(
              (m) => `<button type="button" class="mode" role="radio" data-mode="${m}" aria-checked="${m === mode}">
                <span class="mode__icon" aria-hidden="true">${MODE_ICON[m]}</span>
                <b>${MODES[m].name}</b>
                <small>${esc(MODES[m].desc)}</small>
                <span class="mode__best" data-best="${m}"></span>
              </button>`,
            )
            .join('')}
        </div>
        <span class="label" id="diff-label">Obtížnost</span>
        <div class="segmented" role="radiogroup" aria-labelledby="diff-label">
          ${(Object.keys(DIFFICULTIES) as Difficulty[])
            .map((d) => `<button type="button" role="radio" data-diff="${d}" aria-checked="${d === diff}">${DIFFICULTIES[d].name}</button>`)
            .join('')}
        </div>
        <button type="button" class="btn btn--primary btn--big" data-play data-autofocus>${iconSvg('play', 26)} Hrát</button>
        <div class="btn-row">
          <button type="button" class="btn" data-help>${iconSvg('help')}Jak hrát</button>
          <button type="button" class="btn" data-ach>${iconSvg('trophy')}Úspěchy ${unlocked}/${ACHIEVEMENTS.length}</button>
          <button type="button" class="btn" data-swatter>${iconSvg('swatter')}Plácačka</button>
        </div>
        <p class="foot">${save.stats.totalKills > 0 ? `Celkem zaplácnuto: <b>${fmt(save.stats.totalKills)}</b> komárů` : 'Klikni nebo ťukni na komára. Pozor na červený vykřičník!'}</p>
      </div>`,
      false,
    );
    const hero = root.querySelector<HTMLCanvasElement>('[data-hero]')!;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    hero.width = 84 * dpr;
    hero.height = 84 * dpr;
    paintPortrait(hero, 'common', dpr);

    const sync = () => {
      root.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
      root.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.diff === diff)));
      root.querySelectorAll<HTMLElement>('[data-best]').forEach((el) => (el.textContent = bestLine(el.dataset.best as Mode, diff)));
      act.changed(mode, diff);
    };
    sync();
    root.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        mode = b.dataset.mode as Mode;
        sync();
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) =>
      b.addEventListener('click', () => {
        diff = b.dataset.diff as Difficulty;
        sync();
      }),
    );
    // Arrow keys inside radio groups.
    const arrows = (sel: string, get: () => string, set: (v: string) => void, values: string[]) => {
      root.querySelectorAll<HTMLElement>(sel).forEach((b) =>
        b.addEventListener('keydown', (e) => {
          const i = values.indexOf(get());
          let n = -1;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % values.length;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + values.length) % values.length;
          if (n >= 0) {
            e.preventDefault();
            e.stopPropagation();
            set(values[n]!);
            sync();
            root.querySelector<HTMLElement>(`${sel.replace(']', '')}="${values[n]}"]`)?.focus();
          }
        }),
      );
    };
    arrows('[data-mode]', () => mode, (v) => (mode = v as Mode), Object.keys(MODES));
    arrows('[data-diff]', () => diff, (v) => (diff = v as Difficulty), Object.keys(DIFFICULTIES));
    root.querySelector('[data-play]')!.addEventListener('click', () => act.play(mode, diff));
    root.querySelector('[data-help]')!.addEventListener('click', () => act.help());
    root.querySelector('[data-ach]')!.addEventListener('click', () => act.achievements());
    root.querySelector('[data-swatter]')!.addEventListener('click', () => act.swatter());
  }

  // ------------------------------------------------------------------ pause

  showPause(info: { mode: Mode; score: number; wave: number; kills: number }, act: PauseActions): void {
    const quitLabel = info.mode === 'zen' ? 'Dokončit a ukázat výsledky' : 'Ukončit hru';
    const root = this.open(
      'pause',
      `<div class="card" role="dialog" aria-labelledby="pause-title">
        <div class="card__head"><h2 id="pause-title">Pauza</h2></div>
        <p class="lead">${info.mode === 'waves' ? `Vlna ${info.wave} · ` : ''}Skóre ${fmt(info.score)} · zaplácnuto ${fmt(info.kills)}</p>
        <button type="button" class="btn btn--primary btn--big" data-resume data-autofocus>${iconSvg('play', 24)} Pokračovat</button>
        <div class="row" style="margin-top:10px">
          <button type="button" class="btn" data-restart>${iconSvg('restart', 20)} Znovu</button>
          <button type="button" class="btn" data-help>${iconSvg('help', 20)} Jak hrát</button>
          <button type="button" class="btn" data-swatter>${iconSvg('settings', 20)} Nastavení</button>
        </div>
        <button type="button" class="btn btn--danger" style="width:100%;margin-top:10px" data-quit>${iconSvg('home', 20)} ${quitLabel}</button>
        <p class="foot">Pokračovat můžeš i klávesou <kbd>Esc</kbd>, <kbd>P</kbd> nebo <kbd>mezerník</kbd>.</p>
      </div>`,
      true,
    );
    root.querySelector('[data-resume]')!.addEventListener('click', () => act.resume());
    root.querySelector('[data-restart]')!.addEventListener('click', () => act.restart());
    root.querySelector('[data-quit]')!.addEventListener('click', () => act.quit());
    root.querySelector('[data-help]')!.addEventListener('click', () => act.help());
    root.querySelector('[data-swatter]')!.addEventListener('click', () => act.swatter());
  }

  // ------------------------------------------------------------------ results

  showResults(s: Summary, info: ResultInfo, act: ResultActions): void {
    const title =
      s.mode === 'minute' ? 'Čas vypršel!' : s.mode === 'zen' ? 'Pěkně jsi to vyplácal!' : s.stars >= 3 ? 'Mistr plácačky!' : s.stars >= 1 ? 'Konec hry – dobrá práce!' : 'Komáři vyhráli… tentokrát!';
    const stars = [0, 1, 2]
      .map((i) => `<svg class="icon ${i < s.stars ? 'is-on' : ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.6l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z"/></svg>`)
      .join('');
    const mainValue = s.mode === 'zen' ? s.kills : s.score;
    const stat = (label: string, value: string) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`;
    const stats = [
      s.mode !== 'zen' ? stat('Zaplácnuto', fmt(s.kills)) : stat('Skóre', fmt(s.score)),
      s.mode === 'waves' ? stat('Vlna', String(s.wave)) : '',
      stat('Nejlepší kombo', String(s.bestCombo)),
      stat('Přesnost', `${Math.round(s.accuracy * 100)} %`),
      s.mode !== 'zen' ? stat('Štípanců', String(s.bites)) : '',
    ].join('');
    const ach = info.newAchievements
      .map((id) => achievementById(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => `<div><span aria-hidden="true">${a.icon}</span> Nový úspěch: ${esc(a.title)}</div>`)
      .join('');
    const root = this.open(
      'results',
      `<div class="card" role="dialog" aria-labelledby="res-title">
        <h2 class="result-title" id="res-title">${title}</h2>
        <div class="stars" role="img" aria-label="${s.stars} ze 3 hvězd">${stars}</div>
        <div class="big-score" aria-label="${s.mode === 'zen' ? 'Zaplácnuto' : 'Skóre'}">${fmt(mainValue)}${s.mode === 'zen' ? ' 🦟' : ''}</div>
        <span class="record ${info.isRecord ? 'is-new' : ''}">${info.isRecord ? '🏆 Nový rekord!' : `Rekord: ${fmt(info.best)}`}</span>
        <div class="stat-grid">${stats}</div>
        ${ach ? `<div class="new-ach">${ach}</div>` : ''}
        <div class="row" style="margin-top:16px">
          <button type="button" class="btn btn--primary" data-again data-autofocus>${iconSvg('restart', 20)} Hrát znovu</button>
          <button type="button" class="btn" data-menu>${iconSvg('home', 20)} Hlavní obrazovka</button>
        </div>
      </div>`,
      true,
    );
    root.querySelector('[data-again]')!.addEventListener('click', () => act.again());
    root.querySelector('[data-menu]')!.addEventListener('click', () => act.menu());
  }

  // ------------------------------------------------------------------ help

  showHelp(back: () => void): void {
    const kinds: MosquitoKind[] = ['common', 'fast', 'tiger', 'ninja', 'fat', 'golden', 'queen'];
    const powers: PowerKind[] = ['big', 'electric', 'spray', 'lamp', 'net', 'frost', 'heart', 'time'];
    const root = this.open(
      'help',
      `<div class="card card--wide" role="dialog" aria-labelledby="help-title">
        <div class="card__head">
          <button type="button" class="icon-btn" data-back aria-label="Zpět">${iconSvg('back')}</button>
          <h2 id="help-title">Jak hrát</h2>
        </div>
        <div class="help-grid">
          <div class="help-item"><span class="help-ico" aria-hidden="true">👆</span><div><b>Plácni na komára</b><small>Klikni myší nebo ťukni prstem. Trefíš i víc najednou!</small></div></div>
          <div class="help-item"><span class="help-ico" aria-hidden="true" style="color:#ef4444;font-weight:900">!</span><div><b>Červený kruh = chce štípnout</b><small>Komár se zvětšuje a letí na tebe. Plácni ho, než se kruh uzavře.</small></div></div>
          <div class="help-item"><span class="help-ico" aria-hidden="true">❤️</span><div><b>Štípnutí bere srdíčko</b><small>Dohoníš-li komára, který tě štípl (je červený a pomalý), srdíčko se vrátí.</small></div></div>
          <div class="help-item"><span class="help-ico" aria-hidden="true">🔥</span><div><b>Kombo násobí body</b><small>Plácej rychle za sebou bez minutí: ×2, ×3, ×4, ×5!</small></div></div>
          <div class="help-item"><span class="help-ico" aria-hidden="true">🫧</span><div><b>Bubliny s vylepšením</b><small>Občas po komárovi zůstane bublina. Plácni na ni!</small></div></div>
        </div>
        <h3 class="section-title">Komáři</h3>
        <div class="kinds-grid" data-kinds></div>
        <h3 class="section-title">Vylepšení</h3>
        <div class="powers-grid">
          ${powers
            .map(
              (p) => `<div class="help-item"><span class="help-ico" style="color:${POWERS[p].color}">${iconSvg(p, 30)}</span><div><b>${POWERS[p].name}</b><small>${esc(POWERS[p].desc)}</small></div></div>`,
            )
            .join('')}
        </div>
        <h3 class="section-title">Klávesnice</h3>
        <div class="keys">
          <span><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> / <kbd>WASD</kbd></span><span>posun plácačky</span>
          <span><kbd>Enter</kbd> / <kbd>X</kbd> / <kbd>K</kbd></span><span>plácnout</span>
          <span><kbd>Esc</kbd> / <kbd>P</kbd> / <kbd>mezerník</kbd></span><span>pauza</span>
          <span><kbd>R</kbd></span><span>hrát znovu</span>
          <span><kbd>F</kbd></span><span>celá obrazovka</span>
          <span><kbd>M</kbd></span><span>zvuk zap/vyp</span>
        </div>
        <button type="button" class="btn btn--primary btn--big" data-back2 data-autofocus>Rozumím</button>
      </div>`,
      true,
    );
    const grid = root.querySelector<HTMLElement>('[data-kinds]')!;
    for (const k of kinds) {
      const item = document.createElement('div');
      item.className = 'help-item';
      item.appendChild(portraitCanvas(k));
      const text = document.createElement('div');
      text.innerHTML = `<b>${KINDS[k].name}</b><small>${esc(KINDS[k].desc)} · ${KINDS[k].points} b.</small>`;
      item.appendChild(text);
      grid.appendChild(item);
    }
    root.querySelector('[data-back]')!.addEventListener('click', back);
    root.querySelector('[data-back2]')!.addEventListener('click', back);
  }

  // ------------------------------------------------------------------ achievements

  showAchievements(save: SaveData, back: () => void): void {
    const n = Object.keys(save.achievements).length;
    const items = ACHIEVEMENTS.map((a) => {
      const got = save.achievements[a.id];
      const date = got ? new Date(got).toLocaleDateString('cs-CZ') : '';
      return `<div class="ach ${got ? '' : 'is-locked'}">
        <span class="ach__icon" aria-hidden="true">${a.icon}</span>
        <div><b>${esc(a.title)}</b><small>${esc(a.desc)}${got ? ` · ${date}` : ''}</small></div>
      </div>`;
    }).join('');
    const bests = (['waves', 'minute', 'zen'] as Mode[])
      .map((m) => {
        const cells = (['easy', 'normal', 'hard'] as Difficulty[])
          .map((d) => {
            const b = save.bests[bestKey(m, d)];
            const v = b ? (m === 'zen' ? `${fmt(b.kills)} 🦟` : fmt(b.score)) : '–';
            return `<div class="stat"><small>${MODES[m].name} · ${DIFFICULTIES[d].name}</small><b>${v}</b></div>`;
          })
          .join('');
        return cells;
      })
      .join('');
    const root = this.open(
      'achievements',
      `<div class="card card--wide" role="dialog" aria-labelledby="ach-title">
        <div class="card__head">
          <button type="button" class="icon-btn" data-back aria-label="Zpět">${iconSvg('back')}</button>
          <h2 id="ach-title">Úspěchy</h2>
        </div>
        <div class="ach-progress">
          <p class="lead" style="margin-bottom:6px">Získáno ${n} z ${ACHIEVEMENTS.length}. Některé odemykají nové plácačky!</p>
          <div class="progress"><span style="width:${Math.round((n / ACHIEVEMENTS.length) * 100)}%"></span></div>
        </div>
        <div class="ach-grid">${items}</div>
        <h3 class="section-title">Rekordy</h3>
        <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${bests}</div>
        <div class="stat-grid">
          <div class="stat"><small>Celkem komárů</small><b>${fmt(save.stats.totalKills)}</b></div>
          <div class="stat"><small>Odehraných her</small><b>${fmt(save.stats.games)}</b></div>
          <div class="stat"><small>Nejlepší kombo</small><b>${save.stats.bestCombo}</b></div>
          <div class="stat"><small>Čas hraní</small><b>${Math.round(save.stats.playSeconds / 60)} min</b></div>
        </div>
        <button type="button" class="btn btn--primary btn--big" data-back2 data-autofocus>Zpět</button>
      </div>`,
      true,
    );
    root.querySelector('[data-back]')!.addEventListener('click', back);
    root.querySelector('[data-back2]')!.addEventListener('click', back);
  }

  // ------------------------------------------------------------------ swatter & settings

  showSwatter(save: SaveData, act: SwatterActions): void {
    const has = (id: string | null) => id === null || Boolean(save.achievements[id]);
    const p = save.prefs;
    const isPreset = SWATTER_COLORS.some((c) => c.color === p.color);
    const root = this.open(
      'swatter',
      `<div class="card" role="dialog" aria-labelledby="sw-title">
        <div class="card__head">
          <button type="button" class="icon-btn" data-back aria-label="Zpět">${iconSvg('back')}</button>
          <h2 id="sw-title">Plácačka a nastavení</h2>
        </div>
        <div class="swatter-preview"><canvas data-preview width="400" height="360" aria-label="Náhled plácačky" role="img"></canvas></div>
        <span class="label" id="shape-label">Tvar</span>
        <div class="shapes" role="radiogroup" aria-labelledby="shape-label">
          ${SWATTER_SHAPES.map((s) => {
            const ok = has(s.unlock);
            const req = s.unlock ? achievementById(s.unlock)?.title ?? '' : '';
            return `<button type="button" class="shape-btn" role="radio" data-shape="${s.id}" aria-checked="${p.shape === s.id}" ${ok ? '' : `disabled title="Odemkneš úspěchem: ${esc(req)}"`}>
              ${ok ? '' : iconSvg('lock', 16)}${s.name}${ok ? '' : `<small>${esc(req)}</small>`}</button>`;
          }).join('')}
        </div>
        <span class="label" id="color-label">Barva</span>
        <div class="swatches" role="radiogroup" aria-labelledby="color-label">
          ${SWATTER_COLORS.map((c) => {
            const ok = has(c.unlock);
            const req = c.unlock ? achievementById(c.unlock)?.title ?? '' : '';
            return `<button type="button" class="swatch" role="radio" style="--c:${c.color}" data-color="${c.color}" aria-checked="${p.color === c.color}" aria-label="${c.name}${ok ? '' : ` (zamčeno – úspěch ${esc(req)})`}" title="${ok ? c.name : `Odemkneš úspěchem: ${esc(req)}`}" ${ok ? '' : 'disabled'}>${ok ? '' : iconSvg('lock', 20)}</button>`;
          }).join('')}
          <label class="swatch swatch--custom" title="Vlastní barva" aria-checked="${!isPreset}" role="radio">
            <input type="color" data-custom value="${p.color}" aria-label="Vlastní barva" />
          </label>
        </div>
        <span class="label">Hra</span>
        <div class="toggles">
          <label class="toggle"><span>Krvavé fleky<small>Vypni pro citlivější hráče – místo krve šedé šmouhy.</small></span><input type="checkbox" data-blood ${p.blood ? 'checked' : ''} /></label>
          <label class="toggle"><span>Bzučení komárů<small>Čím blíž komár, tím hlasitěji bzučí.</small></span><input type="checkbox" data-buzz ${p.buzz ? 'checked' : ''} /></label>
        </div>
        <button type="button" class="btn btn--primary btn--big" data-back2 data-autofocus>Hotovo</button>
      </div>`,
      true,
    );
    const canvas = root.querySelector<HTMLCanvasElement>('[data-preview]')!;
    const draw = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = 200 * dpr;
      canvas.height = 180 * dpr;
      const g = canvas.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, 200, 180);
      g.translate(100, 66);
      drawSwatter(g, 38, { shape: p.shape, color: p.color, electric: false, big: false }, 0, 0);
    };
    draw();
    const sync = () => {
      root.querySelectorAll<HTMLElement>('[data-shape]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.shape === p.shape)));
      root.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === p.color)));
      root.querySelector('.swatch--custom')!.setAttribute('aria-checked', String(!SWATTER_COLORS.some((c) => c.color === p.color)));
      draw();
    };
    root.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach((b) =>
      b.addEventListener('click', () => {
        p.shape = b.dataset.shape as typeof p.shape;
        act.change({ shape: p.shape });
        sync();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) =>
      b.addEventListener('click', () => {
        p.color = b.dataset.color!;
        act.change({ color: p.color });
        sync();
      }),
    );
    root.querySelector<HTMLInputElement>('[data-custom]')!.addEventListener('input', (e) => {
      p.color = (e.target as HTMLInputElement).value;
      act.change({ color: p.color });
      sync();
    });
    root.querySelector<HTMLInputElement>('[data-blood]')!.addEventListener('change', (e) => act.change({ blood: (e.target as HTMLInputElement).checked }));
    root.querySelector<HTMLInputElement>('[data-buzz]')!.addEventListener('change', (e) => act.change({ buzz: (e.target as HTMLInputElement).checked }));
    root.querySelector('[data-back]')!.addEventListener('click', act.back);
    root.querySelector('[data-back2]')!.addEventListener('click', act.back);
  }

  // ------------------------------------------------------------------ banners & toasts

  bannerWave(spec: WaveSpec | null, mode: Mode, wave: number): void {
    let html: string;
    let boss = false;
    if (mode === 'minute') {
      html = `<div class="banner__card"><div class="banner__kicker">Minutovka</div><div class="banner__title">Připrav se!</div><div class="banner__sub">Máš 60 vteřin. Štípnutí bere 3 vteřiny.</div></div>`;
    } else if (mode === 'zen') {
      html = `<div class="banner__card"><div class="banner__kicker">Pohoda</div><div class="banner__title">Plácej v klidu</div><div class="banner__sub">Tady nikdo neštípe. Až budeš chtít skončit, dej pauzu.</div></div>`;
    } else {
      boss = Boolean(spec?.boss);
      const sub = boss ? 'Plácej královnu, dokud nepadne! Pozor na její komáry.' : `Zaplácni ${spec?.quota ?? 0} komárů`;
      html = `<div class="banner__card"><div class="banner__kicker">${boss ? 'Pozor, boss!' : 'Připrav se'}</div><div class="banner__title">Vlna ${wave}</div><div class="banner__sub">${sub}</div><div data-new></div></div>`;
    }
    this.showBanner(html, boss, mode === 'waves' && spec && spec.newKinds.length > 0 ? 2800 : 2000);
    if (spec && mode === 'waves') {
      const holder = this.bannerEl.querySelector<HTMLElement>('[data-new]');
      const kinds = spec.newKinds.filter((k) => k !== 'queen');
      if (holder && (kinds.length > 0 || spec.boss)) {
        const k = spec.boss && spec.newKinds.includes('queen') ? 'queen' : kinds[0];
        if (k) {
          const box = document.createElement('div');
          box.className = 'banner__new';
          box.appendChild(portraitCanvas(k, 64));
          const t = document.createElement('div');
          t.innerHTML = `<small>Nový komár</small><b>${KINDS[k].name}</b><span>${esc(KINDS[k].desc)}</span>`;
          box.appendChild(t);
          holder.appendChild(box);
        }
      }
    }
  }

  bannerClear(wave: number, bonus: WaveBonus, accuracy: number): void {
    const chips = [`Vlna +${fmt(bonus.clear)}`];
    if (bonus.flawless) chips.push(`Bez štípnutí +${fmt(bonus.flawless)}`);
    if (bonus.sharp) chips.push(`Přesnost +${fmt(bonus.sharp)}`);
    this.showBanner(
      `<div class="banner__card"><div class="banner__kicker">Hotovo!</div><div class="banner__title">Vlna ${wave} ✔</div>
        <div class="banner__sub">Přesnost ${Math.round(accuracy * 100)} %</div>
        <div class="banner__bonus">${chips.map((c) => `<span>${c}</span>`).join('')}</div></div>`,
      false,
      2400,
    );
  }

  bannerText(kicker: string, title: string, ms = 1400): void {
    this.showBanner(`<div class="banner__card"><div class="banner__kicker">${esc(kicker)}</div><div class="banner__title">${esc(title)}</div></div>`, false, ms);
  }

  private showBanner(html: string, boss: boolean, ms: number): void {
    window.clearTimeout(this.bannerTimer);
    this.bannerEl.innerHTML = html;
    this.bannerEl.classList.toggle('is-boss', boss);
    this.bannerEl.hidden = false;
    this.bannerTimer = window.setTimeout(() => this.hideBanner(), ms);
  }

  hideBanner(): void {
    window.clearTimeout(this.bannerTimer);
    this.bannerEl.hidden = true;
    this.bannerEl.innerHTML = '';
  }

  toastAchievement(id: string): void {
    const a = achievementById(id);
    if (!a) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast__icon" aria-hidden="true">${a.icon}</span><div><small>Nový úspěch</small><b>${esc(a.title)}</b></div>`;
    this.toastsEl.appendChild(el);
    window.setTimeout(() => el.remove(), 4000);
  }
}
