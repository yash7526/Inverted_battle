import * as THREE from 'three';

// Pooled impact effects: spark particles, flash bursts, block hexes, ground dust and
// comic-book "POW!" lettering. Everything is pre-allocated — no garbage per hit.

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.beginPath();
  const spikes = 12;
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 === 0 ? 62 : 22 + Math.random() * 8;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,240,180,0.95)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grad;
  g.fill();
  return new THREE.CanvasTexture(c);
}

function hexTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 6;
  g.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g.lineTo(Math.cos(a) * 54, Math.sin(a) * 54);
  }
  g.stroke();
  g.globalAlpha = 0.25;
  g.fillStyle = '#fff';
  g.fill();
  return new THREE.CanvasTexture(c);
}

function wordTexture(word) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d');
  g.translate(256, 100);
  g.rotate(-0.12);
  // burst behind the word
  g.beginPath();
  for (let i = 0; i <= 28; i++) {
    const r = i % 2 ? 70 : 92;
    const a = (i / 28) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r * 2.3, Math.sin(a) * r * 0.95);
  }
  g.closePath();
  g.fillStyle = '#DB212A';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#111';
  g.stroke();
  g.font = '900 96px Bangers, Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = '#111';
  g.strokeText(word, 0, 4);
  g.fillStyle = '#FFD23F';
  g.fillText(word, 0, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
export class ParticleSystem {
  constructor(scene, max = 600, { additive = true, pixelRatio = 1 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 60);
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 320 * pixelRatio } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor; uniform float uScale;
        void main(){
          vAlpha = alpha; vColor = color;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha; varying vec3 vColor;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          if (a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor * (1.0 + a), a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, { count = 12, speed = 4, spread = 1, color = 0xffffff, size = 0.12, life = 0.4, gravity = -6, dir = null, up = 0 } = {}) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      let vx = (Math.random() * 2 - 1) * spread;
      let vy = (Math.random() * 2 - 1) * spread + up;
      let vz = (Math.random() * 2 - 1) * spread * 0.6;
      if (dir) {
        vx += dir[0];
        vy += dir[1];
        vz += dir[2];
      }
      const len = Math.hypot(vx, vy, vz) || 1;
      const sp = speed * (0.5 + Math.random() * 0.8);
      this.vel[i * 3] = (vx / len) * sp;
      this.vel[i * 3 + 1] = (vy / len) * sp;
      this.vel[i * 3 + 2] = (vz / len) * sp;
      const tint = 0.75 + Math.random() * 0.25;
      this.col[i * 3] = c.r * tint;
      this.col[i * 3 + 1] = c.g * tint;
      this.col[i * 3 + 2] = c.b * tint;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      const drag = Math.exp(-2.5 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k;
      this.size[i] = this.baseSize[i] * (0.4 + k * 0.6);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }

  dispose(scene) {
    scene.remove(this.points);
    this.geo.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
class SpritePool {
  constructor(scene, texture, count, { additive = true, depthTest = true } = {}) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.renderOrder = 6;
      scene.add(s);
      this.items.push({ sprite: s, t: 0, dur: 0, from: 1, to: 2, rot: 0 });
    }
    this.cursor = 0;
  }

  spawn(pos, { color = 0xffffff, from = 0.3, to = 1.4, dur = 0.18, rot = 0, map = null, opacity = 1 } = {}) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.sprite.position.copy(pos);
    it.sprite.material.color.set(color);
    if (map) {
      it.sprite.material.map = map;
      it.sprite.material.needsUpdate = true;
    }
    it.sprite.material.rotation = rot;
    it.sprite.visible = true;
    it.t = 0;
    it.dur = dur;
    it.from = from;
    it.to = to;
    it.opacity = opacity;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.sprite.visible) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) {
        it.sprite.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      const s = it.from + (it.to - it.from) * e;
      it.sprite.scale.set(s * (it.aspect || 1), s, 1);
      it.sprite.material.opacity = it.opacity * (1 - k * k);
    }
  }

  clear() {
    this.items.forEach((it) => (it.sprite.visible = false));
  }

  dispose(scene) {
    this.items.forEach((it) => {
      scene.remove(it.sprite);
      it.sprite.material.dispose();
    });
  }
}

