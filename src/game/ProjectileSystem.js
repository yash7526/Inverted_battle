import * as THREE from 'three';

// Projectiles thrown by special moves (e.g. Maddy's glowing physics textbook).
// Each projectile flies along the stage, can be blocked, cancels out another
// projectile it meets, and on contact plays a short sequence of hits.

function bookCoverTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#16325a';
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#e8b64a';
  g.lineWidth = 8;
  g.strokeRect(14, 14, 228, 292);
  g.fillStyle = '#e8b64a';
  g.font = 'bold 44px Teko, Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('PHYSICS', 128, 120);
  g.font = 'bold 26px Teko, Impact, sans-serif';
  g.fillText('VOL. 404', 128, 160);
  g.font = 'italic 34px serif';
  g.fillStyle = '#9ff4ff';
  g.fillText('E = mc²', 128, 240);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ProjectileSystem {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.list = [];
    this.coverTex = bookCoverTexture();
    this.glowTex = glowTexture();
  }

  _buildVisual(kind, color) {
    const g = new THREE.Group();
    if (kind === 'book') {
      const cover = new THREE.MeshStandardMaterial({ map: this.coverTex, roughness: 0.5, emissive: 0x2a5cff, emissiveIntensity: 0.25 });
      const pages = new THREE.MeshStandardMaterial({ color: 0xfff8e6, roughness: 0.8 });
      const edge = new THREE.MeshStandardMaterial({ color: 0x16325a, roughness: 0.5 });
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.12), [pages, edge, pages, pages, cover, edge]);
      book.castShadow = true;
      g.add(book);
      g.userData.spin = book;
    }
    const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    glowS.scale.set(1.3, 1.3, 1);
    g.add(glowS);
    return g;
  }

  spawn(owner, def) {
    const p0 = owner.limbWorld(def.from || 'handR').clone();
    const obj = this._buildVisual(def.kind || 'book', def.color ?? 0x5ad1ff);
    obj.position.set(p0.x + owner.facing * 0.2, owner.y + def.y, 0.1);
    this.scene.add(obj);
    this.list.push({
      owner,
      def,
      obj,
      x: obj.position.x,
      y: def.y + owner.y,
      dir: owner.facing,
      traveled: 0,
      stuck: null,
      hitIndex: 0,
      timer: 0,
      t: 0,
      dead: false,
    });
    this.audio.play('whoosh', 0.8);
  }

  update(dt, fighters, combat) {
    for (const p of this.list) {
      if (p.dead) continue;
      p.t += dt;
      const spin = p.obj.userData.spin;
      if (spin) {
        spin.rotation.z += dt * 14 * p.dir;
        spin.rotation.y = Math.sin(p.t * 6) * 0.4;
      }
      if (p.stuck) {
        // multi-hit while attached to the victim
        const v = p.stuck;
        p.x = v.x - p.dir * 0.3;
        p.timer -= dt;
        if (p.timer <= 0) {
          const hd = p.def.hits[p.hitIndex];
          combat.resolveProjectileHit(p, v, hd);
          p.hitIndex++;
          p.timer = p.def.interval ?? 0.12;
          if (p.hitIndex >= p.def.hits.length) this._kill(p, true);
        }
      } else {
        const step = p.def.speed * dt;
        p.x += p.dir * step;
        p.traveled += step;
        if (Math.random() < 0.7) this.effects.sparks.emit(p.x, p.y, 0.1, { count: 2, speed: 1.5, color: Math.random() < 0.5 ? 0x5ad1ff : 0xffd23f, size: 0.09, life: 0.4, gravity: 1 });
        if (p.traveled > p.def.range || Math.abs(p.x) > 12) this._kill(p, false);
        else {
          const target = fighters.find((f) => f !== p.owner);
          const [h0, h1] = target.hurtRange();
          if (!target.invulnerable && Math.abs(target.x - p.x) < 0.45 && p.y >= h0 - 0.1 && p.y <= h1 + 0.1) {
            const first = p.def.hits[0];
            if (target.canBlock(first, p.x)) {
              combat.resolveProjectileHit(p, target, first);
              this._kill(p, true);
            } else {
              p.stuck = target;
              p.timer = 0;
            }
          }
        }
        // projectiles cancel each other
        for (const q of this.list) {
          if (q !== p && !q.dead && q.owner !== p.owner && Math.abs(q.x - p.x) < 0.4) {
            this._kill(p, true);
            this._kill(q, true);
          }
        }
      }
      p.obj.position.set(p.x, p.y, 0.1);
    }
    this.list = this.list.filter((p) => !p.dead);
  }

  _kill(p, burst) {
    if (p.dead) return;
    p.dead = true;
    if (burst) {
      this.effects.hit(p.obj.position, { heavy: true, color: p.def.color ?? 0x5ad1ff });
      this.effects.sparks.emit(p.x, p.y, 0.1, { count: 30, speed: 6, color: 0xfff1a8, size: 0.12, life: 0.5 });
    }
    this.scene.remove(p.obj);
    p.obj.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
      if (o.isSprite) o.material.dispose();
    });
  }

  clear() {
    this.list.forEach((p) => this._kill(p, false));
    this.list = [];
  }
}
