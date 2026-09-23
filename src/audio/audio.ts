/**
 * Synthesized sound for Komáři (WebAudio, no samples).
 * – one-shot effects (slap, splat, zap, pickup, fanfares…)
 * – continuous mosquito buzz: two voices following the nearest mosquitoes,
 *   louder and panned by proximity to the swatter.
 */

type Ctx = AudioContext;

interface BuzzVoice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

export interface BuzzSource {
  /** 0..1 loudness (already proximity-weighted). */
  level: number;
  /** -1..1 stereo position. */
  pan: number;
  /** Base frequency in Hz. */
  freq: number;
}

export class Audio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private buzzBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: BuzzVoice[] = [];
  enabled = true;
  buzzEnabled = true;
  private buzzActive = false;

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  private ensure(): Ctx | null {
    if (this.ctx) return this.ctx;
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = this.enabled ? this.masterGain() : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.gain.value = 1;
      sfx.connect(master);
      const buzz = ctx.createGain();
      buzz.gain.value = 0;
      buzz.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.sfxBus = sfx;
      this.buzzBus = buzz;
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      return ctx;
    } catch {
      return null;
    }
  }

  private volume = 0.7;

  /** Global volume 0..1 (kit settings). */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.enabled ? this.masterGain() : 0, this.ctx.currentTime, 0.02);
  }

  private masterGain(): number {
    return 1.25 * this.volume;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.setBuzzActive(false);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? this.masterGain() : 0, this.ctx.currentTime, 0.02);
    if (on && this.ctx) this.unlock();
  }

  setBuzzEnabled(on: boolean): void {
    this.buzzEnabled = on;
    if (!on) this.setBuzzActive(false);
  }

  private get live(): Ctx | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  // ------------------------------------------------------------ helpers

  private noiseBurst(opt: { dur: number; gain: number; type: BiquadFilterType; freq: number; freqEnd?: number; q?: number; delay?: number; pan?: number }): void {
    const ctx = this.live;
    if (!ctx || !this.noise || !this.sfxBus) return;
    const t = ctx.currentTime + (opt.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opt.type;
    f.frequency.setValueAtTime(opt.freq, t);
    if (opt.freqEnd) f.frequency.exponentialRampToValueAtTime(opt.freqEnd, t + opt.dur);
    f.Q.value = opt.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opt.gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    let node: AudioNode = g;
    if (opt.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opt.pan));
      g.connect(p);
      node = p;
    }
    src.connect(f).connect(g);
    node.connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + opt.dur + 0.05);
  }

  private tone(opt: { freq: number; freqEnd?: number; dur: number; gain: number; type?: OscillatorType; delay?: number; attack?: number; pan?: number }): void {
    const ctx = this.live;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime + (opt.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opt.type ?? 'sine';
    o.frequency.setValueAtTime(opt.freq, t);
    if (opt.freqEnd) o.frequency.exponentialRampToValueAtTime(opt.freqEnd, t + opt.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opt.gain, t + (opt.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    let node: AudioNode = g;
    if (opt.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opt.pan));
      g.connect(p);
      node = p;
    }
    o.connect(g);
    node.connect(this.sfxBus);
    o.start(t);
    o.stop(t + opt.dur + 0.05);
  }

  // ------------------------------------------------------------ effects

  /** The swing + plastic slap. `hit` adds a wet thump. */
  swat(hit: boolean, pan = 0): void {
    // Whoosh of the swing.
    this.noiseBurst({ dur: 0.09, gain: 0.18, type: 'bandpass', freq: 1800, freqEnd: 600, q: 0.7, pan });
    // Plastic slap (like the original: bright noise with fast decay).
    this.noiseBurst({ dur: hit ? 0.1 : 0.07, gain: hit ? 0.55 : 0.32, type: 'highpass', freq: 700, delay: 0.015, pan });
    this.tone({ freq: 180, freqEnd: 70, dur: 0.08, gain: hit ? 0.35 : 0.16, type: 'triangle', delay: 0.015, pan });
  }

  splat(size = 1, pan = 0): void {
    this.noiseBurst({ dur: 0.16 * size, gain: 0.35, type: 'lowpass', freq: 900, freqEnd: 180, q: 3, delay: 0.02, pan });
    this.tone({ freq: 140 / Math.sqrt(size), freqEnd: 55, dur: 0.14, gain: 0.25, type: 'sine', delay: 0.02, pan });
  }

  hurt(pan = 0): void {
    this.tone({ freq: 420, freqEnd: 260, dur: 0.12, gain: 0.18, type: 'square', pan });
  }

  multi(count: number): void {
    const base = 523.25;
    for (let i = 0; i < Math.min(5, count); i++) {
      this.tone({ freq: base * Math.pow(1.26, i), dur: 0.12, gain: 0.14, type: 'triangle', delay: 0.06 * i });
    }
  }

  comboUp(mult: number): void {
    const notes = [0, 4, 7, 12];
    const root = 392 * Math.pow(2, (mult - 2) / 6);
    notes.forEach((n, i) => this.tone({ freq: root * Math.pow(2, n / 12), dur: 0.14, gain: 0.12, type: 'square', delay: 0.05 * i }));
  }

  comboBreak(): void {
    this.tone({ freq: 330, freqEnd: 200, dur: 0.22, gain: 0.1, type: 'triangle' });
  }

  bite(): void {
    // "Au!" – a descending wobble plus an itchy scratch.
    this.tone({ freq: 620, freqEnd: 180, dur: 0.35, gain: 0.3, type: 'sawtooth' });
    this.tone({ freq: 90, freqEnd: 50, dur: 0.3, gain: 0.35, type: 'sine' });
    for (let i = 0; i < 3; i++) this.noiseBurst({ dur: 0.05, gain: 0.12, type: 'bandpass', freq: 3000, q: 2, delay: 0.25 + i * 0.07 });
  }

  blocked(): void {
    this.tone({ freq: 880, freqEnd: 1320, dur: 0.12, gain: 0.12, type: 'triangle' });
    this.noiseBurst({ dur: 0.08, gain: 0.1, type: 'bandpass', freq: 2400, q: 4 });
  }

  pickup(): void {
    [0, 4, 7, 11, 14].forEach((n, i) => this.tone({ freq: 523.25 * Math.pow(2, n / 12), dur: 0.16, gain: 0.12, type: 'sine', delay: 0.045 * i }));
  }

  drop(): void {
    this.tone({ freq: 700, freqEnd: 1100, dur: 0.12, gain: 0.08, type: 'sine' });
  }

  powerEnd(): void {
    this.tone({ freq: 660, freqEnd: 330, dur: 0.25, gain: 0.08, type: 'sine' });
  }

  zap(pan = 0): void {
    const ctx = this.live;
    if (!ctx) return;
    this.tone({ freq: 1400, freqEnd: 300, dur: 0.12, gain: 0.12, type: 'sawtooth', pan });
    this.noiseBurst({ dur: 0.12, gain: 0.2, type: 'highpass', freq: 3000, pan });
  }

  lampZap(pan = 0): void {
    this.tone({ freq: 120, dur: 0.18, gain: 0.18, type: 'square', pan });
    this.tone({ freq: 2400, freqEnd: 800, dur: 0.1, gain: 0.08, type: 'sawtooth', pan });
    this.noiseBurst({ dur: 0.15, gain: 0.22, type: 'highpass', freq: 2000, pan });
  }

  spray(): void {
    this.noiseBurst({ dur: 0.35, gain: 0.12, type: 'highpass', freq: 4000 });
  }

  frost(): void {
    [0, 7, 12, 19].forEach((n, i) => this.tone({ freq: 1046 * Math.pow(2, n / 12), dur: 0.4, gain: 0.05, type: 'sine', delay: 0.05 * i }));
  }

  queenSpawn(): void {
    this.tone({ freq: 160, freqEnd: 240, dur: 0.3, gain: 0.12, type: 'sawtooth' });
  }

  queenDown(): void {
    this.splat(2.2);
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone({ freq: 392 * Math.pow(2, n / 12), dur: 0.2, gain: 0.12, type: 'triangle', delay: 0.2 + 0.07 * i }));
  }

  waveStart(boss: boolean): void {
    if (boss) {
      [0, 3, 6].forEach((n, i) => this.tone({ freq: 110 * Math.pow(2, n / 12), dur: 0.35, gain: 0.18, type: 'sawtooth', delay: 0.15 * i }));
      return;
    }
    [0, 7].forEach((n, i) => this.tone({ freq: 440 * Math.pow(2, n / 12), dur: 0.18, gain: 0.1, type: 'triangle', delay: 0.1 * i }));
  }

  waveClear(): void {
    [0, 4, 7, 12, 7, 12].forEach((n, i) => this.tone({ freq: 523.25 * Math.pow(2, n / 12), dur: 0.22, gain: 0.12, type: 'triangle', delay: 0.09 * i }));
  }

  tick(last: boolean): void {
    this.tone({ freq: last ? 1320 : 990, dur: 0.06, gain: 0.08, type: 'square' });
  }

  gameOver(): void {
    [7, 4, 0, -5].forEach((n, i) => this.tone({ freq: 392 * Math.pow(2, n / 12), dur: 0.3, gain: 0.12, type: 'triangle', delay: 0.18 * i }));
  }

  fanfare(): void {
    [0, 4, 7, 12, 16].forEach((n, i) => this.tone({ freq: 523.25 * Math.pow(2, n / 12), dur: 0.25, gain: 0.12, type: 'triangle', delay: 0.08 * i }));
  }

  achievement(): void {
    [12, 16, 19, 24].forEach((n, i) => this.tone({ freq: 523.25 * Math.pow(2, n / 12), dur: 0.18, gain: 0.08, type: 'sine', delay: 0.07 * i }));
  }

  click(): void {
    this.tone({ freq: 660, freqEnd: 880, dur: 0.05, gain: 0.06, type: 'triangle' });
  }

  // ------------------------------------------------------------ buzz

  setBuzzActive(on: boolean): void {
    const want = on && this.enabled && this.buzzEnabled;
    if (want === this.buzzActive) return;
    const ctx = this.ctx;
    if (!ctx || !this.buzzBus) {
      this.buzzActive = false;
      return;
    }
    this.buzzActive = want;
    if (want && this.voices.length === 0) this.createVoices(ctx);
    this.buzzBus.gain.setTargetAtTime(want ? 1 : 0, ctx.currentTime, 0.08);
  }

  private createVoices(ctx: Ctx): void {
    if (!this.buzzBus) return;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 560;
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 563;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7 + i * 2.3;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 14;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfoGain.connect(osc2.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 1.1;
      const mix2 = ctx.createGain();
      mix2.gain.value = 0.35;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc.connect(filter);
      osc2.connect(mix2).connect(filter);
      filter.connect(gain).connect(pan).connect(this.buzzBus);
      osc.start();
      osc2.start();
      lfo.start();
      this.voices.push({ osc, osc2, lfo, lfoGain, filter, gain, pan });
    }
  }

  /** Called every frame with up to two loudest buzz sources. */
  updateBuzz(sources: BuzzSource[]): void {
    const ctx = this.ctx;
    if (!ctx || !this.buzzActive) return;
    const t = ctx.currentTime;
    this.voices.forEach((v, i) => {
      const s = sources[i];
      const level = s ? Math.min(1, s.level) : 0;
      v.gain.gain.setTargetAtTime(level * 0.075, t, 0.06);
      if (s) {
        v.osc.frequency.setTargetAtTime(s.freq, t, 0.05);
        v.osc2.frequency.setTargetAtTime(s.freq * 1.005, t, 0.05);
        v.filter.frequency.setTargetAtTime(s.freq * 2.4, t, 0.05);
        v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, s.pan)), t, 0.05);
      }
    });
  }

  /** Pause/resume the whole context (e.g. when the tab is hidden). */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.enabled && this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }
}
