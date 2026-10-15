import * as THREE from 'three';
import { JOINTS } from './Rig.js';

// ---------------------------------------------------------------------------
// Poses. A pose = { hips:[x,y,z], torso, head, uaL, laL, uaR, laR, thL, shL,
// thR, shR, root:[x,y,z] (whole-body rotation, pivot at the feet), pos:[x,y,z] }.
// Internally poses are flat Float32Arrays of CH channels so blending is cheap.
// ---------------------------------------------------------------------------
export const KEYS = [...JOINTS, 'root', 'pos'];
const CH = KEYS.length * 3;
const ROOT_I = JOINTS.length * 3;
const POS_I = ROOT_I + 3;

export function emptyPose() {
  const p = {};
  for (const k of KEYS) p[k] = [0, 0, 0];
  return p;
}

/** Resolve a partial pose on top of a base (object form, used by character files). */
export function resolvePose(base, partial) {
  const p = {};
  for (const k of KEYS) {
    const src = partial && partial[k] ? partial[k] : base[k];
    p[k] = [src[0] || 0, src[1] || 0, src[2] || 0];
  }
  p.noGround = partial?.noGround ?? base.noGround ?? false;
  return p;
}

function toFlat(pose) {
  const a = new Float32Array(CH);
  KEYS.forEach((k, i) => {
    a[i * 3] = pose[k][0];
    a[i * 3 + 1] = pose[k][1];
    a[i * 3 + 2] = pose[k][2];
  });
  a.noGround = !!pose.noGround;
  return a;
}

