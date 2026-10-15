import * as THREE from 'three';

// Cinematic special-move effects: power auras, lightning bolts (sky strikes and a
// horizontal beam), radial shockwaves and energy bursts. Each effect is a small
// object with update(dt) → alive; meshes are created per use and disposed after.

const BOLT_SEGMENTS = 14;

class Bolt {
  constructor(scene, color, width) {
    this.scene = scene;
    const n = (BOLT_SEGMENTS + 1) * 2;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(n * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const idx = [];
    for (let i = 0; i < BOLT_SEGMENTS; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.glow = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.coreGeo = this.geo.clone();
    this.corePositions = this.coreGeo.attributes.position.array;
    this.core = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.glow.frustumCulled = this.core.frustumCulled = false;
    this.glow.renderOrder = this.core.renderOrder = 7;
    this.width = width;
    scene.add(this.glow, this.core);
  }

  /** Regenerate a jagged path from a to b. */
  set(a, b, jag = 0.35) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const side = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    for (let i = 0; i <= BOLT_SEGMENTS; i++) {
      const t = i / BOLT_SEGMENTS;
      const off = i === 0 || i === BOLT_SEGMENTS ? 0 : (Math.random() * 2 - 1) * jag * Math.min(1, len / 3);
      const px = a.x + dir.x * t + side.x * off;
      const py = a.y + dir.y * t + side.y * off;
      const pz = a.z + dir.z * t + 0.2;
      const taper = 1 - t * 0.5;
      for (const [arr, w] of [
        [this.positions, this.width * taper],
        [this.corePositions, this.width * 0.22 * taper],
      ]) {
        arr[i * 6] = px + side.x * w;
        arr[i * 6 + 1] = py + side.y * w;
        arr[i * 6 + 2] = pz;
        arr[i * 6 + 3] = px - side.x * w;
        arr[i * 6 + 4] = py - side.y * w;
        arr[i * 6 + 5] = pz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.coreGeo.attributes.position.needsUpdate = true;
  }

  opacity(v) {
    this.glow.material.opacity = 0.55 * v;
    this.core.material.opacity = v;
  }

  dispose() {
    this.scene.remove(this.glow, this.core);
    this.geo.dispose();
    this.coreGeo.dispose();
    this.glow.material.dispose();
    this.core.material.dispose();
  }
}

export class SpecialEffects {
  constructor(scene, hitEffects, hooks = {}) {
    this.scene = scene;
    this.hit = hitEffects;
    this.hooks = hooks; // { flash(color, amount), shake(amount), sfx(id) }
    this.active = [];
    this._v = new THREE.Vector3();
  }

  trigger(type, fighter, data = {}) {
    const fn = this[`_${type}`];
    if (fn) fn.call(this, fighter, data);
  }

  // ---------------------------------------------------------------- effects
  _aura(f, { color = 0xffc53a, duration = 1.0 }) {
    const geo = new THREE.CylinderGeometry(0.55, 0.85, 2.3, 24, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    let t = 0;
    this.active.push({
      update: (dt) => {
        t += dt;
        const k = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / (duration - 0.15));
        mesh.position.set(f.x, f.y + 1.1, 0);
        mesh.rotation.y += dt * 4;
        mesh.scale.set(1 + Math.sin(t * 30) * 0.04, 1, 1 + Math.cos(t * 26) * 0.04);
        mat.opacity = 0.2 * k;
        if (Math.random() < 0.8) {
          this.hit.sparks.emit(f.x + (Math.random() - 0.5) * 1.0, f.y + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, { count: 2, speed: 2.5, spread: 0.2, up: 1, dir: [0, 2, 0], color, size: 0.12, life: 0.6, gravity: 2 });
        }
        if (t >= duration) {
          this.scene.remove(mesh);
          geo.dispose();
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _skybolt(f) {
    const bolt = new Bolt(this.scene, 0x6fe3ff, 0.22);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let t = 0;
    let regen = 0;
    this.hooks.sfx?.('thunder');
    this.hooks.flash?.('#bfefff', 0.35);
    this.hooks.shake?.(0.25);
    this.active.push({
      update: (dt) => {
        t += dt;
        regen -= dt;
        f.limbWorld('handR', b);
        a.set(b.x + (Math.random() - 0.5) * 0.6, 12, -1);
        if (regen <= 0) {
          bolt.set(a, b, 0.9);
          regen = 0.045;
        }
        bolt.opacity(Math.max(0, 1 - t / 0.4));
        if (Math.random() < 0.6) this.hit.sparks.emit(b.x, b.y, b.z, { count: 3, speed: 4, color: 0xfff27a, size: 0.12, life: 0.3 });
        if (t > 0.4) {
          bolt.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _beam(f) {
    const bolts = [new Bolt(this.scene, 0x6fe3ff, 0.18), new Bolt(this.scene, 0xffe34a, 0.1), new Bolt(this.scene, 0x6fe3ff, 0.12)];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let t = 0;
    let regen = 0;
    this.hooks.flash?.('#dff7ff', 0.2);
    this.active.push({
      update: (dt) => {
        t += dt;
        regen -= dt;
        f.limbWorld('handR', a);
        b.set(a.x + f.facing * 4.2, a.y - 0.1, a.z);
        if (regen <= 0) {
          bolts.forEach((bo, i) => bo.set(a, this._v.set(b.x, b.y + (i - 1) * 0.25, b.z), 0.45));
          regen = 0.04;
          this.hit.sparks.emit(b.x, b.y, 0.2, { count: 3, speed: 5, color: 0x6fe3ff, size: 0.1, life: 0.25 });
        }
        bolts.forEach((bo) => bo.opacity(Math.max(0, 1 - t / 0.35)));
        if (t > 0.35) {
          bolts.forEach((bo) => bo.dispose());
          return false;
        }
        return true;
      },
    });
  }

  _shockwave(f, { color = 0x47c8ff, radius = 2.4, duration = 0.45 }) {
    const geo = new THREE.RingGeometry(0.75, 1, 48);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.x + f.facing * 0.5, 0.05, 0);
    this.scene.add(ring);
    this.hit.dust(f.x + f.facing * 0.5, { big: true });
    this.hit.sparks.emit(f.x + f.facing * 0.5, 0.1, 0, { count: 24, speed: 6, spread: 1, up: 0.5, color, size: 0.13, life: 0.45 });
    this.hooks.shake?.(0.35);
    let t = 0;
    this.active.push({
      update: (dt) => {
        t += dt;
        const k = t / duration;
        const s = 0.2 + radius * (1 - Math.pow(1 - k, 3));
        ring.scale.set(s, s, s);
        mat.opacity = Math.max(0, 1 - k);
        if (k >= 1) {
          this.scene.remove(ring);
          geo.dispose();
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _thunderSlam(f) {
    this.hooks.flash?.('#ffffff', 0.45);
    this.hooks.shake?.(0.6);
    this.hooks.sfx?.('thunder');
    this._shockwave(f, { color: 0x6fe3ff, radius: 3.6, duration: 0.6 });
    this._shockwave(f, { color: 0xffd23f, radius: 2.4, duration: 0.5 });
    const bolts = [];
    const targets = [];
    for (let i = 0; i < 5; i++) {
      bolts.push(new Bolt(this.scene, i % 2 ? 0xffe34a : 0x6fe3ff, 0.2));
      targets.push(new THREE.Vector3(f.x + f.facing * 0.5 + (i - 2) * 0.9, 0.05, (Math.random() - 0.5) * 1.2));
    }
    const top = new THREE.Vector3();
    let t = 0;
    let regen = 0;
    this.active.push({
      update: (dt) => {
        t += dt;
        regen -= dt;
        if (regen <= 0) {
          bolts.forEach((b, i) => {
            top.set(targets[i].x + (Math.random() - 0.5) * 2, 10, -2);
            b.set(top, targets[i], 1.0);
          });
          regen = 0.05;
        }
        bolts.forEach((b, i) => b.opacity(Math.max(0, 1 - (t - i * 0.03) / 0.5)));
        if (Math.random() < 0.9) {
          const tg = targets[(Math.random() * targets.length) | 0];
          this.hit.sparks.emit(tg.x, 0.15, tg.z, { count: 4, speed: 5, up: 1.2, color: Math.random() < 0.5 ? 0x6fe3ff : 0xffe34a, size: 0.12, life: 0.4 });
        }
        if (t > 0.6) {
          bolts.forEach((b) => b.dispose());
          return false;
        }
        return true;
      },
    });
  }

  _burst(f, { color = 0xffc53a }) {
    const p = f.limbWorld('handR', this._v).clone();
    p.z = 0.3;
    this.hit.hit(p, { heavy: true, color });
    this.hit.sparks.emit(p.x, p.y, p.z, { count: 40, speed: 9, spread: 1, color, size: 0.15, life: 0.6, gravity: -4 });
    this.hooks.flash?.('#fff3c4', 0.25);
  }

  /** Maddy: glowing equations orbit him while he winds up. */
  _formulas(f) {
    const words = ['E=mc²', 'F=ma', '∇·E', 'λ=h/p', 'ΔxΔp', 'PV=nRT'];
    const sprites = words.map((w, i) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 96;
      const g = c.getContext('2d');
      g.font = 'italic bold 60px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#5ad1ff';
      g.shadowBlur = 18;
      g.fillStyle = i % 2 ? '#bff3ff' : '#ffe680';
      g.fillText(w, 128, 50);
      const tex = new THREE.CanvasTexture(c);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.set(0.7, 0.26, 1);
      this.scene.add(s);
      return s;
    });
    let t = 0;
    this.active.push({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / 0.15) * Math.max(0, 1 - Math.max(0, t - 0.45) / 0.25);
        sprites.forEach((s, i) => {
          const a = t * 3 + (i / sprites.length) * Math.PI * 2;
          s.position.set(f.x + Math.cos(a) * 0.75, f.y + 0.6 + (i % 3) * 0.35 + Math.sin(t * 4 + i) * 0.05, Math.sin(a) * 0.75);
          s.material.opacity = k;
        });
        if (t > 0.7) {
          sprites.forEach((s) => {
            this.scene.remove(s);
            s.material.map.dispose();
            s.material.dispose();
          });
          return false;
        }
        return true;
      },
    });
  }

  /** Ghost: a shriek of expanding rings and a flurry of exam papers. */
  _ghostScream(f) {
    this.hooks.sfx?.('scream');
    this.hooks.shake?.(0.2);
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.RingGeometry(0.4, 0.48, 48);
      const mat = new THREE.MeshBasicMaterial({ color: 0x9dffc8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(geo, mat);
      this.scene.add(ring);
      let t = -i * 0.1;
      this.active.push({
        update: (dt) => {
          t += dt;
          const head = f.limbWorld('head', this._v);
          ring.position.set(head.x + f.facing * 0.2, head.y + 0.2, 0.3);
          ring.rotation.y = f.facing * 1.2;
          const k = Math.max(0, t) / 0.5;
          ring.scale.setScalar(0.3 + k * 3);
          mat.opacity = t < 0 ? 0 : Math.max(0, 0.8 * (1 - k));
          if (k >= 1) {
            this.scene.remove(ring);
            geo.dispose();
            mat.dispose();
            return false;
          }
          return true;
        },
      });
    }
    // paper flurry
    const papers = [];
    const pg = new THREE.PlaneGeometry(0.16, 0.21);
    const pm = new THREE.MeshStandardMaterial({ color: 0xfff6e0, side: THREE.DoubleSide, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(pg, pm);
      m.position.set(f.x + (Math.random() - 0.5) * 1.5, f.y + 0.4 + Math.random() * 1.8, (Math.random() - 0.5) * 1.5);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
      m.userData.spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      this.scene.add(m);
      papers.push(m);
    }
    let t = 0;
    this.active.push({
      update: (dt) => {
        t += dt;
        for (const m of papers) {
          m.userData.v.y -= 2.5 * dt;
          m.userData.v.multiplyScalar(Math.exp(-1.2 * dt));
          m.position.addScaledVector(m.userData.v, dt);
          m.rotation.x += m.userData.spin.x * dt;
          m.rotation.y += m.userData.spin.y * dt;
          if (m.position.y < 0.02) m.position.y = 0.02;
        }
        if (t > 1.8) {
          papers.forEach((m) => this.scene.remove(m));
          pg.dispose();
          pm.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _phaseOut(f) {
    const p = f.limbWorld('torso', this._v);
    this.hit.sparks.emit(p.x, p.y, 0.2, { count: 40, speed: 3, spread: 1, color: 0x9dffc8, size: 0.16, life: 0.6, gravity: 1.5 });
    this.hooks.sfx?.('whoosh', 1);
  }

  _phaseIn(f) {
    const p = f.limbWorld('torso', this._v);
    this.hit.sparks.emit(p.x, p.y, 0.2, { count: 30, speed: 2.5, spread: 1, color: 0xc9ffe0, size: 0.14, life: 0.5, gravity: -1 });
    this.hit.flashes.spawn(p, { color: 0x9dffc8, from: 0.4, to: 2.2, dur: 0.25, opacity: 0.6 });
  }

  /** Blackout: the stage lights die, only his red eye and the effects glow. */
  _darkness(f, { duration = 1.6 }) {
    this.hooks.darken?.(duration);
    this.hooks.sfx?.('powerdown');
  }

  _darkPulse(f) {
    this.hooks.flash?.('#ff2a44', 0.35);
    this.hooks.shake?.(0.6);
    this.hooks.sfx?.('thunder');
    this._shockwave(f, { color: 0xff2a44, radius: 4.2, duration: 0.6 });
    this._shockwave(f, { color: 0x6a0b18, radius: 2.8, duration: 0.5 });
    for (let i = 0; i < 3; i++) {
      const bolt = new Bolt(this.scene, 0xff3355, 0.14);
      const a = new THREE.Vector3(f.x + (i - 1) * 1.4, 0.05, 0.2);
      const b = new THREE.Vector3(f.x + (i - 1) * 1.4 + f.facing * 1.2, 1.4 + Math.random(), 0.2);
      let t = 0;
      let regen = 0;
      this.active.push({
        update: (dt) => {
          t += dt;
          regen -= dt;
          if (regen <= 0) {
            bolt.set(a, b, 0.6);
            regen = 0.05;
          }
          bolt.opacity(Math.max(0, 1 - t / 0.4));
          if (t > 0.4) {
            bolt.dispose();
            return false;
          }
          return true;
        },
      });
    }
  }

  _dust(f, { big = false, dir = 1 }) {
    this.hit.dust(f.x, { big, dir: f.facing * dir });
  }

  update(dt) {
    this.active = this.active.filter((e) => e.update(dt));
  }

  clear() {
    // run every effect to completion instantly
    this.active.forEach((e) => {
      for (let i = 0; i < 200 && e.update(0.05); i++);
    });
    this.active = [];
  }
}
