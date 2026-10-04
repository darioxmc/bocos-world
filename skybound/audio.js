const MAX_VOICES = 48;
const MAX_EFFECT_VOICES = 12;
const HORIZON = 0.16;
const TICK_MS = 40;
const AREA_NAMES = ['meadow', 'cliff', 'canopy', 'roost'];
const midi = (note) => 440 * 2 ** ((note - 69) / 12);
const clamp = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

// Area themes keep a recognizable motif while changing arrangement, response
// phrase, register, and percussion as each chapter advances.
export const MUSIC_THEMES = [
  { bpm: 116, roots: [48, 53, 55, 48, 57, 53, 55, 48, 50, 55, 53, 48, 57, 55, 53, 48], minor: false,
    lead: 'square', counter: 'triangle', percussion: 'soft',
    melody: [0, 4, 7, 12, 9, 7, 4, 2, 0, 4, 7, 9, 12, 7, 4, -1, 2, 7, 11, 14, 12, 11, 7, 2, 4, 7, 12, 7, 9, 4, 2, 0],
    answer: [7, 9, 12, 9, 7, 4, 2, -1, 4, 7, 9, 14, 12, 9, 7, 4, 0, 2, 4, 7, 9, 7, 4, 2, 7, 12, 16, 14, 12, 9, 7, 0] },
  { bpm: 124, roots: [50, 55, 57, 50, 59, 55, 57, 50, 52, 57, 59, 55, 50, 57, 55, 50], minor: false,
    lead: 'square', counter: 'sawtooth', percussion: 'driving',
    melody: [7, 12, 14, 16, 14, 12, 9, 7, 4, 7, 12, 14, 16, 14, 12, -1, 7, 11, 14, 19, 16, 14, 11, 7, 12, 9, 7, 4, 2, 4, 7, 0],
    answer: [14, 12, 9, 7, 12, 14, 16, -1, 7, 9, 11, 14, 19, 16, 14, 11, 4, 7, 12, 16, 14, 11, 9, 7, 12, 16, 14, 12, 9, 7, 4, 0] },
  { bpm: 104, roots: [45, 50, 48, 52, 53, 50, 52, 45, 48, 53, 50, 45, 52, 50, 48, 45], minor: true,
    lead: 'triangle', counter: 'square', percussion: 'hollow',
    melody: [0, 3, 7, 10, 12, 10, 7, 3, 5, 7, 10, 12, 14, 12, 10, -1, 7, 10, 12, 15, 14, 12, 10, 7, 3, 7, 10, 7, 5, 3, 2, 0],
    answer: [12, 10, 7, 3, 5, 7, 10, -1, 3, 5, 7, 12, 10, 7, 5, 3, 7, 10, 15, 14, 12, 10, 7, -1, 5, 3, 2, 3, 7, 5, 3, 0] },
  { bpm: 132, roots: [48, 55, 57, 53, 48, 53, 55, 48, 57, 60, 55, 53, 50, 55, 57, 48], minor: false,
    lead: 'triangle', counter: 'square', percussion: 'bright',
    melody: [12, 7, 12, 16, 19, 16, 14, 12, 9, 12, 16, 19, 21, 19, 16, -1, 14, 11, 14, 19, 17, 14, 11, 7, 12, 16, 19, 16, 14, 12, 7, 12],
    answer: [19, 16, 14, 12, 16, 19, 21, -1, 14, 17, 19, 24, 21, 19, 16, 14, 12, 14, 16, 19, 17, 14, 12, 9, 7, 12, 16, 14, 12, 9, 7, 12] },
];

