// Persistent settings + transient match setup shared by screens.

const STORAGE_KEY = 'iu-battle-arena-settings-v1';

export const DIFFICULTY = {
  easy: { label: 'Easy', reaction: 0.42, aggression: 0.35, block: 0.18, combo: 0.15, special: 0.25, punish: 0.2, spacing: 0.4 },
  normal: { label: 'Normal', reaction: 0.24, aggression: 0.55, block: 0.42, combo: 0.45, special: 0.55, punish: 0.5, spacing: 0.7 },
  hard: { label: 'Hard', reaction: 0.12, aggression: 0.72, block: 0.68, combo: 0.8, special: 0.85, punish: 0.85, spacing: 0.95 },
};

const DEFAULTS = {
  difficulty: 'normal',
  roundTime: 60,
  sound: true,
  music: true,
  sfxVolume: 0.8,
  musicVolume: 0.45,
  announcer: true,
  quality: 'auto', // auto | high | low
  shake: true,
};

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export class GameState {
  constructor() {
    this.settings = load();
    this.listeners = new Set();
    // Match setup, filled by the character select screen.
    this.match = {
      mode: 'cpu', // cpu | versus
      p1: 'sambhu',
      p2: 'simba',
      arena: 'fort',
    };
  }

  set(key, value) {
    this.settings[key] = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable (private mode / embedded iframe) — settings stay in memory */
    }
    this.listeners.forEach((fn) => fn(key, value));
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get difficulty() {
    return DIFFICULTY[this.settings.difficulty] || DIFFICULTY.normal;
  }

  get isLowQuality() {
    const q = this.settings.quality;
    if (q === 'low') return true;
    if (q === 'high') return false;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    return coarse || (navigator.hardwareConcurrency || 8) <= 4;
  }
}
