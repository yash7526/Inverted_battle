import * as THREE from 'three';
import { dynamic, toon, glow, armorMat, metalMat, rubberMat, fabricMat, limbGeo, latheGeo, sphereGeo, rboxGeo, cylGeo, torusGeo, taperTubeGeo, part, buildFist, buildBoot } from './ModelKit.js';
import { hit, move, makePoses } from './MoveData.js';

// BLACKOUT — an original Inverted Universe villain: the walking power cut.
// A hulking grappler in a cable-strung armoured suit with transformer coils on
// his back, ceramic insulator horns and a single flickering red eye. Slow, but
// his armored attacks shrug off hits, and his special plunges the stage into
// darkness and drains his rival's energy.

export const BLACKOUT_PALETTES = [
  { suit: 0x1b1d27, armor: 0x353a4d, trim: 0x4a5068, glow: 0xff2a44, copper: 0xc4733a, insulator: 0xe9e4da, cable: 0x101014 },
  { suit: 0x26201a, armor: 0x5a4a32, trim: 0x7a6544, glow: 0x3affd0, copper: 0x9aa6b8, insulator: 0x3a7bd5, cable: 0x14110d },
];

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

/** Hydraulic piston: a steel cylinder with a polished rod, from `from` toward `to` in the parent's space. */
function piston(parent, from, to, { cyl, rod, r = 0.022 }) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.Group();
  g.position.copy(a);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
  parent.add(g);
  part(cylGeo(r, r, len * 0.58, 14), cyl, g, { y: -len * 0.29 });
  part(cylGeo(r * 0.55, r * 0.55, len * 0.5, 12), rod, g, { y: -len * 0.72 });
  part(sphereGeo(r * 1.15, 12, 10), cyl, g);
  return g;
}

