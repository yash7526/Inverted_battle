import * as THREE from 'three';
import { HumanoidRig } from './Rig.js';
import { ProceduralAnimator, GLTFAnimator } from './AnimationController.js';
import { mergeStatic } from './ModelKit.js';

// A fighter = character definition + articulated model + finite-state machine.
//
// States: intro, idle, walk, dash, prejump, jump, land, crouch, block, blockstun,
//         attack, hit, knockdown, down, getup, victory, defeat
//
// Attacks follow startup → active (hit windows) → recovery. Hit windows can only
// connect once each, so holding a button or long animations never multi-hit.

const GRAVITY = 28;
const MAX_ENERGY = 100;
const BUFFER_TIME = 0.2;
const DOUBLE_TAP = 0.25;
const WALK_ACCEL = 26; // units/s² — eases in and out of walking instead of snapping
const PREJUMP = 0.06;

const ACTIONABLE = new Set(['idle', 'walk', 'crouch', 'block']);
const STUNNED = new Set(['hit', 'knockdown', 'down', 'getup']);

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let SHADOW_TEX = null;

const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export class Fighter {
  /**
   * @param {object} def   character definition (see Sambhu.js)
   * @param {object} opts  { index, paletteIndex, hooks }
   *   hooks: { sfx, fx, cinematic, shake, denied, projectile }
   */
  constructor(def, { index = 0, paletteIndex = 0, hooks = {} } = {}) {
    this.def = def;
    this.index = index;
    this.hooks = hooks;

    this.rig = new HumanoidRig(def.proportions);
    this.rig.root.scale.setScalar(def.scale);
    this.model = def.build(this.rig, def.palettes[paletteIndex] || def.palettes[0]);
    mergeStatic(this.rig); // fewer draw calls: static parts become one mesh per joint + material
    this.animator = new ProceduralAnimator(this.rig, def);
    this.gltfAnimator = null;
    this.object = this.rig.root;
    this.gravity = GRAVITY * (def.gravityScale ?? 1);

    if (!SHADOW_TEX) SHADOW_TEX = shadowTexture();
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;

    if (def.shield) this._buildShield(def.shield);

    this._v = new THREE.Vector3();
    this.resetForRound(index === 0 ? -2.2 : 2.2);
    this.stats = { damageDealt: 0, maxCombo: 0, hitsLanded: 0, specials: 0 };
  }

  _buildShield(cfg) {
    const g = new THREE.Group();
    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 32, 22),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const hex = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.08, 2),
      new THREE.MeshBasicMaterial({ color: cfg.color, wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    g.add(bubble, hex);
    g.position.y = 0.95;
    g.scale.setScalar(0.001);
    g.visible = false;
    this.shield = { group: g, bubble, hex, flash: 0, amount: 0 };
  }

  resetForRound(x) {
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = x < 0 ? 1 : -1;
    this.yaw = this.facing * (Math.PI / 2 - 0.32);
    this.hp = this.def.maxHealth;
    this.energy = this.energy ?? 0;
    this.state = 'intro';
    this.stateTime = 0;
    this.move = null;
    this.moveTime = 0;
    this.hitsDone = new Set();
    this.fxDone = new Set();
    this.impulsesDone = new Set();
    this.projDone = new Set();
    this.teleported = false;
    this.cooldowns = {};
    this.timer = 0;
    this.invuln = 0;
    this.hitstop = 0;
    this.crouching = false;
    this.walkDir = 0;
    this.dashDir = 1;
    this.jumpDir = 0;
    this.airAttackUsed = false;
    this.hitVariant = 0;
    this.buffer = null;
    this.bounced = false;
    this.ko = false;
    this.canAct = false;
    this.lastTap = { fwd: -10, back: -10 };
    this.clock = 0;
    this.connected = false;
    this.vanish = 0;
    this.armorFlash = 0;
    this.animator?.snapTo('stance');
  }

  // ------------------------------------------------------------------ queries
  get grounded() {
    return this.y <= 0.0001 && this.vy <= 0;
  }
  get actionable() {
    return ACTIONABLE.has(this.state);
  }
  get stunned() {
    return STUNNED.has(this.state);
  }
  get blocking() {
    return this.state === 'block' || this.state === 'blockstun';
  }
  get maxEnergy() {
    return MAX_ENERGY;
  }

  get invulnerable() {
    if (this.invuln > 0) return true;
    if (this.state === 'getup' || this.state === 'down' || this.state === 'knockdown' || this.state === 'defeat') return true;
    if (this.state === 'attack' && this.move.iframes) {
      const [a, b] = this.move.iframes;
      return this.moveTime >= a && this.moveTime <= b;
    }
    return false;
  }

  /** Armor frames (hits land but don't interrupt). */
  get armored() {
    if (this.state !== 'attack' || !this.move?.armor) return false;
    const [a, b] = this.move.armor;
    return this.moveTime >= a && this.moveTime <= b;
  }

  /** Vertical hurt range in world units. */
  hurtRange() {
    if (this.state === 'down') return [0, 0.45];
    const h = this.crouching ? this.def.crouchHeight : this.def.hurtHeight;
    const bottom = this.state === 'jump' ? this.y + 0.3 : this.y;
    return [bottom, this.y + h];
  }

  canBlock(hitDef, attackerX) {
    if (!this.blocking || !this.grounded) return false;
    if (Math.sign(attackerX - this.x) !== this.facing) return false;
    if (this.def.shield?.allHeights && !this.crouching) return true;
    if (this.crouching) return hitDef.height === 'low';
    return hitDef.height !== 'low';
  }

  limbWorld(name, target = this._v) {
    const node = { handL: this.rig.handL, handR: this.rig.handR, footL: this.rig.footL, footR: this.rig.footR, head: this.rig.j.head }[name] || this.rig.j.torso;
    return node.getWorldPosition(target);
  }

  // ------------------------------------------------------------------ state
  enter(state, timer = 0) {
    if (this.state !== state) this.stateTime = 0;
    this.state = state;
    this.timer = timer;
    if (state !== 'attack') this.move = null;
    if (state !== 'crouch' && state !== 'block' && state !== 'blockstun' && state !== 'hit') this.crouching = false;
  }

  startMove(id) {
    const move = this.def.moves[id];
    if (!move) return false;
    if ((this.cooldowns[id] || 0) > 0) return false;
    if (move.energyCost && this.energy < move.energyCost) return false;
    this.energy -= move.energyCost;
    this.enter('attack');
    this.attackSerial = (this.attackSerial || 0) + 1;
    this.move = move;
    this.moveTime = 0;
    this.hitsDone.clear();
    this.fxDone.clear();
    this.impulsesDone.clear();
    this.projDone.clear();
    this.teleported = false;
    this.connected = false;
    this.crouching = move.crouch;
    if (!move.air) this.vx *= 0.25;
    this.cooldowns[id] = move.duration + move.cooldown;
    if (move.sfxStart) this.hooks.sfx?.(move.sfxStart, move.special ? 1 : 0.4);
    if (move.cinematic) this.hooks.cinematic?.(this, move.cinematic);
    if (move.special) this.stats.specials++;
    return true;
  }

  _resolveCommand(action, held) {
    const c = this.def.commands;
    if (action === 'special') return c.special;
    if (this.state === 'jump') return action === 'punch' ? c.airPunch : c.airKick;
    if (this.state === 'dash' && this.dashDir > 0) return action === 'punch' ? c.dashPunch : c.dashKick;
    if (held.down) return action === 'punch' ? c.crouchPunch : c.crouchKick;
    return action === 'punch' ? c.punch : c.kick;
  }

  _tryBufferedAttack(held) {
    if (!this.buffer || this.buffer.action === 'dash') return false;
    const { action } = this.buffer;
    if (this.state === 'jump' && (this.airAttackUsed || action === 'special')) return false;
    const id = this._resolveCommand(action, held);
    if (this.startMove(id)) {
      if (this.state === 'attack' && this.move.air) this.airAttackUsed = true;
      this.buffer = null;
      return true;
    }
    if (action === 'special') this.hooks.denied?.(this);
    this.buffer = null;
    return false;
  }

  // ------------------------------------------------------------------ hit API (CombatSystem)
  applyHit(hitDef, attackerX, attackerFacing, damage) {
    this.hp = Math.max(0, this.hp - damage);
    this.energy = Math.max(0, Math.min(MAX_ENERGY, this.energy + damage * 0.5 - (hitDef.drain || 0)));
    const dir = attackerX === this.x ? attackerFacing : Math.sign(this.x - attackerX);
    const kb = hitDef.knockback / this.def.weight;
    const airborne = this.y > 0.05;
    this.move = null;
    if (this.hp <= 0) this.ko = true;
    this.animator.impulse(damage / 8 + (hitDef.heavy ? 0.5 : 0), hitDef.height);
    if (this.ko || hitDef.knockdown || airborne) {
      this.enter('knockdown');
      this.vy = Math.max(hitDef.launch, airborne ? 5 : this.ko ? 6 : 3.5);
      this.vx = dir * Math.max(kb, 3) * 0.75;
      this.y = Math.max(this.y, 0.02);
      this.bounced = false;
    } else {
      this.enter('hit', hitDef.hitstun);
      this.vx = dir * kb;
      this.hitVariant = hitDef.height === 'mid' ? 1 : 0;
    }
  }

  /** Hit absorbed by armor frames: damage taken, no interruption. */
  applyArmoredHit(hitDef, damage) {
    this.hp = Math.max(1, this.hp - damage);
    this.armorFlash = 1;
    this.animator.impulse(0.4, hitDef.height);
  }

  applyBlock(hitDef, attackerX, chip) {
    this.hp = Math.max(1, this.hp - chip);
    const dir = attackerX < this.x ? 1 : -1;
    const crouch = this.crouching;
    this.enter('blockstun', hitDef.blockstun);
    this.crouching = crouch;
    this.vx = dir * (hitDef.knockback / this.def.weight) * 0.65;
    this.energy = Math.min(MAX_ENERGY, this.energy + 2);
    this.animator.impulse(0.35, 'mid');
    if (this.shield) this.shield.flash = 1;
  }

  // ------------------------------------------------------------------ update
  update(dt, input, opponent) {
    this.clock += dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this._updateVisuals(dt * 0.15); // keep springs settling very slowly during hit-stop
      return;
    }
    this.stateTime += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.armorFlash = Math.max(0, this.armorFlash - dt * 4);
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);

    const fwdKey = this.facing > 0 ? 'right' : 'left';
    const backKey = this.facing > 0 ? 'left' : 'right';

    // input buffer + double-tap dash detection
    if (this.canAct) {
      for (const a of ['special', 'punch', 'kick', 'dash']) {
        if (input.pressed[a]) {
          this.buffer = { action: a, t: BUFFER_TIME };
          break;
        }
      }
      if (input.pressed[fwdKey]) {
        if (this.clock - this.lastTap.fwd < DOUBLE_TAP && this.actionable) this.buffer = { action: 'dash', t: BUFFER_TIME, dir: 1 };
        this.lastTap.fwd = this.clock;
      }
      if (input.pressed[backKey]) {
        if (this.clock - this.lastTap.back < DOUBLE_TAP && this.actionable) this.buffer = { action: 'dash', t: BUFFER_TIME, dir: -1 };
        this.lastTap.back = this.clock;
      }
    }
    if (this.buffer) {
      this.buffer.t -= dt;
      if (this.buffer.t <= 0) this.buffer = null;
    }

    const held = this.canAct ? input.held : NO_INPUT;
    const wantsFwd = held[fwdKey];
    const wantsBack = held[backKey];

    // face the opponent when free to turn
    if ((this.actionable || this.state === 'land' || this.state === 'intro') && this.grounded) {
      const d = opponent.x - this.x;
      if (Math.abs(d) > 0.05) this.facing = Math.sign(d);
    }

    switch (this.state) {
      case 'intro':
        this.vx = 0;
        if (this.canAct) this.enter('idle');
        break;

      case 'idle':
      case 'walk':
      case 'crouch':
      case 'block': {
        if (!this.canAct) {
          this.enter('idle');
          this.vx = approach(this.vx, 0, WALK_ACCEL * dt);
          break;
        }
        if (input.pressed.up && !held.down) {
          this.jumpDir = wantsFwd ? 1 : wantsBack ? -1 : 0;
          this.enter('prejump');
          break;
        }
        if (this._tryBufferedAttack(held)) break;
        if (this.buffer?.action === 'dash') {
          const dir = this.buffer.dir ?? (wantsBack ? -1 : 1);
          this.buffer = null;
          this._dash(dir);
          break;
        }
        if (held.block) {
          if (this.state !== 'block') this.hooks.sfx?.(this.def.shield ? 'shield' : null);
          this.enter('block');
          this.crouching = !!held.down;
          this.vx = approach(this.vx, 0, WALK_ACCEL * 2 * dt);
          break;
        }
        if (held.down) {
          this.enter('crouch');
          this.crouching = true;
          this.vx = approach(this.vx, 0, WALK_ACCEL * 2 * dt);
          break;
        }
        if (wantsFwd || wantsBack) {
          this.enter('walk');
          this.walkDir = wantsFwd ? 1 : -1;
          const target = this.facing * this.walkDir * (wantsFwd ? this.def.walkSpeed : this.def.backSpeed);
          this.vx = approach(this.vx, target, WALK_ACCEL * dt);
          break;
        }
        this.vx = approach(this.vx, 0, WALK_ACCEL * 1.4 * dt);
        if (Math.abs(this.vx) < 0.05) this.enter('idle');
        break;
      }

      case 'prejump':
        this.vx *= Math.exp(-12 * dt);
        if (this.stateTime >= PREJUMP) this._jump(this.jumpDir);
        break;

      case 'dash': {
        const dur = this.dashDir > 0 ? 0.32 : 0.3;
        const k = 1 - this.stateTime / dur;
        const ease = k * k * (3 - 2 * k); // smooth ease-out
        this.vx = this.facing * this.dashDir * this.def.dashSpeed * (this.dashDir > 0 ? 1 : 0.85) * Math.max(0.12, ease);
        if (this.dashDir > 0 && this._tryBufferedAttack(held)) break;
        if (this.stateTime >= dur) this.enter('idle');
        break;
      }

      case 'jump':
        if (this.canAct && !this.airAttackUsed) this._tryBufferedAttack(held);
        break;

      case 'land':
        this.vx *= Math.exp(-14 * dt);
        if (this.stateTime >= 0.08) this.enter('idle');
        break;

      case 'attack':
        this._updateMove(dt, held, opponent);
        break;

      case 'hit':
        this.vx *= Math.exp(-7 * dt);
        if (this.stateTime >= this.timer) {
          if (held.down) {
            this.enter('crouch');
            this.crouching = true;
          } else this.enter('idle');
        }
        break;

      case 'blockstun':
        this.vx *= Math.exp(-9 * dt);
        if (this.stateTime >= this.timer) {
          if (held.block) {
            this.enter('block');
            this.crouching = !!held.down;
          } else this.enter('idle');
        }
        break;

      case 'knockdown':
        break; // physics handled below; landing switches to 'down'

      case 'down':
        this.vx *= Math.exp(-8 * dt);
        if (!this.ko && this.stateTime >= 0.55) {
          this.enter('getup');
          this.hooks.sfx?.('whoosh', 0.2);
        }
        break;

      case 'getup':
        if (this.stateTime >= 0.5) {
          this.enter('idle');
          this.invuln = 0.2;
        }
        break;

      case 'victory':
      case 'defeat':
        this.vx *= Math.exp(-6 * dt);
        break;

      default:
        break;
    }

    this._integrate(dt);
    this._updateVisuals(dt);
  }

  _jump(dir) {
    this.enter('jump');
    this.vy = this.def.jumpVel;
    this.vx = this.facing * dir * this.def.jumpX;
    this.airAttackUsed = false;
    this.hooks.sfx?.('jump');
    this.hooks.fx?.('dust', this, {});
  }

  _dash(dir) {
    this.enter('dash');
    this.dashDir = dir;
    if (dir < 0) this.invuln = 0.16; // back-dash evasion frames
    this.hooks.sfx?.('dash');
    this.hooks.fx?.('dust', this, { dir });
  }

  _updateMove(dt, held, opponent) {
    const m = this.move;
    this.moveTime += dt;
    const t = this.moveTime;

    // forward lunges (smoothly eased instead of constant)
    let lunging = false;
    for (const l of m.lunge) {
      if (t >= l.at && t <= l.until) {
        const k = (t - l.at) / Math.max(1e-3, l.until - l.at);
        this.vx = this.facing * l.speed * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, k * 1.3)));
        lunging = true;
      }
    }
    if (!lunging && this.grounded) this.vx *= Math.exp(-10 * dt);

    // physics impulses (leaps / dives)
    m.impulses.forEach((imp, i) => {
      if (t >= imp.at && !this.impulsesDone.has(i)) {
        this.impulsesDone.add(i);
        this.vx = this.facing * imp.vx;
        this.vy = imp.vy;
        if (imp.vy > 0) this.y = Math.max(this.y, 0.01);
      }
    });

    // teleport: reappear in front of the opponent, up in the air
    if (m.teleport && !this.teleported && t >= m.teleport.at) {
      this.teleported = true;
      const side = Math.sign(this.x - opponent.x) || -this.facing;
      this.x = opponent.x + side * m.teleport.dist;
      this.facing = -side;
      this.y = m.teleport.height;
      this.vx = 0;
      this.vy = 0;
      this.hooks.fx?.('phaseIn', this, {});
    }

    // projectiles
    m.projectiles.forEach((p, i) => {
      if (t >= p.at && !this.projDone.has(i)) {
        this.projDone.add(i);
        this.hooks.projectile?.(this, p);
      }
    });

    // visual / audio events
    m.fx.forEach((ev, i) => {
      if (t >= ev.at && !this.fxDone.has(i)) {
        this.fxDone.add(i);
        this.hooks.fx?.(ev.type, this, ev);
      }
    });

    // chain cancels (e.g. punch → punch = combo string)
    if (m.cancels && t >= m.cancelAfter && this.buffer) {
      const next = m.cancels[this.buffer.action];
      if (next && this.startMove(next)) {
        this.buffer = null;
        return;
      }
    }

    if (t >= m.duration) {
      if (!this.grounded) {
        this.enter('jump');
        this.airAttackUsed = true;
      } else if (held.down && m.crouch) {
        this.enter('crouch');
        this.crouching = true;
      } else this.enter('idle');
    }
  }

  _integrate(dt) {
    this.x += this.vx * dt;
    const hovering = this.state === 'attack' && this.move?.hover && this.moveTime >= this.move.hover[0] && this.moveTime <= this.move.hover[1];
    if (hovering) {
      this.vy = 0;
      return;
    }
    if (this.y > 0 || this.vy > 0) {
      this.vy -= this.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this._onLand();
      }
    }
  }

  _onLand() {
    const impact = -this.vy;
    this.vy = 0;
    if (this.state === 'knockdown') {
      if (!this.bounced && impact > 6) {
        this.bounced = true;
        this.vy = 3;
        this.y = 0.01;
        this.vx *= 0.6;
        this.hooks.sfx?.('land', 1);
        this.hooks.fx?.('dust', this, { big: true });
        this.hooks.shake?.(0.15);
        this.animator.impulse(1.2, 'mid');
        return;
      }
      this.enter('down');
      this.hooks.sfx?.('land', 0.6);
      this.hooks.fx?.('dust', this, { big: true });
      return;
    }
    if (this.state === 'defeat' || this.state === 'victory') return;
    this.hooks.sfx?.('land');
    if (impact > 7) this.hooks.fx?.('dust', this, {});
    if (this.state === 'attack' && this.move && !this.move.endsOnLand) return; // e.g. Thunder Strike slam
    if (this.state === 'attack' || this.state === 'jump') {
      this.enter('land');
      this.animator.impulse(Math.min(1, impact / 12), 'low');
    }
  }

  _updateVisuals(dt) {
    const root = this.rig.root;
    root.position.set(this.x, this.y, 0);
    let targetYaw = this.facing * (Math.PI / 2 - 0.32);
    if (this.state === 'victory') targetYaw = this.facing * 0.35;
    // shortest-path, frame-rate independent turn
    const k = 1 - Math.exp(-(this.state === 'victory' ? 4 : 16) * dt);
    this.yaw += (targetYaw - this.yaw) * k;
    root.rotation.y = this.yaw;

    // fade for vanishing moves (ghost)
    const vw = this.state === 'attack' && this.move?.vanish;
    const wantVanish = vw && this.moveTime >= vw[0] && this.moveTime <= vw[1] ? 1 : 0;
    this.vanish += (wantVanish - this.vanish) * (1 - Math.exp(-14 * dt));

    if (this.gltfAnimator) this.gltfAnimator.update(dt, this);
    this.animator.update(dt, this);
    this.model?.update?.(dt, this);

    this.blob.position.set(this.x, 0.015, 0.05);
    const s = Math.max(0.35, 1 - this.y * 0.25) * (1 - this.vanish * 0.8);
    this.blob.scale.set(Math.max(0.01, s * (this.state === 'down' ? 1.6 : 1)), Math.max(0.01, s), 1);

    if (this.shield) {
      const sh = this.shield;
      const want = this.blocking && !this.crouching ? 1 : 0;
      sh.amount += (want - sh.amount) * Math.min(1, dt * 14);
      sh.flash = Math.max(0, sh.flash - dt * 4);
      sh.group.visible = sh.amount > 0.02;
      sh.group.position.set(this.x, this.y + 0.95, 0);
      sh.group.scale.setScalar(Math.max(0.001, sh.amount));
      sh.hex.rotation.y += dt * 1.5;
      sh.bubble.material.opacity = 0.14 + sh.flash * 0.35;
      sh.hex.material.opacity = 0.45 + sh.flash * 0.5;
    }
  }

  // ------------------------------------------------------------------ round flow
  setVictory() {
    this.enter('victory');
    this.canAct = false;
  }

  setDefeat() {
    if (this.state !== 'down' && this.state !== 'knockdown') this.enter('defeat');
    this.canAct = false;
  }

  addToScene(scene) {
    scene.add(this.rig.root, this.blob);
    if (this.shield) scene.add(this.shield.group);
  }

  /** Replace the procedural model with a GLB (keeps the procedural rig for hit positions). */
  attachGLTF(gltf) {
    const g = gltf.scene;
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const cfg = this.def.gltf || {};
    if (cfg.scale) g.scale.setScalar(cfg.scale);
    // procedural body becomes invisible but keeps animating for limb positions
    this.rig.body.traverse((o) => {
      if (o.isMesh) o.visible = false;
    });
    this.rig.root.add(g);
    if (gltf.animations?.length) this.gltfAnimator = new GLTFAnimator(gltf, this.def);
  }

  dispose(scene) {
    scene.remove(this.rig.root, this.blob);
    if (this.shield) {
      scene.remove(this.shield.group);
      this.shield.group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    }
    this.blob.geometry.dispose();
    this.blob.material.dispose();
    this.model?.dispose?.();
    this.rig.dispose();
  }
}

const NO_INPUT = { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false, special: false, dash: false };
