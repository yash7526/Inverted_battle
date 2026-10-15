import * as THREE from 'three';
import { dynamic, toon, glow, skinMat, fabricMat, metalMat, armorMat, cached, headGeo, limbGeo, latheGeo, sphereGeo, rboxGeo, cylGeo, torusGeo, bentConeGeo, part, buildFist, buildBoot, buildFace, canvasTex } from './ModelKit.js';
import { hit, move, makePoses } from './MoveData.js';

// SIMBA — the lightning-powered superhero of the Inverted Universe. Powerful,
// slower attacks, heavy knockback. Look taken from the supplied renders: blue suit,
// golden cape, gloves, belt and boots, blue helmet with a golden lightning crest,
// black visor with glowing green wave-lines and a big confident grin.

const BASE = import.meta.env.BASE_URL;

function visorTexture(lineColor) {
  return canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#04060a';
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.28)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = lineColor;
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.shadowColor = lineColor;
    g.shadowBlur = 10;
    for (const cx of [200, 312]) {
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        for (let y = 16; y <= 80; y += 2) {
          const x = cx + k * 20 + Math.sin(y * 0.2) * 6;
          if (y === 16) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  });
}

function boltShape(scale = 1) {
  const s = new THREE.Shape();
  [
    [0.02, 0.5],
    [-0.16, 0.06],
    [-0.02, 0.06],
    [-0.12, -0.32],
    [0.18, 0.14],
    [0.03, 0.14],
    [0.14, 0.5],
  ].forEach(([x, y], i) => (i ? s.lineTo(x * scale, y * scale) : s.moveTo(x * scale, y * scale)));
  s.closePath();
  return s;
}

function shieldShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(w / 2, -h * 0.05);
  s.quadraticCurveTo(w / 2, -h * 0.35, 0, -h / 2);
  s.quadraticCurveTo(-w / 2, -h * 0.35, -w / 2, -h * 0.05);
  s.closePath();
  return s;
}

export const SIMBA_PALETTES = [
  { suit: 0x2c66d4, suitDark: 0x1d4aa6, gold: 0xffc21a, skin: 0xe6a06a, visorLine: '#b6ff4a', emblemBolt: 0xdb212a, cape: 0xffbf1f },
  { suit: 0xdb212a, suitDark: 0x9e1219, gold: 0xffd23f, skin: 0xd8945f, visorLine: '#4af3ff', emblemBolt: 0x1b3a62, cape: 0x1b3a62 },
];

function capeTexture(base, trim) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // soft vertical drape shading
    for (let x = 0; x < w; x += 2) {
      const v = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 6);
      g.fillStyle = `rgba(0,0,0,${0.08 * v})`;
      g.fillRect(x, 0, 2, h);
    }
    g.fillStyle = trim;
    g.fillRect(0, h - 26, w, 14);
    g.fillRect(0, h - 8, w, 4);
    g.fillRect(4, 0, 6, h);
    g.fillRect(w - 10, 0, 6, h);
    // lion-and-bolt crest faintly woven into the cape
    g.globalAlpha = 0.16;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(w / 2, h * 0.45, 70, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.28;
    g.fillStyle = trim;
    g.beginPath();
    [[8, -50], [-30, 8], [-4, 8], [-16, 52], [32, -12], [6, -12]].forEach(([x, y], i) => (i ? g.lineTo(w / 2 + x, h * 0.45 + y) : g.moveTo(w / 2 + x, h * 0.45 + y)));
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  });
}

/** Small zig-zag electric arc ribbon (two crossed strips), re-randomised while visible. */
function makeArc(material) {
  const N = 7;
  const pos = new Float32Array((N + 1) * 4 * 3);
  const idx = [];
  for (let k = 0; k < 2; k++)
    for (let i = 0; i < N; i++) {
      const a = k * (N + 1) * 2 + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.userData.ownGeometry = true;
  mesh.userData.reroll = () => {
    const dir = new THREE.Vector3(Math.random() - 0.5, -0.4 - Math.random() * 0.6, Math.random() - 0.5).normalize();
    const len = 0.12 + Math.random() * 0.12;
    const w = 0.008;
    for (let k = 0; k < 2; k++)
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const jit = i === 0 || i === N ? 0 : 0.03;
        const cx = dir.x * len * t + (Math.random() - 0.5) * jit;
        const cy = -0.08 + dir.y * len * t + (Math.random() - 0.5) * jit;
        const cz = dir.z * len * t + (Math.random() - 0.5) * jit;
        const o = (k * (N + 1) + i) * 6;
        const ox = k ? 0 : w;
        const oz = k ? w : 0;
        pos.set([cx - ox, cy, cz - oz, cx + ox, cy, cz + oz], o);
      }
    geo.attributes.position.needsUpdate = true;
  };
  mesh.userData.reroll();
  return mesh;
}