// Boco's leitmotif uses a broad, rising fanfare softened by woodland
// arpeggios and bird-call ornaments. The second pass lifts the melody.
export const BOCO_THEME = {
  bpm: 112,
  roots: [48, 48, 53, 55, 48, 57, 53, 55, 48, 50, 53, 55, 57, 53, 55, 48],
  melody: [
    0, 4, 7, 12, 7, 9, 7, 4,
    2, 7, 11, 14, 12, 11, 7, -1,
    0, 4, 9, 12, 9, 7, 4, 2,
    7, 11, 14, 19, 16, 14, 11, -1,
    7, 12, 16, 19, 16, 14, 12, 9,
    4, 9, 12, 16, 14, 12, 9, -1,
    5, 9, 12, 17, 16, 12, 9, 7,
    7, 12, 14, 19, 16, 14, 12, 0,
  ],
};

export class AudioEngine {
  constructor() {
    this.context = null;
    this.settings = { music: 0.35, effects: 0.6, muted: false };
    this._musicGain = null;
    this._effectsGain = null;
    this._master = null;
    this._noise = null;
    this._voices = new Set();
    this._timer = null;
    this._area = null;
    this._chapter = 0;
    this._musicMode = 'level';
    this._step = 0;
    this._nextNote = 0;
    this._paused = false;
    this._destroyed = false;
    this._unlockPromise = null;
    this._unlockSource = null;
    this._unlocked = false;
    this._document = typeof document === 'undefined' ? null : document;
    this._window = typeof window === 'undefined' ? null : window;
    this._hidden = Boolean(this._document?.hidden);
    this._visibilityHandler = () => {
      this._hidden = Boolean(this._document?.hidden);
      if (this._hidden) { this._haltMusic(); this._stopVoices('effect'); }
      else this._restartMusic();
    };
    this._gestureHandler = () => { void this.unlock(); };
    this._stateHandler = () => {
      if (this.context?.state !== 'running') this._haltMusic();
      else this._restartMusic();
    };
    this._document?.addEventListener('visibilitychange', this._visibilityHandler);
    for (const event of ['pointerdown', 'touchend', 'keydown']) {
      this._window?.addEventListener(event, this._gestureHandler, { passive: true });
    }
  }

