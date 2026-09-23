import { ACHIEVEMENTS, achievementById } from '../achievements';
import { DIFFICULTIES, KINDS, MODES, POWERS, type Difficulty, type Mode, type MosquitoKind, type PowerKind } from '../game/config';
import type { Summary } from '../game/game';
import type { WaveBonus } from '../game/scoring';
import type { WaveSpec } from '../game/waves';
import {
  ICONS, openDialog, showPause, showResults, showStart, toast, sfx,
  type DialogHandle, type OverlayPromise, type PauseChoice, type ResultsChoice, type StartResult,
} from '../kit';
import { iconSvg } from '../render/icons';
import { paintPortrait } from '../render/mosquitoArt';
import { drawSwatter, SWATTER_COLORS, SWATTER_SHAPES } from '../render/swatter';
import { bestKey, type Prefs, type SaveData } from '../storage';

/**
 * Menus built on the g92 kit overlays/dialogs (start, pause, results, help, achievements,
 * swatter) + the game's own in-play banners.
 */

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number): string => n.toLocaleString('cs-CZ');

const MODE_ICON: Record<Mode, string> = { waves: '🌊', minute: '⏱️', zen: '🌼' };
const DIFF_ICON: Record<Difficulty, string> = { easy: '🐢', normal: '🦟', hard: '🔥' };
const DIFF_HINT: Record<Difficulty, string> = { easy: '5 srdíček', normal: '3 srdíčka', hard: 'rychlí komáři' };

export type OverlayKind = 'start' | 'pause' | 'results';

/** Pictogram how-to (start screen "Jak hrát" and the appbar "?"). */
export const HOW_TO = [
  { icon: '👆', text: 'Klikni nebo ťukni na komára – plesk!' },
  { icon: '❗', text: 'Červený kruh = chce štípnout. Plácni ho včas!' },
  { icon: '❤️', text: 'Štípnutí bere srdíčko. Dohoň štípala a vrátí se.' },
  { icon: '🔥', text: 'Rychle za sebou bez minutí = kombo ×2 až ×5.' },
  { icon: '🫧', text: 'Bublina po komárovi = vylepšení. Plácni na ni!' },
  { icon: '👑', text: 'Každá pátá vlna: královna komárů.' },
];

export const KEYS = [
  { keys: ['←', '↑', '→', '↓'], text: 'posun plácačky' },
  { keys: ['Enter', 'X'], text: 'plácnout' },
  { keys: ['Esc', 'P', 'Mezerník'], text: 'pauza' },
  { keys: ['R'], text: 'hrát znovu' },
  { keys: ['F'], text: 'celá obrazovka' },
  { keys: ['M'], text: 'zvuk' },
];

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function portraitCanvas(kind: MosquitoKind, size = 56): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  c.setAttribute('aria-hidden', 'true');
  paintPortrait(c, kind, dpr);
  return c;
}

export interface StartActions {
  play(mode: Mode, difficulty: Difficulty): void;
  changed(mode: Mode, difficulty: Difficulty): void;
  help(): void;
  achievements(): void;
  swatter(): void;
  /** Swat through the empty space around the panel. */
  swatAt(e: PointerEvent): void;
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
  start(): void;
}

export interface ResultInfo {
  best: number;
  isRecord: boolean;
  newAchievements: string[];
}

export class Screens {
  private bannerEl: HTMLElement;
  private bannerTimer = 0;
  private overlay: OverlayPromise<unknown> | null = null;
  current: OverlayKind | null = null;
  private dialogs = 0;

  constructor(banner: HTMLElement) {
    this.bannerEl = banner;
  }

  /** True while a kit dialog (help, achievements…) is open. */
  get dialogOpen(): boolean {
    return this.dialogs > 0 || Boolean(document.querySelector('dialog[open]'));
  }

  /** Closes whatever overlay is open (without resolving any action). */
  hide(): void {
    const o = this.overlay;
    this.overlay = null;
    this.current = null;
    o?.close(undefined as never);
  }

  private track<T>(kind: OverlayKind, p: OverlayPromise<T>, onDone: (v: T) => void): void {
    this.hide();
    this.overlay = p as OverlayPromise<unknown>;
    this.current = kind;
    void p.then((v) => {
      if (this.overlay !== (p as OverlayPromise<unknown>)) return; // replaced / hidden programmatically
      this.overlay = null;
      this.current = null;
      if (v !== undefined) onDone(v);
    });
  }