// ---------------------------------------------------------------------------
// Keyframe clips: monotone cubic (Fritsch–Carlson) interpolation per channel.
// Motion has continuous velocity through every key (no robotic stops) yet never
// overshoots, so "hold" keys stay crisp.
// ---------------------------------------------------------------------------
export class Clip {
  constructor(keys, basePose) {
    // keys: [[time, partialPose], ...] with times in seconds
    this.times = keys.map((k) => k[0]);
    this.values = keys.map((k) => toFlat(resolvePose(basePose, k[1])));
    this.noGround = keys.map((k, i) => this.values[i].noGround);
    this.duration = this.times[this.times.length - 1];
    const n = this.times.length;
    this.tangents = this.values.map(() => new Float32Array(CH));
    for (let c = 0; c < CH; c++) {
      const d = [];
      for (let i = 0; i < n - 1; i++) {
        const h = Math.max(1e-4, this.times[i + 1] - this.times[i]);
        d.push((this.values[i + 1][c] - this.values[i][c]) / h);
      }
      for (let i = 0; i < n; i++) {
        let m;
        if (i === 0 || i === n - 1) m = 0; // ease in/out at clip ends
        else if (d[i - 1] * d[i] <= 0) m = 0; // local extremum or hold
        else {
          const h0 = this.times[i] - this.times[i - 1];
          const h1 = this.times[i + 1] - this.times[i];
          const w1 = 2 * h1 + h0;
          const w2 = h1 + 2 * h0;
          m = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); // weighted harmonic mean
        }
        this.tangents[i][c] = m;
      }
    }
  }

  sample(t, out) {
    const T = this.times;
    const n = T.length;
    if (t <= T[0]) return this._copy(0, out);
    if (t >= T[n - 1]) return this._copy(n - 1, out);
    let i = 0;
    while (i < n - 2 && t > T[i + 1]) i++;
    const h = T[i + 1] - T[i];
    const s = (t - T[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const a = this.values[i];
    const b = this.values[i + 1];
    const ma = this.tangents[i];
    const mb = this.tangents[i + 1];
    for (let c = 0; c < CH; c++) out[c] = h00 * a[c] + h10 * h * ma[c] + h01 * b[c] + h11 * h * mb[c];
    out.noGround = s < 0.5 ? this.noGround[i] : this.noGround[i + 1];
    return out;
  }

  _copy(i, out) {
    out.set(this.values[i]);
    out.noGround = this.noGround[i];
    return out;
  }
}

/** Exact critically-damped spring step (stable at any dt). */
function spring(x, v, target, w, dt) {
  const y = x - target;
  const e = Math.exp(-w * dt);
  const nx = (y + (v + w * y) * dt) * e + target;
  const nv = (v - w * (v + w * y) * dt) * e;
  return [nx, nv];
}

// ---------------------------------------------------------------------------
// Procedural animation. Every frame the fighter's FSM state picks a target pose
// (a static pose, a cyclic gait, or a keyframed clip) and each of the 39 joint
// channels is pulled toward it by a critically damped spring. Transitions are
// therefore always smooth, and attacks track their spline closely. On top sit
// additive layers: idle bounce, breathing, momentum lean and hit recoil.
// ---------------------------------------------------------------------------
const GETUP_KEYS = [
  [0, 'down'],
  [0.12, { root: [-1.2, 0, 0], pos: [0, 0.18, 0], torso: [0.3, 0, 0], thL: [-1.6, 0, 0.2], shL: [2.2, 0, 0], thR: [-1.2, 0, -0.2], shR: [2.0, 0, 0], uaL: [0.6, 0, 0.5], laL: [-0.4, 0, 0], uaR: [0.6, 0, -0.5], laR: [-0.4, 0, 0], noGround: true }],
  [0.28, 'getup'],
  [0.5, 'stance'],
];

export class ProceduralAnimator {
  constructor(rig, def) {
    this.rig = rig;
    this.def = def;
    const base = emptyPose();
    this.posesObj = {};
    for (const [name, partial] of Object.entries(def.poses)) this.posesObj[name] = resolvePose(base, partial);
    this.poses = {};
    for (const [name, p] of Object.entries(this.posesObj)) this.poses[name] = toFlat(p);

    this.x = new Float32Array(this.poses.stance);
    this.v = new Float32Array(CH);
    this.target = new Float32Array(CH);
    this.tmp = new Float32Array(CH);
    this.clips = new Map();
    this.time = Math.random() * 10;
    this.phase = 0;
    this.groundOffset = 0;
    this._v = new THREE.Vector3();
    this._pose = emptyPose();
    // additive secondary-motion springs (underdamped → natural wobble)
    this.recoil = { p: 0, pv: 0, r: 0, rv: 0, h: 0, hv: 0 };
    this.lean = 0;
    this.leanV = 0;
    this.lastVx = 0;

    this.getupClip = new Clip(
      GETUP_KEYS.map(([t, p]) => [t, typeof p === 'string' ? this.posesObj[p] : p]),
      this.posesObj.stance
    );
    this.loops = {};
    for (const [name, keys] of Object.entries(def.loops || {})) this.loops[name] = new Clip(keys, this.posesObj.stance);
    this._applyFlat(this.x, false);
  }

  clipFor(move) {
    let c = this.clips.get(move.id);
    if (!c) {
      c = new Clip(move.anim, this.posesObj[move.base || 'stance']);
      this.clips.set(move.id, c);
    }
    return c;
  }

  /** Jump straight to a named pose (portraits, round resets). */
  snapTo(name = 'stance') {
    this.x.set(this.poses[name] || this.poses.stance);
    this.v.fill(0);
    this.groundOffset = 0;
    this._applyFlat(this.x, false);
  }

  /** Physical hit reaction layered on top of any pose. */
  impulse(strength = 1, height = 'mid') {
    const r = this.recoil;
    const k = Math.min(2.2, strength);
    if (height === 'high') {
      r.hv -= 9 * k;
      r.pv -= 5 * k;
    } else if (height === 'low') {
      r.pv += 4 * k;
      r.rv += (Math.random() < 0.5 ? -1 : 1) * 4 * k;
    } else {
      r.pv += 7 * k;
      r.hv += 3 * k;
    }
    r.rv += (Math.random() - 0.5) * 3 * k;
  }

  _set(src) {
    this.target.set(src);
    this.target.noGround = src.noGround;
  }

  update(dt, f) {
    if (dt <= 0) return;
    this.time += dt;
    const P = this.poses;
    const T = this.target;
    let w = 14;
    const t = this.time;

    switch (f.state) {
      case 'idle':
      case 'intro': {
        const intro = f.state === 'intro' && this.loops.intro && f.stateTime < this.loops.intro.duration;
        if (intro) {
          this.loops.intro.sample(f.stateTime, this.tmp);
          this._set(this.tmp);
          w = 16;
          break;
        }
        this._set(P.stance);
        // fighting-stance bounce + breathing
        const b = Math.sin(t * 4.4);
        const breathe = Math.sin(t * 2.2) * 0.03;
        T[POS_I + 1] += -0.025 * (0.5 + 0.5 * b);
        this._add('thL', 0, -0.06 * (0.5 + 0.5 * b));
        this._add('shL', 0, 0.12 * (0.5 + 0.5 * b));
        this._add('thR', 0, -0.05 * (0.5 + 0.5 * b));
        this._add('shR', 0, 0.1 * (0.5 + 0.5 * b));
        this._add('torso', 0, breathe);
        this._add('head', 0, -breathe * 0.6);
        this._add('uaL', 0, breathe * 0.8);
        this._add('uaR', 0, -breathe * 0.6);
        w = 12;
        break;
      }
      case 'walk': {
        // advance the gait by distance travelled so feet don't slide
        const stride = this.def.stride ?? 1.05;
        const speed = Math.abs(f.vx);
        this.phase += (speed * dt * Math.PI * 2) / stride;
        const ph = this.phase * (f.walkDir >= 0 ? 1 : -1);
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        const amt = Math.min(1, speed / Math.max(0.5, this.def.walkSpeed));
        this._set(P.stance);
        this._add('thL', 0, s * 0.45 * amt);
        this._add('thR', 0, -s * 0.45 * amt);
        this._add('shL', 0, Math.max(0, c) * 0.65 * amt);
        this._add('shR', 0, Math.max(0, -c) * 0.65 * amt);
        this._add('hips', 1, s * 0.08 * amt);
        this._add('torso', 1, -s * 0.07 * amt);
        this._add('torso', 0, 0.05 * f.walkDir * amt);
        this._add('uaL', 0, -s * 0.16 * amt);
        this._add('uaR', 0, s * 0.16 * amt);
        T[POS_I + 1] -= Math.abs(Math.cos(ph)) * 0.03 * amt;
        w = 16;
        break;
      }
      case 'dash':
      case 'run': {
        const back = f.dashDir < 0;
        this.phase += dt * 15;
        const s = Math.sin(this.phase);
        this._set(back ? P.backdash : P.run);
        if (!back) {
          this._add('thL', 0, s * 0.75);
          this._add('thR', 0, -s * 0.75);
          this._add('shL', 0, Math.max(0, Math.cos(this.phase)) * 1.1);
          this._add('shR', 0, Math.max(0, -Math.cos(this.phase)) * 1.1);
          this._add('uaL', 0, -s * 0.6);
          this._add('uaR', 0, s * 0.6);
          T[POS_I + 1] -= Math.abs(Math.cos(this.phase)) * 0.05;
        }
        w = 20;
        break;
      }
      case 'prejump':
      case 'land':
        this._set(P.crouch);
        w = 30;
        break;
      case 'jump': {
        // blend tuck → extend through the arc
        const k = THREE.MathUtils.clamp((f.vy + 4) / 12, 0, 1);
        for (let c = 0; c < CH; c++) T[c] = P.jumpFall[c] + (P.jumpUp[c] - P.jumpFall[c]) * k;
        T.noGround = true;
        w = 14;
        break;
      }
      case 'crouch':
        this._set(P.crouch);
        this._add('torso', 0, Math.sin(t * 2.2) * 0.02);
        w = 18;
        break;
      case 'block':
      case 'blockstun':
        this._set(f.crouching ? P.crouchBlock : P.block);
        if (f.state === 'blockstun') this._add('torso', 0, -0.14);
        w = 30;
        break;
      case 'attack': {
        const clip = this.clipFor(f.move);
        clip.sample(f.moveTime, this.tmp);
        this._set(this.tmp);
        // track the spline tightly, but ease in from wherever we were
        w = f.moveTime < 0.05 ? 34 : 52;
        break;
      }
      case 'hit': {
        const k = f.stateTime / Math.max(0.05, f.timer);
        const hitPose = f.crouching ? P.hitLow : f.hitVariant ? P.hitBody : P.hitHigh;
        this._set(k < 0.55 ? hitPose : f.crouching ? P.crouch : P.stance);
        w = k < 0.55 ? 34 : 14;
        break;
      }
      case 'knockdown':
        this._set(f.y > 0.05 || f.vy > 0 ? P.fall : P.down);
        w = f.y > 0.05 ? 11 : 16;
        break;
      case 'down':
        this._set(P.down);
        T[POS_I + 1] += Math.sin(t * 3) * 0.004;
        w = 14;
        break;
      case 'getup':
        this.getupClip.sample(f.stateTime, this.tmp);
        this._set(this.tmp);
        w = 24;
        break;
      case 'victory': {
        const loop = this.loops.victory;
        if (loop) {
          const lt = Math.min(f.stateTime, loop.duration);
          loop.sample(lt, this.tmp);
          this._set(this.tmp);
        } else this._set(P.victory);
        this._add('torso', 0, Math.sin(t * 2.2) * 0.03);
        w = 9;
        break;
      }
      case 'defeat':
        this._set(f.y > 0.05 ? P.fall : P.defeat);
        w = 7;
        break;
      default:
        this._set(P.stance);
    }

    // floating characters (the ghost) hover above the ground
    const floating = this.def.floating && !['knockdown', 'down', 'getup', 'defeat'].includes(f.state);
    if (floating) {
      T[POS_I + 1] += this.def.floating.height + Math.sin(t * 2.4) * this.def.floating.bob;
      T.noGround = true;
    }

    // critically damped springs toward the target
    for (let c = 0; c < CH; c++) {
      const [nx, nv] = spring(this.x[c], this.v[c], T[c], w, dt);
      this.x[c] = nx;
      this.v[c] = nv;
    }

    // momentum lean: accelerating tips the body (secondary motion)
    const acc = THREE.MathUtils.clamp((f.vx - this.lastVx) / Math.max(dt, 1e-3), -60, 60) * f.facing;
    this.lastVx = f.vx;
    this.leanV += (-acc * 0.5 - this.lean * 140 - this.leanV * 16) * dt;
    this.lean += this.leanV * dt;

    // recoil springs (underdamped)
    const r = this.recoil;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      r.pv += (-260 * r.p - 15 * r.pv) * h;
      r.p += r.pv * h;
      r.rv += (-220 * r.r - 14 * r.rv) * h;
      r.r += r.rv * h;
      r.hv += (-300 * r.h - 16 * r.hv) * h;
      r.h += r.hv * h;
    }

    this._applyFlat(this.x, true, f, dt);
  }

  _add(joint, axis, v) {
    const i = KEYS.indexOf(joint) * 3 + axis;
    this.target[i] += v;
  }

  _applyFlat(a, layers, f = null, dt = 0) {
    const P = this._pose;
    KEYS.forEach((k, i) => {
      P[k][0] = a[i * 3];
      P[k][1] = a[i * 3 + 1];
      P[k][2] = a[i * 3 + 2];
    });
    if (layers) {
      const r = this.recoil;
      P.torso[0] += r.p * 0.06 + this.lean;
      P.torso[2] += r.r * 0.05;
      P.head[0] += r.h * 0.06 + r.p * 0.03;
      P.hips[0] += r.p * 0.02;
    }
    this.rig.apply(P);

    // Foot planting: keep the lowest foot on the floor for grounded poses.
    if (!f) return;
    const grounded = !this.target.noGround && f.y <= 0.001;
    let off = 0;
    if (grounded) {
      this.rig.root.updateMatrixWorld(true);
      const yL = this.rig.footL.getWorldPosition(this._v).y;
      const yR = this.rig.footR.getWorldPosition(this._v).y;
      const sc = this.rig.root.scale.y || 1;
      off = (Math.min(yL, yR) - this.rig.root.position.y) / sc - this.def.proportions.footH;
    }
    this.groundOffset += (off - this.groundOffset) * (1 - Math.exp(-30 * dt));
    if (grounded) this.rig.body.position.y -= this.groundOffset;
  }
}