  _createContext() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext ||
      this._window?.AudioContext || this._window?.webkitAudioContext;
    if (!Context) return false;
    const context = new Context();
    this.context = context;
    this._master = context.createGain();
    this._musicGain = context.createGain();
    this._effectsGain = context.createGain();
    this._master.gain.value = 0.8;
    this._musicGain.connect(this._master);
    this._effectsGain.connect(this._master);
    // A quiet master and a compressor leave headroom for overlapping pickups.
    this._compressor = context.createDynamicsCompressor();
    this._compressor.threshold.value = -15;
    this._compressor.knee.value = 12;
    this._compressor.ratio.value = 5;
    this._compressor.attack.value = 0.003;
    this._compressor.release.value = 0.15;
    this._master.connect(this._compressor);
    this._compressor.connect(context.destination);
    this._noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.25), context.sampleRate);
    const data = this._noise.getChannelData(0);
    let seed = 0x4b0c0;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 0x100000000) * 2 - 1;
    }
    context.addEventListener?.('statechange', this._stateHandler);
    this._applyVolumes(true);
    return true;
  }

  async unlock() {
    if (this._destroyed) return false;
    if (this._unlockPromise) {
      // A controller-triggered resume may still be waiting for a browser gesture.
      // Retry resume synchronously when a later touch or keyboard event arrives.
      if (this.context?.state === 'suspended') {
        try { Promise.resolve(this.context.resume()).catch(() => {}); } catch { /* Retry on the next gesture. */ }
      }
      return this._unlockPromise;
    }
    try {
      if (!this.context && !this._createContext()) return false;
      const context = this.context;
      if (this._unlocked && context.state === 'running') {
        this._restartMusic();
        return true;
      }
      // Start a silent buffer synchronously inside the gesture, including Safari.
      this._stopUnlockSource();
      const silent = context.createBufferSource();
      this._unlockSource = silent;
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(context.destination);
      silent.onended = () => {
        silent.disconnect();
        if (this._unlockSource === silent) this._unlockSource = null;
      };
      silent.start();
      const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
      this._unlockPromise = Promise.resolve(resumed).then(() => {
        if (this._destroyed || context !== this.context) return false;
        this._unlocked = context.state === 'running';
        this._restartMusic();
        return this._unlocked;
      }).catch(() => false).finally(() => { this._unlockPromise = null; });
      return await this._unlockPromise;
    } catch {
      return false;
    }
  }

  _stopUnlockSource() {
    if (!this._unlockSource) return;
    const source = this._unlockSource;
    this._unlockSource = null;
    source.onended = null;
    try { source.stop(); } catch { /* The one-sample source may have ended. */ }
    source.disconnect();
  }

  setSettings(settings = {}) {
    if (this._destroyed || !settings || typeof settings !== 'object') return;
    const previous = this.settings;
    this.settings = {
      music: clamp(settings.music, previous.music),
      effects: clamp(settings.effects, previous.effects),
      muted: typeof settings.muted === 'boolean' ? settings.muted : previous.muted,
    };
    this._applyVolumes();
    if (this.settings.muted || this.settings.music === 0) this._haltMusic();
    else this._restartMusic();
    if (this.settings.muted || this.settings.effects === 0) this._stopVoices('effect');
  }

  _applyVolumes(immediate = false) {
    if (!this.context || !this._musicGain || !this._effectsGain) return;
    const now = this.context.currentTime;
    for (const [node, value] of [[this._musicGain, this.settings.music], [this._effectsGain, this.settings.effects]]) {
      node.gain.cancelScheduledValues(now);
      const volume = this.settings.muted ? 0 : value;
      if (immediate) node.gain.setValueAtTime(volume, now);
      else node.gain.setTargetAtTime(volume, now, 0.015);
    }
  }

  _canPlay() {
    return !this._destroyed && !this._paused && !this._hidden &&
      this.context?.state === 'running' && !this.settings.muted;
  }

  _canMusic() { return this._canPlay() && this._area !== null && this.settings.music > 0; }

  _voice(kind, when, duration, frequency, volume, type = 'square', endFrequency = null, noise = false, filter = null) {
    if (!this._canPlay() || this._voices.size >= MAX_VOICES) return;
    if (kind === 'effect' && [...this._voices].filter((voice) => voice.kind === 'effect').length >= MAX_EFFECT_VOICES) return;
    const context = this.context;
    const start = Math.max(context.currentTime, when);
    if (start > context.currentTime + HORIZON + 0.03) return;
    const source = noise ? context.createBufferSource() : context.createOscillator();
    const envelope = context.createGain();
    let toneFilter = null;
    if (noise) source.buffer = this._noise;
    else {
      source.type = type;
      source.frequency.setValueAtTime(frequency, start);
      if (endFrequency) source.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    }
    const attack = Math.min(0.008, duration / 4);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    if (filter) {
      toneFilter = context.createBiquadFilter();
      toneFilter.type = filter.type;
      toneFilter.frequency.value = filter.frequency;
      source.connect(toneFilter);
      toneFilter.connect(envelope);
    } else source.connect(envelope);
    envelope.connect(kind === 'music' ? this._musicGain : this._effectsGain);
    const voice = { kind, source, envelope, toneFilter };
    const release = () => {
      if (!this._voices.delete(voice)) return;
      source.onended = null;
      source.disconnect();
      toneFilter?.disconnect();
      envelope.disconnect();
    };
    voice.release = release;
    this._voices.add(voice);
    source.onended = release;
    source.start(start);
    source.stop(start + duration + 0.01);
  }

  _stopVoices(kind) {
    for (const voice of [...this._voices]) {
      if (kind && voice.kind !== kind) continue;
      try { voice.source.stop(); } catch { /* The source may already have ended. */ }
      voice.release();
    }
  }

  effect(name) {
    if (!this._canPlay() || this.settings.effects === 0) return;
    const now = this.context.currentTime;
    const tone = (hz, seconds, level = 0.2, type = 'square', end = null, offset = 0) =>
      this._voice('effect', now + offset, seconds, hz, level, type, end);
    const noise = (seconds, level, cutoff) => this._voice('effect', now, seconds, 0, level, 'square', null, true, { type: 'highpass', frequency: cutoff });
    switch (name) {
      case 'jump': tone(290, 0.16, 0.19, 'square', 740); break;
      case 'glide': tone(800, 0.22, 0.1, 'triangle', 400); noise(0.12, 0.035, 1800); break;
      case 'spring': tone(220, 0.09, 0.16, 'square', 520); tone(440, 0.14, 0.1, 'triangle', 760, 0.05); break;
      case 'peck': tone(900, 0.07, 0.15, 'square', 190); noise(0.045, 0.09, 1000); break;
      case 'hit': tone(160, 0.22, 0.23, 'sawtooth', 45); noise(0.17, 0.16, 500); break;
      case 'flower': tone(midi(79), 0.11, 0.16); tone(midi(86), 0.19, 0.12, 'triangle', null, 0.07); break;
      case 'checkpoint': tone(midi(72), 0.24, 0.13, 'triangle'); tone(midi(76), 0.22, 0.11, 'triangle', null, 0.06); tone(midi(79), 0.28, 0.12, 'square', null, 0.12); break;
      case 'chapter': tone(midi(67), 0.13, 0.12, 'triangle'); tone(midi(72), 0.18, 0.12, 'square', null, 0.08); tone(midi(79), 0.26, 0.1, 'triangle', null, 0.16); break;
      case 'boss': tone(82, 0.35, 0.23, 'sawtooth', 41); tone(123, 0.3, 0.12, 'square', 61); noise(0.2, 0.13, 250); break;
      case 'win': tone(midi(72), 0.3, 0.14); tone(midi(76), 0.32, 0.12, 'triangle', null, 0.06); tone(midi(79), 0.38, 0.11, 'square', null, 0.12); tone(midi(84), 0.5, 0.12, 'triangle', null, 0.16); break;
      case 'menu': tone(620, 0.065, 0.12, 'triangle', 930); break;
    }
  }

  startMusic(area = 0, chapter = 0, mode = 'level') {
    if (this._destroyed) return;
    const at = typeof area === 'string' ? AREA_NAMES.indexOf(area) : area;
    if (!Number.isInteger(at) || at < 0 || at >= MUSIC_THEMES.length) throw new RangeError('Unknown music area');
    const nextChapter = Math.max(0, Math.min(6, Number(chapter) || 0));
    const nextMode = ['boss', 'boco'].includes(mode) ? mode : 'level';
    if (this._area === at && this._chapter === nextChapter && this._musicMode === nextMode && this._timer !== null) return;
    this._haltMusic();
    this._area = at;
    this._chapter = nextChapter;
    this._musicMode = nextMode;
    this._step = 0;
    this._restartMusic();
  }

  startMenuMusic() { this.startMusic(0, 0, 'boco'); }

  setMusicChapter(chapter = 0, mode = 'level') {
    if (this._area === null || this._destroyed) return;
    this.startMusic(this._area, chapter, mode);
  }

  _restartMusic() {
    if (!this._canMusic() || this._timer !== null) return;
    this._nextNote = this.context.currentTime + 0.025;
    this._scheduleMusic();
  }

  _scheduleMusic() {
    if (!this._canMusic()) { this._haltMusic(); return; }
    const theme = this._musicMode === 'boco' ? BOCO_THEME : MUSIC_THEMES[this._area];
    const stepLength = 60 / theme.bpm / 4;
    const now = this.context.currentTime;
    // Skip missed beats after main-thread stalls instead of replaying a backlog.
    if (this._nextNote < now) {
      const missed = Math.ceil((now - this._nextNote) / stepLength);
      this._step = (this._step + missed) % 256;
      this._nextNote = now + 0.015;
    }
    let scheduled = 0;
    while (this._nextNote < now + HORIZON && scheduled++ < 4) {
      this._musicStep(theme, this._step, this._nextNote, stepLength);
      this._step = (this._step + 1) % 256;
      this._nextNote += stepLength;
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      this._scheduleMusic();
    }, TICK_MS);
  }

  _musicStep(theme, step, when, beat) {
    if (this._musicMode === 'boco') { this._bocoMusicStep(theme, step, when, beat); return; }
    if (this._musicMode === 'boss') { this._bossMusicStep(theme, step, when, beat); return; }
    const bar = Math.floor(step / 16);
    const phase = step % 16;
    const root = theme.roots[bar % theme.roots.length];
    const third = theme.minor ? 3 : 4;
    const note = (offset, duration, volume, type) => this._voice('music', when, duration, midi(root + offset), volume, type);
    if (phase % 2 === 0) {
      const phrase = Math.floor(bar / 4) % 2 ? theme.answer : theme.melody;
      const melody = phrase[(bar % 4) * 8 + phase / 2];
      if (melody !== -1 && !(this._chapter === 0 && phase % 4 === 2)) {
        const lift = [0, 0, 0, 2, 0, 5, 0][this._chapter];
        note(24 + melody + lift, beat * (phase === 14 ? 2.6 : 1.65), 0.072 + this._chapter * 0.0025, theme.lead);
      }
      const chord = [0, third, 7, this._chapter >= 4 ? 10 : third][(phase / 2 + bar) % 4];
      note(12 + chord, beat * 1.5, this._chapter >= 1 ? 0.042 : 0.03, theme.counter);
    }
    // Later chapters add a syncopated answer without replacing the area's tune.
    if (this._chapter >= 2 && [3, 7, 11, 15].includes(phase)) {
      note(17 + [0, 7, third, 12][(phase - 3) / 4], beat * 0.78, 0.024 + this._chapter * 0.002, theme.counter);
    }
    if (phase % 4 === 0) note(phase === 8 ? 7 : phase === 12 && this._chapter >= 3 ? third : 0, beat * 2.6, 0.13, 'triangle');
    if (phase === 0 || phase === 8 || (this._chapter >= 4 && phase === 12)) this._voice('music', when, 0.12, 125, 0.15, 'sine', 38);
    const snarePhases = theme.percussion === 'driving' ? [4, 10, 12] : theme.percussion === 'hollow' ? [6, 14] : [4, 12];
    if (snarePhases.includes(phase)) {
      this._voice('music', when, 0.11, 0, 0.085, 'square', null, true, { type: 'highpass', frequency: 1500 });
      this._voice('music', when, 0.07, 175, 0.035, 'triangle', 90);
    }
    const hatEvery = this._chapter >= 3 || theme.percussion === 'bright' ? 2 : 4;
    if (phase % hatEvery === 0) this._voice('music', when, 0.035, 0, 0.018 + this._chapter * 0.0015, 'square', null, true, { type: 'highpass', frequency: 6500 });
    if (phase === 0 && bar % 4 === 0) note(12 + (bar % 8 ? 7 : 0), beat * 10, 0.018, 'sine');
  }

  _bocoMusicStep(theme, step, when, beat) {
    const bar = Math.floor(step / 16);
    const phase = step % 16;
    const root = theme.roots[bar % theme.roots.length];
    const secondPass = bar >= 8;
    const note = (offset, duration, volume, type = 'triangle', delay = 0) =>
      this._voice('music', when + delay, duration, midi(root + offset), volume, type);

    if (phase % 2 === 0) {
      const melody = theme.melody[(bar % 8) * 8 + phase / 2];
      const lift = secondPass && [1, 2, 5, 6].includes(bar % 8) ? 2 : 0;
      if (melody !== -1) note(24 + melody + lift, beat * (phase === 14 ? 2.7 : 1.7), 0.077, 'square');
      const arpeggio = [0, 7, 12, 16][(phase / 2 + bar) % 4];
      note(12 + arpeggio, beat * 1.45, 0.034, 'triangle');
    }

    if (phase === 0) {
      note(12, beat * 7.5, 0.018, 'sine');
      note(19, beat * 7.5, 0.014, 'triangle');
    }
    if (phase % 4 === 0) {
      const bass = phase === 8 ? 7 : phase === 12 && bar % 4 === 3 ? 9 : 0;
      note(bass, beat * 2.65, 0.125, 'triangle');
    }

    if ([0, 8].includes(phase)) this._voice('music', when, 0.12, 122, 0.14, 'sine', 38);
    if ([4, 12].includes(phase)) {
      this._voice('music', when, 0.1, 0, 0.07, 'square', null, true, { type: 'highpass', frequency: 1750 });
      this._voice('music', when, 0.065, 180, 0.026, 'triangle', 95);
    }
    if ([2, 6, 10, 14].includes(phase)) {
      this._voice('music', when, 0.035, 0, 0.012, 'square', null, true, { type: 'highpass', frequency: 6100 });
    }

    // A two-note answer at each four-bar cadence evokes a distant bird call.
    if (phase === 13 && bar % 4 === 3) {
      note(36 + (secondPass ? 7 : 4), beat * 0.72, 0.036, 'triangle');
      note(43 + (secondPass ? 7 : 4), beat * 1.1, 0.03, 'triangle', beat * 0.62);
    }
  }

  _bossMusicStep(theme, step, when, beat) {
    const bar = Math.floor(step / 16);
    const phase = step % 16;
    const root = theme.roots[(bar * 3) % theme.roots.length] - 12;
    const pulse = [0, 0, 7, 0, 3, 0, 10, 7][Math.floor(phase / 2)];
    if (phase % 2 === 0) this._voice('music', when, beat * 1.45, midi(root + 12 + pulse), 0.072, theme.lead);
    if ([0, 3, 6, 8, 11, 14].includes(phase)) this._voice('music', when, beat * 2.1, midi(root + (phase === 8 ? 7 : 0)), 0.15, 'sawtooth');
    if (phase % 4 === 0) this._voice('music', when, 0.13, 105, 0.18, 'sine', 36);
    if ([4, 12].includes(phase)) this._voice('music', when, 0.12, 0, 0.11, 'square', null, true, { type: 'highpass', frequency: 1200 });
    if (phase % 2 === 1) this._voice('music', when, 0.035, 0, 0.022, 'square', null, true, { type: 'highpass', frequency: 6200 });
  }

  _haltMusic() {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
    this._stopVoices('music');
  }

  stopMusic() { this._area = null; this._chapter = 0; this._musicMode = 'level'; this._step = 0; this._haltMusic(); }

  pause() {
    this._paused = true;
    this._haltMusic();
    this._stopVoices('effect');
  }

  resume() {
    if (this._destroyed) return;
    this._paused = false;
    this._hidden = Boolean(this._document?.hidden);
    if (this.context && this.context.state !== 'running') { void this.unlock(); }
    else this._restartMusic();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stopMusic();
    this._stopVoices();
    this._stopUnlockSource();
    this._document?.removeEventListener('visibilitychange', this._visibilityHandler);
    for (const event of ['pointerdown', 'touchend', 'keydown']) this._window?.removeEventListener(event, this._gestureHandler);
    this.context?.removeEventListener?.('statechange', this._stateHandler);
    for (const node of [this._musicGain, this._effectsGain, this._master, this._compressor]) node?.disconnect();
    const context = this.context;
    this.context = null;
    this._noise = null;
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* Already closed or unsupported. */ }
    }
  }
}
