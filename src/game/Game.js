import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { GameState, DIFFICULTY } from './GameState.js';
import { GameLoop } from './GameLoop.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { CameraController } from './CameraController.js';
import { CollisionSystem } from './CollisionSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { RoundManager } from './RoundManager.js';
import { Fighter } from '../characters/Fighter.js';
import { AIController } from '../characters/AIController.js';
import { getCharacter, CHARACTERS } from '../characters/CharacterConfig.js';
import { renderPortraits } from '../characters/PortraitRenderer.js';
import { setCharacterEnv } from '../characters/ModelKit.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ProjectileSystem } from './ProjectileSystem.js';
import { Trails } from '../effects/Trails.js';
import { createArena } from '../arenas/index.js';
import { HitEffects } from '../effects/HitEffects.js';
import { SpecialEffects } from '../effects/SpecialEffects.js';
import { MainMenu } from '../ui/MainMenu.js';
import { CharacterSelect } from '../ui/CharacterSelect.js';
import { GameHUD } from '../ui/GameHUD.js';
import { TouchControls } from '../ui/TouchControls.js';
import { ResultsScreen } from '../ui/ResultsScreen.js';

const BASE = import.meta.env.BASE_URL;
const SPAR_MOVES = ['punch', 'kick', 'crouchKick', 'punch', 'dashPunch'];

export class Game {
  constructor({ canvas, uiRoot, container }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.container = container;
    this.state = new GameState();
    this.low = this.state.isLowQuality;
    this.mode = 'boot';
    this.paused = false;
    this.fighters = [];
    this.fighterIds = [];
    this.arena = null;
    this.arenaId = null;
    this.ai = null;
    this.modelManifest = {};
    this.gltfCache = new Map();
    this.sparTimer = 2;
    this.slowmo = 0;
    this._listeners = [];
  }

  // ======================================================================= init
  async init(progress = () => {}) {
    progress(0.1, 'Starting renderer…');
    this._initRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.camera.position.set(0, 2, 8);
    this._initComposer();

    this.input = new InputManager();
    this.audio = new AudioManager(this.state);
    this.loop = new GameLoop((dt, raw) => this.update(dt, raw));
    this.cam = new CameraController(this.camera);
    this.cam.shakeEnabled = this.state.settings.shake;
    this.state.onChange((k, v) => {
      if (k === 'shake') this.cam.shakeEnabled = v;
    });

    progress(0.3, 'Charging effects…');
    this.hitFx = new HitEffects(this.scene, { pixelRatio: this.renderer.getPixelRatio(), low: this.low });
    this.specialFx = new SpecialEffects(this.scene, this.hitFx, {
      flash: (color, amount) => {
        this.hud?.el?.isConnected && this.hud.flash(color, amount);
        this.arena?.flash(amount);
      },
      shake: (a) => this.cam.shake(a),
      sfx: (id) => this._sfx(id),
      darken: (d) => this.arena?.darken(d),
    });
    this.trails = new Trails(this.scene);
    this.projectiles = new ProjectileSystem(this.scene, this.hitFx, this.audio);
    this.collision = new CollisionSystem();
    this.combat = new CombatSystem({
      effects: this.hitFx,
      audio: this.audio,
      camera: this.cam,
      collision: this.collision,
      hooks: {
        onKO: (a) => this.rounds.onKO(a),
        onHit: (a, d, dmg, combo) => this.hud?.combo(this.fighters.indexOf(a), combo),
        onCounter: (a) => this.hud?.toast('COUNTER!', this.fighters.indexOf(a)),
        onArmor: (a, d) => this.hud?.toast('ARMOR!', this.fighters.indexOf(d)),
        onDrain: (a, d) => this.hud?.toast('ENERGY DRAINED', this.fighters.indexOf(d)),
      },
    });

    this.screens = {
      menu: new MainMenu(this),
      select: new CharacterSelect(this),
      results: new ResultsScreen(this),
    };
    this.hud = new GameHUD(this);
    this.touch = new TouchControls(this);
    this.rounds = new RoundManager({
      state: this.state,
      audio: this.audio,
      hud: this.hud,
      loop: this.loop,
      camera: this.cam,
      onMatchEnd: (winner, summary) => this._onMatchEnd(winner, summary),
    });

    progress(0.45, 'Reading model manifest…');
    await this._loadModelManifest();

    // soft studio reflections used ONLY by fighter materials (arenas keep their own lighting)
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.charEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      setCharacterEnv(this.charEnv);
    } catch (err) {
      console.warn('[env] Character reflections unavailable', err);
    }

