import * as THREE from 'three';

// Base stage: owns a root group, lights, sky dome and fog, plus helpers for procedural
// canvas textures. Subclasses add architecture/props in build() and animate them in
// update(). dispose() frees every geometry, material and texture it created.

export class Arena {
  constructor({ low = false } = {}) {
    this.low = low;
    this.group = new THREE.Group();
    this.limit = 7.5; // fighters are clamped to [-limit, limit] on X
    this.animated = [];
    this.textures = [];
    this.fog = null;
    this.background = null;
    this.name = 'Arena';
  }

  // ---------------------------------------------------------------- helpers
  canvas(w, h, draw, { repeat = null, srgb = true, wrap = true } = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    this.textures.push(t);
    return t;
  }

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
  }

  add(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true, receive = true, parent = this.group } = {}) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = cast && !this.low;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  skyDome(stops, { radius = 120 } = {}) {
    const geo = new THREE.SphereGeometry(radius, 32, 16);
    const uniforms = {
      c0: { value: new THREE.Color(stops[0]) },
      c1: { value: new THREE.Color(stops[1]) },
      c2: { value: new THREE.Color(stops[2]) },
      c3: { value: new THREE.Color(stops[3] ?? stops[2]) },
      uDim: { value: 1 },
    };
    this.skyUniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform float uDim; varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 col = h > 0.25 ? mix(c1, c0, smoothstep(0.25, 0.8, h))
                   : h > 0.0 ? mix(c2, c1, smoothstep(0.0, 0.25, h))
                   : mix(c2, c3, smoothstep(0.0, -0.3, h));
          gl_FragColor = vec4(col * uDim, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    this.group.add(m);
    return m;
  }

  standardLights({ hemiSky, hemiGround, hemi = 1.0, sunColor, sun = 2.4, sunPos = [-6, 11, 7], fill = 0x8fb7ff, fillIntensity = 0.6 }) {
    const h = new THREE.HemisphereLight(hemiSky, hemiGround, hemi);
    this.group.add(h);
    const d = new THREE.DirectionalLight(sunColor, sun);
    d.position.set(...sunPos);
    d.castShadow = true;
    const size = this.low ? 1024 : 2048;
    d.shadow.mapSize.set(size, size);
    d.shadow.camera.left = -14;
    d.shadow.camera.right = 14;
    d.shadow.camera.top = 10;
    d.shadow.camera.bottom = -6;
    d.shadow.camera.near = 1;
    d.shadow.camera.far = 40;
    d.shadow.bias = -0.0005;
    d.shadow.normalBias = 0.03;
    this.group.add(d, d.target);
    const f = new THREE.DirectionalLight(fill, fillIntensity);
    f.position.set(6, 4, 8);
    this.group.add(f);
    this.sun = d;
    this.hemi = h;
    return { hemi: h, sun: d, fill: f };
  }

  /** The Inverted Universe emblem (red ring + bolt) drawn into a 2D context. */
  static drawEmblem(g, cx, cy, r, { ring = '#DB212A', bolt = '#DB212A', fill = null } = {}) {
    if (fill) {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = ring;
    g.lineWidth = r * 0.16;
    g.beginPath();
    g.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
    g.stroke();
    const s = r / 50;
    g.fillStyle = bolt;
    g.beginPath();
    [
      [8, -38],
      [-20, 6],
      [-2, 6],
      [-10, 38],
      [22, -10],
      [3, -10],
    ].forEach(([x, y], i) => (i ? g.lineTo(cx + x * s, cy + y * s) : g.moveTo(cx + x * s, cy + y * s)));
    g.closePath();
    g.fill();
  }

  // ---------------------------------------------------------------- lifecycle
  build() {}

  update(dt, t) {
    for (const fn of this.animated) fn(dt, t);
  }

  /** Called on heavy impacts / thunder to briefly light the stage. */
  flash(amount) {
    this.flashAmt = Math.max(this.flashAmt || 0, amount);
  }

  /** Kill the stage lights for a while (Blackout's special). */
  darken(duration) {
    this.darkT = duration;
  }

  addTo(scene) {
    this.build();
    this.lights = [];
    this.group.traverse((o) => {
      if (o.isLight) {
        o.userData.base = o.intensity;
        this.lights.push(o);
      }
    });
    this.flashAmt = 0;
    this.dim = 0;
    this.darkT = 0;
    this.fogBase = this.fog ? this.fog.color.clone() : null;
    scene.add(this.group);
    scene.fog = this.fog;
    scene.background = this.background;
  }

  /** Called after update(): applies flash and darkness on top of the base lighting. */
  tick(dt) {
    this.flashAmt = Math.max(0, (this.flashAmt || 0) - dt * 4);
    this.darkT = Math.max(0, (this.darkT || 0) - dt);
    const want = this.darkT > 0 ? 1 : 0;
    this.dim += (want - this.dim) * (1 - Math.exp(-(want ? 14 : 5) * dt));
    const k = 1 - 0.88 * this.dim;
    for (const l of this.lights || []) {
      if (l.userData.animated) l.intensity *= k; // already set fresh by update()
      else l.intensity = l.userData.base * k + (l === this.hemi ? this.flashAmt * 1.2 : 0);
    }
    if (this.skyUniforms) this.skyUniforms.uDim.value = 1 - 0.8 * this.dim;
    if (this.fog && this.fogBase) this.fog.color.copy(this.fogBase).multiplyScalar(1 - 0.8 * this.dim);
  }

  dispose(scene) {
    scene.remove(this.group);
    const mats = new Set();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
      if (o.dispose && o.isLight) o.dispose();
    });
    mats.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    if (scene.fog === this.fog) scene.fog = null;
  }
}