function buildModel(rig, pal) {
  const p = rig.p;
  const R = p.headR;
  // cobalt technical suit with panel seams; brushed gold; polished helmet
  const suit = armorMat(pal.suit, { rough: 0.38, metal: 0.3, panels: true, repeat: [2, 3], envI: 0.55, rim: 0.16, rimColor: 0xbfe2ff });
  const suitSmooth = armorMat(pal.suit, { rough: 0.34, metal: 0.3, envI: 0.6, rim: 0.16, rimColor: 0xbfe2ff });
  const suitDark = armorMat(pal.suitDark, { rough: 0.45, metal: 0.25, envI: 0.45, rim: 0.1 });
  const gold = metalMat(pal.gold, { rough: 0.3, envI: 1.1, rim: 0.12 });
  const goldDark = metalMat(new THREE.Color(pal.gold).multiplyScalar(0.72), { rough: 0.38, envI: 0.9 });
  const skin = skinMat(pal.skin);
  const helmet = armorMat(pal.suit, { rough: 0.2, metal: 0.55, envI: 1.0, rim: 0.2, rimColor: 0xdff0ff });
  const visorTex = visorTexture(pal.visorLine);
  const visor = new THREE.MeshStandardMaterial({ map: visorTex, emissive: 0xffffff, emissiveMap: visorTex, emissiveIntensity: 0.9, roughness: 0.06, metalness: 0.5 });
  const red = toon(pal.emblemBolt, { rough: 0.35, envI: 0.5 });
  const capeMat = fabricMat(capeTexture('#' + new THREE.Color(pal.cape).getHexString(), '#' + new THREE.Color(pal.gold).multiplyScalar(0.85).getHexString()), { side: THREE.DoubleSide, repeat: [4, 6], sheen: 0.7, rough: 0.7 });
  const arcMat = new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const j = rig.j;

  // ---------------- head: lion helmet — mane, ears, brow plate, visor, bolt crest
  const head = new THREE.Group();
  head.position.y = R * 0.95;
  j.head.add(head);
  part(headGeo(R, { jaw: 0.05, chin: 0.16, cheek: 0.16, flat: 0.02 }), skin, head, { sx: 0.95, sz: 0.96 }); // square heroic jaw
  part(new THREE.SphereGeometry(R * 1.08, 44, 26, 0, Math.PI * 2, 0, Math.PI * 0.58), helmet, head, { y: R * 0.02, rx: -0.12, own: true });
  const visorGeo = new THREE.CylinderGeometry(R * 1.12, R * 1.06, R * 0.46, 44, 1, true, -1.3, 2.6);
  part(visorGeo, visor, head, { y: R * 0.08, rx: -0.06, own: true });
  // lion brow: a golden V-plate over the visor that runs up into the crest
  for (const s of [1, -1]) part(rboxGeo(R * 0.62, R * 0.12, R * 0.08, R * 0.03, 3), gold, head, { x: s * R * 0.3, y: R * 0.42, z: R * 0.98, rz: s * 0.32, rx: -0.3 });
  part(rboxGeo(R * 0.14, R * 0.5, R * 0.08, R * 0.04, 3), gold, head, { y: R * 0.66, z: R * 0.86, rx: -0.75 });
  // ear guards (gold discs) + small lion ears on top
  for (const s of [1, -1]) {
    part(cylGeo(R * 0.3, R * 0.3, R * 0.22, 28), helmet, head, { x: s * R * 0.98, y: -R * 0.02, rz: Math.PI / 2 });
    part(cylGeo(R * 0.2, R * 0.2, R * 0.25, 24), gold, head, { x: s * R * 1.0, y: -R * 0.02, rz: Math.PI / 2 });
    part(torusGeo(R * 0.27, R * 0.035, Math.PI * 2, 8, 28), goldDark, head, { x: s * R * 1.08, y: -R * 0.02, ry: Math.PI / 2 });
    const ear = new THREE.Group();
    ear.position.set(s * R * 0.62, R * 0.86, -R * 0.12);
    ear.rotation.set(-0.2, 0, -s * 0.5);
    head.add(ear);
    part(cached('simbaEar', () => new THREE.ConeGeometry(R * 0.2, R * 0.38, 4, 1)), helmet, ear, { y: R * 0.12, sz: 0.45, ry: Math.PI / 4 });
    part(cached('simbaEarIn', () => new THREE.ConeGeometry(R * 0.12, R * 0.24, 4, 1)), gold, ear, { y: R * 0.1, z: R * 0.04, sz: 0.3, ry: Math.PI / 4 });
  }
  // golden mane: two rows of swept blades fanning around the back of the helmet
  for (let row = 0; row < 2; row++) {
    const n = row ? 9 : 11;
    for (let i = 0; i < n; i++) {
      const phi = Math.PI * 0.42 + (i / (n - 1)) * Math.PI * 1.16 + (row ? 0.08 : 0); // back half, ear to ear
      const theta = row ? 1.65 : 1.25;
      const nrm = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
      const g = new THREE.Group();
      g.position.copy(nrm).multiplyScalar(R * 1.0);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
      g.rotateX(0.9);
      head.add(g);
      part(bentConeGeo(R * (row ? 0.17 : 0.2), R * (row ? 0.5 : 0.62), 0.5, 10), row ? goldDark : gold, g, { sz: 0.35 });
    }
  }
  const crestGeo = new THREE.ExtrudeGeometry(boltShape(0.62), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 3 });
  crestGeo.translate(0, 0, -0.025);
  part(crestGeo, gold, head, { x: 0.03, y: R * 1.12, z: 0.02, rz: -0.28, ry: 0.1, own: true });
  const face = buildFace(head, { R: R * 0.96, skin, eyes: false, brows: false, mouthY: -R * 0.48, mouthW: R * 0.36, noseR: R * 0.12, eyeY: -R * 0.02, lip: 0x4a1a12 });
  face.setDefault('grin');

  part(cylGeo(0.085, 0.1, 0.14, 18), suitDark, j.torso, { y: p.torsoLen + 0.02 });
  part(torusGeo(0.11, 0.028, Math.PI * 2, 10, 32), gold, j.torso, { y: p.torsoLen - 0.02, rx: Math.PI / 2, sy: 0.85 }); // gorget ring

  // ---------------- torso: heroic V-shape, chest plates, emblem
  const t = j.torso;
  const torsoProfile = [
    [-0.03, 0.17],
    [0.1, 0.175],
    [0.24, 0.2],
    [0.4, 0.255],
    [0.52, 0.27],
    [0.6, 0.22],
    [p.torsoLen + 0.02, 0.13],
  ];
  part(latheGeo(torsoProfile, { seg: 40 }), suit, t, { sz: 0.74 });
  for (const s of [1, -1]) {
    part(sphereGeo(0.135, 28, 20), suitSmooth, t, { x: s * 0.105, y: 0.44, z: 0.1, sx: 1.05, sy: 0.75, sz: 0.55 }); // pecs
    // shoulder pauldron: blue plate with a brushed-gold rim
    part(new THREE.SphereGeometry(0.15, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), suitSmooth, t, { x: s * 0.28, y: p.torsoLen - 0.05, rz: -s * 0.3, sz: 0.95, own: true });
    part(torusGeo(0.125, 0.016, Math.PI * 2, 8, 32), gold, t, { x: s * 0.31, y: p.torsoLen - 0.1, rx: Math.PI / 2, rz: -s * 0.3 });
    part(rboxGeo(0.035, 0.3, 0.02, 0.01), gold, t, { x: s * 0.17, y: 0.38, z: 0.15, rz: s * 0.55, rx: -0.25 });
    // cape clasp
    part(cylGeo(0.04, 0.04, 0.02, 20), gold, t, { x: s * 0.19, y: p.torsoLen - 0.05, z: 0.08, rx: Math.PI / 2 - 0.3 });
  }
  // abdominal plates: subtle stacked segments (panel lines do the fine detail)
  for (let r = 0; r < 3; r++) part(rboxGeo(0.17 - r * 0.012, 0.06, 0.03, 0.02, 3), suitDark, t, { y: 0.26 - r * 0.075, z: 0.125 - r * 0.003, rx: -0.05 });
  const shGeo = new THREE.ExtrudeGeometry(shieldShape(0.21, 0.24), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3 });
  part(shGeo, gold, t, { y: 0.44, z: 0.165, rx: -0.15, own: true });
  part(new THREE.ExtrudeGeometry(boltShape(0.34), { depth: 0.02, bevelEnabled: false }), red, t, { x: -0.005, y: 0.445, z: 0.205, rx: -0.15, rz: -0.2, own: true });

  // belt + hips
  part(latheGeo([[-0.15, 0.1], [-0.06, 0.17], [0.05, 0.19], [0.1, 0.18]], { seg: 32 }), suitDark, j.hips, { sz: 0.82 });
  part(torusGeo(0.19, 0.035, Math.PI * 2, 10, 40), gold, j.hips, { y: 0.07, rx: Math.PI / 2, sy: 0.82 });
  part(rboxGeo(0.1, 0.075, 0.03, 0.012), red, j.hips, { y: 0.07, z: 0.16 });

  // ---------------- cape (cloth simulated per vertex in update)
  const capeW = 0.64;
  const capeH = 1.1;
  const capeGeo = new THREE.PlaneGeometry(capeW, capeH, 10, 18);
  capeGeo.translate(0, -capeH / 2, 0);
  const capeBase = capeGeo.attributes.position.array.slice();
  dynamic(part(capeGeo, capeMat, t, { y: p.torsoLen - 0.03, z: -0.2, own: true }));
  part(torusGeo(0.17, 0.035, Math.PI, 8, 24), capeMat, t, { y: p.torsoLen - 0.02, z: -0.02, rx: Math.PI / 2, rz: Math.PI });

  // ---------------- arms: gold gauntlets with ridges and bolt fins
  const arcs = [];
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(limbGeo(0.1, 0.082, p.upperArm, { bulge: 0.1, seg: 22 }), suit, j['ua' + s]);
    part(limbGeo(0.084, 0.07, p.foreArm * 0.5, { bulge: 0.05 }), suit, j['la' + s]);
    part(cylGeo(0.112, 0.075, p.foreArm * 0.6, 28), gold, j['la' + s], { y: -p.foreArm * 0.62 });
    for (const k of [0.36, 0.52]) part(torusGeo(0.1 - k * 0.05, 0.013, Math.PI * 2, 8, 28), goldDark, j['la' + s], { y: -p.foreArm * (k + 0.1), rx: Math.PI / 2 });
    part(new THREE.ExtrudeGeometry(boltShape(0.22), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }), gold, j['la' + s], { x: side * 0.1, y: -p.foreArm * 0.6, ry: side * Math.PI / 2, own: true });
    buildFist(rig['hand' + s], gold, { size: 1.08, side });
    for (let k = 0; k < 3; k++) {
      const arc = dynamic(makeArc(arcMat));
      arc.visible = false;
      rig['hand' + s].add(arc);
      arcs.push(arc);
    }
  }

  // ---------------- legs + boots
  for (const s of ['L', 'R']) {
    part(limbGeo(0.13, 0.1, p.thigh, { bulge: 0.08, seg: 22 }), suit, j['th' + s]);
    part(rboxGeo(0.16, 0.12, 0.06, 0.03, 3), goldDark, j['th' + s], { y: -p.thigh * 0.98, z: 0.08 }); // knee guard
    part(limbGeo(0.1, 0.085, p.shin * 0.6, { bulge: 0.06 }), suit, j['sh' + s]);
    buildBoot(j['sh' + s], rig['foot' + s], { material: gold, sole: suitDark, shinLen: p.shin, flare: 0.14, trim: goldDark });
  }

  // ---------------- runtime: cape cloth, visor pulse, controlled lightning, face
  let time = 0;
  let arcTimer = 0;
  const pos = capeGeo.attributes.position;
  return {
    update(dt, f) {
      time += dt;
      face.update(dt, f);
      const speed = Math.min(1.4, (Math.abs(f.vx) + Math.abs(f.vy) * 0.6) / 8);
      const air = f.y > 0.05 ? 0.4 : 0;
      for (let i = 0; i < pos.count; i++) {
        const x0 = capeBase[i * 3];
        const y0 = capeBase[i * 3 + 1];
        const tt = -y0 / capeH; // 0 at the shoulders, 1 at the hem
        const flutter = Math.sin(time * (5 + speed * 8) + tt * 5 + x0 * 6) * (0.025 + speed * 0.07) * tt;
        const drape = Math.sin(x0 * 18) * 0.012 * tt; // vertical folds
        const lift = (speed + air) * 0.55 * tt * tt;
        pos.setXYZ(i, x0 * (1 + 0.5 * tt), y0 * (1 - lift * 0.5), -tt * (0.15 + lift * 0.9) - Math.abs(x0) * 0.08 * tt + flutter + drape);
      }
      pos.needsUpdate = true;
      capeGeo.computeVertexNormals();
      // electricity only while striking (and through specials) — never a constant glow
      const m = f.state === 'attack' ? f.move : null;
      const charged = m && (m.special || (f.moveTime > m.startup - 0.12 && f.moveTime < m.activeEnd + 0.06));
      visor.emissiveIntensity = (charged ? 1.4 : 0.75) + Math.sin(time * 5) * 0.2;
      arcTimer -= dt;
      const reroll = arcTimer <= 0;
      if (reroll) arcTimer = 0.045;
      for (const a of arcs) {
        a.visible = !!charged && Math.random() < 0.85;
        if (a.visible && reroll) a.userData.reroll();
      }
    },
  };
}