// ---------------------------------------------------------------------------
export class HitEffects {
  constructor(scene, { pixelRatio = 1, low = false } = {}) {
    this.scene = scene;
    this.low = low;
    this.sparks = new ParticleSystem(scene, low ? 300 : 700, { pixelRatio });
    this.dustPS = new ParticleSystem(scene, 200, { additive: false, pixelRatio });
    this.glowTex = radialTexture();
    this.starTex = starTexture();
    this.hexTex = hexTexture();
    this.flashes = new SpritePool(scene, this.glowTex, 10);
    this.stars = new SpritePool(scene, this.starTex, 8);
    this.hexes = new SpritePool(scene, this.hexTex, 6);
    this.words = new SpritePool(scene, null, 4, { additive: false, depthTest: false });
    this.wordTex = new Map();
  }

  hit(pos, { heavy = false, color = null } = {}) {
    const c = color ?? (heavy ? 0xffb43a : 0xfff1a8);
    this.sparks.emit(pos.x, pos.y, pos.z, { count: heavy ? 26 : 14, speed: heavy ? 7 : 5, spread: 1, color: c, size: heavy ? 0.16 : 0.11, life: heavy ? 0.5 : 0.32, gravity: -9 });
    this.sparks.emit(pos.x, pos.y, pos.z, { count: 6, speed: 1.2, color: 0xffffff, size: 0.3, life: 0.15, gravity: 0 });
    this.flashes.spawn(pos, { color: c, from: 0.25, to: heavy ? 1.5 : 0.95, dur: heavy ? 0.2 : 0.14, opacity: 0.65 });
    this.stars.spawn(pos, { color: 0xffffff, from: 0.2, to: heavy ? 1.3 : 0.8, dur: heavy ? 0.18 : 0.12, rot: Math.random() * Math.PI, opacity: 0.85 });
  }

  block(pos, color = 0x9fe8ff, shield = false) {
    this.sparks.emit(pos.x, pos.y, pos.z, { count: 10, speed: 4, color, size: 0.1, life: 0.25, gravity: 0 });
    this.hexes.spawn(pos, { color, from: 0.4, to: shield ? 1.8 : 1.1, dur: 0.2, rot: Math.random() });
  }

  dust(x, { big = false, dir = 0 } = {}) {
    this.dustPS.emit(x, 0.08, 0.1, { count: big ? 22 : 10, speed: big ? 2.6 : 1.6, spread: 1, up: 0.4, color: 0xb59a78, size: big ? 0.5 : 0.32, life: big ? 0.8 : 0.5, gravity: 0.4, dir: [-dir * 1.5, 0.3, 0] });
  }

  comicText(pos, word) {
    if (!this.wordTex.has(word)) this.wordTex.set(word, wordTexture(word));
    const p = pos.clone();
    p.y += 0.55;
    p.z += 0.4;
    const it = this.words.spawn(p, { map: this.wordTex.get(word), from: 0.5, to: 1.0, dur: 0.6, rot: (Math.random() - 0.5) * 0.3 });
    it.aspect = 2.67;
  }

  update(dt) {
    this.sparks.update(dt);
    this.dustPS.update(dt);
    this.flashes.update(dt);
    this.stars.update(dt);
    this.hexes.update(dt);
    this.words.update(dt);
  }

  clear() {
    this.sparks.clear();
    this.dustPS.clear();
    this.flashes.clear();
    this.stars.clear();
    this.hexes.clear();
    this.words.clear();
  }

  dispose() {
    this.sparks.dispose(this.scene);
    this.dustPS.dispose(this.scene);
    [this.flashes, this.stars, this.hexes, this.words].forEach((p) => p.dispose(this.scene));
    [this.glowTex, this.starTex, this.hexTex, ...this.wordTex.values()].forEach((t) => t.dispose());
  }
}