/** Stack of curved armour plates (pauldrons, abdomen) — layered, not one blob. */
function layeredPlates(parent, material, trimMat, { x = 0, y = 0, z = 0, rz = 0, count = 3, r = 0.2, step = 0.055 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.z = rz;
  parent.add(g);
  for (let i = 0; i < count; i++) {
    const rr = r * (1 - i * 0.09);
    part(new THREE.SphereGeometry(rr, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), material, g, { y: -i * step, sz: 0.92, own: true });
    part(torusGeo(rr * Math.sin(Math.PI * 0.42), 0.008, Math.PI * 2, 6, 32), trimMat, g, { y: -i * step + rr * Math.cos(Math.PI * 0.42), rx: Math.PI / 2, sy: 0.92, shadow: false });
  }
  return g;
}

function buildModel(rig, pal) {
  const p = rig.p;
  const R = p.headR;
  // gunmetal armour (worn, semi-metallic), matte plates, brushed steel, ribbed rubber joints
  const armor = armorMat(pal.armor, { rough: 0.36, metal: 0.65, envI: 0.85, rim: 0.14, rimColor: 0xff9aa5 });
  const matte = armorMat(pal.suit, { rough: 0.6, metal: 0.35, panels: true, repeat: [2, 2], envI: 0.5, rim: 0.12, rimColor: 0xff9aa5 });
  const steel = metalMat(0x8d939e, { rough: 0.28, envI: 1.0 });
  const chrome = metalMat(0xd8dde4, { rough: 0.12, brushed: false, envI: 1.2 });
  const rubber = rubberMat(0x121318, { ribbed: true });
  const under = fabricMat(pal.suit, { weave: 'knit', repeat: [8, 8], rough: 0.9, sheen: 0.2 });
  const copper = metalMat(pal.copper, { rough: 0.3, envI: 0.9 });
  const insul = toon(pal.insulator, { rough: 0.22, envI: 0.5, rim: 0.1 });
  const cable = rubberMat(pal.cable);
  const seam = glow(pal.glow);
  const eye = glow(pal.glow);
  const coreGlow = glow(pal.glow);
  const j = rig.j;

  // ---------------- head: armoured skull, overhanging brow, slit visor, one red eye
  const head = new THREE.Group();
  head.position.y = R * 0.9;
  j.head.add(head);
  part(rboxGeo(R * 1.7, R * 1.75, R * 1.75, R * 0.55, 6), armor, head, { y: R * 0.05 }); // skull
  part(rboxGeo(R * 1.95, R * 0.32, R * 0.7, R * 0.12, 4), armor, head, { y: R * 0.45, z: R * 0.62, rx: 0.28 }); // brow overhang
  // jaw guard: tapered, vented
  part(rboxGeo(R * 1.45, R * 0.75, R * 0.5, R * 0.18, 4), matte, head, { y: -R * 0.55, z: R * 0.62, rx: -0.12 });
  for (let i = 0; i < 4; i++) part(rboxGeo(R * 0.85, R * 0.055, R * 0.08, R * 0.02, 1), steel, head, { y: -R * 0.4 - i * R * 0.12, z: R * 0.9, rx: -0.12 });
  // visor slit with the eye in a recessed housing
  part(rboxGeo(R * 1.5, R * 0.2, R * 0.22, R * 0.06, 2), under, head, { y: R * 0.12, z: R * 0.8 });
  part(rboxGeo(R * 1.35, R * 0.04, R * 0.05, R * 0.015, 1), seam, head, { y: R * 0.12, z: R * 0.92, shadow: false });
  part(cylGeo(R * 0.34, R * 0.38, R * 0.18, 36), steel, head, { y: R * 0.12, z: R * 0.86, rx: Math.PI / 2 });
  const eyeMesh = dynamic(part(cylGeo(R * 0.24, R * 0.24, R * 0.14, 36), eye, head, { y: R * 0.12, z: R * 0.93, rx: Math.PI / 2, shadow: false }));
  part(torusGeo(R * 0.3, R * 0.035, Math.PI * 2, 8, 36), chrome, head, { y: R * 0.12, z: R * 0.96 });
  for (const s of [1, -1]) {
    // power-line insulators as horns
    const horn = new THREE.Group();
    horn.position.set(s * R * 0.6, R * 0.85, -R * 0.1);
    horn.rotation.z = -s * 0.35;
    head.add(horn);
    part(cylGeo(R * 0.12, R * 0.16, R * 0.2, 16), steel, horn, { y: -R * 0.05 });
    for (let k = 0; k < 4; k++) part(cylGeo(R * (0.3 - k * 0.04), R * (0.3 - k * 0.04), R * 0.09, 24), insul, horn, { y: R * 0.1 + k * R * 0.17 });
    part(cylGeo(R * 0.06, R * 0.06, R * 0.75, 10), copper, horn, { y: R * 0.38 });
    part(rboxGeo(R * 0.2, R * 0.55, R * 0.7, R * 0.08, 3), matte, head, { x: s * R * 0.92, y: -R * 0.05, z: R * 0.05 }); // cheek plates
  }

  // neck: ribbed rubber collar
  part(cylGeo(0.12, 0.15, 0.13, 22), rubber, j.torso, { y: p.torsoLen + 0.02 });

  // ---------------- torso: barrel chest, layered plates, energy core, back transformer
  const t = j.torso;
  part(latheGeo([[-0.03, 0.2], [0.12, 0.215], [0.28, 0.26], [0.44, 0.3], [0.56, 0.3], [0.64, 0.23], [p.torsoLen + 0.02, 0.15]], { seg: 40 }), under, t, { sz: 0.78 });
  for (const s of [1, -1]) part(rboxGeo(0.25, 0.26, 0.1, 0.05, 4), armor, t, { x: s * 0.125, y: 0.48, z: 0.2, ry: s * 0.3, rz: -s * 0.08 }); // pec plates
  for (let i = 0; i < 3; i++) part(rboxGeo(0.3 - i * 0.025, 0.075, 0.08, 0.03, 3), matte, t, { y: 0.3 - i * 0.075, z: 0.19 - i * 0.008, rx: 0.08 }); // abdomen segments
  // energy core: chrome ring, glowing disc, cracked bolt — brightens for specials
  part(torusGeo(0.085, 0.022, Math.PI * 2, 10, 40), chrome, t, { y: 0.47, z: 0.262 });
  const core = dynamic(part(cylGeo(0.07, 0.07, 0.03, 36), coreGlow, t, { y: 0.47, z: 0.255, rx: Math.PI / 2, shadow: false }));
  const sig = dynamic(part(new THREE.ExtrudeGeometry(boltShape(0.2), { depth: 0.01, bevelEnabled: false }), armor, t, { x: 0.005, y: 0.47, z: 0.27, rz: Math.PI - 0.2, own: true, shadow: false }));
  part(rboxGeo(0.34, 0.01, 0.01, 0.004, 1), seam, t, { y: 0.34, z: 0.245, shadow: false });
  // transformer on the back with copper windings
  part(cylGeo(0.14, 0.14, 0.42, 28), armor, t, { y: 0.42, z: -0.27, rz: Math.PI / 2 });
  for (let k = 0; k < 5; k++) part(torusGeo(0.145, 0.018, Math.PI * 2, 8, 28), copper, t, { x: -0.16 + k * 0.08, y: 0.42, z: -0.27, ry: Math.PI / 2 });
  for (const s of [1, -1]) {
    // layered pauldrons with glowing undersides
    layeredPlates(t, armor, seam, { x: s * 0.34, y: p.torsoLen - 0.02, rz: -s * 0.28, count: 3, r: 0.2, step: 0.05 });
    part(sphereGeo(0.13, 20, 16), rubber, t, { x: s * 0.33, y: p.torsoLen - 0.1 }); // shoulder joint
    part(taperTubeGeo([[s * 0.2, 0.42, -0.3], [s * 0.3, 0.62, -0.2], [s * 0.34, 0.7, 0.0], [s * 0.3, 0.56, 0.12]], 0.025, 0.02, { tubular: 16, radial: 6 }), cable, t, { own: true });
  }

  // hips: armoured belt, ribbed waist, blown-fuse buckle
  part(latheGeo([[-0.16, 0.12], [-0.06, 0.2], [0.05, 0.22], [0.1, 0.21]], { seg: 32 }), under, j.hips, { sz: 0.82 });
  part(cylGeo(0.21, 0.215, 0.08, 32), rubber, j.hips, { y: 0.12, sz: 0.82 });
  part(torusGeo(0.215, 0.035, Math.PI * 2, 8, 36), armor, j.hips, { y: 0.07, rx: Math.PI / 2, sy: 0.82 });
  part(cylGeo(0.035, 0.035, 0.12, 12), toon(0xe8e8e8, { rough: 0.2, envI: 0.6 }), j.hips, { y: 0.07, z: 0.19, rz: Math.PI / 2 });
  for (const x of [0.065, -0.065]) part(cylGeo(0.042, 0.042, 0.03, 14), copper, j.hips, { x, y: 0.07, z: 0.19, rz: Math.PI / 2 });
  for (const s of [1, -1]) part(rboxGeo(0.15, 0.2, 0.06, 0.03, 3), matte, j.hips, { x: s * 0.13, y: -0.08, z: 0.12, rz: s * 0.15, rx: 0.15 }); // tassets

  // ---------------- arms: hydraulics, ribbed elbows, heavy gauntlets, live cables
  const cableTips = [];
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(limbGeo(0.12, 0.1, p.upperArm, { bulge: 0.12, seg: 22 }), under, j['ua' + s]);
    part(rboxGeo(0.17, p.upperArm * 0.55, 0.2, 0.05, 3), armor, j['ua' + s], { y: -p.upperArm * 0.42, x: side * 0.03 }); // bicep plate
    piston(j['ua' + s], [side * 0.11, -0.05, -0.06], [side * 0.1, -p.upperArm - 0.02, -0.08], { cyl: steel, rod: chrome });
    part(sphereGeo(0.105, 20, 16), rubber, j['la' + s]); // elbow joint
    part(rboxGeo(0.25, p.foreArm * 0.78, 0.25, 0.07, 4), armor, j['la' + s], { y: -p.foreArm * 0.55 });
    part(rboxGeo(0.27, 0.06, 0.27, 0.025, 2), matte, j['la' + s], { y: -p.foreArm * 0.25 }); // cuff ring
    part(rboxGeo(0.018, p.foreArm * 0.6, 0.012, 0.005), seam, j['la' + s], { x: side * 0.126, y: -p.foreArm * 0.55, shadow: false });
    buildFist(rig['hand' + s], armor, { size: 1.32, side });
    const c = dynamic(new THREE.Group());
    c.position.set(-side * 0.1, -p.foreArm * 0.7, -0.08);
    j['la' + s].add(c);
    part(taperTubeGeo([[0, 0, 0], [0, -0.12, -0.05], [-side * 0.04, -0.28, -0.04], [-side * 0.02, -0.4, 0.02]], 0.018, 0.014, { tubular: 14, radial: 6 }), cable, c, { own: true });
    part(cylGeo(0.022, 0.016, 0.04, 10), copper, c, { x: -side * 0.02, y: -0.41, z: 0.02 });
    const tip = part(sphereGeo(0.03, 10, 8), seam, c, { x: -side * 0.02, y: -0.44, z: 0.02, shadow: false });
    cableTips.push({ group: c, tip, phase: Math.random() * 6 });
  }

  // ---------------- legs: thigh plates, ribbed knees, calf pistons, armoured boots
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(limbGeo(0.14, 0.11, p.thigh, { bulge: 0.08, seg: 22 }), under, j['th' + s]);
    part(rboxGeo(0.2, p.thigh * 0.62, 0.12, 0.05, 3), armor, j['th' + s], { y: -p.thigh * 0.42, z: 0.07 });
    part(sphereGeo(0.12, 20, 16), rubber, j['sh' + s]); // knee joint
    part(rboxGeo(0.2, 0.16, 0.1, 0.05, 3), matte, j['sh' + s], { y: -0.02, z: 0.1, rx: -0.15 }); // knee cap
    part(limbGeo(0.11, 0.095, p.shin * 0.6), under, j['sh' + s]);
    piston(j['sh' + s], [side * 0.08, -0.06, -0.1], [side * 0.07, -p.shin * 0.75, -0.11], { cyl: steel, rod: chrome, r: 0.02 });
    buildBoot(j['sh' + s], rig['foot' + s], { material: armor, sole: rubber, shinLen: p.shin, flare: 0.155, trim: matte });
  }

  let time = 0;
  let flick = 0;
  return {
    update(dt, f) {
      time += dt;
      flick -= dt;
      const attacking = f.state === 'attack';
      const special = attacking && f.move?.special;
      const hurt = f.state === 'hit' || f.state === 'knockdown' || f.state === 'down';
      // the eye flickers like a failing bulb; flares when attacking
      let b = attacking ? 1.6 : hurt ? 0.35 : 1;
      if (flick <= 0 && Math.random() < 0.02) flick = 0.08;
      if (flick > 0) b *= 0.25;
      eye.color.set(pal.glow).multiplyScalar(b);
      eyeMesh.scale.set(1, 1, attacking ? 1.15 : 1);
      // energy core: steady pulse, surges during specials and armored hits
      const surge = special ? 2.2 + Math.sin(time * 30) * 0.4 : attacking ? 1.4 : 1;
      coreGlow.color.set(pal.glow).multiplyScalar((0.8 + Math.sin(time * 3) * 0.2) * surge).lerp(new THREE.Color(0xffffff), Math.min(1, (f.armorFlash || 0) + (special ? 0.25 : 0)));
      core.scale.setScalar(special ? 1.15 : 1);
      const pulse = 0.75 + Math.sin(time * 3) * 0.25;
      seam.color.set(pal.glow).multiplyScalar(pulse * (special ? 1.6 : 1)).lerp(new THREE.Color(0xffffff), f.armorFlash || 0);
      sig.scale.setScalar(1 + (f.armorFlash || 0) * 0.3);
      for (const c of cableTips) {
        c.group.rotation.x = Math.sin(time * 2.2 + c.phase) * 0.18 - Math.min(0.6, Math.abs(f.vx) * 0.08);
        c.group.rotation.z = Math.sin(time * 1.7 + c.phase) * 0.12;
        c.tip.scale.setScalar(Math.random() < 0.15 ? 1.6 : 1);
      }
    },
  };
}

