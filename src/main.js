import '@fontsource/bangers/400.css';
import '@fontsource/teko/500.css';
import '@fontsource/teko/600.css';
import './styles/main.css';
import { Game } from './game/Game.js';

// Entry point: boots the game, drives the loading screen and reports fatal errors.

const loader = document.getElementById('loader');
const fill = document.getElementById('loader-fill');
const msg = document.getElementById('loader-msg');

function progress(p, text) {
  if (fill) fill.style.transform = `scaleX(${p})`;
  if (msg && text) msg.textContent = text;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch {
    return false;
  }
}

async function boot() {
  if (!webglAvailable()) {
    progress(0, 'Your browser or device does not support WebGL, which Battle Arena needs. Try a recent Chrome, Edge, Firefox or Safari.');
    loader?.classList.add('is-error');
    return;
  }
  // Fonts are used inside canvas textures (floor medallion, banners, POW! text).
  try {
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    await Promise.all([document.fonts?.load('48px Bangers'), document.fonts?.load('600 48px Teko')]);
  } catch {
    /* fall back to system fonts */
  }
  const game = new Game({
    canvas: document.getElementById('game-canvas'),
    uiRoot: document.getElementById('ui-root'),
    container: document.getElementById('app'),
  });
  try {
    await game.init(progress);
    loader?.classList.add('is-done');
    setTimeout(() => loader?.remove(), 700);
  } catch (err) {
    console.error(err);
    progress(0, 'Something went wrong while loading the arena. Please reload the page.');
    loader?.classList.add('is-error');
  }
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
}

boot();