  /** Resolve the open pause overlay (e.g. from the Space key). */
  resumeFromKey(): void {
    if (this.current === 'pause' && this.overlay) (this.overlay as OverlayPromise<PauseChoice>).close('resume');
  }

  // ------------------------------------------------------------------ start

  showStart(save: SaveData, act: StartActions): void {
    let mode: Mode = save.prefs.mode;
    let diff: Difficulty = save.prefs.difficulty;
    const bestLine = (m: Mode, d: Difficulty): string => {
      const b = save.bests[bestKey(m, d)];
      if (!b) return 'Bez rekordu';
      if (m === 'zen') return `🏆 ${fmt(b.kills)} komárů`;
      if (m === 'waves') return `🏆 ${fmt(b.score)} · vlna ${b.wave}`;
      return `🏆 ${fmt(b.score)} bodů`;
    };
    const unlocked = Object.keys(save.achievements).length;
    const extra = el(`<div class="k-start">
      <div class="k-section">
        <span class="g92-eyebrow" id="k-mode-label">Režim</span>
        <div class="k-modes" role="radiogroup" aria-labelledby="k-mode-label">
          ${(Object.keys(MODES) as Mode[])
            .map(
              (m) => `<button type="button" class="k-mode" role="radio" data-mode="${m}" aria-checked="${m === mode}">
                <span class="k-mode__icon" aria-hidden="true">${MODE_ICON[m]}</span>
                <b>${MODES[m].name}</b>
                <small>${esc(MODES[m].desc)}</small>
                <span class="k-mode__best" data-best="${m}"></span>
              </button>`,
            )
            .join('')}
        </div>
        <p class="k-mode-desc" data-mode-desc aria-live="polite"></p>
      </div>
    </div>`);
    const more = el(`<div class="k-more">
      <button type="button" class="g92-btn g92-btn--soft" data-help>${ICONS.komari}<span>Komáři</span></button>
      <button type="button" class="g92-btn g92-btn--soft" data-ach>${iconSvg('trophy', 20)}<span>Úspěchy ${unlocked}/${ACHIEVEMENTS.length}</span></button>
      <button type="button" class="g92-btn g92-btn--soft" data-swatter>${iconSvg('swatter', 20)}<span>Plácačka</span></button>
    </div>`);
    const foot = el(`<p class="k-foot">${save.stats.totalKills > 0 ? `Celkem zaplácnuto: <b>${fmt(save.stats.totalKills)}</b> komárů` : 'Tip: zkus plácnout komáry i tady kolem.'}</p>`);

    const p = showStart({
      appId: 'komari',
      subtitle: 'Bzzz… plácni je dřív, než štípnou!',
      backdrop: 'clear',
      className: 'k-overlay-start',
      difficulties: (Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => ({ id: d, label: DIFFICULTIES[d].name, icon: DIFF_ICON[d], hint: DIFF_HINT[d] })),
      difficulty: diff,
      compact: true,
      showHowTo: !save.prefs.seenHelp,
      howTo: HOW_TO,
      keys: KEYS,
      extra,
    });
    // Mode picker joins the hero (above the difficulty picker; left column on landscape phones),
    // small buttons + tip go below "Hrát".
    const main = p.el.querySelector<HTMLElement>('.g92-overlay__view');
    const extraWrap = main?.querySelector<HTMLElement>('.g92-overlay__extra');
    const hero = main?.querySelector<HTMLElement>('.g92-overlay__hero');
    const diffSection = main?.querySelector<HTMLElement>('.g92-overlay__section');
    if (extraWrap && hero) hero.append(extraWrap);
    else if (extraWrap && diffSection) diffSection.before(extraWrap);
    const actions = main?.querySelector<HTMLElement>('.g92-overlay__actions');
    if (actions) {
      actions.append(more, foot);
      // Pull the kit's "Jak hrát" button into our row of small buttons (saves a full-width row).
      const how = actions.querySelector<HTMLElement>(':scope > .g92-btn--secondary');
      if (how) {
        how.className = 'g92-btn g92-btn--soft';
        more.prepend(how);
        more.classList.add('k-more--4');
      }
    }

    const sync = () => {
      extra.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
      extra.querySelectorAll<HTMLElement>('[data-best]').forEach((e) => (e.textContent = bestLine(e.dataset.best as Mode, diff)));
      extra.querySelector<HTMLElement>('[data-mode-desc]')!.textContent = MODES[mode].desc;
      act.changed(mode, diff);
    };
    sync();
    const modes = Object.keys(MODES) as Mode[];
    extra.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        mode = b.dataset.mode as Mode;
        sfx.click();
        sync();
      });
      b.addEventListener('keydown', (e) => {
        const i = modes.indexOf(mode);
        let n = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % modes.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + modes.length) % modes.length;
        if (n < 0) return;
        e.preventDefault();
        e.stopPropagation();
        mode = modes[n]!;
        sync();
        extra.querySelector<HTMLElement>(`[data-mode="${mode}"]`)?.focus();
      });
    });
    p.el.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'radio' && t.value in DIFFICULTIES) {
        diff = t.value as Difficulty;
        sync();
      }
    });
    more.querySelector('[data-help]')!.addEventListener('click', () => act.help());
    more.querySelector('[data-ach]')!.addEventListener('click', () => act.achievements());
    more.querySelector('[data-swatter]')!.addEventListener('click', () => act.swatter());
    // Swat the attract-mode mosquitoes around the panel.
    p.el.addEventListener('pointerdown', (e) => {
      if (e.target === p.el) act.swatAt(e);
    });
    this.track<StartResult>('start', p, (r) => act.play(mode, (r.difficulty as Difficulty | undefined) ?? diff));
  }

  // ------------------------------------------------------------------ pause

  showPause(info: { mode: Mode; score: number; wave: number; kills: number; difficulty: Difficulty }, act: PauseActions): void {
    const stats = [{ label: 'Skóre', value: info.score }];
    if (info.mode === 'waves') stats.push({ label: 'Vlna', value: info.wave });
    stats.push({ label: 'Zaplácnuto', value: info.kills });
    const extra = el(`<div class="k-more k-more--pause">
      <button type="button" class="g92-btn g92-btn--soft" data-help>${iconSvg('help', 20)}<span>Jak hrát</span></button>
      <button type="button" class="g92-btn g92-btn--soft" data-swatter>${iconSvg('swatter', 20)}<span>Plácačka</span></button>
    </div>`);
    extra.querySelector('[data-help]')!.addEventListener('click', () => act.help());
    extra.querySelector('[data-swatter]')!.addEventListener('click', () => act.swatter());
    const p = showPause({
      subtitle: `${MODES[info.mode].name} · ${DIFFICULTIES[info.difficulty].name}`,
      stats,
      menuHref: null,
      menuLabel: info.mode === 'zen' ? 'Dokončit' : 'Ukončit hru',
      className: 'k-overlay-pause',
    });
    // Secondary buttons below the main actions (kit `extra` would put them above "Pokračovat").
    p.el.querySelector('.g92-overlay__actions')?.append(extra);
    this.track<PauseChoice>('pause', p, (v) => {
      if (v === 'resume') act.resume();
      else if (v === 'restart') act.restart();
      else act.quit();
    });
  }

  // ------------------------------------------------------------------ results

  showResults(s: Summary, info: ResultInfo, act: ResultActions): void {
    const stat = (label: string, value: string | number) => ({ label, value });
    const time = `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}`;
    const acc = `${Math.round(s.accuracy * 100)} %`;
    const powers = String(s.powers.length);
    const stats =
      s.mode === 'waves'
        ? [stat('Zaplácnuto', s.kills), stat('Vlna', s.wave), stat('Kombo', s.bestCombo), stat('Přesnost', acc), stat('Štípanců', s.bites), stat('Čas', time)]
        : s.mode === 'minute'
          ? [stat('Zaplácnuto', s.kills), stat('Kombo', s.bestCombo), stat('Přesnost', acc), stat('Štípanců', s.bites), stat('Jednou ranou', s.maxMulti), stat('Vylepšení', powers)]
          : [stat('Skóre', s.score), stat('Kombo', s.bestCombo), stat('Přesnost', acc), stat('Jednou ranou', s.maxMulti), stat('Vylepšení', powers), stat('Čas', time)];
    const title =
      s.mode === 'minute'
        ? 'Čas vypršel!'
        : s.mode === 'zen'
          ? 'Pěkně vyplácáno!'
          : s.stars >= 3
            ? 'Mistr plácačky!'
            : s.stars >= 1
              ? 'Dobrá práce!'
              : info.isRecord
                ? 'Dobrý začátek!'
                : 'Komáři vyhráli… zatím!';
    const achs = info.newAchievements.map((id) => achievementById(id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
    const extra = achs.length
      ? el(`<div class="k-newach">${achs.map((a) => `<div><span aria-hidden="true">${a.icon}</span> Nový úspěch: <b>${esc(a.title)}</b></div>`).join('')}</div>`)
      : undefined;
    const p = showResults({
      title,
      subtitle: `${MODES[s.mode].name} · ${DIFFICULTIES[s.difficulty].name}`,
      score: s.mode === 'zen' ? s.kills : s.score,
      scoreLabel: s.mode === 'zen' ? 'komárů' : 'bodů',
      best: info.best,
      isNewBest: info.isRecord,
      stars: s.stars,
      stats,
      lost: s.mode === 'waves' && s.stars === 0 && !info.isRecord,
      actions: [{ label: 'Úvod', value: 'start', variant: 'soft', icon: iconSvg('home', 20) }],
      extra,
      className: 'k-overlay-results',
    });
    this.track<ResultsChoice>('results', p, (v) => {
      if (v === 'again') act.again();
      else if (v === 'start') act.start();
      // 'menu' navigates to /menu/ by itself.
    });
  }

  // ------------------------------------------------------------------ dialogs

  private dialog(title: string, content: Node, icon: string, wide = true): DialogHandle {
    this.dialogs++;
    const d = openDialog({ title, content, wide, icon, actions: [{ label: 'Zavřít', value: 'ok', variant: 'primary' }] });
    void d.closed.then(() => {
      this.dialogs = Math.max(0, this.dialogs - 1);
    });
    return d;
  }

  showHelp(): DialogHandle {
    const kinds: MosquitoKind[] = ['common', 'fast', 'tiger', 'ninja', 'fat', 'golden', 'queen'];
    const powers: PowerKind[] = ['big', 'electric', 'spray', 'lamp', 'net', 'frost', 'heart', 'time'];
    const root = el(`<div class="k-help">
      <div class="k-help-grid">
        <div class="k-help-item"><span class="k-help-ico" aria-hidden="true">👆</span><div><b>Plácni na komára</b><small>Klikni myší nebo ťukni prstem. Trefíš i víc najednou!</small></div></div>
        <div class="k-help-item"><span class="k-help-ico k-help-ico--warn" aria-hidden="true">!</span><div><b>Červený kruh = chce štípnout</b><small>Komár se zvětšuje a letí na tebe. Plácni ho, než se kruh uzavře.</small></div></div>
        <div class="k-help-item"><span class="k-help-ico" aria-hidden="true">❤️</span><div><b>Štípnutí bere srdíčko</b><small>Štípal zčervená a pomalu odlétá. Když ho dostihneš, srdíčko se vrátí.</small></div></div>
        <div class="k-help-item"><span class="k-help-ico" aria-hidden="true">🔥</span><div><b>Kombo násobí body</b><small>Plácej rychle za sebou a nemiň: ×2, ×3, ×4, ×5!</small></div></div>
      </div>
      <h3 class="k-h3">Komáři</h3>
      <div class="k-cards" data-kinds></div>
      <h3 class="k-h3">Vylepšení</h3>
      <div class="k-cards">
        ${powers
          .map(
            (p) => `<div class="k-help-item"><span class="k-help-ico" style="color:${POWERS[p].color}">${iconSvg(p, 30)}</span><div><b>${POWERS[p].name}</b><small>${esc(POWERS[p].desc)}${p === 'time' ? ' (jen v Minutovce)' : p === 'heart' || p === 'net' ? ' (ve Vlnách)' : ''}</small></div></div>`,
          )
          .join('')}
      </div>
    </div>`);
    const grid = root.querySelector<HTMLElement>('[data-kinds]')!;
    for (const k of kinds) {
      const item = el(`<div class="k-help-item"><div><b>${KINDS[k].name}</b><small>${esc(KINDS[k].desc)} · ${KINDS[k].points} b.</small></div></div>`);
      item.prepend(portraitCanvas(k));
      grid.appendChild(item);
    }
    return this.dialog('Komáři a vylepšení', root, iconSvg('help'));
  }

  showAchievements(save: SaveData): DialogHandle {
    const n = Object.keys(save.achievements).length;
    const items = ACHIEVEMENTS.map((a) => {
      const got = save.achievements[a.id];
      const date = got ? new Date(got).toLocaleDateString('cs-CZ') : '';
      return `<div class="k-ach ${got ? '' : 'is-locked'}">
        <span class="k-ach__icon" aria-hidden="true">${a.icon}</span>
        <div><b>${esc(a.title)}</b><small>${esc(a.desc)}${got ? ` · ${date}` : ''}</small></div>
      </div>`;
    }).join('');
    const bests = (['waves', 'minute', 'zen'] as Mode[])
      .map((m) =>
        (['easy', 'normal', 'hard'] as Difficulty[])
          .map((d) => {
            const b = save.bests[bestKey(m, d)];
            const v = b ? (m === 'zen' ? `${fmt(b.kills)} 🦟` : fmt(b.score)) : '–';
            return `<div class="k-stat"><small>${MODES[m].name} · ${DIFFICULTIES[d].name}</small><b>${v}</b></div>`;
          })
          .join(''),
      )
      .join('');
    const root = el(`<div class="k-achs">
      <p class="k-lead">Získáno <b>${n}</b> z ${ACHIEVEMENTS.length}. Některé odemykají nové plácačky!</p>
      <div class="g92-progress" style="--value:${(n / ACHIEVEMENTS.length).toFixed(3)}"></div>
      <div class="k-cards k-cards--ach">${items}</div>
      <h3 class="k-h3">Rekordy</h3>
      <div class="k-stats">${bests}</div>
      <h3 class="k-h3">Statistiky</h3>
      <div class="k-stats">
        <div class="k-stat"><small>Celkem komárů</small><b>${fmt(save.stats.totalKills)}</b></div>
        <div class="k-stat"><small>Odehraných her</small><b>${fmt(save.stats.games)}</b></div>
        <div class="k-stat"><small>Nejlepší kombo</small><b>${save.stats.bestCombo}</b></div>
        <div class="k-stat"><small>Čas hraní</small><b>${Math.round(save.stats.playSeconds / 60)} min</b></div>
      </div>
    </div>`);
    return this.dialog('Úspěchy a rekordy', root, iconSvg('trophy'));
  }

  /** Swatter look + game toggles (also embedded in the kit settings dialog). */
  swatterPanel(save: SaveData, change: (p: Partial<Prefs>) => void, compact = false): HTMLElement {
    const has = (id: string | null) => id === null || Boolean(save.achievements[id]);
    const p = save.prefs;
    const uid = Math.random().toString(36).slice(2, 7);
    const root = el(`<div class="k-swatter">
      ${compact ? '' : `<div class="k-swatter__preview"><canvas data-preview aria-label="Náhled plácačky" role="img"></canvas></div>`}
      <span class="g92-label" id="k-shape-${uid}">Tvar plácačky</span>
      <div class="k-shapes" role="radiogroup" aria-labelledby="k-shape-${uid}">
        ${SWATTER_SHAPES.map((s) => {
          const ok = has(s.unlock);
          const req = s.unlock ? achievementById(s.unlock)?.title ?? '' : '';
          return `<button type="button" class="k-shape" role="radio" data-shape="${s.id}" aria-checked="${p.shape === s.id}" ${ok ? '' : `disabled title="Odemkneš úspěchem „${esc(req)}“"`}>
            ${ok ? '' : iconSvg('lock', 16)}<span>${s.name}</span>${ok ? '' : `<small>${esc(req)}</small>`}</button>`;
        }).join('')}
      </div>
      <span class="g92-label" id="k-color-${uid}">Barva</span>
      <div class="k-swatches" role="radiogroup" aria-labelledby="k-color-${uid}">
        ${SWATTER_COLORS.map((c) => {
          const ok = has(c.unlock);
          const req = c.unlock ? achievementById(c.unlock)?.title ?? '' : '';
          return `<button type="button" class="k-swatch" role="radio" style="--c:${c.color}" data-color="${c.color}" aria-checked="${p.color === c.color}" aria-label="${c.name}${ok ? '' : ` – zamčeno, úspěch „${esc(req)}“`}" title="${ok ? c.name : `Odemkneš úspěchem „${esc(req)}“`}" ${ok ? '' : 'disabled'}>${ok ? '' : iconSvg('lock', 18)}</button>`;
        }).join('')}
        <label class="k-swatch k-swatch--custom" title="Vlastní barva"><input type="color" data-custom value="${p.color}" aria-label="Vlastní barva" /></label>
      </div>
      <label class="g92-switch-row k-switch"><span>Krvavé fleky<small>Vypnuto = šedé šmouhy místo krve.</small></span><input type="checkbox" class="g92-toggle" role="switch" data-blood ${p.blood ? 'checked' : ''} /></label>
      <label class="g92-switch-row k-switch"><span>Bzučení komárů<small>Čím blíž komár, tím hlasitěji bzučí.</small></span><input type="checkbox" class="g92-toggle" role="switch" data-buzz ${p.buzz ? 'checked' : ''} /></label>
    </div>`);
    const canvas = root.querySelector<HTMLCanvasElement>('[data-preview]');
    const draw = () => {
      if (!canvas) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = 200 * dpr;
      canvas.height = 170 * dpr;
      const g = canvas.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, 200, 170);
      g.translate(100, 62);
      drawSwatter(g, 36, { shape: p.shape, color: p.color, electric: false, big: false }, 0, 0);
    };
    draw();
    const sync = () => {
      root.querySelectorAll<HTMLElement>('[data-shape]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.shape === p.shape)));
      root.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === p.color)));
      root.querySelector('.k-swatch--custom')!.classList.toggle('is-on', !SWATTER_COLORS.some((c) => c.color === p.color));
      draw();
    };
    sync();
    root.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach((b) =>
      b.addEventListener('click', () => {
        p.shape = b.dataset.shape as Prefs['shape'];
        sfx.click();
        change({ shape: p.shape });
        sync();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) =>
      b.addEventListener('click', () => {
        p.color = b.dataset.color!;
        sfx.click();
        change({ color: p.color });
        sync();
      }),
    );
    root.querySelector<HTMLInputElement>('[data-custom]')!.addEventListener('input', (e) => {
      p.color = (e.target as HTMLInputElement).value;
      change({ color: p.color });
      sync();
    });
    root.querySelector<HTMLInputElement>('[data-blood]')!.addEventListener('change', (e) => change({ blood: (e.target as HTMLInputElement).checked }));
    root.querySelector<HTMLInputElement>('[data-buzz]')!.addEventListener('change', (e) => change({ buzz: (e.target as HTMLInputElement).checked }));
    return root;
  }

  showSwatter(save: SaveData, change: (p: Partial<Prefs>) => void): DialogHandle {
    return this.dialog('Plácačka', this.swatterPanel(save, change), iconSvg('swatter'), false);
  }

  // ------------------------------------------------------------------ in-game banners & toasts

  bannerWave(spec: WaveSpec | null, mode: Mode, wave: number): void {
    let html: string;
    let boss = false;
    if (mode === 'zen') {
      html = `<div class="banner__card"><div class="banner__kicker">Pohoda</div><div class="banner__title">Plácej v klidu</div><div class="banner__sub">Nikdo tu neštípe. Až budeš chtít skončit, dej pauzu.</div></div>`;
    } else if (mode === 'minute') {
      return; // the kit countdown covers the start
    } else {
      boss = Boolean(spec?.boss);
      const sub = boss ? 'Plácej královnu, dokud nepadne! Pozor na její komáry.' : `Zaplácni ${spec?.quota ?? 0} komárů`;
      html = `<div class="banner__card"><div class="banner__kicker">${boss ? 'Pozor, královna!' : 'Připrav se'}</div><div class="banner__title">Vlna ${wave}</div><div class="banner__sub">${sub}</div><div data-new></div></div>`;
    }
    this.showBanner(html, boss, mode === 'waves' && spec && spec.newKinds.length > 0 ? 2800 : 2000);
    if (spec && mode === 'waves') {
      const holder = this.bannerEl.querySelector<HTMLElement>('[data-new]');
      const k = spec.newKinds.includes('queen') ? 'queen' : spec.newKinds[0];
      if (holder && k) {
        const box = el(`<div class="banner__new"><div><small>Nový komár</small><b>${KINDS[k].name}</b><span>${esc(KINDS[k].desc)}</span></div></div>`);
        box.prepend(portraitCanvas(k, 64));
        holder.appendChild(box);
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
    toast(`Nový úspěch: ${a.title}`, { variant: 'accent', icon: `<span style="font-size:20px;line-height:22px">${a.icon}</span>`, duration: 3200 });
  }
}
