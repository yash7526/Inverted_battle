// Centralised, configurable input. Keyboard, touch, gamepad and AI all feed the same
// per-player PlayerInput objects, so fighters never care where input comes from.

export const ACTIONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'block', 'special', 'dash'];

// Edit this map to rebind controls. Multiple codes per action are allowed.
// `KeyboardEvent.code` values are layout-independent physical keys.
export const DEFAULT_KEYMAP = {
  0: {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW', 'Space'],
    down: ['KeyS'],
    punch: ['KeyF'],
    kick: ['KeyG'],
    block: ['KeyH'],
    special: ['KeyR'],
    dash: ['ShiftLeft'],
  },
  1: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    // Numpad as specified, plus laptop-friendly alternates (no numpad needed).
    punch: ['Numpad1', 'KeyK'],
    kick: ['Numpad2', 'KeyL'],
    block: ['Numpad3', 'Semicolon'],
    special: ['Numpad4', 'KeyP'],
    dash: ['Numpad0', 'ShiftRight'],
  },
};

const PAD_MAP = {
  punch: [2], // X / Square
  kick: [3], // Y / Triangle
  block: [1], // B / Circle
  up: [0, 12], // A / Cross, D-pad up
  down: [13],
  left: [14],
  right: [15],
  dash: [5], // RB
  special: [4, 7], // LB, RT
};

const blank = () => Object.fromEntries(ACTIONS.map((a) => [a, false]));

export class PlayerInput {
  constructor() {
    this.held = blank();
    this.pressed = blank();
    this._prev = blank();
    this._taps = blank();
  }

  /** Register an instantaneous press (keeps very short taps from being lost). */
  tap(action) {
    this._taps[action] = true;
  }

  /** Called once per frame after `held` has been written by the source. */
  commit() {
    for (const a of ACTIONS) {
      this.pressed[a] = (this.held[a] && !this._prev[a]) || this._taps[a];
      this._prev[a] = this.held[a];
      this._taps[a] = false;
    }
  }

  reset() {
    for (const a of ACTIONS) {
      this.held[a] = this.pressed[a] = this._prev[a] = this._taps[a] = false;
    }
  }
}

export class InputManager {
  constructor(keymap = DEFAULT_KEYMAP) {
    this.keymap = keymap;
    this.players = [new PlayerInput(), new PlayerInput()];
    this._kb = [blank(), blank()];
    this._touch = blank();
    this._codeIndex = new Map();
    this.mergeP2IntoP1 = true; // vs CPU: arrows + numpad also control player 1
    this.enabled = [true, true]; // false when a slot is driven by the AI
    this.uiHandlers = new Set();
    this._buildIndex();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = () => {
      this._kb = [blank(), blank()];
      this._touch = blank();
    };
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  _buildIndex() {
    this._codeIndex.clear();
    for (const [player, actions] of Object.entries(this.keymap)) {
      for (const [action, codes] of Object.entries(actions)) {
        for (const code of codes) {
          if (!this._codeIndex.has(code)) this._codeIndex.set(code, []);
          this._codeIndex.get(code).push({ player: Number(player), action });
        }
      }
    }
  }

  /** Subscribe to raw key presses for menus (Enter/Escape etc.). */
  onUiKey(fn) {
    this.uiHandlers.add(fn);
    return () => this.uiHandlers.delete(fn);
  }

  _onKeyDown(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const binds = this._codeIndex.get(e.code);
    if (binds || e.code === 'Space') e.preventDefault(); // stop page scrolling
    if (!e.repeat) this.uiHandlers.forEach((fn) => fn(e.code, e));
    if (!binds || e.repeat) return; // ignore auto-repeat: no accidental repeat attacks
    for (const { player, action } of binds) {
      const target = player === 1 && this.mergeP2IntoP1 ? 0 : player;
      this._kb[target][action] = true;
      this.players[target].tap(action);
    }
  }

  _onKeyUp(e) {
    const binds = this._codeIndex.get(e.code);
    if (!binds) return;
    for (const { player, action } of binds) {
      const target = player === 1 && this.mergeP2IntoP1 ? 0 : player;
      this._kb[target][action] = false;
    }
  }

  /** Touch controls always drive player 1. */
  setTouch(action, down) {
    this._touch[action] = down;
    if (down) this.players[0].tap(action);
  }

  clearTouch() {
    this._touch = blank();
  }

  _readPad(pad) {
    const out = blank();
    if (!pad) return out;
    for (const [action, buttons] of Object.entries(PAD_MAP)) {
      out[action] = buttons.some((b) => pad.buttons[b]?.pressed);
    }
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (ax < -0.45) out.left = true;
    if (ax > 0.45) out.right = true;
    if (ay > 0.55) out.down = true;
    if (ay < -0.7) out.up = true;
    return out;
  }

  update() {
    let pads = [];
    try {
      pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    } catch {
      pads = [];
    }
    const padStates = [this._readPad(pads[0]), this._readPad(pads[1])];
    if (this.mergeP2IntoP1) {
      // Single player: any pad drives player 1.
      for (const a of ACTIONS) padStates[0][a] = padStates[0][a] || padStates[1][a];
      padStates[1] = blank();
    }

    for (let p = 0; p < 2; p++) {
      if (!this.enabled[p]) continue; // AI writes this slot directly
      const pi = this.players[p];
      for (const a of ACTIONS) {
        pi.held[a] = this._kb[p][a] || padStates[p][a] || (p === 0 && this._touch[a]);
      }
      pi.commit();
    }
  }

  resetPlayers() {
    this.players.forEach((p) => p.reset());
    this._kb = [blank(), blank()];
    this._touch = blank();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.uiHandlers.clear();
  }
}