const P = makePoses({
  // brute stance: wide base, arms low and wide, head sunk between the shoulders
  stance: {
    hips: [0, -0.2, 0],
    torso: [0.22, 0.12, 0],
    head: [0.05, 0.05, 0],
    uaL: [-0.55, 0, 0.55],
    laL: [-1.25, 0, 0],
    uaR: [-0.45, 0, -0.6],
    laR: [-1.3, 0, 0],
    thL: [-0.42, 0, 0.26],
    shL: [0.6, 0, 0],
    thR: [0.18, 0, -0.26],
    shR: [0.5, 0, 0],
  },
  victory: {
    torso: [-0.1, 0, 0],
    head: [-0.2, 0, 0],
    uaL: [-0.3, 0, 1.4],
    laL: [-2.2, 0, 0],
    uaR: [-0.3, 0, -1.4],
    laR: [-2.2, 0, 0],
    thL: [-0.1, 0, 0.3],
    shL: [0.1, 0, 0],
    thR: [0.05, 0, -0.3],
    shR: [0.1, 0, 0],
  },
});

const HAMMER_WIND = { uaR: [0.3, 0, -0.9], laR: [-1.6, 0, 0], torso: [0.1, -0.6, 0], hips: [0, -0.6, 0], head: [0, 0.3, 0], thL: [-0.55, 0, 0.26], shL: [0.75, 0, 0] };
const HAMMER_HIT = { uaR: [-1.55, 0, -0.1], laR: [-0.1, 0, 0], torso: [0.35, 0.7, 0], hips: [0, 0.3, 0], head: [0.05, -0.4, 0], thL: [-0.7, 0, 0.26], shL: [0.8, 0, 0], thR: [0.4, 0, -0.26], shR: [0.25, 0, 0], uaL: [-0.3, 0, 0.7], laL: [-1.4, 0, 0] };
const UPPER_WIND = { uaL: [0.4, 0, 0.5], laL: [-2.3, 0, 0], torso: [0.6, -0.4, 0], head: [-0.2, 0.2, 0], thL: [-1.0, 0, 0.3], shL: [1.6, 0, 0], thR: [-0.3, 0, -0.3], shR: [1.5, 0, 0] };
const UPPER = { uaL: [-2.9, 0, 0.1], laL: [-0.4, 0, 0], torso: [-0.25, 0.35, 0], head: [-0.3, 0, 0], thL: [-0.5, 0, 0.26], shL: [0.6, 0, 0], thR: [0.3, 0, -0.26], shR: [0.4, 0, 0] };
const STOMP_UP = { thL: [-1.6, 0, 0.1], shL: [2.0, 0, 0], torso: [-0.1, 0, 0], uaL: [-0.5, 0, 0.9], uaR: [-0.5, 0, -0.9], thR: [-0.15, 0, -0.26], shR: [0.3, 0, 0] };
const STOMP_OUT = { thL: [-1.5, 0, 0.1], shL: [0.05, 0, 0], torso: [-0.3, -0.2, 0], hips: [0, -0.3, 0], uaL: [-0.6, 0, 1.0], uaR: [-0.4, 0, -1.0], thR: [0.1, 0, -0.26], shR: [0.2, 0, 0] };
const CHARGE = { torso: [0.75, 0, 0], head: [-0.6, 0, 0], uaL: [0.5, 0, 0.6], laL: [-1.7, 0, 0], uaR: [0.5, 0, -0.6], laR: [-1.7, 0, 0], thL: [-1.4, 0, 0.35], shL: [2.1, 0, 0], thR: [-0.6, 0, -0.35], shR: [2.2, 0, 0], hips: [0, 0, 0] };
const POUND = { torso: [1.15, 0, 0], head: [-0.8, 0, 0], uaL: [-1.2, 0, 0.15], laL: [-0.1, 0, 0], uaR: [-1.2, 0, -0.15], laR: [-0.1, 0, 0], thL: [-1.6, 0, 0.35], shL: [2.2, 0, 0], thR: [-0.8, 0, -0.35], shR: [2.4, 0, 0], hips: [0, 0, 0] };
const OVERHEAD = { uaL: [-3.0, 0, 0.2], laL: [-0.5, 0, 0], uaR: [-3.0, 0, -0.2], laR: [-0.5, 0, 0], torso: [-0.35, 0, 0], head: [-0.3, 0, 0], thL: [-0.3, 0, 0.3], shL: [0.4, 0, 0], thR: [0.1, 0, -0.3], shR: [0.4, 0, 0] };

