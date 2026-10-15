import * as THREE from 'three';
import { Arena } from './Arena.js';

// Fort Courtyard — sandstone courtyard at sunset: fort wall with merlons,
// arched gateway, bastion towers crowned with chhatri domes, torches, matkas,
// Inverted banners and flags, trees and distant hills.

const rnd = (a, b) => a + Math.random() * (b - a);

export class FortArena extends Arena {
  constructor(opts) {
    super(opts);
    this.name = 'Fort Courtyard';
    this.limit = 7.6;
  }

  build() {
    const g = this.group;
    this.fog = new THREE.Fog(0xf0a46d, 28, 95);
    this.skyDome(['#1d3d6c', '#ef8a4a', '#ffd59a', '#b9825a']);
    this.standardLights({ hemiSky: 0xffe2bf, hemiGround: 0x7a4f33, hemi: 1.15, sunColor: 0xffd2a0, sun: 2.7, sunPos: [-8, 12, 8], fill: 0x9ec3ff, fillIntensity: 0.55 });

    // ---------- textures ----------
    const tiles = this.canvas(512, 512, (c, w, h) => {
      c.fillStyle = '#8d6a45';
      c.fillRect(0, 0, w, h);
      const n = 4;
      const s = w / n;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const l = rnd(-10, 10);
          c.fillStyle = `hsl(${30 + rnd(-3, 3)}, ${42 + rnd(-6, 6)}%, ${60 + l}%)`;
          c.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
          for (let k = 0; k < 140; k++) {
            c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,220' : '90,55,30'},${rnd(0.04, 0.12)})`;
            c.fillRect(x * s + rnd(4, s - 6), y * s + rnd(4, s - 6), rnd(1, 4), rnd(1, 4));
          }
          if (Math.random() < 0.3) {
            c.strokeStyle = 'rgba(90,60,35,0.35)';
            c.lineWidth = 1.5;
            c.beginPath();
            let px = x * s + rnd(10, s - 10);
            let py = y * s + rnd(10, s - 10);
            c.moveTo(px, py);
            for (let i = 0; i < 5; i++) c.lineTo((px += rnd(-14, 14)), (py += rnd(-14, 14)));
            c.stroke();
          }
        }
    }, { repeat: [10, 6] });

