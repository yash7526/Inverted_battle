import * as THREE from 'three';
import { Arena } from './Arena.js';

// Indian City Rooftop — night-time terrace above a busy city: water tanks, dish
// antennas, festive string lights, an INVERTED ENERGY neon sign and a lit skyline.

const rnd = (a, b) => a + Math.random() * (b - a);

export class CityRooftopArena extends Arena {
  constructor(opts) {
    super(opts);
    this.name = 'Indian City Rooftop';
    this.limit = 7.4;
  }

  build() {
    const g = this.group;
    this.fog = new THREE.Fog(0x15203a, 25, 90);
    this.skyDome(['#05091a', '#16244a', '#4a3a6a', '#141a2c']);
    this.standardLights({ hemiSky: 0x7f8fd0, hemiGround: 0x2a1e2a, hemi: 0.9, sunColor: 0xbfd2ff, sun: 1.9, sunPos: [6, 12, 7], fill: 0xff8a5c, fillIntensity: 0.5 });

    const concrete = this.canvas(512, 512, (c, w, h) => {
      c.fillStyle = '#7d7a78';
      c.fillRect(0, 0, w, h);
      for (let k = 0; k < 6000; k++) {
        c.fillStyle = `rgba(${Math.random() < 0.5 ? '30,30,30' : '220,220,220'},${rnd(0.02, 0.08)})`;
        c.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3));
      }
      c.strokeStyle = 'rgba(40,40,40,0.5)';
      c.lineWidth = 3;
      for (let i = 0; i <= w; i += 128) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, h);
        c.moveTo(0, i);
        c.lineTo(w, i);
        c.stroke();
      }
      for (let k = 0; k < 8; k++) {
        c.fillStyle = `rgba(20,20,30,${rnd(0.08, 0.18)})`;
        c.beginPath();
        c.ellipse(rnd(0, w), rnd(0, h), rnd(20, 70), rnd(10, 40), rnd(0, 3), 0, Math.PI * 2);
        c.fill();
      }
    }, { repeat: [8, 5] });
    this.add(new THREE.PlaneGeometry(40, 24), this.mat(0xffffff, { map: concrete, roughness: 0.75, metalness: 0.05 }), { rx: -Math.PI / 2, z: -2, cast: false });

    const pad = this.canvas(512, 512, (c, w) => {
      c.strokeStyle = '#FFD23F';
      c.lineWidth = 18;
      c.beginPath();
      c.arc(w / 2, w / 2, 230, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 6;
      c.strokeStyle = '#ffffff';
      c.beginPath();
      c.arc(w / 2, w / 2, 200, 0, Math.PI * 2);
      c.stroke();
      Arena.drawEmblem(c, w / 2, w / 2, 130, { ring: '#DB212A', bolt: '#FFD23F' });
    }, { wrap: false });
    this.add(new THREE.CircleGeometry(3, 48), this.mat(0xffffff, { map: pad, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), { rx: -Math.PI / 2, y: 0.005, cast: false });

    // parapets
    const wallMat = this.mat(0xb7a99a, { roughness: 0.9 });
    const trim = this.mat(0xd8cbbb);
    this.add(new THREE.BoxGeometry(40, 1.2, 0.4), wallMat, { y: 0.6, z: -5.6 });
    this.add(new THREE.BoxGeometry(40, 0.12, 0.6), trim, { y: 1.26, z: -5.6 });
    for (const s of [-1, 1]) {
      this.add(new THREE.BoxGeometry(0.4, 1.2, 9), wallMat, { x: s * 8.3, y: 0.6, z: -1.2 });
      this.add(new THREE.BoxGeometry(0.6, 0.12, 9), trim, { x: s * 8.3, y: 1.26, z: -1.2 });
    }

    // water tanks on a steel stand
    const tankMat = this.mat(0x1a1a1a, { roughness: 0.5 });
    const steel = this.mat(0x6b6f78, { metalness: 0.6, roughness: 0.4 });
    for (const [x, z] of [
      [-6.2, -7.5],
      [-4.4, -7.8],
    ]) {
      for (const [dx, dz] of [
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6],
      ])
        this.add(new THREE.BoxGeometry(0.1, 2, 0.1), steel, { x: x + dx, y: 1, z: z + dz });
      this.add(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 20), tankMat, { x, y: 2.85, z });
      this.add(new THREE.CylinderGeometry(0.35, 0.85, 0.3, 20), tankMat, { x, y: 3.85, z });
    }
    // satellite dishes
    for (const [x, z, r] of [
      [5.2, -6.6, 0.6],
      [6.6, -6.4, 0.45],
    ]) {
      this.add(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), steel, { x, y: 0.7 + 0.6, z });
      this.add(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3), this.mat(0xe8e8e8, { side: THREE.DoubleSide }), { x, y: 2.2, z, rx: -1.0 });
    }
    // potted tulsi + crates
    for (const x of [-2.5, 2.8]) {
      this.add(new THREE.BoxGeometry(0.7, 0.7, 0.7), this.mat(0xc75b2c), { x, y: 0.35, z: -5.0 });
      this.add(new THREE.IcosahedronGeometry(0.45, 1), this.mat(0x3f7a33, { flatShading: true }), { x, y: 0.95, z: -5.0 });
    }

    // neon sign
    const signTex = this.canvas(1024, 256, (c, w, h) => {
      c.fillStyle = '#05060c';
      c.fillRect(0, 0, w, h);
      c.font = 'bold 150px Teko, Bangers, Impact, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowBlur = 30;
      c.shadowColor = '#ff2a3a';
      c.fillStyle = '#ff4a55';
      c.fillText('INVERTED', w * 0.36, h / 2 + 8);
      c.shadowColor = '#4af3ff';
      c.fillStyle = '#9ff8ff';
      c.fillText('ENERGY', w * 0.8, h / 2 + 8);
      Arena.drawEmblem(c, 70, h / 2, 56, { ring: '#FFD23F', bolt: '#FFD23F' });
    }, { wrap: false });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.6, roughness: 0.5 });
    const sign = this.add(new THREE.PlaneGeometry(8, 2), signMat, { y: 4.4, z: -9.5, cast: false });
    for (const x of [-3.4, 3.4]) this.add(new THREE.BoxGeometry(0.12, 4, 0.12), steel, { x, y: 2, z: -9.6 });
    const neonLight = new THREE.PointLight(0xff4a6a, this.low ? 0 : 14, 16, 2);
    neonLight.position.set(-1, 4, -8);
    const neonLight2 = new THREE.PointLight(0x4af3ff, this.low ? 0 : 10, 16, 2);
    neonLight2.position.set(2.5, 4, -8);
    neonLight.userData.animated = true;
    g.add(neonLight, neonLight2);
    this.animated.push((dt, t) => {
      const flicker = Math.random() < 0.015 ? 0.4 : 1;
      signMat.emissiveIntensity = 1.5 * flicker;
      neonLight.intensity = (this.low ? 0 : 14) * flicker;
    });
    sign.castShadow = false;

    // string lights
    const bulbColors = [0xffd23f, 0xff5a5a, 0x5ad1ff, 0x9dff6a];
    const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const bulbs = [];
    for (let strand = 0; strand < 2; strand++) {
      const z = strand ? -5.4 : -3.5;
      const y0 = strand ? 3.3 : 4.2;
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const t = i / 36;
        const x = -9 + t * 18;
        pts.push(new THREE.Vector3(x, y0 - Math.sin(t * Math.PI) * 0.9 - Math.sin(t * Math.PI * 3) * 0.12, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      this.add(new THREE.TubeGeometry(curve, 60, 0.012, 4), this.mat(0x111111), { cast: false });
      for (let i = 1; i < 36; i += 1) {
        const m = new THREE.MeshBasicMaterial({ color: bulbColors[i % 4] });
        this.add(bulbGeo, m, { x: pts[i].x, y: pts[i].y - 0.08, z, cast: false, receive: false });
        bulbs.push({ m, base: new THREE.Color(bulbColors[i % 4]), ph: i });
      }
    }
    this.animated.push((dt, t) => {
      bulbs.forEach((b) => b.m.color.copy(b.base).multiplyScalar(0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3 + b.ph))));
    });

    // skyline
    const windowTex = this.canvas(256, 512, (c, w, h) => {
      c.fillStyle = '#0d1222';
      c.fillRect(0, 0, w, h);
      for (let y = 10; y < h; y += 26)
        for (let x = 8; x < w; x += 22) {
          if (Math.random() < 0.45) {
            c.fillStyle = Math.random() < 0.8 ? `rgba(255,${200 + rnd(0, 40)},${120 + rnd(0, 60)},${rnd(0.6, 1)})` : 'rgba(150,220,255,0.9)';
            c.fillRect(x, y, 12, 14);
          }
        }
    });
    windowTex.repeat.set(1, 2);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x1b2238, map: windowTex, emissive: 0xffffff, emissiveMap: windowTex, emissiveIntensity: 0.9, roughness: 0.8 });
    for (let i = 0; i < 34; i++) {
      const w = rnd(3, 7);
      const h = rnd(6, 26);
      const d = rnd(3, 6);
      const x = -60 + i * 3.6 + rnd(-1, 1);
      const z = -20 - rnd(0, 30);
      const geo = new THREE.BoxGeometry(w, h, d);
      this.add(geo, towerMat, { x, y: h / 2 - 6, z, cast: false, receive: false });
      if (Math.random() < 0.25) this.add(new THREE.BoxGeometry(0.15, 3, 0.15), this.mat(0x222222), { x, y: h - 6 + 1.5, z, cast: false });
    }
    // moon
    const moonTex = this.canvas(128, 128, (c) => {
      const grad = c.createRadialGradient(64, 64, 20, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,250,235,1)');
      grad.addColorStop(0.45, 'rgba(255,245,220,1)');
      grad.addColorStop(0.5, 'rgba(200,210,255,0.35)');
      grad.addColorStop(1, 'rgba(120,140,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 128, 128);
    }, { wrap: false });
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
    moon.position.set(25, 26, -80);
    moon.scale.set(16, 16, 1);
    g.add(moon);
  }
}
