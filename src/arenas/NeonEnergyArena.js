import * as THREE from 'three';
import { Arena } from './Arena.js';

// Neon Energy Arena — inside the Inverted Energy core: glowing grid floor, energy
// pylons, a rotating holographic emblem and pulsing rings of light.

export class NeonEnergyArena extends Arena {
  constructor(opts) {
    super(opts);
    this.name = 'Neon Energy Arena';
    this.limit = 7.4;
  }

  build() {
    const g = this.group;
    this.fog = new THREE.FogExp2(0x070b1c, 0.022);
    this.skyDome(['#02040c', '#0b1636', '#1B3A62', '#04060f']);
    this.standardLights({ hemiSky: 0x6fa8ff, hemiGround: 0x220814, hemi: 0.75, sunColor: 0xdbe8ff, sun: 1.6, sunPos: [-4, 12, 8], fill: 0xdb212a, fillIntensity: 0.8 });

    const grid = this.canvas(256, 256, (c, w, h) => {
      c.fillStyle = '#0a0f22';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#2bd8ff';
      c.lineWidth = 3;
      c.shadowBlur = 8;
      c.shadowColor = '#2bd8ff';
      c.strokeRect(1.5, 1.5, w - 3, h - 3);
      c.strokeStyle = 'rgba(43,216,255,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(w / 2, 0);
      c.lineTo(w / 2, h);
      c.moveTo(0, h / 2);
      c.lineTo(w, h / 2);
      c.stroke();
    }, { repeat: [20, 12] });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: grid, emissive: 0xffffff, emissiveMap: grid, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.5 });
    this.add(new THREE.PlaneGeometry(40, 24), floorMat, { rx: -Math.PI / 2, z: -2, cast: false });

    // central platform rings
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xdb212a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0x47c8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const r1 = this.add(new THREE.RingGeometry(3.3, 3.45, 96), ringMat, { rx: -Math.PI / 2, y: 0.02, cast: false });
    const r2 = this.add(new THREE.RingGeometry(2.4, 2.48, 6), ringMat2, { rx: -Math.PI / 2, y: 0.02, cast: false });
    const emblem = this.canvas(512, 512, (c, w) => Arena.drawEmblem(c, w / 2, w / 2, 220, { ring: '#DB212A', bolt: '#FFD23F' }), { wrap: false });
    const emMat = new THREE.MeshBasicMaterial({ map: emblem, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.add(new THREE.PlaneGeometry(3.2, 3.2), emMat, { rx: -Math.PI / 2, y: 0.03, cast: false });

    // holographic emblem in the background
    const holoMat = new THREE.MeshBasicMaterial({ map: emblem, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const holo = this.add(new THREE.PlaneGeometry(7, 7), holoMat, { y: 6, z: -12, cast: false });
    const halo = this.add(new THREE.TorusGeometry(4.3, 0.06, 8, 96), ringMat2, { y: 6, z: -12, cast: false });
    const halo2 = this.add(new THREE.TorusGeometry(4.8, 0.04, 8, 96), ringMat, { y: 6, z: -12, cast: false });

    // pylons with energy columns
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1B3A62, roughness: 0.35, metalness: 0.7 });
    const coreMats = [];
    for (const [x, z, col] of [
      [-9, -6, 0x47c8ff],
      [9, -6, 0x47c8ff],
      [-5.5, -8.5, 0xdb212a],
      [5.5, -8.5, 0xdb212a],
      [-14, -9, 0xffd23f],
      [14, -9, 0xffd23f],
    ]) {
      this.add(new THREE.CylinderGeometry(0.5, 0.7, 0.6, 8), pylonMat, { x, y: 0.3, z });
      this.add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8), pylonMat, { x, y: 6.3, z });
      const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      coreMats.push(m);
      this.add(new THREE.CylinderGeometry(0.22, 0.22, 5.7, 12, 1, true), m, { x, y: 3.3, z, cast: false });
      this.add(new THREE.CylinderGeometry(0.08, 0.08, 5.7, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), { x, y: 3.3, z, cast: false });
      if (!this.low && Math.abs(x) < 10) {
        const l = new THREE.PointLight(col, 8, 10, 2);
        l.position.set(x, 2.5, z + 0.8);
        g.add(l);
      }
    }

    // side barriers (light walls)
    const barrierMat = new THREE.MeshBasicMaterial({ color: 0x47c8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      this.add(new THREE.PlaneGeometry(8, 3), barrierMat, { x: s * 8.2, y: 1.5, z: -1.5, ry: Math.PI / 2, cast: false });
      this.add(new THREE.BoxGeometry(0.15, 0.15, 8), new THREE.MeshBasicMaterial({ color: 0x47c8ff }), { x: s * 8.2, y: 0.08, z: -1.5, cast: false });
    }

    // floating energy cubes
    const cubes = [];
    for (let i = 0; i < 16; i++) {
      const c = this.add(new THREE.OctahedronGeometry(0.25 + Math.random() * 0.3), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x47c8ff : 0xffd23f, wireframe: true }), {
        x: (Math.random() - 0.5) * 30,
        y: 3 + Math.random() * 6,
        z: -10 - Math.random() * 12,
        cast: false,
      });
      cubes.push(c);
    }

    this.animated.push((dt, t) => {
      holo.rotation.y = Math.sin(t * 0.5) * 0.5;
      halo.rotation.x = t * 0.4;
      halo2.rotation.y = t * 0.35;
      r2.rotation.z = t * 0.3;
      ringMat.opacity = 0.65 + Math.sin(t * 2.5) * 0.2;
      coreMats.forEach((m, i) => (m.opacity = 0.45 + Math.sin(t * 4 + i) * 0.2));
      floorMat.emissiveIntensity = 0.5 + Math.sin(t * 1.5) * 0.12;
      cubes.forEach((c, i) => {
        c.rotation.x += dt * 0.6;
        c.rotation.y += dt * 0.8;
        c.position.y += Math.sin(t + i) * dt * 0.2;
      });
      r1.material.opacity = ringMat.opacity;
    });
  }
}