const P = makePoses({
  stance: {
    hips: [0, -0.28, 0],
    torso: [-0.02, 0.18, 0],
    head: [-0.05, 0.08, 0],
    uaL: [-0.62, 0, 0.42],
    laL: [-1.75, 0, 0],
    uaR: [-0.42, 0, -0.45],
    laR: [-1.8, 0, 0],
    thL: [-0.38, 0, 0.18],
    shL: [0.45, 0, 0],
    thR: [0.25, 0, -0.18],
    shR: [0.38, 0, 0],
  },
});

const HAYMAKER = { uaR: [-1.6, 0, -0.04], laR: [-0.05, 0, 0], torso: [0.22, 0.65, 0], hips: [0, 0.2, 0], thL: [-0.6, 0, 0.18], shL: [0.6, 0, 0], thR: [0.4, 0, -0.18], shR: [0.2, 0, 0], head: [0, -0.3, 0] };
const ARMS_UP = { uaL: [-2.9, 0, 0.25], laL: [-0.6, 0, 0], uaR: [-2.9, 0, -0.25], laR: [-0.6, 0, 0], torso: [-0.3, 0, 0], head: [-0.25, 0, 0] };
const SLAM = { hips: [0, 0, 0], thL: [-1.55, 0, 0.3], shL: [2.0, 0, 0], thR: [-0.7, 0, -0.3], shR: [2.3, 0, 0], torso: [1.0, 0, 0], head: [-0.6, 0, 0], uaL: [-1.05, 0, 0.3], laL: [-0.15, 0, 0], uaR: [-1.05, 0, -0.3], laR: [-0.15, 0, 0] };
const FLEX = { torso: [-0.1, 0, 0], head: [-0.2, 0, 0], uaL: [-0.1, 0, 1.45], laL: [-2.3, 0, 0], uaR: [-0.1, 0, -1.45], laR: [-2.3, 0, 0], thL: [0, 0, 0.22], shL: [0, 0, 0], thR: [0, 0, -0.22], shR: [0, 0, 0] };

