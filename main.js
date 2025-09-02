"use strict";

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const scoreEl = document.getElementById("score");
  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnSound = document.getElementById("btnSound");
  const soundIconSpan = document.getElementById("soundIcon");
  const swatterTypeEl = document.getElementById("swatterType");
  const swatterColorEl = document.getElementById("swatterColor");

  const state = {
    running: false,
    paused: false,
    score: 0,
    bestScore: 0,
    mosquitos: [],
    splats: [],
    lastTime: 0,
    spawnAccumulator: 0,
    pointer: { x: 0, y: 0, vx: 0, vy: 0, lastTimeMs: 0, isDown: false },
    swat: { isSwinging: false, radius: 36, cooldownMs: 160, lastSwingAt: 0, swingDurationMs: 120, type: "round", color: "#60a5fa" },
    maxMosquitos: 18,
    audio: { enabled: true, ctx: null, unlocked: false },
    perf: { mode: "high", fps: 60, lastCheckMs: performance.now() }
  };
  let fpsLast = performance.now();
  let fpsCounter = 0;
  let fpsValue = 0;

  // Utility
  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, min, max) => v < min ? min : v > max ? max : v;
  const distanceSquared = (x1, y1, x2, y2) => {
    const dx = x1 - x2, dy = y1 - y2;
    return dx * dx + dy * dy;
  };

  // Swatter size scales with score (mírnější růst)
  function computeSwatRadius(score) {
    const base = state.swat.radius;
    const s = Math.max(0, Number(score) || 0);
    const growth = 0.22 * s + 2.2 * Math.sqrt(s) + 4 * Math.log2(s + 2);
    return base + growth;
  }

  function getSwatterDrawRadius(now) {
    const base = computeSwatRadius(state.score);
    const swingBoost = state.swat.isSwinging ? (1 - clamp((now - state.swat.lastSwingAt) / state.swat.swingDurationMs, 0, 1)) : 0;
    const swingPx = 12;
    return base + swingBoost * swingPx;
  }

  // Difficulty scaling helpers
  function computeCapacityCss() {
    const cssWidth = canvas.width / devicePixelRatioScale;
    const cssHeight = canvas.height / devicePixelRatioScale;
    const area = cssWidth * cssHeight;
    const cap = Math.floor(area / 22000); // ~46 on 1280x800, ~94 on 1080p
    return clamp(cap, 8, 80);
  }
  function targetAliveForScore(score) {
    const minAlive = 6;
    const linear = score * 0.8; // hlavní růst
    const extra = Math.sqrt(Math.max(0, score)) * 2; // lehké přikořenění
    return Math.round(minAlive + linear + extra);
  }
  function spawnIntervalForScore(score, alive, target) {
    const base = 1.2 - 1.1 * clamp(score / 80, 0, 1); // výrazně rychlejší s vyšším score
    const pressure = clamp((target - alive) / Math.max(1, target), 0, 1); // pokud je deficit, ještě zrychlit
    const interval = base * (1 - 0.85 * pressure);
    return clamp(interval, 0.04, 1.2);
  }

  function spawnRateMultiplierForScore(score) {
    // plynulé zrychlení akumulace s rostoucím skóre, až ~9x
    return 1 + Math.min(8, (Math.max(0, score) / 50));
  }

  // DPR and resize
  let devicePixelRatioScale = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    devicePixelRatioScale = dpr;
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  // Local storage best score
  const BEST_KEY = "komari_bestScore";
  const SWATTER_KEY = "komari_swatter";
  const storedBest = Number(localStorage.getItem(BEST_KEY) || "0");
  state.bestScore = isNaN(storedBest) ? 0 : storedBest;
  // best score no longer shown in HUD

  // Audio
  function ensureAudio() {
    if (!state.audio.enabled) return null;
    if (!state.audio.ctx) {
      try {
        state.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        state.audio.enabled = false;
        return null;
      }
    }
    return state.audio.ctx;
  }

  function unlockAudio() {
    const ctxA = ensureAudio();
    if (ctxA && ctxA.state === "suspended") {
      ctxA.resume();
    }
    state.audio.unlocked = true;
  }

  function playSlapSound() {
    const ctxA = ensureAudio();
    if (!ctxA) return;
    const duration = 0.08;
    const sampleRate = ctxA.sampleRate;
    const frameCount = Math.floor(duration * sampleRate);
    const buffer = ctxA.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / frameCount;
      // White noise with quick decay envelope
      const envelope = Math.exp(-20 * t);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const source = ctxA.createBufferSource();
    source.buffer = buffer;
    const filter = ctxA.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 600;
    const gain = ctxA.createGain();
    gain.gain.value = 0.5;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctxA.destination);
    source.start();
  }

  function renderSoundIcon() {
    if (!soundIconSpan) return;
    soundIconSpan.innerHTML = state.audio.enabled
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M5 9v6h4l5 4V5L9 9H5z"/><path d="M16.5 12a3.5 3.5 0 0 0-2.5-3.35v6.7A3.5 3.5 0 0 0 16.5 12z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M5 9v6h4l5 4V5L9 9H5z"/><path d="M19 5 5 19" stroke="currentColor" stroke-width="2"/></svg>';
  }
  renderSoundIcon();

  btnSound.addEventListener("click", () => {
    state.audio.enabled = !state.audio.enabled;
    renderSoundIcon();
    if (state.audio.enabled) unlockAudio();
  });

  // Entities
  class Mosquito {
    constructor(boundsWidth, boundsHeight) {
      const margin = 24;
      this.positionX = rand(margin, boundsWidth - margin);
      this.positionY = rand(margin, boundsHeight - margin);
      this.headingRadians = rand(0, Math.PI * 2);
      this.speedPixelsPerSecond = rand(60, 160);
      this.turnSpeedRadiansPerSecond = rand(Math.PI, Math.PI * 2);
      this.radiusPixels = rand(9, 12);
      this.alive = true;
      this.timeToJitterSeconds = rand(0.15, 0.8);
      this.wingAngleRadians = 0;
      this.wingFlapSpeed = rand(18, 28); // flaps per second
    }
    update(deltaSeconds, boundsWidth, boundsHeight) {
      if (!this.alive) return;
      // Jitter heading
      this.timeToJitterSeconds -= deltaSeconds;
      if (this.timeToJitterSeconds <= 0) {
        this.timeToJitterSeconds = rand(0.2, 0.9);
        const jitter = rand(-Math.PI / 2, Math.PI / 2);
        this.headingRadians += jitter * 0.35;
      }
      // Move forward
      const vx = Math.cos(this.headingRadians) * this.speedPixelsPerSecond;
      const vy = Math.sin(this.headingRadians) * this.speedPixelsPerSecond;
      this.positionX += vx * deltaSeconds;
      this.positionY += vy * deltaSeconds;
      // Keep within bounds with soft bounce
      const pad = this.radiusPixels + 4;
      if (this.positionX < pad) {
        this.positionX = pad;
        this.headingRadians = Math.PI - this.headingRadians;
      } else if (this.positionX > boundsWidth - pad) {
        this.positionX = boundsWidth - pad;
        this.headingRadians = Math.PI - this.headingRadians;
      }
      if (this.positionY < pad) {
        this.positionY = pad;
        this.headingRadians = -this.headingRadians;
      } else if (this.positionY > boundsHeight - pad) {
        this.positionY = boundsHeight - pad;
        this.headingRadians = -this.headingRadians;
      }
      // Wing animation
      this.wingAngleRadians += deltaSeconds * this.wingFlapSpeed * 2 * Math.PI;
    }
    kill() {
      this.alive = false;
    }
    draw(context) {
      if (!this.alive) return;
      const x = this.positionX;
      const y = this.positionY;
      const r = this.radiusPixels;
      const isLow = false;
      // Animation helpers
      const flapT = (Math.sin(this.wingAngleRadians) + 1) * 0.5; // 0..1
      const wingOpen = 0.45 + 0.55 * flapT;
      const roll = (flapT - 0.5) * 0.18;

      // Drop shadow (soft floor) - fixed screen-space offset (light from top-right), ellipse rotates with body
      context.save();
      const offX = -r * 0.36; // left
      const offY =  r * 0.32; // down
      context.translate(x + offX, y + offY);
      context.rotate(this.headingRadians + roll);
      context.globalAlpha = isLow ? 0.08 : 0.12;
      context.fillStyle = "#000";
      context.beginPath();
      context.ellipse(0, 0, r * 1.55, r * 0.64, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.save();
      context.translate(x, y);
      context.rotate(this.headingRadians + roll);

      if (isLow) {
        // Simplified mosquito drawing for performance
        // Simple wings perpendicular to body
        const flap = Math.sin(this.wingAngleRadians) * 0.3 + 0.5;
        const flutter = Math.sin(this.wingAngleRadians);
        const flutterTilt = flutter * 0.22;
        context.globalAlpha = 1.0;
        context.fillStyle = "#c8d5e6"; // stronger grey-light blue tint
        const wingMajor = r * (1.0 + 0.36 * flap);
        const wingMinor = r * (0.28 + 0.24 * flap);
        // draw in rotated local space to guarantee perpendicular orientation
        context.save();
        context.translate(-r * 0.1, -r * 0.6);
        context.rotate(-Math.PI / 2 + (-1) * flutterTilt);
        context.scale(1 + 0.08 * flap, 1 + 0.03 * flap);
        context.beginPath();
        context.ellipse(0, 0, wingMajor, wingMinor, 0, 0, Math.PI * 2);
        // darker, more visible fill on light bg
        const prevComp1 = context.globalCompositeOperation;
        context.globalCompositeOperation = "multiply";
        context.fill();
        context.globalCompositeOperation = prevComp1;
        context.strokeStyle = "rgba(50,90,130,0.8)";
        context.lineWidth = 1.35;
        context.stroke();
        // subtle highlight to retain translucency
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.14;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.ellipse(-wingMajor * 0.1, -wingMinor * 0.25, wingMajor * 0.35, wingMinor * 0.22, 0.15, 0, Math.PI * 2);
        context.fill();
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1.0;
        context.restore();
        context.save();
        context.translate(-r * 0.1, r * 0.6);
        context.rotate(-Math.PI / 2 + (1) * flutterTilt);
        context.scale(1 + 0.08 * flap, 1 + 0.03 * flap);
        context.beginPath();
        context.ellipse(0, 0, wingMajor, wingMinor, 0, 0, Math.PI * 2);
        const prevComp2 = context.globalCompositeOperation;
        context.globalCompositeOperation = "multiply";
        context.fill();
        context.globalCompositeOperation = prevComp2;
        context.strokeStyle = "rgba(50,90,130,0.8)";
        context.lineWidth = 1.35;
        context.stroke();
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.14;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.ellipse(-wingMajor * 0.1, -wingMinor * 0.25, wingMajor * 0.35, wingMinor * 0.22, 0.15, 0, Math.PI * 2);
        context.fill();
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1.0;
        context.restore();
        context.globalAlpha = 1;
        // Body
        context.fillStyle = "#2a2f38";
        context.beginPath();
        context.ellipse(0, 0, r * 0.9, r * 0.65, 0, 0, Math.PI * 2);
        context.fill();
        // Head
        context.beginPath();
        context.ellipse(r * 0.8, 0, r * 0.45, r * 0.45, 0, 0, Math.PI * 2);
        context.fill();
        // Proboscis
        context.strokeStyle = "#161a1f";
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(r * 1.2, 0);
        context.lineTo(r * 1.9, 0);
        context.stroke();
        // Minimal legs
        context.strokeStyle = "#171b20";
        context.lineWidth = 1;
        for (const side of [-1, 1]) {
          context.beginPath();
          context.moveTo(-r * 0.15, side * r * 0.15);
          context.lineTo(-r * 0.7, side * r * (0.2 + 0.15 * flapT));
          context.stroke();
        }
        context.restore();
        return;
      }

      // WINGS (behind body) - perpendicular to body (major axis along local Y)
      const drawWing = (sign) => {
        context.save();
        const wingAlpha = 0.78 + 0.22 * flapT;
        context.globalAlpha = wingAlpha;
        const lg = context.createLinearGradient(-r * 0.2, -r * 1.4, r * 0.2, 0);
        lg.addColorStop(0, "rgba(190,205,220,0.96)");   // stronger grey-blue
        lg.addColorStop(0.5, "rgba(175,195,215,0.75)"); // visible mid tone
        lg.addColorStop(1, "rgba(220,235,250,0.30)");   // faint fade-out
        context.fillStyle = lg;
        // anchor at side of thorax; rotate local space by +90° to ensure perpendicular orientation
        const wingMajor = r * (1.1 + 0.35 * flapT);   // major radius
        const wingMinor = r * (0.28 + 0.22 * flapT);  // minor radius
        context.translate(-r * 0.1, sign * r * 0.6);
        const flutter = Math.sin(this.wingAngleRadians);
        const flutterTilt = flutter * 0.22;
        context.rotate(-Math.PI / 2 + sign * flutterTilt);
        context.scale(1 + 0.07 * flapT, 1 + 0.03 * flapT);
        context.beginPath();
        context.ellipse(0, 0, wingMajor, wingMinor, 0, 0, Math.PI * 2);
        const prevComp = context.globalCompositeOperation;
        context.globalCompositeOperation = "multiply";
        context.fill();
        context.globalCompositeOperation = prevComp;
        // outline to improve visibility on light backgrounds
        context.strokeStyle = "rgba(50,90,130,0.8)";
        context.lineWidth = 1.3;
        context.stroke();
        // veins: from root outward along +/-Y
        context.globalAlpha = 0.5;
        context.strokeStyle = "rgba(110,140,170,0.65)";
        context.lineWidth = 0.85;
        for (let i = 0; i < 4; i++) {
          const t = i / 3;
          const sx = -r * 0.25;
          const sy = sign * (r * (0.1 + 0.06 * i));
          const ex = sx + r * (0.25 + 0.1 * t);
          const ey = sign * (r * (0.5 + 0.35 * t));
          context.beginPath();
          context.moveTo(sx, sy);
          context.lineTo(ex, ey);
          context.stroke();
        }
        // subtle highlight pass to suggest translucency
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.15;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.ellipse(-wingMajor * 0.08, -wingMinor * 0.22, wingMajor * 0.32, wingMinor * 0.2, 0.1, 0, Math.PI * 2);
        context.fill();
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1.0;
        context.restore();
      };
      drawWing(-1);
      drawWing(1);

      // ABDOMEN (rear)
      const abdomenGrad = context.createRadialGradient(-r * 1.0, -r * 0.3, r * 0.2, -r * 0.9, 0, r * 1.8);
      abdomenGrad.addColorStop(0, "#9aa6b7");
      abdomenGrad.addColorStop(0.25, "#5c6675");
      abdomenGrad.addColorStop(1, "#14171b");
      context.fillStyle = abdomenGrad;
      context.beginPath();
      context.ellipse(-r * 0.95, 0, r * 1.4, r * 0.62, 0.04, 0, Math.PI * 2);
      context.fill();
      // subtle stripes
      context.globalAlpha = 0.22;
      context.strokeStyle = "#cfd8e3";
      context.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const f = 0.14 * k;
        context.beginPath();
        context.moveTo(-r * (1.55 - f), -r * 0.35);
        context.lineTo(-r * (0.65 - f), r * 0.35);
        context.stroke();
      }
      context.globalAlpha = 1;

      // THORAX (center)
      const thoraxGrad = context.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.2, 0, 0, r * 1.0);
      thoraxGrad.addColorStop(0, "#b6c1d3");
      thoraxGrad.addColorStop(0.35, "#657083");
      thoraxGrad.addColorStop(1, "#1a1e24");
      context.fillStyle = thoraxGrad;
      context.beginPath();
      context.ellipse(0, 0, r * 0.95, r * 0.68, 0, 0, Math.PI * 2);
      context.fill();

      // LEGS (3 pairs)
      const drawLeg = (anchorX, anchorY, baseAngle, side, phase) => {
        const swing = (Math.sin(this.wingAngleRadians * 2 + phase) * 0.14);
        const len1 = r * 0.9;
        const len2 = r * 1.1;
        const a1 = baseAngle + side * (0.85 + swing);
        const a2 = a1 + side * (0.9 + swing * 0.6);
        const x1 = anchorX + Math.cos(a1) * len1;
        const y1 = anchorY + Math.sin(a1) * len1;
        const x2 = x1 + Math.cos(a2) * len2;
        const y2 = y1 + Math.sin(a2) * len2;
        context.strokeStyle = "#0f1216";
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(anchorX, anchorY);
        context.lineTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        // highlight
        context.strokeStyle = "rgba(255,255,255,0.08)";
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(anchorX, anchorY);
        context.lineTo(x1, y1);
        context.stroke();
      };
      for (const side of [-1, 1]) {
        // front, mid, rear anchors near thorax
        drawLeg(-r * 0.1, side * r * 0.2, 0.05, side, 0.0);
        drawLeg(-r * 0.2, side * r * 0.05, -0.1, side, 1.1);
        drawLeg(-r * 0.3, side * -r * 0.1, -0.3, side, 2.2);
      }

      // HEAD
      const headGrad = context.createRadialGradient(r * 0.75, -r * 0.3, r * 0.1, r * 0.9, 0, r * 0.6);
      headGrad.addColorStop(0, "#d5deea");
      headGrad.addColorStop(0.45, "#7b8799");
      headGrad.addColorStop(1, "#22262c");
      context.fillStyle = headGrad;
      context.beginPath();
      context.ellipse(r * 0.9, 0, r * 0.46, r * 0.46, 0, 0, Math.PI * 2);
      context.fill();
      // eye
      context.fillStyle = "#0c0f14";
      context.beginPath();
      context.ellipse(r * 1.0, -r * 0.08, r * 0.22, r * 0.26, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "rgba(255,255,255,0.9)";
      context.beginPath();
      context.arc(r * 1.08, -r * 0.2, r * 0.06, 0, Math.PI * 2);
      context.fill();

      // PROBOSCIS
      context.strokeStyle = "#0e1116";
      context.lineWidth = 1.3;
      context.beginPath();
      context.moveTo(r * 1.18, 0);
      context.lineTo(r * 2.15, 0);
      context.stroke();
      context.strokeStyle = "rgba(255,255,255,0.25)";
      context.lineWidth = 0.6;
      context.beginPath();
      context.moveTo(r * 1.2, -0.5);
      context.lineTo(r * 1.9, -0.5);
      context.stroke();

      // ANTENNAE
      context.strokeStyle = "#11151a";
      context.lineWidth = 1.0;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(r * 0.85, side * r * 0.1);
        context.quadraticCurveTo(r * 1.15, side * -r * 0.45, r * 0.5, side * -r * 0.6);
        context.stroke();
      }

      context.restore();
    }
  }

  class Splat {
    constructor(x, y, radiusPixels, options = {}) {
      this.positionX = x;
      this.positionY = y;
      this.radiusPixels = radiusPixels;
      this.ageSeconds = 0;
      this.maxAgeSeconds = 8;
      this.hue = Number.isFinite(options.hue) ? options.hue : 0; // degrees
      this.orientationRadians = options.orientationRadians || 0;
      this.strength = clamp(options.strength || 0.3, 0, 1);
      this.rotationJitter = rand(-0.2, 0.2);
      // precompute smear geometry
      this.smearLength = radiusPixels * (1.2 + 2.0 * this.strength);
      this.smearWidth = radiusPixels * (0.6 + 0.3 * this.strength);
      // drips
      this.drips = [];
      const dripCount = Math.round(2 + Math.random() * 3 + this.strength * 3);
      for (let i = 0; i < dripCount; i++) {
        const dx = rand(-radiusPixels * 0.4, radiusPixels * 0.4);
        const r = radiusPixels * rand(0.12, 0.22);
        this.drips.push({
          x: this.positionX + dx,
          y: this.positionY + radiusPixels * 0.55 + rand(-2, 4),
          r,
          vx: rand(-10, 10),
          vy: rand(10, 40) + this.strength * 120,
          age: 0,
          maxAge: 5 + Math.random() * 4
        });
      }
      // organic base blot
      this.blotPoints = [];
      const pointCount = Math.floor(16 + Math.random() * 8);
      for (let i = 0; i < pointCount; i++) {
        const ang = (i / pointCount) * Math.PI * 2;
        const baseR = this.radiusPixels * (0.55 + 0.25 * this.strength);
        const jitter = this.radiusPixels * rand(-0.18, 0.22);
        const orient = this.orientationRadians + Math.PI; // slightly flattened towards back
        const flatten = 0.1 + 0.18 * this.strength;
        let rr = baseR + jitter;
        rr *= 1 - flatten * Math.cos(ang - orient);
        this.blotPoints.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
      }
      // curved streaks
      this.streaks = [];
      const streakCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < streakCount; i++) {
        const angleOffset = rand(-0.35, 0.35);
        const angle = this.orientationRadians + angleOffset;
        const length = this.smearLength * (0.55 + Math.random() * 0.6);
        const width = this.radiusPixels * (0.16 + 0.22 * Math.random() * (0.5 + this.strength));
        const curve = rand(-0.35, 0.35);
        const startOffset = rand(-this.radiusPixels * 0.25, this.radiusPixels * 0.25);
        this.streaks.push({ angle, length, width, curve, startOffset });
      }
      // specks
      this.specks = [];
      const speckCount = Math.floor(10 + Math.random() * 12 + this.strength * 8);
      for (let i = 0; i < speckCount; i++) {
        const ang = this.orientationRadians + Math.PI + rand(-0.7, 0.7) * 0.6;
        const d = this.radiusPixels * (0.5 + Math.random() * 1.8);
        const px = Math.cos(ang) * d;
        const py = Math.sin(ang) * d * 0.65;
        const rr = this.radiusPixels * (0.05 + Math.random() * 0.12);
        this.specks.push({ x: px, y: py, r: rr });
      }
    }
    update(deltaSeconds) {
      this.ageSeconds += deltaSeconds;
      // update drips with gravity
      const g = 600; // px/s^2
      for (const d of this.drips) {
        if (d.age >= d.maxAge) continue;
        d.vy += g * deltaSeconds;
        d.x += d.vx * deltaSeconds;
        d.y += d.vy * deltaSeconds;
        d.vx *= 0.995;
        d.age += deltaSeconds;
        // stop when offscreen-ish to save perf
        if (d.y > (canvas.height / devicePixelRatioScale) + 200) d.age = d.maxAge;
      }
    }
    isExpired() {
      return this.ageSeconds >= this.maxAgeSeconds;
    }
    draw(context) {
      const lifeT = clamp(this.ageSeconds / this.maxAgeSeconds, 0, 1);
      const wet = 1 - lifeT;
      const baseAlpha = 0.45 - 0.28 * lifeT;
      const darkAlpha = 0.6 - 0.4 * lifeT;
      const glossAlpha = 0.12 * wet;
      const isLow = false;

      // base blot and streaks
      context.save();
      context.translate(this.positionX, this.positionY);
      context.rotate(this.orientationRadians + this.rotationJitter);
      context.globalCompositeOperation = "multiply";

      // irregular base blot
      context.fillStyle = `rgba(110,7,12,${baseAlpha})`;
      context.beginPath();
      if (this.blotPoints.length) {
        context.moveTo(this.blotPoints[0].x, this.blotPoints[0].y);
        for (let i = 1; i < this.blotPoints.length; i++) {
          context.lineTo(this.blotPoints[i].x, this.blotPoints[i].y);
        }
        context.closePath();
        context.fill();
      }

      // curved streaks with taper (reduced in low)
      context.strokeStyle = `rgba(90,6,10,${darkAlpha})`;
      context.lineCap = "round";
      const streaksToDraw = isLow ? Math.min(1, this.streaks.length) : this.streaks.length;
      for (let si = 0; si < streaksToDraw; si++) {
        const s = this.streaks[si];
        const layers = isLow ? 1 : 2;
        for (let k = 0; k < layers; k++) {
          const w = s.width * (1 - k * 0.55);
          const len = s.length * (1 - k * 0.28);
          const a = s.angle;
          const sx = Math.cos(a) * (this.radiusPixels * 0.2 + s.startOffset);
          const sy = Math.sin(a) * (this.radiusPixels * 0.2 + s.startOffset);
          const cx = sx + Math.cos(a + s.curve) * (len * 0.45);
          const cy = sy + Math.sin(a + s.curve) * (len * 0.45);
          const ex = sx + Math.cos(a) * len;
          const ey = sy + Math.sin(a) * len;
          context.lineWidth = w;
          context.beginPath();
          context.moveTo(sx, sy);
          context.quadraticCurveTo(cx, cy, ex, ey);
          context.stroke();
        }
      }

      // specks (reduced in low)
      context.fillStyle = `rgba(90,6,10,${darkAlpha})`;
      const specksToDraw = isLow ? Math.min(4, this.specks.length) : this.specks.length;
      for (let pi = 0; pi < specksToDraw; pi++) {
        const p = this.specks[pi];
        context.beginPath();
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        context.fill();
      }

      // subtle gloss (skip in low)
      if (!isLow) {
        context.globalCompositeOperation = "screen";
        context.globalAlpha = glossAlpha;
        const grad = context.createLinearGradient(-this.smearLength * 0.15, -this.smearWidth * 0.3, this.smearLength * 0.25, 0);
        grad.addColorStop(0, "rgba(255,255,255,0.18)");
        grad.addColorStop(1, "rgba(255,255,255,0.0)");
        context.fillStyle = grad;
        context.beginPath();
        context.ellipse(-this.radiusPixels * 0.2, -this.radiusPixels * 0.15, this.smearLength * 0.28, this.smearWidth * 0.2, 0.2, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      // drips
      context.save();
      context.globalCompositeOperation = "multiply";
      const dripsToDraw = isLow ? Math.min(2, this.drips.length) : this.drips.length;
      for (let di = 0; di < dripsToDraw; di++) {
        const d = this.drips[di];
        const fade = 1 - clamp(d.age / d.maxAge, 0, 1);
        const a = (0.46 - 0.25 * lifeT) * fade;
        context.fillStyle = `rgba(90,6,10,${a})`;
        context.beginPath();
        context.ellipse(d.x, d.y, d.r * 1.1, d.r * 1.4, 0.15, 0, Math.PI * 2);
        context.fill();
      }
      if (!isLow) {
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.14 * wet;
        context.fillStyle = "rgba(255,255,255,1)";
        for (const d of this.drips) {
          const fade = 1 - clamp(d.age / d.maxAge, 0, 1);
          if (fade <= 0) continue;
          context.beginPath();
          context.arc(d.x + d.r * 0.22, d.y - d.r * 0.28, d.r * 0.22, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.restore();
    }
  }

  // Game control
  function resetGame() {
    state.score = 0;
    state.mosquitos = [];
    state.splats = [];
    state.spawnAccumulator = 0;
    updateHud();
    for (let i = 0; i < 6; i++) {
      spawnMosquito();
    }
  }

  function spawnMosquito() {
    // žádný pevný cap – řízeno jen targetAliveForScore()
    const { width, height } = canvas;
    const cssWidth = width / devicePixelRatioScale;
    const cssHeight = height / devicePixelRatioScale;
    state.mosquitos.push(new Mosquito(cssWidth, cssHeight));
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
  }

  function setRunning(value) {
    state.running = value;
    state.paused = !value ? false : state.paused;
    if (value) {
      state.lastTime = performance.now();
      requestAnimationFrame(tick);
    }
  }

  function setPaused(value) {
    if (!state.running) return;
    state.paused = value;
    if (!value) {
      state.lastTime = performance.now();
      requestAnimationFrame(tick);
    }
    document.body.classList.toggle("paused", value);
  }

  function onSwat(x, y) {
    const now = performance.now();
    if (now - state.swat.lastSwingAt < state.swat.cooldownMs) return;
    state.swat.lastSwingAt = now;
    state.swat.isSwinging = true;
    unlockAudio();
    if (state.audio.enabled) playSlapSound();

    const r = computeSwatRadius(state.score); // stejný poloměr jako vizuální hranice
    const r2 = r * r;
    let hits = 0;
    const pvx = state.pointer.vx || 0;
    const pvy = state.pointer.vy || 0;
    const speed = Math.hypot(pvx, pvy);
    const baseOrient = Math.atan2(pvy, pvx);
    for (const m of state.mosquitos) {
      if (!m.alive) continue;
      if (distanceSquared(x, y, m.positionX, m.positionY) <= r2) {
        m.kill();
        const orient = speed > 220 ? baseOrient : Math.atan2(m.positionY - y, m.positionX - x);
        const strength = clamp(speed / 1400, 0, 1);
        state.splats.push(new Splat(
          m.positionX,
          m.positionY,
          m.radiusPixels * rand(2.6, 3.6),
          { hue: rand(-10, 10), orientationRadians: orient, strength }
        ));
        hits++;
      }
    }
    if (hits > 0) {
      state.score += hits;
      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        localStorage.setItem(BEST_KEY, String(state.bestScore));
      }
      updateHud();
    }
  }

  // Input
  function canvasToCssPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    return { x, y };
  }

  canvas.addEventListener("pointermove", (e) => {
    const now = performance.now();
    const p = canvasToCssPoint(e.clientX, e.clientY);
    const lastT = state.pointer.lastTimeMs || now;
    const dt = Math.max(0.000001, (now - lastT) / 1000);
    const dx = p.x - state.pointer.x;
    const dy = p.y - state.pointer.y;
    const instVx = dx / dt;
    const instVy = dy / dt;
    const smoothing = 0.4;
    state.pointer.vx = instVx * smoothing + state.pointer.vx * (1 - smoothing);
    state.pointer.vy = instVy * smoothing + state.pointer.vy * (1 - smoothing);
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.lastTimeMs = now;
  });
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = canvasToCssPoint(e.clientX, e.clientY);
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.isDown = true;
    if (!state.running) {
      resetGame();
      setRunning(true);
    }
    if (!state.paused) {
      onSwat(state.pointer.x, state.pointer.y);
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    state.pointer.isDown = false;
  });
  canvas.addEventListener("pointercancel", () => {
    state.pointer.isDown = false;
  });

  // Buttons
  btnStart.addEventListener("click", () => {
    if (!state.running) {
      resetGame();
      setRunning(true);
      setPaused(false);
    } else if (state.paused) {
      setPaused(false);
    }
    unlockAudio();
  });
  btnPause.addEventListener("click", () => {
    if (!state.running) return;
    setPaused(!state.paused);
  });
  btnRestart.addEventListener("click", () => {
    resetGame();
    if (!state.running) setRunning(true);
  });

  // Swatter UI controls
  swatterTypeEl.addEventListener("change", () => {
    state.swat.type = swatterTypeEl.value;
    saveSwatterPrefs();
  });
  swatterColorEl.addEventListener("input", () => {
    state.swat.color = swatterColorEl.value;
    saveSwatterPrefs();
  });

  function saveSwatterPrefs() {
    try {
      const toSave = { type: state.swat.type, color: state.swat.color };
      localStorage.setItem(SWATTER_KEY, JSON.stringify(toSave));
    } catch {}
  }
  function loadSwatterPrefs() {
    try {
      const raw = localStorage.getItem(SWATTER_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && (obj.type === "square" || obj.type === "round")) {
        state.swat.type = obj.type;
      }
      if (obj && typeof obj.color === "string" && obj.color.startsWith("#")) {
        state.swat.color = obj.color;
      }
    } catch {}
    // sync UI
    if (swatterTypeEl) swatterTypeEl.value = state.swat.type;
    if (swatterColorEl) swatterColorEl.value = state.swat.color;
  }
  loadSwatterPrefs();

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!state.running) {
        resetGame();
        setRunning(true);
        return;
      }
      setPaused(!state.paused);
    } else if (e.key.toLowerCase() === "r") {
      resetGame();
      if (!state.running) setRunning(true);
    }
  });

  // Loop
  function tick(timeMs) {
    if (!state.running) return;
    const now = timeMs;
    let rawDeltaSeconds = (now - state.lastTime) / 1000;
    let deltaSeconds = rawDeltaSeconds;
    if (deltaSeconds > 0.05) deltaSeconds = 0.05;
    state.lastTime = now;

    if (!state.paused) {
      update(deltaSeconds);
    }
    render();
    // perf fps estimate (no mode switching; always high quality)
    const instFps = 1 / Math.max(rawDeltaSeconds, 0.001);
    state.perf.fps = state.perf.fps * 0.9 + instFps * 0.1;
    state.perf.mode = "high";
    if (now - state.perf.lastCheckMs >= 600) {
      state.perf.lastCheckMs = now;
    }
    requestAnimationFrame(tick);
  }

  function update(deltaSeconds) {
    // spawn scaled by score (rychlejší akumulace v endgame)
    state.spawnAccumulator += deltaSeconds * spawnRateMultiplierForScore(state.score);
    let currentAlive = state.mosquitos.filter(m => m.alive).length;
    const targetAlive = targetAliveForScore(state.score);
    const spawnInterval = spawnIntervalForScore(state.score, currentAlive, targetAlive);
    while (state.spawnAccumulator >= spawnInterval && currentAlive < targetAlive) {
      state.spawnAccumulator -= spawnInterval;
      spawnMosquito();
      currentAlive++;
    }
    // update mosquitos
    const { width, height } = canvas;
    const cssWidth = width / devicePixelRatioScale;
    const cssHeight = height / devicePixelRatioScale;
    for (const m of state.mosquitos) {
      m.update(deltaSeconds, cssWidth, cssHeight);
    }
    // update splats (no low-perf throttling)
    const updateEvery = 1;
    for (let i = 0; i < state.splats.length; i++) {
      if (i % updateEvery === 0) state.splats[i].update(deltaSeconds);
    }
    // cleanup with cap in low perf
    state.mosquitos = state.mosquitos.filter(m => m.alive);
    const maxSplats = 200;
    state.splats = state.splats.filter(s => !s.isExpired());
    if (state.splats.length > maxSplats) state.splats.splice(0, state.splats.length - maxSplats);
    // keep alive counts in hud
    updateHud();
    // swat animation
    if (state.swat.isSwinging) {
      if (performance.now() - state.swat.lastSwingAt > state.swat.swingDurationMs) {
        state.swat.isSwinging = false;
      }
    }
  }

  function render() {
    const { width, height } = canvas;
    // Background
    ctx.fillStyle = "#f5f8fb";
    ctx.fillRect(0, 0, width, height);
    // subtle grid (draw only in high quality)
    if (state.perf.mode === "high") {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = "#3a6cc9";
      ctx.lineWidth = 1;
      const step = 32;
      const cssWidth = width / devicePixelRatioScale;
      const cssHeight = height / devicePixelRatioScale;
      for (let x = 0; x < cssWidth; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssHeight);
        ctx.stroke();
      }
      for (let y = 0; y < cssHeight; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssWidth, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Splats
    for (const s of state.splats) {
      s.draw(ctx);
    }

    // Mosquitos
    for (const m of state.mosquitos) {
      m.draw(ctx);
    }

    // Swatter cursor
    drawSwatter(ctx, state.pointer.x, state.pointer.y, state);
  }

  function drawSwatter(context, x, y, s) {
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    const now = performance.now();
    const radius = getSwatterDrawRadius(now);
    const heat = clamp((performance.now() - s.swat.lastSwingAt) / 300, 0, 1);
    // outer ring
    context.save();
    context.translate(x, y);
    context.globalAlpha = 0.75; // celkově průhlednější
    const accent = s.swat.color || "#d53939";
    context.strokeStyle = s.swat.isSwinging ? accent : (heat < 1 ? accent : "#2b2b2b");
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    // inner cross
    context.globalAlpha = 0.5; // méně výrazný
    context.beginPath();
    context.moveTo(-radius, 0);
    context.lineTo(radius, 0);
    context.moveTo(0, -radius);
    context.lineTo(0, radius);
    context.stroke();
    // draw plastic swatter head and handle
    drawPlasticSwatter(context, s, radius);
    context.restore();
  }

  function drawPlasticSwatter(context, s, radius) {
    const color = s.swat.color || "#e11d48";
    const type = s.swat.type || "square";
    const headW = radius * 2.1;
    const headH = radius * 1.6;
    const handleLen = radius * 2.4;
    const handleW = Math.max(6, radius * 0.35);
    const headOffset = radius * 0.8;

    // handle
    context.save();
    context.globalAlpha = 0.6; // více průhledné
    context.fillStyle = color;
    context.strokeStyle = "rgba(0,0,0,0.35)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(-handleW * 0.5, headOffset, handleW, handleLen, Math.min(6, handleW * 0.6));
    context.fill();
    context.stroke();

    // grip stripes
    context.globalAlpha = 0.2;
    context.strokeStyle = "#ffffff";
    for (let i = 0; i < 5; i++) {
      const yy = headOffset + handleLen * (i / 5);
      context.beginPath();
      context.moveTo(-handleW * 0.45, yy);
      context.lineTo(handleW * 0.45, yy);
      context.stroke();
    }
    context.restore();

    // head shape
    context.save();
    context.translate(0, -radius * 0.2);
    context.fillStyle = color;
    context.strokeStyle = "rgba(0,0,0,0.35)";
    context.lineWidth = 1.5;
    context.beginPath();
    if (type === "round") {
      context.ellipse(0, 0, headW * 0.55, headW * 0.55, 0, 0, Math.PI * 2);
    } else {
      context.roundRect(-headW * 0.5, -headH * 0.5, headW, headH, 8);
    }
    // poloprůhledná hlava
    context.globalAlpha = 0.45;
    context.fill();
    context.stroke();

    // perforated mesh
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "rgba(0,0,0,0.5)"; // díry méně tmavé
    const cols = type === "round" ? 8 : 9;
    const rows = type === "round" ? 8 : 7;
    for (let rIdx = 0; rIdx < rows; rIdx++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const tx = (cIdx / (cols - 1)) - 0.5;
        const ty = (rIdx / (rows - 1)) - 0.5;
        const gx = tx * headW * 0.8;
        const gy = ty * (type === "round" ? headW * 0.8 : headH * 0.8);
        if (type === "round" && Math.hypot(gx, gy) > headW * 0.4) continue;
        context.beginPath();
        context.arc(gx, gy, Math.max(1.2, radius * 0.14), 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();

    // highlight
    context.save();
    context.globalCompositeOperation = "screen";
    context.globalAlpha = 0.12;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.ellipse(0, -radius * 0.5, headW * 0.4, headH * 0.25, -0.3, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  // Initial idle render with instructions
  render();
})();


