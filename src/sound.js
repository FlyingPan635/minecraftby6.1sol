const TWO_PI = Math.PI * 2;

/** Original, procedural sounds: no recordings or game assets are needed. */
export class SoundSystem {
  constructor() {
    this.context = null;
    this.volume = .45;
    this.master = null;
    this.noiseBuffer = null;
    this.ambient = null;
    this.ambientGain = null;
    this.stepTimer = 0;
    this.birdTimer = 14;
    this.voiceCount = 0;
  }

  start() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return Promise.resolve();
      try {
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 15;
        compressor.ratio.value = 5;
        this.master.connect(compressor);
        compressor.connect(this.context.destination);
        const rate = this.context.sampleRate;
        this.noiseBuffer = this.context.createBuffer(1, rate * 2, rate);
        const values = this.noiseBuffer.getChannelData(0);
        let n = 1429573;
        for (let i = 0; i < values.length; i++) {
          n = (Math.imul(n, 1664525) + 1013904223) | 0;
          values[i] = ((n >>> 0) / 2147483648 - 1) * .8;
        }
        this.ambientGain = this.context.createGain();
        this.ambientGain.gain.value = 0;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 350;
        this.ambient = this.context.createBufferSource();
        this.ambient.buffer = this.noiseBuffer; this.ambient.loop = true;
        this.ambient.connect(filter); filter.connect(this.ambientGain); this.ambientGain.connect(this.master);
        this.ambient.start();
      } catch { this.context = null; return Promise.resolve(); }
    }
    return this.context.resume().catch(() => {});
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, Number(value) || 0));
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .03);
  }

  tone(frequency, duration, amplitude = .1, wave = 'sine', endFrequency = frequency, delay = 0) {
    if (!this.context || this.context.state !== 'running' || this.voiceCount > 65) return;
    const t = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(10, frequency), t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), t + duration);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, amplitude), t + Math.min(.018, duration * .15));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    oscillator.connect(gain); gain.connect(this.master);
    this.voiceCount++;
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voiceCount--; };
    oscillator.start(t); oscillator.stop(t + duration + .025);
  }

  noise(duration, amplitude = .1, frequency = 900, filterType = 'bandpass', delay = 0, endFrequency = frequency) {
    if (!this.context || this.context.state !== 'running' || this.voiceCount > 65) return;
    const t = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = filterType; filter.Q.value = .65;
    filter.frequency.setValueAtTime(Math.max(25, frequency), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(25, endFrequency), t + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, amplitude), t + Math.min(.012, duration * .12));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    this.voiceCount++;
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.voiceCount--; };
    source.start(t, Math.random() * .8); source.stop(t + duration + .02);
  }

  material(variant) {
    if (typeof variant === 'string') return variant;
    if ([6, 8, 19, 28, 29, 34, 35, 36, 37].includes(variant)) return 'wood';
    if ([1, 2, 7, 17, 22, 24, 30, 31, 32, 33].includes(variant)) return 'grass';
    if ([4, 25].includes(variant)) return 'sand';
    if (variant === 10) return 'glass';
    if ([5, 27].includes(variant)) return 'water';
    return 'stone';
  }

  impact(variant, amp = .16, delay = 0, breaking = false) {
    const material = this.material(variant);
    const variation = .88 + Math.random() * .24;
    if (material === 'grass' || material === 'sand') {
      this.noise(.16, amp, material === 'grass' ? 1600 : 900, 'bandpass', delay, 420);
      this.tone(100 * variation, .055, amp * .35, 'sine', 70, delay);
    } else if (material === 'wood') {
      this.tone(230 * variation, .085, amp * .55, 'triangle', 140, delay);
      this.noise(.07, amp * .55, 950, 'bandpass', delay);
    } else if (material === 'glass') {
      this.tone(1600 * variation, .15, amp * .28, 'sine', 1300, delay);
      this.tone(2350 * variation, .12, amp * .15, 'sine', 1700, delay + .015);
      if (breaking) this.noise(.2, amp * .6, 4300, 'highpass', delay);
    } else if (material === 'water') {
      this.noise(.25, amp * .7, 740, 'lowpass', delay, 1600);
      this.tone(430 * variation, .09, amp * .18, 'sine', 180, delay + .03);
    } else {
      this.noise(.095, amp, 1050 * variation, 'bandpass', delay, 430);
      this.tone(125 * variation, .07, amp * .35, 'triangle', 73, delay);
    }
  }

  animal(type, hurt = false, death = false) {
    const duration = death ? .5 : hurt ? .24 : .6;
    const volume = hurt ? .14 : .035;
    if (type === 'cow') {
      this.tone(hurt ? 195 : 115, duration, volume, 'triangle', hurt ? 90 : 70);
      this.tone(hurt ? 390 : 230, duration * .8, volume * .24, 'sine', 120);
    } else if (type === 'pig') {
      this.tone(hurt ? 740 : 410, duration * .45, volume * .7, 'triangle', hurt ? 510 : 270);
      this.noise(duration * .4, volume * .7, 1100, 'bandpass');
      if (!hurt) this.tone(430, .18, volume * .6, 'triangle', 240, .21);
    } else if (type === 'sheep') {
      for (let i = 0; i < 5; i++) this.tone((hurt ? 490 : 295) + (i % 2) * 55, .095, volume * .6, 'triangle', 230, i * .075);
    } else if (type === 'zombie') {
      this.tone(hurt ? 180 : 93, duration, volume * .8, 'sawtooth', 48);
      this.noise(duration * .8, volume * .9, 230, 'lowpass');
    } else if (type === 'skeleton') {
      for (let i = 0; i < 3; i++) this.impact('stone', hurt ? .12 : .025, i * .105);
    } else this.noise(duration * .55, volume, 1400, 'bandpass');
  }

  play(name, variant = 3) {
    if (!this.context || this.context.state !== 'running' || this.volume === 0) return;
    switch (name) {
      case 'step': case 'footstep': this.impact(variant, .105); break;
      case 'place': this.impact(variant, .2); break;
      case 'hit': case 'mine': case 'dig': this.impact(variant, .07); break;
      case 'break':
        this.impact(variant, .24, 0, true);
        this.impact(variant, .085, .04, true);
        this.impact(variant, .06, .085, true);
        break;
      case 'swing': this.noise(.1, .085, 1450, 'bandpass', 0, 450); break;
      case 'hurt':
        this.tone(165, .16, .16, 'triangle', 87);
        this.noise(.14, .17, 440, 'bandpass');
        break;
      case 'jump': this.noise(.075, .035, 620, 'bandpass'); break;
      case 'land': this.impact(variant, .22); this.tone(85, .08, .13, 'sine', 52); break;
      case 'water': case 'swim': case 'splash':
        this.noise(.38, .15, 1500, 'lowpass', 0, 400);
        for (let i = 0; i < 4; i++) this.tone(450 + Math.random() * 450, .09, .023, 'sine', 150, i * .055);
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(.095, .14, 1350, 'bandpass', i * .145, 500);
        break;
      case 'pickup': this.tone(660, .09, .045, 'sine', 880); this.tone(990, .12, .04, 'sine', 1210, .065); break;
      case 'craft': this.tone(350, .09, .055, 'triangle', 450); this.tone(600, .13, .04, 'sine', 760, .075); break;
      case 'click': this.tone(520, .05, .035, 'triangle', 360); break;
      case 'door': this.tone(200, .15, .11, 'triangle', 100); this.noise(.16, .09, 820, 'bandpass'); break;
      case 'explosion':
        this.noise(1.0, .85, 2100, 'lowpass', 0, 80);
        this.tone(80, .65, .4, 'sine', 23);
        this.noise(.46, .32, 400, 'bandpass', .18, 100);
        break;
      case 'creeper_fuse': this.noise(1.65, .2, 2800, 'highpass', 0, 5800); break;
      case 'bow': this.noise(.17, .085, 1400, 'bandpass', 0, 400); this.tone(275, .12, .045, 'triangle', 95); break;
      case 'arrow_hit': this.noise(.045, .07, 3000, 'bandpass'); this.tone(720, .05, .035, 'triangle', 380); break;
      case 'zombie_attack': this.animal('zombie', true); break;
      case 'mob_hurt': this.animal(variant, true); break;
      case 'mob_death': this.animal(variant, true, true); break;
      case 'sheep': case 'pig': case 'cow': case 'zombie': case 'skeleton': case 'creeper': this.animal(name); break;
      default: break;
    }
  }

  update(dt, state = {}) {
    if (!this.context || this.context.state !== 'running') return;
    this.stepTimer -= dt;
    if ((state.walking || state.moving) && state.grounded && !state.paused && this.stepTimer <= 0) {
      this.play(state.underwater ? 'swim' : 'step', state.block ?? 1);
      this.stepTimer = state.sprinting ? .27 : .4;
    }
    if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(state.paused ? 0 : (state.underwater || state.inWater) ? .042 : state.active !== false ? .012 + (state.rain || 0) * .016 : 0, this.context.currentTime, .45);
  }

  dispose() {
    if (this.ambient) { try { this.ambient.stop(); } catch {} this.ambient.disconnect(); }
    this.context?.close().catch(() => {});
    this.context = this.master = this.ambient = this.ambientGain = null;
  }
}
