// Web Audio sound system. Every sound is synthesised at runtime, so the game needs no
// audio files; drop files into public/assets/audio and list them in manifest.json to
// override any sound. Audio only starts after the first user gesture (autoplay rules).

const BASE = import.meta.env.BASE_URL;

// A tabla-flavoured groove in a raga-like scale (C, Db, E, F, G, Ab, B — Bhairav).
const SCALE = [0, 1, 4, 5, 7, 8, 11];
const LEAD = [0, 2, 4, 3, 4, -1, 2, 1, 0, 4, 5, 6, 5, 4, 2, -1];
const BASS = [0, 0, 4, 0, 3, 3, 4, 2];

export class AudioManager {
  constructor(state) {
    this.state = state;
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.buffers = new Map();
    this.noise = null;
    this.musicPlaying = false;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.schedulerId = 0;
    this.musicIntensity = 0; // 0 = menu, 1 = fight
    this.customMusic = null;

    this._unlock = this._unlock.bind(this);
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, this._unlock, { passive: true })
    );
    this._offState = state.onChange((key) => {
      if (key === 'sound' || key === 'sfxVolume' || key === 'music' || key === 'musicVolume') this._applyVolumes();
    });
  }

  _unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.noise = this._makeNoise();
      this._applyVolumes();
      this._loadManifest();
      if (this._wantMusic) this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const s = this.state.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.sound ? 1 : 0, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.02);
    this.musicBus.gain.setTargetAtTime(s.music ? s.musicVolume * 0.55 : 0, t, 0.05);
  }

  async _loadManifest() {
    try {
      const res = await fetch(`${BASE}assets/audio/manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      const manifest = await res.json();
      await Promise.all(
        Object.entries(manifest)
          .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v)
          .map(async ([id, file]) => {
            try {
              const r = await fetch(`${BASE}assets/audio/${file}`);
              if (!r.ok) throw new Error(r.status);
              const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
              this.buffers.set(id, buf);
            } catch (err) {
              console.warn(`[audio] Could not load "${file}" for "${id}", using synth fallback.`, err);
            }
          })
      );
      if (this.buffers.has('music') && this.musicPlaying) {
        this.stopMusic();
        this.startMusic();
      }
    } catch {
      /* manifest missing: synth only */
    }
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- building blocks ----------
  _env(gainNode, t, attack, decay, peak) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _tone(type, f0, f1, dur, vol, dest = this.sfxBus, when = 0) {
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    this._env(g, t, 0.005, dur, vol);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noiseHit(filterType, freq, q, dur, vol, dest = this.sfxBus, when = 0, sweepTo = null) {
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, dur, vol);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _buffer(id, vol = 1, rate = 1) {
    const buf = this.buffers.get(id);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
    return true;
  }

  /** Play a named sound effect. `power` (0..1) scales heaviness. */
  play(id, power = 0.5) {
    if (!this.ready || !this.state.settings.sound) return;
    const rate = 0.92 + Math.random() * 0.16;
    if (this._buffer(id, 1, rate)) return;
    switch (id) {
      case 'punch':
        this._tone('sine', 190, 55, 0.12, 0.9);
        this._noiseHit('lowpass', 2400, 1, 0.07, 0.6);
        break;
      case 'kick':
        this._tone('sine', 150, 42, 0.18, 1);
        this._noiseHit('lowpass', 1600, 1, 0.12, 0.7);
        break;
      case 'heavy':
        this._tone('sine', 120, 30, 0.32, 1);
        this._tone('square', 80, 35, 0.12, 0.25);
        this._noiseHit('lowpass', 1200, 0.8, 0.25, 0.8);
        break;
      case 'block':
        this._noiseHit('bandpass', 3200, 6, 0.09, 0.6);
        this._tone('triangle', 1400, 900, 0.12, 0.25);
        break;
      case 'shield':
        this._tone('sine', 900, 1500, 0.18, 0.25);
        this._noiseHit('highpass', 5000, 1, 0.12, 0.25);
        break;
      case 'whoosh':
        this._noiseHit('bandpass', 600 + power * 600, 1.8, 0.16 + power * 0.08, 0.28, this.sfxBus, 0, 2400);
        break;
      case 'jump':
        this._tone('sine', 260, 520, 0.12, 0.25);
        break;
      case 'land':
        this._tone('sine', 110, 50, 0.1, 0.5);
        this._noiseHit('lowpass', 500, 1, 0.08, 0.3);
        break;
      case 'dash':
        this._noiseHit('bandpass', 900, 1.2, 0.22, 0.35, this.sfxBus, 0, 3200);
        break;
      case 'click':
        this._tone('square', 880, 660, 0.06, 0.18);
        break;
      case 'select':
        this._tone('square', 660, 660, 0.05, 0.15);
        this._tone('square', 990, 990, 0.08, 0.15, this.sfxBus, 0.06);
        break;
      case 'charge':
        this._tone('sawtooth', 110, 880, 0.7, 0.18);
        this._noiseHit('bandpass', 400, 2, 0.7, 0.25, this.sfxBus, 0, 4000);
        break;
      case 'special':
        this._tone('sawtooth', 220, 110, 0.4, 0.3);
        this._tone('square', 440, 880, 0.25, 0.12);
        this._noiseHit('lowpass', 3000, 1, 0.3, 0.5);
        break;
      case 'thunder':
        this._noiseHit('lowpass', 4000, 0.7, 0.9, 1, this.sfxBus, 0, 120);
        this._tone('sine', 70, 28, 0.8, 1);
        for (let i = 0; i < 5; i++) this._noiseHit('highpass', 3000, 1, 0.05, 0.5, this.sfxBus, i * 0.06 + Math.random() * 0.04);
        break;
      case 'scream':
        this._tone('sawtooth', 900, 300, 0.7, 0.16);
        this._tone('square', 1300, 500, 0.6, 0.08);
        this._noiseHit('bandpass', 2500, 3, 0.7, 0.35, this.sfxBus, 0, 900);
        break;
      case 'powerdown':
        this._tone('sawtooth', 220, 30, 0.9, 0.3);
        this._tone('sine', 60, 35, 0.9, 0.6);
        this._noiseHit('lowpass', 1800, 1, 0.25, 0.4, this.sfxBus, 0, 200);
        break;
      case 'ko':
        this._tone('sine', 90, 25, 1.2, 1);
        this._noiseHit('lowpass', 900, 0.7, 1.0, 0.8);
        break;
      case 'bell':
        [523, 659, 784].forEach((f, i) => this._tone('triangle', f, f, 0.6, 0.18, this.sfxBus, i * 0.02));
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this._tone('square', f, f, 0.22, 0.14, this.sfxBus, i * 0.13));
        this._tone('triangle', 1046, 1046, 0.9, 0.2, this.sfxBus, 0.52);
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) => this._tone('triangle', f, f * 0.98, 0.35, 0.2, this.sfxBus, i * 0.22));
        break;
      default:
        break;
    }
  }

  /** Arcade announcer. Uses the browser's built-in speech voice if available. */
  announce(text) {
    if (!this.state.settings.sound) return;
    this.play('bell');
    if (!this.state.settings.announcer || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = 0.6;
      u.rate = 0.95;
      u.volume = Math.min(1, this.state.settings.sfxVolume + 0.2);
      window.speechSynthesis.speak(u);
    } catch {
      /* speech unsupported */
    }
  }

  // ---------- music ----------
  setMusicIntensity(v) {
    this.musicIntensity = v;
  }

  startMusic() {
    this._wantMusic = true;
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    if (this.buffers.has('music')) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.get('music');
      src.loop = true;
      src.connect(this.musicBus);
      src.start();
      this.customMusic = src;
      return;
    }
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicStep = 0;
    const tick = () => {
      if (!this.musicPlaying) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
        this._scheduleStep(this.musicStep, this.nextNoteTime);
        this.nextNoteTime += 60 / 116 / 4; // 16th notes @ 116 BPM
        this.musicStep = (this.musicStep + 1) % 64;
      }
      this.schedulerId = window.setTimeout(tick, 60);
    };
    tick();
  }

  stopMusic() {
    this._wantMusic = false;
    this.musicPlaying = false;
    window.clearTimeout(this.schedulerId);
    if (this.customMusic) {
      try {
        this.customMusic.stop();
      } catch {
        /* already stopped */
      }
      this.customMusic = null;
    }
  }

  _note(semi, octave) {
    return 130.81 * Math.pow(2, (semi + octave * 12) / 12);
  }

  _scheduleStep(step, t) {
    const ctx = this.ctx;
    const bus = this.musicBus;
    const s16 = step % 16;
    const fight = this.musicIntensity > 0.5;
    const drum = (freq, decay, vol, tone = 'sine', bend = 0.5) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = tone;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * bend, t + decay);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + decay + 0.02);
    };
    const hat = (vol, decay = 0.04) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      src.connect(f).connect(g).connect(bus);
      src.start(t, Math.random());
      src.stop(t + decay + 0.02);
    };

    // dhol / tabla-ish pattern
    if ([0, 6, 10].includes(s16)) drum(95, 0.28, 0.9, 'sine', 0.45); // baya (bass)
    if ([4, 12].includes(s16)) drum(420, 0.09, fight ? 0.45 : 0.3, 'triangle', 0.9); // dayan "na"
    if (fight && [3, 7, 14, 15].includes(s16)) drum(520, 0.06, 0.22, 'triangle', 0.95);
    if (s16 % 2 === 0) hat(fight ? 0.12 : 0.06);

    // bass line
    if (s16 % 4 === 0) {
      const deg = BASS[(Math.floor(step / 4) % 8)];
      const f = this._note(SCALE[deg], -1);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      o.type = 'sawtooth';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(lp).connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.45);
    }

    // lead (shehnai-ish square with vibrato) — every 8th note
    if (s16 % 2 === 0) {
      const idx = (step / 2) % LEAD.length;
      const deg = LEAD[idx];
      if (deg >= 0 && (fight || step % 4 === 0)) {
        const f = this._note(SCALE[deg % 7], 1 + Math.floor(deg / 7));
        const o = ctx.createOscillator();
        const vib = ctx.createOscillator();
        const vibG = ctx.createGain();
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        o.type = 'square';
        o.frequency.value = f;
        vib.frequency.value = 6;
        vibG.gain.value = f * 0.012;
        vib.connect(vibG).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(lp).connect(g).connect(bus);
        o.start(t);
        vib.start(t);
        o.stop(t + 0.26);
        vib.stop(t + 0.26);
      }
    }
  }

  dispose() {
    this.stopMusic();
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, this._unlock));
    this._offState?.();
    this.ctx?.close().catch(() => {});
  }
}
