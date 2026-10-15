import { h, EMBLEM_SVG, ICONS, navList } from './dom.js';
import { openSettings, openHowToPlay } from './Panels.js';

// Cinematic title screen. The live 3D arena with both fighters posing renders
// behind it (driven by Game in 'menu' mode).

export class MainMenu {
  constructor(game) {
    this.game = game;
  }

  show() {
    const g = this.game;
    const click = (fn) => () => {
      g.audio.play('click');
      fn();
    };
    const items = [
      ['ARCADE', 'Fight the CPU', () => g.goto('select', { mode: 'cpu' })],
      ['VERSUS', 'Local 2 players', () => g.goto('select', { mode: 'versus' })],
      ['CHARACTERS', 'Meet the roster', () => g.goto('select', { mode: g.state.match.mode })],
      ['HOW TO PLAY', 'Controls & moves', () => openHowToPlay(g, () => this.buttons[3]?.focus())],
      ['SETTINGS', 'Difficulty, audio, graphics', () => openSettings(g, () => this.buttons[4]?.focus())],
    ];
    this.buttons = items.map(([label, sub, fn], i) =>
      h('button', { class: 'menu__item' + (i === 0 ? ' menu__item--primary' : ''), onClick: click(fn), style: { '--i': i } }, h('span', { class: 'menu__label' }, i === 0 ? 'PLAY' : label), h('span', { class: 'menu__sub' }, i === 0 ? 'Arcade — vs CPU' : sub))
    );

    this.soundBtn = h('button', { class: 'icon-btn', 'aria-label': 'Toggle sound', onClick: () => this.toggleSound() });
    this.renderSound();

    this.el = h(
      'section',
      { class: 'screen menu', 'aria-label': 'Main menu' },
      h('div', { class: 'menu__halftone' }),
      h('div', { class: 'menu__speedlines' }),
      h(
        'div',
        { class: 'menu__panel' },
        h('div', { class: 'brand' }, h('span', { class: 'brand__mark', html: EMBLEM_SVG }), h('span', { class: 'brand__text' }, h('b', {}, 'INVERTED'), ' UNIVERSE')),
        h('h1', { class: 'title' }, h('span', { class: 'title__line' }, 'BATTLE'), h('span', { class: 'title__line title__line--red' }, 'ARENA')),
        h('p', { class: 'tagline' }, 'Five fighters from the Inverted Universe. One arena.'),
        h('nav', { class: 'menu__list' }, this.buttons)
      ),
      h(
        'div',
        { class: 'menu__corner' },
        this.soundBtn,
        h('button', { class: 'icon-btn', 'aria-label': 'Fullscreen', html: ICONS.fullscreen, onClick: () => g.toggleFullscreen() })
      ),
      h('div', { class: 'menu__foot' }, h('span', {}, 'A Comics Inverted original'), h('span', { class: 'menu__hint' }, '↑ ↓ to choose · Enter to select'))
    );
    g.uiRoot.append(this.el);
    this.offNav = navList(this.buttons, g.input);
    this.offState = g.state.onChange((k) => (k === 'sound' ? this.renderSound() : null));
    requestAnimationFrame(() => this.buttons[0].focus({ preventScroll: true }));
  }

  renderSound() {
    const on = this.game.state.settings.sound;
    this.soundBtn.innerHTML = on ? ICONS.soundOn : ICONS.soundOff;
    this.soundBtn.setAttribute('aria-pressed', String(on));
  }

  toggleSound() {
    const s = this.game.state;
    s.set('sound', !s.settings.sound);
    this.game.audio.play('click');
  }

  hide() {
    this.offNav?.();
    this.offState?.();
    this.el?.remove();
    this.game.uiRoot.querySelectorAll('.modal').forEach((m) => m.remove());
  }
}
