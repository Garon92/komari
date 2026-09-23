import { POWERS, POWER_ORDER, type PowerKind } from '../game/config';
import type { Game } from '../game/game';
import { iconSvg } from '../render/icons';

const HEART_FULL = '<svg class="icon heart" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.7C1.5 7.7 3.8 4 7.4 4c2 0 3.5 1.1 4.6 2.6C13.1 5.1 14.6 4 16.6 4c3.6 0 5.9 3.7 4.7 7.3C19.5 16.4 12 21 12 21z"/></svg>';

/** In-game heads-up display (DOM, updated only when values change). */
export class Hud {
  private root: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private waveChip: HTMLElement;
  private waveLabel: HTMLElement;
  private waveBar: HTMLElement;
  private progressEl: HTMLElement;
  private timerEl: HTMLElement;
  private livesEl: HTMLElement;
  private powersEl: HTMLElement;
  private last = { score: -1, mul: -1, combo: -1, wave: '', pct: -1, time: -1, lives: -1, maxLives: -1, powers: '' };

  constructor(root: HTMLElement, onPause: () => void) {
    this.root = root;
    root.innerHTML = `
      <div class="hud__row">
        <div class="hud__left">
          <div class="chip hud__score" aria-label="Skóre"><small>Skóre</small><span data-score>0</span></div>
          <div class="chip hud__combo" data-combo hidden></div>
        </div>
        <div class="hud__center">
          <div class="chip hud__wave" data-wave>
            <span class="hud__wave-label" data-wave-label></span>
            <div class="progress" data-progress><span data-bar></span></div>
          </div>
          <div class="chip hud__timer" data-timer hidden></div>
        </div>
        <div class="hud__right">
          <div class="chip hud__lives" data-lives aria-label="Životy"></div>
          <button class="hud__pause" type="button" data-pause aria-label="Pauza (Esc)">${iconSvg('pause', 22)}</button>
        </div>
      </div>
      <div class="hud__powers" data-powers></div>`;
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
    this.scoreEl = q('[data-score]');
    this.comboEl = q('[data-combo]');
    this.waveChip = q('[data-wave]');
    this.waveLabel = q('[data-wave-label]');
    this.waveBar = q('[data-bar]');
    this.progressEl = q('[data-progress]');
    this.timerEl = q('[data-timer]');
    this.livesEl = q('[data-lives]');
    this.powersEl = q('[data-powers]');
    q('[data-pause]').addEventListener('click', (e) => {
      e.stopPropagation();
      onPause();
    });
    // The pause button must not trigger a swat underneath.
    q('[data-pause]').addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  reset(): void {
    this.last = { score: -1, mul: -1, combo: -1, wave: '', pct: -1, time: -1, lives: -1, maxLives: -1, powers: '' };
  }

  /** Height the HUD occupies at the top (mosquitoes stay below it). */
  topInset(): number {
    const row = this.root.querySelector<HTMLElement>('.hud__row');
    return row ? row.offsetHeight + 14 : 60;
  }

  update(game: Game): void {
    const L = this.last;
    if (game.score !== L.score) {
      L.score = game.score;
      this.scoreEl.textContent = game.score.toLocaleString('cs-CZ');
    }
    const mul = game.multiplier;
    if (mul !== L.mul || game.combo !== L.combo) {
      const bumped = mul > L.mul && L.mul > 0;
      L.mul = mul;
      L.combo = game.combo;
      this.comboEl.hidden = game.combo < 2;
      this.comboEl.dataset.mul = String(mul);
      this.comboEl.textContent = mul > 1 ? `×${mul} · kombo ${game.combo}` : `kombo ${game.combo}`;
      if (bumped) {
        this.comboEl.classList.remove('bump');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('bump');
      }
    }

    // Centre: wave progress / minute timer / zen counter.
    let label = '';
    let pct = 0;
    if (game.mode === 'waves') {
      const spec = game.waveSpecCur;
      if (spec?.boss) {
        const q = game.mosquitoes.find((m) => m.kind === 'queen');
        label = `Vlna ${game.wave} · Královna`;
        pct = q ? q.hp / q.maxHp : game.waveProgress >= 1 ? 0 : 1;
      } else {
        label = `Vlna ${game.wave} · ${Math.min(game.waveProgress, game.quota)}/${game.quota}`;
        pct = game.quota > 0 ? Math.min(1, game.waveProgress / game.quota) : 0;
      }
      this.progressEl.classList.toggle('is-boss', Boolean(spec?.boss));
    } else if (game.mode === 'zen') {
      label = `Pohoda · ${game.kills} 🦟`;
      pct = (game.kills % 50) / 50;
    }
    const showWave = game.mode !== 'minute';
    this.waveChip.hidden = !showWave;
    if (label !== L.wave) {
      L.wave = label;
      this.waveLabel.textContent = label;
    }
    const pr = Math.round(pct * 100);
    if (pr !== L.pct) {
      L.pct = pr;
      this.waveBar.style.width = `${pr}%`;
    }

    this.timerEl.hidden = game.mode !== 'minute';
    if (game.mode === 'minute') {
      const t = Math.ceil(game.timeLeft);
      if (t !== L.time) {
        L.time = t;
        this.timerEl.textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        this.timerEl.classList.toggle('is-low', t <= 10);
      }
    }

    // Lives.
    this.livesEl.hidden = game.mode !== 'waves';
    if (game.mode === 'waves' && (game.lives !== L.lives || game.maxLives !== L.maxLives)) {
      const lost = L.lives > game.lives && L.lives > 0 ? game.lives : -1;
      L.lives = game.lives;
      L.maxLives = game.maxLives;
      const shown = Math.max(game.lives, game.diff.lives);
      let html = '';
      for (let i = 0; i < shown; i++) {
        const cls = i < game.lives ? '' : ' is-empty';
        const lostCls = i === lost ? ' is-lost' : '';
        html += HEART_FULL.replace('icon heart', `icon heart${cls}${lostCls}`);
      }
      this.livesEl.innerHTML = html;
      this.livesEl.setAttribute('aria-label', `Životy: ${game.lives}`);
    }

    // Active power-ups.
    const act = POWER_ORDER.filter((k) => game.powers[k] > 0);
    const key = act.map((k) => `${k}:${Math.ceil(game.powers[k] * 4)}`).join(',');
    if (key !== L.powers) {
      L.powers = key;
      this.renderPowers(act, game);
    }
  }

  private renderPowers(act: PowerKind[], game: Game): void {
    const existing = new Map<string, HTMLElement>();
    for (const el of Array.from(this.powersEl.children) as HTMLElement[]) existing.set(el.dataset.kind ?? '', el);
    for (const [k, el] of existing) if (!act.includes(k as PowerKind)) el.remove();
    for (const k of act) {
      let el = existing.get(k);
      if (!el) {
        el = document.createElement('div');
        el.className = 'power-chip';
        el.dataset.kind = k;
        el.title = POWERS[k].name;
        el.style.setProperty('--c', POWERS[k].color);
        el.innerHTML = iconSvg(k, 24);
        this.powersEl.appendChild(el);
      }
      el.style.setProperty('--p', String(Math.max(0, game.powers[k] / POWERS[k].duration)));
    }
  }
}
