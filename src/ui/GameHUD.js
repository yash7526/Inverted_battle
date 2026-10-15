import { h, ICONS, navList } from './dom.js';
import { openSettings, openHowToPlay } from './Panels.js';

// In-fight HUD: portraits, health bars with a lagging damage trail, energy meters,
// round pips, timer, combo counters, announcer text, toasts, screen flash and the
// pause menu.

export class GameHUD {
  constructor(game) {
    this.game = game;
  }

  show(fighters, labels) {
    const g = this.game;
    this.fighters = fighters;
    this.sides = fighters.map((f, i) => this._side(f, i, labels[i]));
    this.timer = h('div', { class: 'hud__timer', role: 'timer', 'aria-label': 'Round timer' }, '60');
    this.roundLabel = h('div', { class: 'hud__round' }, 'ROUND 1');
    this.announcer = h('div', { class: 'announcer', 'aria-live': 'assertive' });
    this.toastEl = h('div', { class: 'hud__toast', 'aria-live': 'polite' });
    this.flashEl = h('div', { class: 'flash' });
    this.pauseBtn = h('button', { class: 'icon-btn hud__pause', 'aria-label': 'Pause', html: ICONS.pause, onClick: () => g.pause() });
    this.el = h(
      'section',
      { class: 'screen hud', 'aria-label': 'Fight' },
      this.flashEl,
      h('div', { class: 'hud__top' }, this.sides[0].el, h('div', { class: 'hud__center' }, this.timer, this.roundLabel, this.pauseBtn), this.sides[1].el),
      this.sides[0].combo,
      this.sides[1].combo,
      this.announcer,
      this.toastEl
    );
    g.uiRoot.append(this.el);
    this.lag = [1, 1];
  }

  _side(f, i, label) {
    const hpFill = h('div', { class: 'bar__fill' });
    const hpLag = h('div', { class: 'bar__lag' });
    const enFill = h('div', { class: 'energy__fill' });
    const enText = h('span', { class: 'energy__text' }, 'SPECIAL');
    const pips = h('div', { class: 'pips' }, h('i'), h('i'));
    const comboNum = h('b', {}, '0');
    const combo = h('div', { class: `combo combo--p${i + 1}` }, comboNum, h('span', {}, 'HITS'));
    const el = h(
      'div',
      { class: `hud__side hud__side--p${i + 1}`, style: { '--accent': f.def.accent } },
      h('div', { class: 'portrait' }, h('img', { src: f.def.portrait, alt: '' })),
      h(
        'div',
        { class: 'hud__bars' },
        h('div', { class: 'hud__name' }, h('span', {}, f.def.name), h('small', {}, label), pips),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': `${f.def.name} health`, 'aria-valuemin': '0', 'aria-valuemax': '100' }, hpLag, hpFill),
        h('div', { class: 'energy' }, h('div', { class: 'energy__track' }, enFill, h('i', { class: 'energy__mark' })), enText)
      )
    );
    return { el, hpFill, hpLag, enFill, enText, pips, combo, comboNum, bar: el.querySelector('.bar'), comboTimer: 0, lastHp: f.def.maxHealth };
  }

  setTimer(t) {
    const v = Math.ceil(t);
    if (v !== this._t) {
      this._t = v;
      this.timer.textContent = String(v);
      this.timer.classList.toggle('is-low', v <= 10);
    }
  }

  setRound(round, wins) {
    this.roundLabel.textContent = `ROUND ${round}`;
    this.sides.forEach((s, i) => s.pips.querySelectorAll('i').forEach((p, k) => p.classList.toggle('on', wins[i] > k)));
  }

  announce(text, { size = 'lg', duration = 1.2, style = '' } = {}) {
    const el = h('div', { class: `announce announce--${size} ${style ? 'announce--' + style : ''}` }, h('span', { 'data-text': text }, text));
    el.style.setProperty('--dur', `${duration}s`);
    this.announcer.append(el);
    setTimeout(() => el.remove(), duration * 1000 + 50);
  }

  toast(text, side = null) {
    const el = h('div', { class: 'toast' + (side !== null ? ` toast--p${side + 1}` : '') }, text);
    this.toastEl.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  combo(i, count) {
    const s = this.sides[i];
    if (count < 2) return;
    s.comboNum.textContent = String(count);
    s.combo.classList.remove('is-pop');
    void s.combo.offsetWidth;
    s.combo.classList.add('is-on', 'is-pop');
    s.comboTimer = 1.4;
  }

  flash(color = '#fff', amount = 0.5) {
    this.flashEl.style.background = color;
    this.flashEl.animate([{ opacity: amount }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }

  update(dt) {
    this.fighters.forEach((f, i) => {
      const s = this.sides[i];
      const hp = f.hp / f.def.maxHealth;
      if (f.hp < s.lastHp) {
        s.bar.classList.remove('is-hit');
        void s.bar.offsetWidth;
        s.bar.classList.add('is-hit');
      }
      s.lastHp = f.hp;
      s.hpFill.style.transform = `scaleX(${hp})`;
      s.hpFill.classList.toggle('is-low', hp < 0.3);
      // damage trail catches up after a short delay
      if (this.lag[i] < hp) this.lag[i] = hp;
      else this.lag[i] += (hp - this.lag[i]) * Math.min(1, dt * 2.2);
      s.hpLag.style.transform = `scaleX(${this.lag[i]})`;
      s.bar.setAttribute('aria-valuenow', String(Math.round(hp * 100)));
      const en = f.energy / f.maxEnergy;
      s.enFill.style.transform = `scaleX(${en})`;
      const cost = f.def.moves.special?.energyCost ?? 100;
      s.el.classList.toggle('is-special-ready', f.energy >= cost);
      if (s.comboTimer > 0) {
        s.comboTimer -= dt;
        if (s.comboTimer <= 0) s.combo.classList.remove('is-on');
      }
    });
  }

  // ---------------------------------------------------------------- pause menu
  showPause() {
    const g = this.game;
    const item = (label, fn) => h('button', { class: 'menu__item menu__item--compact', onClick: () => (g.audio.play('click'), fn()) }, h('span', { class: 'menu__label' }, label));
    const buttons = [
      item('RESUME', () => g.resume()),
      item('RESTART MATCH', () => g.restartMatch()),
      item('MOVE LIST', () => openHowToPlay(g)),
      item('SETTINGS', () => openSettings(g)),
      item('MAIN MENU', () => g.goto('menu')),
    ];
    this.pauseEl = h('div', { class: 'pause', role: 'dialog', 'aria-label': 'Paused' }, h('div', { class: 'pause__card' }, h('h2', {}, 'PAUSED'), h('nav', { class: 'menu__list' }, buttons)));
    this.el.append(this.pauseEl);
    this.offPauseNav = navList(buttons, g.input);
    requestAnimationFrame(() => buttons[0].focus({ preventScroll: true }));
  }

  hidePause() {
    this.offPauseNav?.();
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.game.uiRoot.querySelectorAll('.modal').forEach((m) => m.remove());
  }

  hide() {
    this.hidePause();
    this.el?.remove();
  }
}
