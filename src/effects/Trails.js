import * as THREE from 'three';

// Motion-smear trails: while an attack is in its swing, the striking limb leaves a
// fading ribbon that arcs back toward the body. Gives punches and kicks a readable,
// fluid arc (the 3D equivalent of a comic speed-smear).

const SAMPLES = 14;
const LIFE = 0.16;

class Ribbon {
  constructor(scene, color) {
    this.points = []; // {p: Vector3, q: Vector3, t}
    const n = SAMPLES * 2;
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    const idx = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(mix(uColor, vec3(1.0), vA * 0.6), vA * 0.75); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  push(p, q, now) {
    this.points.unshift({ p: p.clone(), q: q.clone(), t: now });
    if (this.points.length > SAMPLES) this.points.pop();
  }

  update(now) {
    while (this.points.length && now - this.points[this.points.length - 1].t > LIFE) this.points.pop();
    const n = this.points.length;
    for (let i = 0; i < SAMPLES; i++) {
      const pt = this.points[Math.min(i, n - 1)];
      const a = n >= 2 && i < n ? Math.max(0, 1 - (now - pt.t) / LIFE) * (1 - i / SAMPLES) : 0;
      const k = i * 2;
      if (pt) {
        this.pos.set([pt.p.x, pt.p.y, pt.p.z], k * 3);
        this.pos.set([pt.q.x, pt.q.y, pt.q.z], (k + 1) * 3);
      }
      this.alpha[k] = a;
      this.alpha[k + 1] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.mesh.visible = n >= 2;
  }

  clear() {
    this.points.length = 0;
    this.mesh.visible = false;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class Trails {
  constructor(scene) {
    this.scene = scene;
    this.ribbons = new Map(); // fighter → {limb → Ribbon}
    this.now = 0;
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
  }

  _get(f, limb) {
    let set = this.ribbons.get(f);
    if (!set) this.ribbons.set(f, (set = {}));
    if (!set[limb]) set[limb] = new Ribbon(this.scene, f.def.trailColor || f.def.accent || '#ffffff');
    return set[limb];
  }

  update(dt, fighters) {
    this.now += dt;
    for (const f of fighters) {
      if (f.state === 'attack' && f.move?.trail && f.vanish < 0.5) {
        for (const h of f.move.hits) {
          if (f.moveTime >= h.at - 0.06 && f.moveTime <= h.until + 0.02) {
            const r = this._get(f, h.limb);
            const p = f.limbWorld(h.limb, this._p);
            const q = f.limbWorld('torso', this._q);
            q.lerp(p, 0.55); // smear reaches 45% of the way back toward the body
            if (dt > 0) r.push(p, q, this.now);
          }
        }
      }
    }
    for (const set of this.ribbons.values()) for (const r of Object.values(set)) r.update(this.now);
  }

  /** Drop ribbons belonging to fighters no longer in play. */
  sync(fighters) {
    for (const [f, set] of this.ribbons) {
      if (!fighters.includes(f)) {
        Object.values(set).forEach((r) => r.dispose(this.scene));
        this.ribbons.delete(f);
      }
    }
  }

  clear() {
    for (const set of this.ribbons.values()) for (const r of Object.values(set)) r.clear();
  }
}