// ---------------------------------------------------------------------------
// GLTF animation: used automatically when a GLB with clips is listed in
// public/assets/models/manifest.json. Clip names are mapped in the character
// definition (`gltf.clips`). Missing clips fall back to `idle`.
// ---------------------------------------------------------------------------
export class GLTFAnimator {
  constructor(gltf, def) {
    this.def = def;
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    this.actions = new Map();
    this.currentKey = null;
  }

  _action(key) {
    const map = this.def.gltf?.clips || {};
    const name = map[key] || map.idle;
    if (!name || !this.clips.has(name)) return null;
    if (!this.actions.has(name)) this.actions.set(name, this.mixer.clipAction(this.clips.get(name)));
    return this.actions.get(name);
  }

  _keyFor(f) {
    if (f.state === 'attack') return f.move.id;
    if (f.state === 'block' || f.state === 'blockstun') return 'block';
    if (f.state === 'dash' || f.state === 'run') return 'run';
    return f.state;
  }

  update(dt, f) {
    const key = this._keyFor(f);
    if (key !== this.currentKey) {
      const next = this._action(key);
      const prev = this.currentKey ? this._action(this.currentKey) : null;
      if (next) {
        next.reset();
        const once = f.state === 'attack' || f.state === 'hit' || f.state === 'getup';
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        if (f.state === 'attack' && next.getClip().duration > 0) {
          next.timeScale = next.getClip().duration / f.move.duration; // sync clip to move timing
        } else next.timeScale = 1;
        next.play();
        if (prev && prev !== next) prev.crossFadeTo(next, 0.12, false);
      }
      this.currentKey = key;
    }
    this.mixer.update(dt);
  }
}
