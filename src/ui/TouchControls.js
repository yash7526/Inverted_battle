import { h } from './dom.js';

// On-screen controls for phones/tablets. A floating 8-way pad on the left and
// action buttons on the right; multi-touch via pointer capture. Always drives P1.

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.el = null;
  }

  static wanted() {
    return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  show() {
    const input = this.game.input;
    const knob = h('div', { class: 'pad__knob' });
    const pad = h('div', { class: 'pad', 'aria-label': 'Movement pad' }, h('i', { class: 'pad__arrow pad__arrow--up' }), h('i', { class: 'pad__arrow pad__arrow--down' }), h('i', { class: 'pad__arrow pad__arrow--left' }), h('i', { class: 'pad__arrow pad__arrow--right' }), knob);

    const dirs = { left: false, right: false, up: false, down: false };
    const setDirs = (nx, ny) => {
      const next = {
        left: nx < -0.35,
        right: nx > 0.35,
        up: ny < -0.5,
        down: ny > 0.45,
      };
      for (const k of Object.keys(next)) {
        if (next[k] !== dirs[k]) {
          dirs[k] = next[k];
          input.setTouch(k, next[k]);
        }
      }
    };
    let padId = null;
    const padMove = (e) => {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let nx = (e.clientX - cx) / (r.width / 2);
      let ny = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(nx, ny);
      if (len > 1) {
        nx /= len;
        ny /= len;
      }
      knob.style.transform = `translate(${nx * 34}px, ${ny * 34}px)`;
      setDirs(nx, ny);
    };
    const padEnd = () => {
      padId = null;
      knob.style.transform = '';
      setDirs(0, 0);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      padId = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      padMove(e);
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === padId && padMove(e));
    pad.addEventListener('pointerup', padEnd);
    pad.addEventListener('pointercancel', padEnd);

    const btn = (action, label, cls) => {
      const b = h('button', { class: `tbtn tbtn--${cls}`, 'aria-label': action }, label);
      const down = (e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('is-down');
        input.setTouch(action, true);
        navigator.vibrate?.(8);
      };
      const up = () => {
        b.classList.remove('is-down');
        input.setTouch(action, false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };

    this.el = h(
      'div',
      { class: 'touch', 'aria-hidden': 'false' },
      h('div', { class: 'touch__left' }, pad),
      h(
        'div',
        { class: 'touch__right' },
        btn('punch', 'P', 'punch'),
        btn('kick', 'K', 'kick'),
        btn('block', 'BLOCK', 'block'),
        btn('up', 'JUMP', 'jump'),
        btn('special', 'SP', 'special'),
        btn('dash', 'DASH', 'dash')
      )
    );
    // keep the page from scrolling/zooming while fighting
    this._prevent = (e) => e.preventDefault();
    this.el.addEventListener('touchstart', this._prevent, { passive: false });
    this.el.addEventListener('touchmove', this._prevent, { passive: false });
    this.game.uiRoot.append(this.el);
  }

  hide() {
    this.game.input.clearTouch();
    this.el?.remove();
    this.el = null;
  }
}
