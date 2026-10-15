import { h } from './dom.js';
import { DIFFICULTY } from '../game/GameState.js';
import { CHARACTERS } from '../characters/CharacterConfig.js';

// Modal panels shared by the main menu and the pause menu.

function modal(title, body, onClose, game) {
  const close = () => {
    game.audio.play('click');
    off();
    root.remove();
    onClose?.();
  };
  const root = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-label': title },
    h('div', { class: 'modal__card' }, h('div', { class: 'modal__head' }, h('h2', {}, title), h('button', { class: 'btn btn--ghost modal__x', onClick: close, 'aria-label': 'Close' }, '✕')), h('div', { class: 'modal__body' }, body))
  );
  const off = game.input.onUiKey((code) => {
    if (code === 'Escape' && root.isConnected) close();
  });
  game.uiRoot.append(root);
  root.querySelector('.modal__x').focus({ preventScroll: true });
  return { root, close };
}

function segmented(label, options, current, onPick, game) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const btns = options.map(([value, text]) => {
    const b = h('button', { class: 'seg__btn' + (value === current ? ' is-on' : ''), role: 'radio', 'aria-checked': String(value === current) }, text);
    b.addEventListener('click', () => {
      game.audio.play('click');
      btns.forEach((x) => {
        x.classList.remove('is-on');
        x.setAttribute('aria-checked', 'false');
      });
      b.classList.add('is-on');
      b.setAttribute('aria-checked', 'true');
      onPick(value);
    });
    return b;
  });
  wrap.append(...btns);
  return h('div', { class: 'setting' }, h('span', { class: 'setting__label' }, label), wrap);
}

function slider(label, value, onInput) {
  const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(value), 'aria-label': label });
  input.addEventListener('input', () => onInput(Number(input.value)));
  return h('div', { class: 'setting' }, h('span', { class: 'setting__label' }, label), input);
}

export function openSettings(game, onClose) {
  const s = game.state.settings;
  const set = (k) => (v) => game.state.set(k, v);
  const body = h(
    'div',
    { class: 'settings' },
    segmented('CPU difficulty', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), s.difficulty, set('difficulty'), game),
    segmented('Round timer', [[30, '30s'], [60, '60s'], [99, '99s']], s.roundTime, set('roundTime'), game),
    segmented('Sound effects', [[true, 'On'], [false, 'Off']], s.sound, set('sound'), game),
    slider('SFX volume', s.sfxVolume, set('sfxVolume')),
    segmented('Music', [[true, 'On'], [false, 'Off']], s.music, (v) => {
      game.state.set('music', v);
    }, game),
    slider('Music volume', s.musicVolume, set('musicVolume')),
    segmented('Announcer voice', [[true, 'On'], [false, 'Off']], s.announcer, set('announcer'), game),
    segmented('Graphics', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']], s.quality, (v) => {
      game.state.set('quality', v);
      game.applyQuality();
    }, game),
    segmented('Screen shake', [[true, 'On'], [false, 'Off']], s.shake, set('shake'), game)
  );
  return modal('SETTINGS', body, onClose, game);
}

export function controlsTable() {
  const rows = [
    ['Move', 'A / D', '← / →', '◀ ▶ pad'],
    ['Jump', 'W (or Space)', '↑', '▲ pad'],
    ['Crouch', 'S', '↓', '▼ pad'],
    ['Punch', 'F', 'Num 1 / K', 'P'],
    ['Kick', 'G', 'Num 2 / L', 'K'],
    ['Block', 'H', 'Num 3 / ;', 'BLOCK'],
    ['Special', 'R', 'Num 4 / P', 'SP'],
    ['Dash', 'Shift  (or tap → →)', 'Num 0 / R-Shift', 'DASH'],
    ['Pause', 'Esc', 'Esc', 'II'],
  ];
  return h(
    'table',
    { class: 'ctable' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Player 1'), h('th', {}, 'Player 2'), h('th', {}, 'Touch'))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i ? h('td', {}, h('kbd', {}, c)) : h('th', {}, c))))))
  );
}

export function moveLists() {
  return h(
    'div',
    { class: 'movelists' },
    CHARACTERS.map((c) =>
      h(
        'div',
        { class: 'movelist', style: { '--accent': c.accent } },
        h('div', { class: 'movelist__head' }, h('img', { src: c.portrait, alt: '', width: '44', height: '44' }), h('div', {}, h('strong', {}, c.name), h('span', {}, c.style))),
        h('ul', {}, c.moveList.map(([n, k]) => h('li', {}, h('span', {}, n), h('kbd', {}, k))))
      )
    )
  );
}

export function openHowToPlay(game, onClose) {
  const body = h(
    'div',
    { class: 'howto' },
    h(
      'div',
      { class: 'howto__tips' },
      h('p', {}, h('b', {}, 'Win 2 rounds. '), 'Drain your rival’s health bar to zero for a K.O., or have more health when the timer runs out.'),
      h('p', {}, h('b', {}, 'Block smart. '), 'Standing block (H) stops high and mid attacks; crouch-block (S + H) stops lows. Crouching also ducks under high punches. Simba’s Energy Shield covers every height while standing.'),
      h('p', {}, h('b', {}, 'Charge your special. '), 'Landing and taking hits fills the energy meter. At 50 energy press R for a cinematic special.'),
      h('p', {}, h('b', {}, 'Chain it. '), 'Tap punch again during a punch to string combos; hits on a reeling opponent count as a combo (with damage scaling). Hitting an opponent during their attack is a COUNTER (+20%).')
    ),
    controlsTable(),
    moveLists()
  );
  return modal('HOW TO PLAY', body, onClose, game);
}
