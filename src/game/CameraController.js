import * as THREE from 'three';

// Fighting-game camera: tracks the midpoint between the fighters, pulls back as they
// separate (and on narrow/portrait screens), adds trauma-based shake and short
// cinematic close-ups for special moves.

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'orbit';
    this.target = new THREE.Vector3(0, 1.2, 0);
    this.look = new THREE.Vector3(0, 1.2, 0);
    this.desiredPos = new THREE.Vector3(0, 2, 8);
    this.trauma = 0;
    this.shakeEnabled = true;
    this.orbitAngle = 0.4;
    this.cine = null;
    this.focus = null;
    this._tmp = new THREE.Vector3();
  }

  setMode(mode, opts = {}) {
    this.mode = mode;
    this.focus = opts.focus || null;
    if (opts.snap) this.snap = true;
    if (mode === 'orbit') this.orbitAngle = opts.angle ?? this.orbitAngle;
  }

  shake(amount) {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  cinematic(fighter, duration = 0.6) {
    this.cine = { fighter, t: 0, duration };
  }

  _fightFraming(fighters) {
    const [a, b] = fighters;
    const mid = (a.x + b.x) / 2;
    const dist = Math.abs(a.x - b.x);
    const maxY = Math.max(a.y, b.y);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = this.camera.aspect;
    const halfW = dist / 2 + (aspect < 1 ? 1.25 : 1.9);
    const zNeeded = halfW / (Math.tan(vfov / 2) * aspect);
    const z = THREE.MathUtils.clamp(Math.max(5.9 + dist * 0.5, zNeeded), 6.3, 17);
    this.desiredPos.set(mid, 1.6 + z * 0.06 + maxY * 0.25, z);
    this.target.set(mid, 1.5 + maxY * 0.35, 0);
  }

  update(dt, fighters) {
    let rate = 4.5;
    switch (this.mode) {
      case 'fight':
        this._fightFraming(fighters);
        if (this.cine) {
          this.cine.t += dt;
          const f = this.cine.fighter;
          const k = Math.sin(Math.min(1, this.cine.t / this.cine.duration) * Math.PI);
          const close = this._tmp.set(f.x - f.facing * 0.4, 1.3 + f.y * 0.6, 3.6);
          this.desiredPos.lerp(close, k * 0.85);
          this.target.lerp(this._tmp.set(f.x + f.facing * 0.6, 1.2 + f.y, 0), k * 0.8);
          rate = 7;
          if (this.cine.t >= this.cine.duration) this.cine = null;
        }
        break;
      case 'orbit':
        this.orbitAngle += dt * 0.08;
        // keep both fighters in frame on narrow (portrait) screens
        const r = Math.max(7.2, 2.1 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
        this.desiredPos.set(Math.sin(this.orbitAngle) * r, 2.0 + Math.sin(this.orbitAngle * 0.7) * 0.4, Math.cos(this.orbitAngle) * r);
        this.target.set(0, this.camera.aspect < 1 ? 0.35 : 1.25, 0);
        rate = 2;
        break;
      case 'select': {
        const aspect = this.camera.aspect;
        const z = Math.max(6.4, 2.6 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect));
        this.desiredPos.set(0, 1.6, z);
        this.target.set(0, aspect < 1 ? 1.6 : 1.15, 0);
        rate = 3;
        break;
      }
      case 'victory': {
        const f = this.focus || fighters[0];
        this.orbitAngle += dt * 0.25;
        const r = this.camera.aspect < 1 ? 5 : 3.6;
        this.desiredPos.set(f.x + Math.sin(this.orbitAngle) * r, 1.5, Math.cos(this.orbitAngle) * r + 0.3);
        this.target.set(f.x, 1.15, 0);
        rate = 2.5;
        break;
      }
      default:
        break;
    }

    if (this.snap) {
      this.camera.position.copy(this.desiredPos);
      this.look.copy(this.target);
      this.snap = false;
    } else {
      const k = 1 - Math.exp(-rate * dt);
      this.camera.position.lerp(this.desiredPos, k);
      this.look.lerp(this.target, k);
    }

    // shake (trauma²) applied on top
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = performance.now() * 0.05;
      this.camera.position.x += Math.sin(t * 1.7) * 0.18 * s;
      this.camera.position.y += Math.sin(t * 2.3 + 1) * 0.14 * s;
    }
    this.camera.lookAt(this.look);
    if (s > 0.0001) this.camera.rotateZ(Math.sin(performance.now() * 0.03) * 0.02 * s);
  }
}