export const Simba = {
  id: 'simba',
  name: 'SIMBA',
  title: 'The Lightning Lion',
  style: 'Power • Heavy hitter',
  description: 'Slower swings that hit like thunder. Plants an energy shield that turns away anything, then answers with lightning.',
  portrait: `${BASE}assets/portraits/simba.png`,
  art: `${BASE}assets/portraits/simba-action.png`,
  accent: '#2C66D4',
  trailColor: '#6fe3ff',
  stats: { power: 5, speed: 3, defense: 4, range: 4 },
  scale: 0.9,
  proportions: { legLen: 0.95, thigh: 0.43, shin: 0.41, footH: 0.11, torsoLen: 0.62, neck: 0.06, headR: 0.28, shoulderW: 0.3, hipW: 0.12, upperArm: 0.31, foreArm: 0.29 },
  walkSpeed: 2.7,
  backSpeed: 2.25,
  stride: 1.15,
  jumpVel: 9.6,
  jumpX: 3.0,
  dashSpeed: 10.5,
  weight: 1.3, // heavier: takes less knockback
  maxHealth: 140,
  hurtHeight: 1.9,
  crouchHeight: 1.16,
  shield: { color: 0x47c8ff, chipScale: 0.5, allHeights: true, energyPerBlock: 3 },
  palettes: SIMBA_PALETTES,
  build: buildModel,
  gltf: { clips: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', crouch: 'Crouch', block: 'Shield', hit: 'Hit', knockdown: 'Knockdown', down: 'Down', getup: 'GetUp', victory: 'Victory', defeat: 'Defeat', heavyPunch: 'Punch', powerKick: 'Kick', groundSlam: 'Slam', special: 'Special' } },

  poses: P,
  loops: {
    intro: [
      [0, FLEX],
      [0.55, FLEX],
      [0.8, { ...FLEX, uaL: [-0.1, 0, 1.3], laL: [-2.45, 0, 0], uaR: [-0.1, 0, -1.3], laR: [-2.45, 0, 0] }],
      [1.3, {}],
    ],
    victory: [
      [0, {}],
      [0.4, { torso: [-0.15, 0.1, 0], head: [-0.25, 0.2, 0], uaR: [-3.0, 0, -0.1], laR: [0, 0, 0], uaL: [0.35, 0, 0.75], laL: [-2.0, 0, 0], thL: [0, 0, 0.22], shL: [0, 0, 0], thR: [0, 0, -0.22], shR: [0, 0, 0] }],
      [1.2, { torso: [-0.15, 0.1, 0], head: [-0.25, 0.2, 0], uaR: [-3.0, 0, -0.1], laR: [0, 0, 0], uaL: [0.35, 0, 0.75], laL: [-2.0, 0, 0], thL: [0, 0, 0.22], shL: [0, 0, 0], thR: [0, 0, -0.22], shR: [0, 0, 0] }],
      [1.6, FLEX],
    ],
  },

  commands: {
    punch: 'heavyPunch',
    kick: 'powerKick',
    crouchPunch: 'lowPunch',
    crouchKick: 'groundSlam',
    airPunch: 'jumpKick',
    airKick: 'jumpKick',
    dashPunch: 'dashAttack',
    dashKick: 'dashAttack',
    special: 'special',
  },

  moveList: [
    ['Heavy Punch', 'F (→ F Hammer)'],
    ['Power Kick', 'G'],
    ['Ground Slam', 'S + G'],
    ['Forward Dash / Charge', 'Shift (+ F)'],
    ['Energy Shield', 'H (blocks high, mid & low)'],
    ['Diving Kick', 'W + G'],
    ['Simba Thunder Strike', 'R (50 energy)'],
  ],

  moves: {
    heavyPunch: move('heavyPunch', {
      name: 'Heavy Punch',
      duration: 0.56,
      hits: [hit(0.22, 0.29, 9, { height: 'high', reach: [0.2, 1.4], kb: 5, stun: 0.42, bstun: 0.22, heavy: true, sfx: 'heavy', limb: 'handR' })],
      cancels: { punch: 'hammer' },
      cancelAfter: 0.3,
      lunge: [{ at: 0.16, until: 0.26, speed: 2.5 }],
      anim: [
        [0, {}],
        [0.15, { uaR: [0.6, 0, -0.5], laR: [-1.7, 0, 0], torso: [0.05, -0.45, 0], hips: [0, -0.5, 0], thL: [-0.5, 0, 0.18], shL: [0.7, 0, 0] }],
        [0.24, HAYMAKER],
        [0.36, HAYMAKER],
        [0.56, {}],
      ],
    }),
    hammer: move('hammer', {
      name: 'Thunder Hammer',
      duration: 0.62,
      hits: [hit(0.27, 0.34, 10, { height: 'mid', y: [0.6, 1.9], reach: [0.2, 1.45], kb: 6.5, stun: 0.5, bstun: 0.25, heavy: true, sfx: 'heavy', limb: 'handR', spark: 'electric' })],
      lunge: [{ at: 0.2, until: 0.3, speed: 2 }],
      anim: [
        [0, HAYMAKER],
        [0.18, ARMS_UP],
        [0.3, { uaL: [-1.25, 0, 0.1], laL: [-0.2, 0, 0], uaR: [-1.25, 0, -0.1], laR: [-0.2, 0, 0], torso: [0.6, 0, 0], head: [0.1, 0, 0], thL: [-0.7, 0, 0.18], shL: [0.8, 0, 0] }],
        [0.42, { uaL: [-1.25, 0, 0.1], laL: [-0.2, 0, 0], uaR: [-1.25, 0, -0.1], laR: [-0.2, 0, 0], torso: [0.6, 0, 0], head: [0.1, 0, 0], thL: [-0.7, 0, 0.18], shL: [0.8, 0, 0] }],
        [0.62, {}],
      ],
    }),
    powerKick: move('powerKick', {
      name: 'Power Kick',
      duration: 0.64,
      hits: [hit(0.26, 0.35, 11, { height: 'mid', reach: [0.2, 1.7], kb: 7, stun: 0.45, bstun: 0.24, heavy: true, sfx: 'kick', limb: 'footR' })],
      anim: [
        [0, {}],
        [0.17, { thR: [-1.3, 0, -0.5], shR: [1.9, 0, 0], torso: [-0.1, 0.4, 0], hips: [0, 0.3, 0] }],
        [0.28, { thR: [-1.55, 0, -0.15], shR: [0.02, 0, 0], torso: [-0.45, 0.65, -0.15], hips: [0, 0.6, 0], uaL: [-0.6, 0, 0.9], uaR: [-0.2, 0, -0.8], laR: [-1.0, 0, 0], thL: [-0.1, 0, 0.1], shL: [0.15, 0, 0] }],
        [0.4, { thR: [-1.55, 0, -0.15], shR: [0.02, 0, 0], torso: [-0.45, 0.65, -0.15], hips: [0, 0.6, 0], uaL: [-0.6, 0, 0.9], uaR: [-0.2, 0, -0.8], laR: [-1.0, 0, 0], thL: [-0.1, 0, 0.1], shL: [0.15, 0, 0] }],
        [0.52, { thR: [-1.0, 0, -0.3], shR: [1.6, 0, 0] }],
        [0.64, {}],
      ],
    }),
    lowPunch: move('lowPunch', {
      name: 'Low Punch',
      duration: 0.36,
      base: 'crouch',
      crouch: true,
      hits: [hit(0.1, 0.16, 5, { height: 'low', reach: [0.2, 1.25], kb: 2, stun: 0.3, limb: 'handR' })],
      anim: [
        [0, {}],
        [0.11, { uaR: [-1.3, 0, -0.05], laR: [-0.1, 0, 0], torso: [0.55, 0.5, 0] }],
        [0.2, { uaR: [-1.3, 0, -0.05], laR: [-0.1, 0, 0], torso: [0.55, 0.5, 0] }],
        [0.36, {}],
      ],
    }),
    groundSlam: move('groundSlam', {
      name: 'Ground Slam',
      duration: 0.88,
      cooldown: 0.8,
      hits: [hit(0.42, 0.52, 12, { height: 'low', radial: true, reach: [-1.3, 2.0], kb: 4, launch: 6, kd: true, stun: 0.5, bstun: 0.3, chip: 0.15, sfx: 'heavy', heavy: true, limb: 'handR', spark: 'electric' })],
      fx: [{ at: 0.42, type: 'shockwave', color: 0x47c8ff }],
      anim: [
        [0, {}],
        [0.3, { ...ARMS_UP, thL: [-0.6, 0, 0.25], shL: [0.9, 0, 0], thR: [-0.2, 0, -0.25], shR: [0.8, 0, 0] }],
        [0.44, SLAM],
        [0.66, SLAM],
        [0.88, {}],
      ],
    }),
    jumpKick: move('jumpKick', {
      name: 'Diving Kick',
      duration: 0.55,
      base: 'jumpFall',
      air: true,
      hits: [hit(0.12, 0.38, 13, { y: [-0.5, 1.3], reach: [0.1, 1.55], kb: 5.5, stun: 0.48, bstun: 0.26, heavy: true, sfx: 'kick', limb: 'footR' })],
      anim: [
        [0, { noGround: true, thR: [-1.3, 0, 0], shR: [1.9, 0, 0], thL: [-1.2, 0, 0], shL: [1.9, 0, 0] }],
        [0.12, { noGround: true, thR: [-1.25, 0, -0.05], shR: [0.1, 0, 0], thL: [-1.1, 0, 0.05], shL: [0.4, 0, 0], torso: [-0.55, 0.2, 0], uaL: [-0.8, 0, 1.0], uaR: [-0.6, 0, -1.0] }],
        [0.4, { noGround: true, thR: [-1.25, 0, -0.05], shR: [0.1, 0, 0], thL: [-1.1, 0, 0.05], shL: [0.4, 0, 0], torso: [-0.55, 0.2, 0], uaL: [-0.8, 0, 1.0], uaR: [-0.6, 0, -1.0] }],
        [0.55, { noGround: true }],
      ],
    }),
    dashAttack: move('dashAttack', {
      name: 'Lion Charge',
      duration: 0.58,
      base: 'run',
      cooldown: 0.6,
      hits: [hit(0.1, 0.3, 11, { height: 'mid', reach: [0.0, 1.35], kb: 8, stun: 0.5, bstun: 0.26, heavy: true, sfx: 'heavy', limb: 'handL' })],
      lunge: [{ at: 0, until: 0.28, speed: 8.5 }],
      anim: [
        [0, {}],
        [0.1, { torso: [0.45, -0.9, 0], hips: [0, -0.6, 0], head: [-0.3, 0.6, 0], uaL: [-0.3, 0, 0.3], laL: [-1.9, 0, 0], uaR: [-0.8, 0, -0.3], laR: [-1.6, 0, 0], thL: [-0.9, 0, 0.15], shL: [0.9, 0, 0], thR: [0.4, 0, -0.15], shR: [0.6, 0, 0] }],
        [0.34, { torso: [0.45, -0.9, 0], hips: [0, -0.6, 0], head: [-0.3, 0.6, 0], uaL: [-0.3, 0, 0.3], laL: [-1.9, 0, 0], uaR: [-0.8, 0, -0.3], laR: [-1.6, 0, 0], thL: [-0.9, 0, 0.15], shL: [0.9, 0, 0], thR: [0.4, 0, -0.15], shR: [0.6, 0, 0] }],
        [0.58, P.stance],
      ],
    }),
    special: move('special', {
      name: 'Simba Thunder Strike',
      special: true,
      duration: 1.85,
      energyCost: 50,
      cooldown: 3,
      iframes: [0, 0.4],
      sfxStart: 'charge',
      cinematic: { duration: 0.6, slowmo: 0.5, zoom: true },
      impulses: [{ at: 0.85, vx: 4.5, vy: 9 }],
      hits: [
        hit(0.62, 0.76, 8, { height: 'mid', y: [0.5, 1.9], reach: [0.2, 4.2], kb: 1.2, stun: 0.95, bstun: 0.4, chip: 0.25, sfx: 'thunder', heavy: true, limb: 'handR', spark: 'electric' }),
        hit(1.47, 1.6, 16, { height: 'mid', y: [-0.2, 1.4], radial: true, reach: [-1.5, 2.5], kb: 5, launch: 8.5, kd: true, stun: 0.6, bstun: 0.35, chip: 0.25, sfx: 'thunder', heavy: true, limb: 'handR', spark: 'electric' }),
      ],
      fx: [
        { at: 0, type: 'aura', color: 0x47c8ff },
        { at: 0.45, type: 'skybolt' },
        { at: 0.62, type: 'beam' },
        { at: 1.47, type: 'thunderSlam' },
      ],
      anim: [
        [0, { uaL: [-0.4, 0, 1.1], laL: [-0.3, 0, 0], uaR: [-0.4, 0, -1.1], laR: [-0.3, 0, 0], thL: [-0.3, 0, 0.3], shL: [0.5, 0, 0], thR: [0.2, 0, -0.3], shR: [0.5, 0, 0], torso: [-0.1, 0, 0] }],
        [0.3, { uaL: [0.4, 0, 0.45], laL: [-2.2, 0, 0], uaR: [0.4, 0, -0.45], laR: [-2.2, 0, 0], torso: [-0.35, 0, 0], head: [-0.45, 0, 0], thL: [-0.5, 0, 0.3], shL: [0.8, 0, 0], thR: [0.1, 0, -0.3], shR: [0.8, 0, 0] }],
        [0.45, { uaR: [-3.0, 0, -0.1], laR: [0, 0, 0], uaL: [0.35, 0, 0.75], laL: [-2.0, 0, 0], torso: [-0.2, 0, 0], head: [-0.35, 0, 0], thL: [-0.2, 0, 0.25], shL: [0.3, 0, 0], thR: [0.1, 0, -0.25], shR: [0.3, 0, 0] }],
        [0.6, { uaR: [-3.0, 0, -0.1], laR: [0, 0, 0], uaL: [0.35, 0, 0.75], laL: [-2.0, 0, 0], torso: [-0.2, 0, 0], head: [-0.35, 0, 0] }],
        [0.66, { uaR: [-1.62, 0, 0], laR: [0, 0, 0], torso: [0.15, 0.6, 0], hips: [0, 0.2, 0], uaL: [-0.4, 0, 0.8], laL: [-1.4, 0, 0], thL: [-0.6, 0, 0.2], shL: [0.6, 0, 0], thR: [0.4, 0, -0.2], shR: [0.2, 0, 0] }],
        [0.78, { uaR: [-1.62, 0, 0], laR: [0, 0, 0], torso: [0.15, 0.6, 0], hips: [0, 0.2, 0], uaL: [-0.4, 0, 0.8], laL: [-1.4, 0, 0] }],
        [0.85, { thL: [-0.9, 0, 0.2], shL: [1.4, 0, 0], thR: [-0.5, 0, -0.2], shR: [1.4, 0, 0], torso: [0.4, 0, 0] }],
        [0.95, { noGround: true, ...ARMS_UP, thL: [-1.3, 0, 0.1], shL: [1.8, 0, 0], thR: [-1.0, 0, -0.1], shR: [1.6, 0, 0] }],
        [1.38, { noGround: true, ...ARMS_UP, thL: [-0.8, 0, 0.15], shL: [1.0, 0, 0], thR: [-0.6, 0, -0.15], shR: [1.0, 0, 0] }],
        [1.48, SLAM],
        [1.7, SLAM],
        [1.85, {}],
      ],
    }),
  },
};
