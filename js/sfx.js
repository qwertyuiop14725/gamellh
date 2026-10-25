/* ============================================================
 * sfx.js  ——  WebAudio 实时合成音效（无音频素材）
 * 射击音效极高频，这里做节流 + 同时发声数上限
 * ============================================================ */

const SFX = {
  ctx: null,
  enabled: true,
  voices: 0,
  lastAt: {},

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  },

  /* 节流：同一个音效在 minGap 秒内只响一次 */
  throttled(key, minGap) {
    const now = performance.now() / 1000;
    if (this.lastAt[key] && now - this.lastAt[key] < minGap) return true;
    this.lastAt[key] = now;
    return false;
  },

  tone(freq, dur, type, vol, slideTo) {
    const ctx = this.ctx;
    if (!ctx || this.voices > 8) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol || 0.12, ctx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
    this.voices++;
    osc.onended = () => { this.voices = Math.max(0, this.voices - 1); };
  },

  noise(dur, vol, cutoff) {
    const ctx = this.ctx;
    if (!ctx || this.voices > 8) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.1;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff || 1000;
    src.connect(f).connect(gain).connect(ctx.destination);
    src.start();
    this.voices++;
    src.onended = () => { this.voices = Math.max(0, this.voices - 1); };
  },

  play(name) {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    switch (name) {
      case 'shoot':
        if (this.throttled('shoot', 0.07)) return;
        this.tone(880, 0.05, 'square', 0.035, 620);
        break;
      case 'laser':
        if (this.throttled('laser', 0.10)) return;
        this.tone(1400, 0.06, 'sawtooth', 0.03, 1100);
        break;
      case 'missile':
        if (this.throttled('missile', 0.10)) return;
        this.tone(420, 0.09, 'triangle', 0.05, 780);
        break;
      case 'hit':
        if (this.throttled('hit', 0.05)) return;
        this.tone(320, 0.04, 'square', 0.03);
        break;
      case 'boom':
        if (this.throttled('boom', 0.05)) return;
        this.noise(0.22, 0.09, 800);
        break;
      case 'bigboom':
        this.noise(0.5, 0.16, 500);
        this.tone(90, 0.5, 'sine', 0.11, 40);
        break;
      case 'pick':
        this.tone(760, 0.1, 'sine', 0.09);
        setTimeout(() => this.tone(1140, 0.12, 'sine', 0.07), 70);
        break;
      case 'hurt':
        this.tone(220, 0.3, 'sawtooth', 0.1, 70);
        this.noise(0.3, 0.1);
        break;
      case 'bomb':
        this.noise(0.7, 0.18, 400);
        this.tone(140, 0.6, 'sine', 0.12, 50);
        break;
      case 'wave':
        [520, 660, 790].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.08), i * 90));
        break;
      case 'boss':
        [180, 220, 160].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sawtooth', 0.09), i * 200));
        break;
      case 'over':
        [440, 350, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.1), i * 150));
        break;
      case 'click':
        this.tone(700, 0.05, 'square', 0.05);
        break;
    }
  }
};
