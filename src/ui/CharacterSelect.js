import { h, ICONS } from './dom.js';
import { CHARACTERS, ARENAS, getCharacter } from '../characters/CharacterConfig.js';
import { DIFFICULTY } from '../game/GameState.js';

// Character + stage select. Everything is generated from CHARACTERS / ARENAS, so
// new fighters appear here automatically. The two picks are shown as live 3D
// models in the chosen arena behind the UI.

const STAT_LABELS = { power: 'Power', speed: 'Speed', defense: 'Defense', range: 'Reach' };

export class CharacterSelect {
  constructor(game) {
    this.game = game;
  }

  show({ mode } = {}) {
    const g = this.game;
    const m = g.state.match;
    if (mode) m.mode = mode;
    this.mode = m.mode;
    this.picks = [m.p1, m.p2];
    this.arenaIdx = Math.max(0, ARENAS.findIndex((a) => a.id === m.arena));
    this.active = 0;

    this.cards = CHARACTERS.map((c, i) => {
      const card = h(
        'button',
        { class: 'card', style: { '--accent': c.accent }, 'aria-label': `Select ${c.name}`, onClick: () => this.pick(this.active, i, true) },
        h('img', { class: 'card__art', src: c.portrait, alt: '', draggable: 'false' }),
        h('span', { class: 'card__name' }, c.name),
        h('span', { class: 'card__tag card__tag--p1' }, '1P'),
        h('span', { class: 'card__tag card__tag--p2' }, this.mode === 'cpu' ? 'CPU' : '2P')
      );
      return card;
    });

    this.panels = [0, 1].map((slot) => this._panel(slot));
    this.arenaName = h('strong', {}, '');
    this.arenaBlurb = h('span', {}, '');
    const arenaBox = h(
      'div',
      { class: 'arena-pick' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous stage', html: ICONS.back, onClick: () => this.cycleArena(-1) }),
      h('div', { class: 'arena-pick__text' }, h('small', {}, 'STAGE'), this.arenaName, this.arenaBlurb),
      h('button', { class: 'icon-btn', 'aria-label': 'Next stage', html: ICONS.next, onClick: () => this.cycleArena(1) })
    );

    const diffKeys = Object.keys(DIFFICULTY);
    this.diffBtn = h('button', { class: 'chip', onClick: () => this.cycleDifficulty(diffKeys) }, '');
    this.renderDifficulty();

    this.fightBtn = h('button', { class: 'btn btn--fight', onClick: () => this.confirm() }, 'FIGHT!');

    this.el = h(
      'section',
      { class: 'screen select', 'aria-label': 'Character select' },
      h(
        'header',
        { class: 'select__top' },
        h('button', { class: 'btn btn--ghost', onClick: () => this.back() }, h('span', { html: ICONS.back, class: 'btn__icon' }), 'Back'),
        h('h2', { class: 'select__title' }, 'CHOOSE YOUR FIGHTER'),
        h('div', { class: 'select__mode' }, h('span', { class: 'chip chip--solid' }, this.mode === 'cpu' ? 'ARCADE · vs CPU' : 'VERSUS · 2 PLAYERS'), this.mode === 'cpu' ? this.diffBtn : null)
      ),
      this.panels[0].el,
      this.panels[1].el,
      h('div', { class: 'select__bottom' }, arenaBox, h('div', { class: 'roster' }, this.cards), this.fightBtn),
      h('p', { class: 'select__hint' }, this.mode === 'cpu' ? 'A / D or tap a card to choose · ← / → picks the CPU rival · Enter to fight' : '1P: A / D · 2P: ← / → · Enter to fight')
    );
    g.uiRoot.append(this.el);

    this.offKeys = g.input.onUiKey((code) => {
      if (!this.el.isConnected) return;
      if (code === 'KeyA') this.step(0, -1);
      else if (code === 'KeyD') this.step(0, 1);
      else if (code === 'ArrowLeft') this.step(1, -1);
      else if (code === 'ArrowRight') this.step(1, 1);
      else if (code === 'Enter' || code === 'KeyF' || code === 'NumpadEnter') {
        if (document.activeElement?.tagName !== 'BUTTON' || document.activeElement === this.fightBtn) this.confirm();
      } else if (code === 'Escape') this.back();
      else if (code === 'BracketLeft') this.cycleArena(-1);
      else if (code === 'BracketRight') this.cycleArena(1);
    });

    this.renderArena(false);
    this.render();
    g.previewFighters(this.picks[0], this.picks[1]);
    requestAnimationFrame(() => this.fightBtn.focus({ preventScroll: true }));
  }

  _panel(slot) {
    const name = h('h3', { class: 'fpanel__name' });
    const title = h('p', { class: 'fpanel__title' });
    const style = h('p', { class: 'fpanel__style' });
    const desc = h('p', { class: 'fpanel__desc' });
    const stats = h('div', { class: 'fpanel__stats' });
    const special = h('p', { class: 'fpanel__special' });
    const tag = slot === 0 ? '1P' : this.mode === 'cpu' ? 'CPU' : '2P';
    const el = h(
      'aside',
      { class: `fpanel fpanel--${slot ? 'right' : 'left'}`, onClick: () => this.setActive(slot) },
      h('span', { class: `fpanel__tag fpanel__tag--p${slot + 1}` }, tag),
      name,
      title,
      style,
      stats,
      desc,
      special,
      h('span', { class: 'fpanel__switch' }, slot === 0 ? 'Tap a card to pick' : 'Tap here, then a card, to change')
    );
    return { el, name, title, style, desc, stats, special };
  }

  setActive(slot) {
    this.active = slot;
    this.panels.forEach((p, i) => p.el.classList.toggle('is-active', i === slot));
  }

  step(slot, dir) {
    const cur = CHARACTERS.findIndex((c) => c.id === this.picks[slot]);
    this.pick(slot, (cur + dir + CHARACTERS.length) % CHARACTERS.length);
  }

  pick(slot, idx, fromClick = false) {
    const c = CHARACTERS[idx];
    if (!c) return;
    this.game.audio.play('select');
    this.picks[slot] = c.id;
    this.render();
    this.game.previewFighters(this.picks[0], this.picks[1], slot);
    if (fromClick && slot === 1) this.setActive(0);
  }

  render() {
    this.cards.forEach((card, i) => {
      const id = CHARACTERS[i].id;
      card.classList.toggle('is-p1', this.picks[0] === id);
      card.classList.toggle('is-p2', this.picks[1] === id);
    });
    this.panels.forEach((p, slot) => {
      const c = getCharacter(this.picks[slot]);
      p.el.style.setProperty('--accent', c.accent);
      p.name.textContent = c.name;
      p.title.textContent = c.title;
      p.style.textContent = c.style;
      p.desc.textContent = c.description;
      p.special.innerHTML = '';
      p.special.append(h('small', {}, 'SPECIAL '), c.moveList[c.moveList.length - 1][0]);
      p.stats.innerHTML = '';
      for (const [k, label] of Object.entries(STAT_LABELS)) {
        p.stats.append(h('div', { class: 'stat' }, h('span', {}, label), h('div', { class: 'stat__bar' }, Array.from({ length: 5 }, (_, i) => h('i', { class: i < c.stats[k] ? 'on' : '' })))));
      }
    });
    this.setActive(this.active);
  }

  renderArena(load = true) {
    const a = ARENAS[this.arenaIdx];
    this.arenaName.textContent = a.name;
    this.arenaBlurb.textContent = a.blurb;
    this.game.state.match.arena = a.id;
    if (load) this.game.loadArena(a.id);
  }

  cycleArena(dir) {
    this.game.audio.play('click');
    this.arenaIdx = (this.arenaIdx + dir + ARENAS.length) % ARENAS.length;
    this.renderArena(true);
  }

  renderDifficulty() {
    this.diffBtn.textContent = `CPU: ${this.game.state.difficulty.label.toUpperCase()}`;
  }

  cycleDifficulty(keys) {
    const s = this.game.state;
    const i = keys.indexOf(s.settings.difficulty);
    s.set('difficulty', keys[(i + 1) % keys.length]);
    this.game.audio.play('click');
    this.renderDifficulty();
  }

  confirm() {
    const m = this.game.state.match;
    m.p1 = this.picks[0];
    m.p2 = this.picks[1];
    this.game.audio.play('select');
    this.game.goto('fight');
  }

  back() {
    this.game.audio.play('click');
    this.game.goto('menu');
  }

  hide() {
    this.offKeys?.();
    this.el?.remove();
  }
}
