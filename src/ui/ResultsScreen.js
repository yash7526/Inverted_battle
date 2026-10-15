import { h, navList } from './dom.js';
import { getCharacter } from '../characters/CharacterConfig.js';

// Match result: YOU WIN / YOU LOSE (or PLAYER N WINS), winner art, match stats and
// the rematch / change fighters / main menu actions.

export class ResultsScreen {
  constructor(game) {
    this.game = game;
  }

  show({ winner, summary, mode }) {
    const g = this.game;
    const m = g.state.match;
    const ids = [m.p1, m.p2];
    const w = getCharacter(ids[winner]);
    const headline = mode === 'cpu' ? (winner === 0 ? 'YOU WIN' : 'YOU LOSE') : `PLAYER ${winner + 1} WINS`;
    const good = mode !== 'cpu' || winner === 0;
    const stat = (label, a, b) => h('tr', {}, h('td', {}, String(a)), h('th', {}, label), h('td', {}, String(b)));
    const s = summary.stats;
    const btn = (label, fn, primary) => h('button', { class: 'menu__item menu__item--compact' + (primary ? ' menu__item--primary' : ''), onClick: () => (g.audio.play('click'), fn()) }, h('span', { class: 'menu__label' }, label));
    const buttons = [btn('REMATCH', () => g.goto('fight'), true), btn('CHANGE FIGHTERS', () => g.goto('select', { mode })), btn('MAIN MENU', () => g.goto('menu'))];

    this.el = h(
      'section',
      { class: `screen results ${good ? 'results--win' : 'results--lose'}`, 'aria-label': 'Match result', style: { '--accent': w.accent } },
      h('div', { class: 'results__burst' }),
      h('div', { class: 'results__art' }, h('img', { src: w.art, alt: w.name })),
      h(
        'div',
        { class: 'results__panel' },
        h('h1', { class: 'results__head', 'data-text': headline }, headline),
        h('p', { class: 'results__sub' }, `${w.name} takes the match ${summary.wins[winner]}–${summary.wins[1 - winner]}`),
        h(
          'table',
          { class: 'results__stats' },
          h('thead', {}, h('tr', {}, h('td', {}, getCharacter(ids[0]).name), h('th', {}, ''), h('td', {}, getCharacter(ids[1]).name))),
          h('tbody', {}, stat('Rounds won', summary.wins[0], summary.wins[1]), stat('Damage dealt', s[0].damageDealt, s[1].damageDealt), stat('Hits landed', s[0].hitsLanded, s[1].hitsLanded), stat('Best combo', s[0].maxCombo, s[1].maxCombo), stat('Specials', s[0].specials, s[1].specials), stat('Perfects', summary.perfects[0], summary.perfects[1]))
        ),
        h('nav', { class: 'menu__list results__actions' }, buttons)
      )
    );
    g.uiRoot.append(this.el);
    this.offNav = navList(buttons, g.input);
    requestAnimationFrame(() => buttons[0].focus({ preventScroll: true }));
  }

  hide() {
    this.offNav?.();
    this.el?.remove();
  }
}