    const bricks = (base, hue = 28) =>
      this.canvas(512, 256, (c, w, h) => {
        c.fillStyle = '#7d5634';
        c.fillRect(0, 0, w, h);
        const bw = 64;
        const bh = 32;
        for (let y = 0; y < h / bh; y++)
          for (let x = -1; x < w / bw + 1; x++) {
            const ox = (y % 2) * (bw / 2);
            c.fillStyle = `hsl(${hue + rnd(-4, 4)}, ${45 + rnd(-8, 6)}%, ${base + rnd(-7, 6)}%)`;
            c.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
          }
        for (let k = 0; k < 900; k++) {
          c.fillStyle = `rgba(60,35,15,${rnd(0.03, 0.1)})`;
          c.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3));
        }
      });

    const wallTex = bricks(56);
    wallTex.repeat.set(14, 2.4);
    const towerTex = bricks(52, 24);
    towerTex.repeat.set(5, 3);
    const gateTex = bricks(48, 20);
    gateTex.repeat.set(0.3, 0.25);

    const medallion = this.canvas(1024, 1024, (c, w) => {
      const cx = w / 2;
      c.clearRect(0, 0, w, w);
      c.fillStyle = '#1B3A62';
      c.beginPath();
      c.arc(cx, cx, 500, 0, Math.PI * 2);
      c.fill();
      // mandala petals
      c.fillStyle = '#e1ad54';
      for (let ring = 0; ring < 2; ring++) {
        const petals = ring ? 24 : 16;
        const r0 = ring ? 300 : 170;
        const r1 = ring ? 410 : 290;
        for (let i = 0; i < petals; i++) {
          const a = (i / petals) * Math.PI * 2 + ring * 0.13;
          c.save();
          c.translate(cx, cx);
          c.rotate(a);
          c.beginPath();
          c.moveTo(0, r0);
          c.quadraticCurveTo(ring ? 26 : 40, (r0 + r1) / 2, 0, r1);
          c.quadraticCurveTo(ring ? -26 : -40, (r0 + r1) / 2, 0, r0);
          c.globalAlpha = ring ? 0.75 : 0.9;
          c.fill();
          c.restore();
        }
      }
      c.globalAlpha = 1;
      c.lineWidth = 26;
      c.strokeStyle = '#DB212A';
      c.beginPath();
      c.arc(cx, cx, 478, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 6;
      c.strokeStyle = '#ffffff';
      c.beginPath();
      c.arc(cx, cx, 440, 0, Math.PI * 2);
      c.stroke();
      // ring text
      c.font = 'bold 44px Teko, Bangers, Impact, sans-serif';
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      const text = 'INVERTED UNIVERSE  ★  BATTLE ARENA  ★  INVERTED UNIVERSE  ★  BATTLE ARENA  ★  ';
      for (let i = 0; i < text.length; i++) {
        const a = (i / text.length) * Math.PI * 2;
        c.save();
        c.translate(cx, cx);
        c.rotate(a);
        c.fillText(text[i], 0, -446 + 52);
        c.restore();
      }
      Arena.drawEmblem(c, cx, cx, 150, { fill: '#ffffff' });
      // wear
      for (let k = 0; k < 3000; k++) {
        c.fillStyle = `rgba(200,160,110,${rnd(0.05, 0.2)})`;
        c.fillRect(rnd(0, w), rnd(0, w), rnd(1, 4), rnd(1, 4));
      }
    }, { wrap: false });

    const banner = this.canvas(256, 512, (c, w, h) => {
      c.fillStyle = '#1B3A62';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#DB212A';
      c.fillRect(0, 0, w, 26);
      c.fillRect(0, h - 70, w, 26);
      c.fillStyle = '#e1ad54';
      c.fillRect(0, 26, w, 8);
      Arena.drawEmblem(c, w / 2, 170, 90, { ring: '#ffffff', bolt: '#FFD23F' });
      c.font = 'bold 54px Teko, Bangers, Impact, sans-serif';
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.fillText('INVERTED', w / 2, 340);
      c.font = 'bold 40px Teko, Bangers, Impact, sans-serif';
      c.fillStyle = '#FFD23F';
      c.fillText('UNIVERSE', w / 2, 390);
      // tassel edge
      c.fillStyle = '#e1ad54';
      for (let x = 0; x < w; x += 32) {
        c.beginPath();
        c.moveTo(x, h - 44);
        c.lineTo(x + 16, h);
        c.lineTo(x + 32, h - 44);
        c.fill();
      }
    }, { wrap: false });

    // ---------- floor ----------
    this.add(new THREE.PlaneGeometry(44, 26), this.mat(0xffffff, { map: tiles, roughness: 0.92 }), { rx: -Math.PI / 2, z: -2, cast: false });
    this.add(new THREE.CircleGeometry(3.4, 64), this.mat(0xffffff, { map: medallion, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), { rx: -Math.PI / 2, y: 0.005, cast: false });
    // raised stone border strip at the back of the fighting floor
    this.add(new THREE.BoxGeometry(30, 0.25, 0.8), this.mat(0xb98656), { y: 0.12, z: -5.0 });
    this.add(new THREE.BoxGeometry(30, 0.25, 0.8), this.mat(0xa77548), { y: 0.37, z: -5.5 });

    // ---------- fort wall ----------
    const wallMat = this.mat(0xffffff, { map: wallTex });
    const trimMat = this.mat(0xa66e43);
    this.add(new THREE.BoxGeometry(46, 4.2, 1.4), wallMat, { y: 2.1, z: -7.6 });
    this.add(new THREE.BoxGeometry(46, 0.3, 1.7), trimMat, { y: 4.25, z: -7.6 });
    this.add(new THREE.BoxGeometry(46, 0.35, 1.6), trimMat, { y: 0.17, z: -7.0 });
    const merlonGeo = new THREE.BoxGeometry(0.9, 0.85, 1.4);
    for (let x = -22; x <= 22; x += 1.6) {
      if (Math.abs(x) < 3.3) continue;
      this.add(merlonGeo, wallMat, { x, y: 4.8, z: -7.6 });
    }
    // jharokha balconies on the wall
    for (const x of [-6.5, 6.5]) {
      this.add(new THREE.BoxGeometry(1.8, 0.2, 0.7), trimMat, { x, y: 2.3, z: -6.65 });
      this.add(new THREE.BoxGeometry(1.6, 1.1, 0.1), this.mat(0x2b1a10), { x, y: 2.95, z: -6.88 });
      const roof = new THREE.SphereGeometry(1.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      this.add(roof, trimMat, { x, y: 3.5, z: -6.75, sx: 0.95, sy: 0.45, sz: 0.4 });
      for (const s of [-0.75, 0.75]) this.add(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), trimMat, { x: x + s, y: 2.95, z: -6.6 });
    }

    // ---------- gateway ----------
    // gate outline with the arched opening carved into it
    const outer = new THREE.Shape();
    outer.moveTo(-3.2, 0);
    outer.lineTo(-1.7, 0);
    outer.lineTo(-1.7, 3.2);
    outer.absarc(0, 3.2, 1.7, Math.PI, 0, true);
    outer.lineTo(1.7, 0);
    outer.lineTo(3.2, 0);
    outer.lineTo(3.2, 7.2);
    outer.lineTo(-3.2, 7.2);
    outer.closePath();
    const gateGeo = new THREE.ExtrudeGeometry(outer, { depth: 1.9, bevelEnabled: false, curveSegments: 20 });
    this.add(gateGeo, this.mat(0xffffff, { map: gateTex }), { z: -8.4 });
    this.add(new THREE.PlaneGeometry(3.4, 5), this.mat(0x24130a, { roughness: 1 }), { y: 2.5, z: -8.0, cast: false });
    // wooden doors ajar
    const doorMat = this.mat(0x6a3a1b, { roughness: 0.8 });
    this.add(new THREE.BoxGeometry(1.6, 4.4, 0.15), doorMat, { x: -2.0, y: 2.2, z: -7.4, ry: 1.2 });
    this.add(new THREE.BoxGeometry(1.6, 4.4, 0.15), doorMat, { x: 2.0, y: 2.2, z: -7.4, ry: -1.2 });
    this.add(new THREE.CircleGeometry(0.95, 40), this.mat(0xffffff, { map: this.canvas(256, 256, (c) => Arena.drawEmblem(c, 128, 128, 120, { fill: '#1B3A62', ring: '#DB212A', bolt: '#FFD23F' }), { wrap: false }), roughness: 0.5 }), { y: 5.9, z: -6.48, cast: false });
    for (const x of [-2.6, 2.6]) this.chhatri(x, 7.2, -7.45, 0.6);
    this.chhatri(0, 7.2, -7.45, 0.9);

    // ---------- bastion towers ----------
    const towerMat = this.mat(0xffffff, { map: towerTex });
    for (const s of [-1, 1]) {
      const x = s * 11;
      this.add(new THREE.CylinderGeometry(2.3, 2.7, 7.5, 28), towerMat, { x, y: 3.75, z: -7.5 });
      this.add(new THREE.CylinderGeometry(2.55, 2.55, 0.35, 28), trimMat, { x, y: 7.6, z: -7.5 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        this.add(new THREE.BoxGeometry(0.6, 0.7, 0.5), towerMat, { x: x + Math.cos(a) * 2.35, y: 8.1, z: -7.5 + Math.sin(a) * 2.35, ry: -a });
      }
      this.chhatri(x, 7.75, -7.5, 1.3);
    }

    // ---------- side parapets (stage boundaries) ----------
    for (const s of [-1, 1]) {
      this.add(new THREE.BoxGeometry(0.7, 1.1, 10), wallMat, { x: s * 8.55, y: 0.55, z: -1.8 });
      this.add(new THREE.BoxGeometry(0.9, 0.18, 10.2), trimMat, { x: s * 8.55, y: 1.15, z: -1.8 });
      for (let z = -6.3; z <= 2.8; z += 1.3) this.add(new THREE.BoxGeometry(0.6, 0.45, 0.6), wallMat, { x: s * 8.55, y: 1.45, z });
    }

    // ---------- banners ----------
    const bannerMat = this.mat(0xffffff, { map: banner, roughness: 0.9, side: THREE.DoubleSide });
    for (const x of [-4.2, 4.2, -14.5, 14.5]) {
      const geo = new THREE.PlaneGeometry(1.2, 2.4, 4, 8);
      const m = this.add(geo, bannerMat, { x, y: 2.75, z: -6.86, cast: false });
      const base = geo.attributes.position.array.slice();
      const phase = Math.random() * 6;
      this.animated.push((dt, t) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = base[i * 3 + 1];
          const k = (1.2 - y) / 2.4;
          p.setZ(i, Math.sin(t * 1.6 + phase + base[i * 3] * 2 + y) * 0.06 * k);
        }
        p.needsUpdate = true;
      });
      m.castShadow = false;
    }

    // ---------- flags on the wall ----------
    const flagTex = this.canvas(256, 160, (c, w, h) => {
      c.fillStyle = '#DB212A';
      c.fillRect(0, 0, w, h / 2);
      c.fillStyle = '#1B3A62';
      c.fillRect(0, h / 2, w, h / 2);
      Arena.drawEmblem(c, w / 2, h / 2, 56, { fill: '#ffffff' });
    }, { wrap: false });
    const flagMat = this.mat(0xffffff, { map: flagTex, side: THREE.DoubleSide, roughness: 0.9 });
    const poleMat = this.mat(0x3b2a1e, { metalness: 0.3, roughness: 0.6 });
    for (const x of [-8.5, 8.5, 0]) {
      const py = x === 0 ? 8.8 : 4.4;
      const h = x === 0 ? 2.0 : 3.0;
      this.add(new THREE.CylinderGeometry(0.05, 0.05, h, 8), poleMat, { x, y: py + h / 2, z: -7.4 });
      const geo = new THREE.PlaneGeometry(1.6, 1.0, 10, 4);
      geo.translate(0.8, 0, 0);
      this.add(geo, flagMat, { x, y: py + h - 0.55, z: -7.4 });
      const base = geo.attributes.position.array.slice();
      this.animated.push((dt, t) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const fx = base[i * 3];
          p.setZ(i, Math.sin(t * 5 + fx * 3.2 + x) * 0.14 * (fx / 1.6));
          p.setY(i, base[i * 3 + 1] - (fx / 1.6) * 0.06);
        }
        p.needsUpdate = true;
        geo.computeVertexNormals();
      });
    }

    // ---------- torches ----------
    const flameTex = this.canvas(64, 64, (c) => {
      const grad = c.createRadialGradient(32, 40, 2, 32, 36, 30);
      grad.addColorStop(0, 'rgba(255,255,220,1)');
      grad.addColorStop(0.3, 'rgba(255,190,60,0.9)');
      grad.addColorStop(1, 'rgba(255,80,0,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 64);
    }, { wrap: false });
    for (const x of [-5.8, 5.8]) {
      this.add(new THREE.BoxGeometry(0.55, 1.9, 0.55), this.mat(0xb17a4a), { x, y: 0.95, z: -6.2 });
      this.add(new THREE.CylinderGeometry(0.42, 0.22, 0.32, 16), this.mat(0x3a2a20, { metalness: 0.5, roughness: 0.4 }), { x, y: 2.05, z: -6.2 });
      const sprites = [];
      for (let i = 0; i < 2; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.position.set(x, 2.5, -6.2);
        g.add(sp);
        sprites.push(sp);
      }
      const light = this.low ? null : new THREE.PointLight(0xff9a3c, 6, 9, 2);
      if (light) {
        light.userData.animated = true;
        light.position.set(x, 2.7, -5.6);
        g.add(light);
      }
      const ph = Math.random() * 10;
      this.animated.push((dt, t) => {
        sprites.forEach((sp, i) => {
          const f = 1 + Math.sin(t * 13 + ph + i * 2) * 0.12 + Math.sin(t * 23 + i) * 0.08;
          sp.scale.set(0.8 * f, (1.3 + i * 0.3) * f, 1);
          sp.position.y = 2.55 + i * 0.12;
        });
        if (light) light.intensity = 6 + Math.sin(t * 17 + ph) * 1.2 + Math.sin(t * 7.3) * 0.8;
      });
    }

    // ---------- matkas (clay pots) ----------
    const potProfile = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      potProfile.push(new THREE.Vector2(0.05 + Math.sin(t * Math.PI) * 0.34 + (t > 0.85 ? (t - 0.85) * 0.8 : 0), t * 0.7));
    }
    const potGeo = new THREE.LatheGeometry(potProfile, 20);
    const potMat = this.mat(0xa4532c, { roughness: 0.75 });
    for (const [x, z, s] of [
      [-3.4, -6.1, 1],
      [-2.75, -6.3, 0.8],
      [-3.0, -5.85, 0.6],
      [3.6, -6.2, 1.1],
      [4.25, -6.0, 0.75],
      [-12.5, -5.2, 1.2],
      [12.8, -5.4, 1],
    ])
      this.add(potGeo, potMat, { x, z, y: 0.25, sx: s, sy: s, sz: s });

    // ---------- trees beyond the wall ----------
    const leaf = this.mat(0x3d6b2f, { flatShading: true, roughness: 0.9 });
    const leaf2 = this.mat(0x4f8236, { flatShading: true, roughness: 0.9 });
    const bark = this.mat(0x5a3b25);
    for (const [x, z, s] of [
      [-6, -12, 1.4],
      [7.5, -13, 1.7],
      [-17, -12, 1.6],
      [18, -11, 1.3],
      [1.5, -16, 1.2],
    ]) {
      this.add(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 5 * s, 8), bark, { x, y: 2.5 * s, z });
      for (let i = 0; i < 5; i++) {
        this.add(new THREE.IcosahedronGeometry(1.4 * s * rnd(0.8, 1.2), 1), i % 2 ? leaf : leaf2, { x: x + rnd(-1.4, 1.4) * s, y: 5.2 * s + rnd(-0.6, 1) * s, z: z + rnd(-1, 1) * s, cast: false });
      }
    }

    // ---------- distant hills + sun ----------
    const hillMat = this.mat(0xa66f4c, { flatShading: true });
    for (let i = 0; i < 9; i++) {
      this.add(new THREE.DodecahedronGeometry(rnd(8, 16), 0), hillMat, { x: -60 + i * 15 + rnd(-4, 4), y: -3, z: -55 - rnd(0, 15), sy: 0.45, cast: false, receive: false });
    }
    const sunTex = this.canvas(128, 128, (c) => {
      const grad = c.createRadialGradient(64, 64, 6, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,250,220,1)');
      grad.addColorStop(0.25, 'rgba(255,220,140,0.9)');
      grad.addColorStop(1, 'rgba(255,150,60,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 128, 128);
    }, { wrap: false });
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
    sun.position.set(-30, 14, -90);
    sun.scale.set(30, 30, 1);
    g.add(sun);

    // ---------- floating dust motes ----------
    const n = this.low ? 60 : 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rnd(-12, 12);
      pos[i * 3 + 1] = rnd(0.2, 5);
      pos[i * 3 + 2] = rnd(-6, 4);
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xffe2b0, size: 0.05, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(motes);
    this.animated.push((dt, t) => {
      const p = dgeo.attributes.position;
      for (let i = 0; i < n; i++) {
        let y = p.getY(i) + dt * 0.12;
        if (y > 5) y = 0.2;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.1);
      }
      p.needsUpdate = true;
    });
  }

  /** Domed pavilion (chhatri) — a signature of Rajput/Bundela architecture. */
  chhatri(x, y, z, s) {
    const stone = this.mat(0xd29a62);
    const dome = this.mat(0xe0ab70, { roughness: 0.7 });
    this.add(new THREE.CylinderGeometry(1.0 * s, 1.0 * s, 0.15 * s, 16), stone, { x, y: y + 0.07 * s, z });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.add(new THREE.CylinderGeometry(0.07 * s, 0.08 * s, 1.1 * s, 8), stone, { x: x + Math.cos(a) * 0.78 * s, y: y + 0.7 * s, z: z + Math.sin(a) * 0.78 * s });
    }
    this.add(new THREE.CylinderGeometry(1.15 * s, 1.05 * s, 0.14 * s, 16), stone, { x, y: y + 1.3 * s, z });
    this.add(new THREE.SphereGeometry(0.95 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), dome, { x, y: y + 1.35 * s, z, sy: 1.15 });
    this.add(new THREE.ConeGeometry(0.1 * s, 0.6 * s, 8), this.mat(0xe8b23c, { metalness: 0.6, roughness: 0.3 }), { x, y: y + 2.65 * s, z });
  }
}