export const Blackout = {
  id: 'blackout',
  name: 'BLACKOUT',
  title: 'The Walking Power Cut',
  style: 'Grappler • Armored',
  description: 'Slow, huge and hard to stop. His heaviest swings shrug off hits, and Total Blackout kills the lights and drains your energy.',
  portrait: null,
  art: null,
  accent: '#DB212A',
  trailColor: '#ff3a4a',
  stats: { power: 5, speed: 2, defense: 5, range: 3 },
  scale: 0.95,
  proportions: { legLen: 0.92, thigh: 0.43, shin: 0.4, footH: 0.11, torsoLen: 0.66, neck: 0.05, headR: 0.24, shoulderW: 0.34, hipW: 0.13, upperArm: 0.32, foreArm: 0.31 },
  walkSpeed: 2.3,
  backSpeed: 1.9,
  stride: 1.2,
  jumpVel: 9.0,
  jumpX: 2.8,
  gravityScale: 1.1,
  dashSpeed: 9.5,
  weight: 1.5,
  maxHealth: 150,
  hurtHeight: 1.95,
  crouchHeight: 1.2,
  palettes: BLACKOUT_PALETTES,
  build: buildModel,
  gltf: { clips: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', crouch: 'Crouch', block: 'Block', hit: 'Hit', knockdown: 'Knockdown', down: 'Down', getup: 'GetUp', victory: 'Victory', defeat: 'Defeat', fuseHammer: 'Punch', stomp: 'Kick', special: 'Blackout' } },

  poses: P,
  loops: {
    intro: [
      [0, POUND],
      [0.3, OVERHEAD],
      [0.55, POUND],
      [0.75, POUND],
      [1.3, {}],
    ],
    victory: [
      [0, {}],
      [0.4, OVERHEAD],
      [0.7, POUND],
      [1.1, POUND],
      [1.6, { torso: [-0.1, 0, 0], head: [-0.2, 0, 0], uaL: [-0.3, 0, 1.4], laL: [-2.2, 0, 0], uaR: [-0.3, 0, -1.4], laR: [-2.2, 0, 0], thL: [-0.1, 0, 0.3], shL: [0.1, 0, 0], thR: [0.05, 0, -0.3], shR: [0.1, 0, 0] }],
    ],
  },

  commands: {
    punch: 'fuseHammer',
    kick: 'stomp',
    crouchPunch: 'lowHook',
    crouchKick: 'gridSweep',
    airPunch: 'powerDrop',
    airKick: 'powerDrop',
    dashPunch: 'shortCircuit',
    dashKick: 'shortCircuit',
    special: 'special',
  },

  moveList: [
    ['Fuse Hammer', 'F (armored, → F Overload Uppercut)'],
    ['Transformer Stomp', 'G'],
    ['Low Hook', 'S + F'],
    ['Grid Sweep', 'S + G (knockdown)'],
    ['Power Drop', 'W + F / G'],
    ['Short-Circuit Charge', 'Shift + F (armored)'],
    ['Total Blackout', 'R (50 energy, drains energy)'],
  ],

  moves: {
    fuseHammer: move('fuseHammer', {
      name: 'Fuse Hammer',
      duration: 0.62,
      armor: [0.04, 0.24],
      hits: [hit(0.25, 0.32, 11, { height: 'high', reach: [0.2, 1.4], kb: 5.5, stun: 0.45, bstun: 0.24, heavy: true, sfx: 'heavy', limb: 'handR', spark: 'dark' })],
      cancels: { punch: 'overload' },
      cancelAfter: 0.32,
      lunge: [{ at: 0.18, until: 0.28, speed: 2.2 }],
      anim: [
        [0, {}],
        [0.18, HAMMER_WIND],
        [0.27, HAMMER_HIT],
        [0.4, HAMMER_HIT],
        [0.62, {}],
      ],
    }),
    overload: move('overload', {
      name: 'Overload Uppercut',
      duration: 0.72,
      hits: [hit(0.28, 0.36, 12, { height: 'mid', y: [0.5, 2.2], reach: [0.1, 1.35], kb: 3.5, launch: 8, kd: true, heavy: true, sfx: 'heavy', limb: 'handL', spark: 'dark' })],
      lunge: [{ at: 0.2, until: 0.32, speed: 2.4 }],
      anim: [
        [0, HAMMER_HIT],
        [0.2, UPPER_WIND],
        [0.31, UPPER],
        [0.46, UPPER],
        [0.72, {}],
      ],
    }),
    stomp: move('stomp', {
      name: 'Transformer Stomp',
      duration: 0.66,
      hits: [hit(0.27, 0.35, 11, { height: 'mid', reach: [0.2, 1.55], kb: 8, stun: 0.45, bstun: 0.26, heavy: true, sfx: 'kick', limb: 'footL' })],
      anim: [
        [0, {}],
        [0.18, STOMP_UP],
        [0.29, STOMP_OUT],
        [0.42, STOMP_OUT],
        [0.54, STOMP_UP],
        [0.66, {}],
      ],
    }),
    lowHook: move('lowHook', {
      name: 'Low Hook',
      duration: 0.4,
      base: 'crouch',
      crouch: true,
      hits: [hit(0.13, 0.2, 6, { height: 'low', reach: [0.2, 1.2], kb: 2.2, stun: 0.32, limb: 'handR', spark: 'dark' })],
      anim: [
        [0, {}],
        [0.12, { uaR: [-1.2, 0, -0.4], laR: [-0.4, 0, 0], torso: [0.6, 0.6, 0] }],
        [0.22, { uaR: [-1.2, 0, -0.4], laR: [-0.4, 0, 0], torso: [0.6, 0.6, 0] }],
        [0.4, {}],
      ],
    }),
    gridSweep: move('gridSweep', {
      name: 'Grid Sweep',
      duration: 0.76,
      base: 'crouch',
      crouch: true,
      cooldown: 0.5,
      hits: [hit(0.26, 0.36, 9, { height: 'low', reach: [0.2, 1.55], kb: 3, kd: true, launch: 4, sfx: 'heavy', heavy: true, limb: 'footL', spark: 'dark' })],
      anim: [
        [0, {}],
        [0.16, { root: [0, 1.0, 0], thL: [-1.1, 0, 0.9], shL: [0.5, 0, 0], torso: [0.7, -0.5, 0], uaR: [-0.6, 0, -0.9], laR: [-0.3, 0, 0] }],
        [0.3, { root: [0, -0.45, 0], thL: [-1.45, 0, 0.1], shL: [0.15, 0, 0], torso: [0.7, 0.3, 0], uaR: [-0.6, 0, -0.9], laR: [-0.3, 0, 0] }],
        [0.46, { root: [0, -0.55, 0], thL: [-1.45, 0, 0.1], shL: [0.2, 0, 0], torso: [0.7, 0.3, 0] }],
        [0.76, {}],
      ],
    }),
    powerDrop: move('powerDrop', {
      name: 'Power Drop',
      duration: 0.55,
      base: 'jumpFall',
      air: true,
      hits: [hit(0.1, 0.4, 14, { y: [-0.6, 1.0], reach: [-0.2, 1.3], kb: 5, stun: 0.5, bstun: 0.28, heavy: true, sfx: 'heavy', limb: 'torso', spark: 'dark' })],
      impulses: [{ at: 0.08, vx: 1.5, vy: -6 }],
      fx: [{ at: 0.3, type: 'shockwave', color: 0xff3355 }],
      anim: [
        [0, { noGround: true, ...OVERHEAD }],
        [0.1, { noGround: true, torso: [0.6, 0, 0], head: [-0.4, 0, 0], uaL: [-1.9, 0, 0.3], laL: [-0.5, 0, 0], uaR: [-1.9, 0, -0.3], laR: [-0.5, 0, 0], thL: [-1.2, 0, 0.3], shL: [1.6, 0, 0], thR: [-1.0, 0, -0.3], shR: [1.6, 0, 0] }],
        [0.4, { noGround: true, torso: [0.6, 0, 0], head: [-0.4, 0, 0], uaL: [-1.9, 0, 0.3], laL: [-0.5, 0, 0], uaR: [-1.9, 0, -0.3], laR: [-0.5, 0, 0], thL: [-1.2, 0, 0.3], shL: [1.6, 0, 0], thR: [-1.0, 0, -0.3], shR: [1.6, 0, 0] }],
        [0.55, { noGround: true }],
      ],
    }),
    shortCircuit: move('shortCircuit', {
      name: 'Short-Circuit Charge',
      duration: 0.66,
      base: 'run',
      cooldown: 0.7,
      armor: [0, 0.32],
      hits: [hit(0.12, 0.32, 12, { height: 'mid', reach: [0.0, 1.35], kb: 8.5, stun: 0.5, bstun: 0.28, heavy: true, sfx: 'heavy', limb: 'torso', spark: 'dark' })],
      lunge: [{ at: 0, until: 0.32, speed: 8 }],
      anim: [
        [0, {}],
        [0.12, { torso: [0.55, -1.0, 0], hips: [0, -0.7, 0], head: [-0.3, 0.7, 0], uaL: [-0.4, 0, 0.3], laL: [-1.9, 0, 0], uaR: [-0.8, 0, -0.3], laR: [-1.6, 0, 0], thL: [-0.9, 0, 0.2], shL: [0.9, 0, 0], thR: [0.45, 0, -0.2], shR: [0.6, 0, 0] }],
        [0.38, { torso: [0.55, -1.0, 0], hips: [0, -0.7, 0], head: [-0.3, 0.7, 0], uaL: [-0.4, 0, 0.3], laL: [-1.9, 0, 0], uaR: [-0.8, 0, -0.3], laR: [-1.6, 0, 0], thL: [-0.9, 0, 0.2], shL: [0.9, 0, 0], thR: [0.45, 0, -0.2], shR: [0.6, 0, 0] }],
        [0.66, P.stance],
      ],
    }),
    special: move('special', {
      name: 'Total Blackout',
      special: true,
      duration: 1.6,
      energyCost: 50,
      cooldown: 3,
      armor: [0, 0.75],
      iframes: [0, 0.15],
      sfxStart: 'charge',
      cinematic: { duration: 0.6, slowmo: 0.55 },
      aiRange: 3,
      hits: [hit(0.78, 0.92, 18, { height: 'low', y: [0, 1.5], radial: true, reach: [-2.4, 3.2], kb: 5, launch: 7.5, kd: true, bstun: 0.4, chip: 0.25, drain: 30, sfx: 'thunder', heavy: true, limb: 'handR', spark: 'dark' })],
      fx: [
        { at: 0, type: 'darkness', duration: 0.85 },
        { at: 0, type: 'aura', color: 0xff2a44, duration: 0.8 },
        { at: 0.78, type: 'darkPulse' },
      ],
      anim: [
        [0, {}],
        [0.25, OVERHEAD],
        [0.6, { ...OVERHEAD, torso: [-0.45, 0, 0], head: [-0.4, 0, 0] }],
        [0.8, POUND],
        [1.15, POUND],
        [1.6, {}],
      ],
    }),
  },
};