    progress(0.52, 'Drawing fighter portraits…');
    await nextFrame();
    try {
      renderPortraits(this.renderer, CHARACTERS);
    } catch (err) {
      console.warn('[portraits] Could not render portraits', err);
    }

    progress(0.6, 'Building the fort courtyard…');
    await nextFrame();
    this.loadArena(this.state.match.arena || 'fort');

    progress(0.8, 'Suiting up the fighters…');
    await nextFrame();
    this.setFighters('sambhu', 'simba');

    this._bindGlobal();
    this.resize();
    progress(1, 'Ready!');
    this.audio.startMusic();
    this.goto('menu');
    this.loop.start();
    if (new URLSearchParams(location.search).has('debug')) window.__game = this;
  }

  _initRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.low, powerPreference: 'high-performance', alpha: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.low ? 1.25 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = this.low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer = r;
  }

  _initComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloom.enabled = !this.low;
  }

  applyQuality() {
    this.low = this.state.isLowQuality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.low ? 1.25 : 2));
    this.bloom.enabled = !this.low;
    this.resize();
  }

  async _loadModelManifest() {
    try {
      const res = await fetch(`${BASE}assets/models/manifest.json`, { cache: 'no-cache' });
      if (res.ok) this.modelManifest = await res.json();
    } catch {
      this.modelManifest = {};
    }
  }

  _bindGlobal() {
    const on = (target, ev, fn, opts) => {
      target.addEventListener(ev, fn, opts);
      this._listeners.push(() => target.removeEventListener(ev, fn, opts));
    };
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.container);
    on(window, 'resize', () => this.resize());
    on(document, 'visibilitychange', () => {
      if (document.hidden && this.mode === 'fight' && !this.paused) this.pause();
    });
    this._offUiKey = this.input.onUiKey((code) => {
      if (this.mode !== 'fight') return;
      if (code === 'Escape') {
        if (this.uiRoot.querySelector('.modal')) return;
        this.paused ? this.resume() : this.pause();
      }
    });
    on(this.canvas, 'webglcontextlost', (e) => {
      e.preventDefault();
      this.loop.stop();
      this._fatal('The graphics context was lost. Please reload the page.');
    });
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const hgt = this.container.clientHeight || window.innerHeight;
    if (!w || !hgt) return;
    this.renderer.setSize(w, hgt, false);
    this.composer.setSize(w, hgt);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
    document.documentElement.style.setProperty('--vh', `${hgt / 100}px`);
  }

  // ======================================================================= world
  loadArena(id) {
    if (this.arenaId === id && this.arena) return;
    if (this.arena) this.arena.dispose(this.scene);
    this.arena = createArena(id, { low: this.low });
    this.arena.addTo(this.scene);
    this.arenaId = id;
    this.collision.limit = this.arena.limit;
  }

  _fighterHooks() {
    return {
      sfx: (id, p) => id && this._sfx(id, p),
      fx: (type, f, data) => this.specialFx.trigger(type, f, data),
      cinematic: (f, cfg) => {
        if (this.mode !== 'fight') return;
        this.cam.cinematic(f, cfg.duration + 0.2);
        this.slowmo = cfg.duration;
        this.loop.timeScale = cfg.slowmo;
        this.hud?.toast(f.move?.name?.toUpperCase() ?? 'SPECIAL', this.fighters.indexOf(f));
      },
      shake: (a) => this.cam.shake(a),
      projectile: (f, def) => this.mode === 'fight' && this.projectiles.spawn(f, def),
      denied: (f) => {
        if (this.mode === 'fight' && this.ai?.self !== f) this.hud?.toast(`NEED ${f.def.moves.special.energyCost} ENERGY`, this.fighters.indexOf(f));
      },
    };
  }

  _sfx(id, p) {
    if (this.mode === 'fight' || this.mode === 'select') this.audio.play(id, p);
  }

  setFighters(p1, p2) {
    if (this.fighterIds[0] === p1 && this.fighterIds[1] === p2 && this.fighters.length) return;
    this.fighters.forEach((f) => f.dispose(this.scene));
    const d1 = getCharacter(p1);
    const d2 = getCharacter(p2);
    const hooks = this._fighterHooks();
    this.fighters = [new Fighter(d1, { index: 0, paletteIndex: 0, hooks }), new Fighter(d2, { index: 1, paletteIndex: p1 === p2 ? 1 : 0, hooks })];
    this.fighters.forEach((f) => {
      f.addToScene(this.scene);
      this._maybeAttachGLTF(f);
    });
    this.fighterIds = [p1, p2];
    this.trails.sync(this.fighters);
  }

  async _maybeAttachGLTF(fighter) {
    const file = this.modelManifest[fighter.def.id];
    if (!file || typeof file !== 'string') return;
    try {
      let gltf = this.gltfCache.get(file);
      if (!gltf) {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        gltf = await new GLTFLoader().loadAsync(`${BASE}assets/models/${file}`);
        this.gltfCache.set(file, gltf);
      }
      if (!this.fighters.includes(fighter)) return; // replaced while loading
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      fighter.attachGLTF({ scene: clone(gltf.scene), animations: gltf.animations });
    } catch (err) {
      console.warn(`[models] Could not load "${file}" for ${fighter.def.name}; using the built-in model.`, err);
      this.hud?.el?.isConnected && this.hud.toast(`${fighter.def.name}: using built-in model`);
    }
  }

  previewFighters(p1, p2, changedSlot) {
    this.setFighters(p1, p2);
    this._placeForShowcase(1.55);
    if (changedSlot !== undefined) {
      const f = this.fighters[changedSlot];
      f.enter('victory');
      f.showcaseTimer = 1.8;
    }
  }

  _placeForShowcase(x) {
    this.fighters.forEach((f, i) => {
      f.resetForRound(i === 0 ? -x : x);
      f.enter('idle');
      f.canAct = false;
    });
  }

  // ======================================================================= screens
  goto(screen, opts = {}) {
    const prev = this.mode;
    this.screens[prev]?.hide?.();
    if (prev === 'fight' || prev === 'results') this._teardownFight();
    if (prev === 'fight' || screen !== 'fight') this.hud.hide();
    this.mode = screen;
    this.audio.setMusicIntensity(screen === 'fight' ? 1 : 0);

    switch (screen) {
      case 'menu':
        this.loadArena(this.state.match.arena || 'fort');
        this.setFighters(this.fighterIds[0] || 'sambhu', this.fighterIds[1] || 'simba');
        this._placeForShowcase(1.25);
        this.cam.setMode('orbit');
        this.screens.menu.show();
        break;
      case 'select':
        this.loadArena(this.state.match.arena);
        this.cam.setMode('select');
        this.screens.select.show(opts);
        break;
      case 'fight':
        this._startFight();
        break;
      case 'results':
        this.screens.results.show(opts);
        break;
      default:
        break;
    }
  }

  _startFight() {
    const m = this.state.match;
    this.loadArena(m.arena);
    this.setFighters(m.p1, m.p2);
    this.hitFx.clear();
    this.specialFx.clear();
    this.projectiles.clear();
    this.trails.clear();
    this.input.resetPlayers();
    const cpu = m.mode === 'cpu';
    this.input.mergeP2IntoP1 = cpu;
    this.input.enabled = [true, !cpu];
    this.ai = cpu ? new AIController(this.input.players[1], this.fighters[1], this.fighters[0], this.state.difficulty) : null;
    const labels = cpu ? { 0: 'PLAYER', 1: `CPU · ${this.state.difficulty.label.toUpperCase()}`, cpu: true } : { 0: 'PLAYER 1', 1: 'PLAYER 2' };
    this.hud.show(this.fighters, labels);
    if (TouchControls.wanted()) this.touch.show();
    this.combat.reset();
    this.paused = false;
    this.rounds.startMatch(this.fighters, labels);
    this.cam.setMode('fight', { snap: true });
  }

  _teardownFight() {
    this.rounds.stop();
    this.autoP1 = null;
    this.touch.hide();
    this.ai = null;
    this.paused = false;
    this.slowmo = 0;
    this.loop.timeScale = 1;
    this.input.mergeP2IntoP1 = true;
    this.input.enabled = [true, true];
    this.hitFx.clear();
    this.specialFx.clear();
    this.projectiles.clear();
    this.trails.clear();
    if (this.arena) this.arena.darkT = 0;
  }

  _onMatchEnd(winner, summary) {
    const mode = this.state.match.mode;
    this.hud.hide();
    this.touch.hide();
    this.mode = 'results';
    this.audio.play(mode === 'cpu' && winner === 1 ? 'defeat' : 'victory');
    this.screens.results.show({ winner, summary, mode });
  }

  pause() {
    if (this.mode !== 'fight' || this.paused) return;
    this.paused = true;
    this.input.resetPlayers();
    this.hud.showPause();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.input.resetPlayers();
    this.hud.hidePause();
  }

  restartMatch() {
    this.hud.hidePause();
    this.goto('fight');
  }

  toggleFullscreen() {
    const el = this.container;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else el.requestFullscreen?.({ navigationUI: 'hide' });
    } catch {
      /* fullscreen not permitted (e.g. inside a sandboxed iframe) */
    }
  }

  // ======================================================================= frame
  update(dt, rawDt) {
    this.input.update();
    const [a, b] = this.fighters;

    if (this.slowmo > 0) {
      this.slowmo -= rawDt;
      if (this.slowmo <= 0 && this.rounds.phase === 'fight') this.loop.timeScale = 1;
    }

    if (this.mode === 'fight' || (this.mode === 'results' && a)) {
      if (!this.paused) {
        if (this.mode === 'fight') {
          this.ai?.update(dt);
          this.autoP1?.update(dt);
          a.update(dt, this.input.players[0], b);
          b.update(dt, this.input.players[1], a);
          this.collision.update(a, b);
          this.combat.update(this.fighters);
          this.projectiles.update(dt, this.fighters, this.combat);
          this.rounds.update(dt, rawDt);
          this.hud.update(rawDt);
        } else {
          a.update(dt, IDLE_INPUT_FULL, b);
          b.update(dt, IDLE_INPUT_FULL, a);
          this.collision.update(a, b);
        }
      }
    } else if (a && b) {
      this._updateShowcase(dt);
    }

    const simDt = this.paused ? 0 : dt;
    this.hitFx.update(simDt);
    this.specialFx.update(simDt);
    if (this.fighters.length) this.trails.update(simDt, this.fighters);
    if (this.arena) {
      this.arena.update(rawDt, this.loop.elapsed);
      this.arena.tick(rawDt);
    }
    this.cam.update(this.paused ? 0 : rawDt, this.fighters);
    if (this._noRender) return;
    if (this.bloom.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Menu / select: fighters pose and shadow-spar without real combat. */
  _updateShowcase(dt) {
    const [a, b] = this.fighters;
    this.sparTimer -= dt;
    if (this.mode === 'menu' && this.sparTimer <= 0) {
      this.sparTimer = 1.4 + Math.random() * 1.6;
      const f = Math.random() < 0.5 ? a : b;
      if (f.state === 'idle' || f.state === 'intro') {
        const key = SPAR_MOVES[(Math.random() * SPAR_MOVES.length) | 0];
        const id = f.def.commands[key];
        f.cooldowns = {};
        f.startMove(id);
      }
    }
    for (const f of this.fighters) {
      if (f.showcaseTimer > 0) {
        f.showcaseTimer -= dt;
        if (f.showcaseTimer <= 0) f.enter('idle');
      }
      f.update(dt, IDLE_INPUT_FULL, f === a ? b : a);
      // stay planted on the showcase marks
      f.x = f === a ? Math.min(f.x, -1.1) : Math.max(f.x, 1.1);
      f.vx *= 0.5;
    }
  }

  // ---------------------------------------------------------------- debug helpers (?debug)
  /** Advance the simulation quickly without rendering (used by automated playtests). */
  simulate(seconds, step = 1 / 60) {
    this._noRender = true;
    for (let t = 0; t < seconds; t += step) {
      this.update(step * this.loop.timeScale, step);
    }
    this._noRender = false;
  }

  /** Let the CPU drive player 1 as well (attract mode / balance testing). */
  debugAutoP1(level = 'normal') {
    this.input.enabled = [false, this.input.enabled[1]];
    this.autoP1 = new AIController(this.input.players[0], this.fighters[0], this.fighters[1], DIFFICULTY[level]);
  }

  _fatal(msg) {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.remove('is-done');
      loader.querySelector('.loader__msg').textContent = msg;
    }
  }

  dispose() {
    this.loop.stop();
    Object.values(this.screens).forEach((s) => s.hide?.());
    this.hud.hide();
    this.touch.hide();
    this.fighters.forEach((f) => f.dispose(this.scene));
    this.arena?.dispose(this.scene);
    this.hitFx.dispose();
    this.input.dispose();
    this.audio.dispose();
    this._offUiKey?.();
    this._ro?.disconnect();
    this._listeners.forEach((off) => off());
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}

const IDLE_INPUT_FULL = {
  held: { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false, special: false, dash: false },
  pressed: { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false, special: false, dash: false },
};

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
