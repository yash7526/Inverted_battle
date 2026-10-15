import * as THREE from 'three';
import { toon, skinMat, fabricMat, hairMat, metalMat, rubberMat, foldify, canvasTex, headGeo, limbGeo, latheGeo, sphereGeo, rboxGeo, cylGeo, torusGeo, bentConeGeo, part, plaidTex, denimTex, buildFist, buildSneaker, buildFace } from './ModelKit.js';
import { hit, move, makePoses, LIMB } from './MoveData.js';

// SAMBHU — the e-rickshaw driver hero of the Inverted Universe. Balanced, agile,
// approachable. Look taken from the supplied render: spiky black quiff, open
// yellow plaid shirt with rolled sleeves, black tee with a red circle, blue
// trousers and yellow sneakers.

const BASE = import.meta.env.BASE_URL;

export const SAMBHU_PALETTES = [
  { skin: 0xd99a6c, hair: 0x141414, shirt: '#f4c321', plaidLine: '#c8811b', plaidThin: '#8a4b0c', tee: 0x161616, logo: 0xe02b2b, pants: '#4a8ae0', shoe: 0xf2c11d, sole: 0xffffff },
  // alternate colours for mirror matches
  { skin: 0xc98b5e, hair: 0x1b1b1b, shirt: '#db212a', plaidLine: '#8d0f15', plaidThin: '#ffffff', tee: 0xf2f2f2, logo: 0x1b3a62, pants: '#27344d', shoe: 0xffffff, sole: 0xdb212a },
];

/** Place a hair spike on the skull surface, pointing outward then swept back. */
function tuft(head, mat, R, theta, phi, r, h, bend, tilt = 0, flat = 0.62) {
  const n = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
  const g = new THREE.Group();
  g.position.copy(n).multiplyScalar(R * 0.88);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  g.rotateX(-tilt);
  g.rotateY(phi * 0.15);
  head.add(g);
  part(bentConeGeo(r, h, bend, 12), mat, g, { sz: flat });
}

/** Stitched placket / seam strip texture: fabric colour with a dashed thread line. */
function stitchTex(base, thread) {
  return canvasTex(
    32,
    128,
    (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      g.fillStyle = thread;
      for (let y = 0; y < h; y += 10) g.fillRect(w * 0.7, y, 2, 6);
    },
    { repeat: [1, 3] }
  );
}

function buildModel(rig, pal) {
  const p = rig.p;
  const skin = skinMat(pal.skin);
  const hair = hairMat(pal.hair);
  const plaidMap = plaidTex(pal.shirt, pal.plaidLine, pal.plaidThin, { repeat: [4, 3] });
  const plaid = fabricMat(plaidMap, { side: THREE.DoubleSide, repeat: [10, 8] });
  const plaidArm = fabricMat(plaidTex(pal.shirt, pal.plaidLine, pal.plaidThin, { repeat: [2, 1.5] }), { repeat: [6, 4] });
  const placket = fabricMat(stitchTex(pal.shirt, pal.plaidThin), { repeat: [2, 8] });
  const tee = fabricMat(pal.tee, { weave: 'knit', repeat: [10, 10], sheen: 0.4 });
  const logo = fabricMat(pal.logo, { weave: 'knit', repeat: [4, 4], rough: 0.7 });
  const denim = fabricMat(denimTex(pal.pants), { weave: 'twill', repeat: [6, 10], rough: 0.8, sheen: 0.35 });
  const seam = toon(new THREE.Color(pal.pants).multiplyScalar(0.62), { rough: 0.85, rim: 0 });
  const shoe = toon(pal.shoe, { rough: 0.5, rim: 0.12, envI: 0.35 });
  const sole = rubberMat(pal.sole);
  const belt = toon(0x3e2414, { rough: 0.45, rim: 0.1, envI: 0.35 });
  const buckle = metalMat(0xc9c2b4, { rough: 0.28 });
  const glove = toon(0x2b2421, { rough: 0.55, rim: 0.1, envI: 0.3 });
  const j = rig.j;
  const R = p.headR;

  // ---------------- head
  const head = new THREE.Group();
  head.position.y = R * 0.95;
  j.head.add(head);
  part(headGeo(R, { jaw: 0.28, chin: 0.14, cheek: 0.1, flat: 0.08 }), skin, head, { sx: 0.92, sy: 1.04, sz: 0.95 });
  for (const s of [1, -1]) {
    part(sphereGeo(R * 0.23, 16, 12), skin, head, { x: s * R * 0.88, y: -R * 0.06, z: -R * 0.02, sx: 0.42, sy: 1, sz: 0.72 }); // ears
    part(torusGeo(R * 0.12, R * 0.03, Math.PI * 2, 6, 14), skin, head, { x: s * R * 0.92, y: -R * 0.06, ry: Math.PI / 2, sy: 1.4, shadow: false }); // ear rim
  }
  const face = buildFace(head, { R: R * 0.95, skin, eyeX: R * 0.35, eyeY: R * 0.08, eyeR: R * 0.22, iris: 0x3b2112, brow: pal.hair, browW: R * 0.36, browT: R * 0.07, mouthY: -R * 0.44, mouthW: R * 0.25, noseR: R * 0.12, smirk: 0.16 });

  // hair: a sculpted cap with layered, sharply defined spikes swept up and back
  part(new THREE.SphereGeometry(R * 1.02, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, head, { y: R * 0.04, z: -R * 0.02, rx: -0.52, sx: 0.96, own: true });
  part(new THREE.SphereGeometry(R * 1.0, 24, 12, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.4), hair, head, { y: R * 0.0, z: -R * 0.02, sx: 0.97, own: true }); // back of the head (rear half only)
  const spikes = [];
  // hairline row: overlapping quiff spikes rooted along the hairline, swept up and back
  for (let i = -3; i <= 3; i++) spikes.push([0.86 - Math.abs(i) * 0.03, i * 0.3, 0.12, 0.42 - Math.abs(i) * 0.03, 0.55, 1.0 - Math.abs(i) * 0.05]);
  // crown and back: longer spikes fanning backward
  spikes.push(
    [0.5, 0.0, 0.11, 0.4, 0.5, 0.8],
    [0.5, 0.55, 0.1, 0.36, 0.5, 0.75],
    [0.5, -0.55, 0.1, 0.36, 0.5, 0.75],
    [0.25, 1.2, 0.1, 0.34, 0.45, 0.6],
    [0.25, -1.2, 0.1, 0.34, 0.45, 0.6],
    [0.2, 2.2, 0.1, 0.32, 0.45, 0.5],
    [0.2, -2.2, 0.1, 0.32, 0.45, 0.5],
    [0.4, 3.1, 0.1, 0.3, 0.4, 0.4],
    [0.62, 1.55, 0.085, 0.24, 0.35, 0.3],
    [0.62, -1.55, 0.085, 0.24, 0.35, 0.3],
    [0.68, 2.4, 0.09, 0.24, 0.3, 0.25],
    [0.68, -2.4, 0.09, 0.24, 0.3, 0.25],
    [0.8, 3.0, 0.09, 0.2, 0.25, 0.2]
  );
  for (const [th, ph, r, h, b, t] of spikes) tuft(head, hair, R, th, ph, r * R * 3.4, h * R * 3.4, b, t);
  for (const s of [1, -1]) part(bentConeGeo(R * 0.11, R * 0.3, 0, 8), hair, head, { x: s * R * 0.84, y: R * 0.22, z: R * 0.18, rx: Math.PI, sz: 0.6 }); // sideburns

  part(cylGeo(0.068, 0.082, 0.16, 18), skin, j.torso, { y: p.torsoLen + 0.03 }); // neck

  // ---------------- torso: ribbed tee + open plaid shirt with folds
  const t = j.torso;
  const teeProfile = [
    [-0.02, 0.162],
    [0.12, 0.167],
    [0.28, 0.185],
    [0.42, 0.212],
    [0.52, 0.205],
    [p.torsoLen + 0.01, 0.12],
  ];
  part(latheGeo(teeProfile, { seg: 36 }), tee, t, { sz: 0.74 });
  part(torusGeo(0.078, 0.012, Math.PI * 2, 6, 24), tee, t, { y: p.torsoLen - 0.005, rx: Math.PI / 2, sy: 0.8 }); // crew neck rib
  part(new THREE.CircleGeometry(0.07, 36), logo, t, { y: 0.38, z: 0.154, rx: -0.12, shadow: false, own: true });
  const shirtProfile = teeProfile.map(([y, r], i) => [y - (i === 0 ? 0.07 : 0), r + 0.024 + (i === 0 ? 0.035 : 0)]);
  const shirtGeo = foldify(latheGeo(shirtProfile, { seg: 40, phiGap: 1.2, closeTop: false, closeBottom: false }), { amount: 0.009, freq: 7 });
  part(shirtGeo, plaid, t, { sz: 0.78, own: true });
  for (const s of [1, -1]) {
    part(sphereGeo(0.098, 22, 16), plaidArm, t, { x: s * 0.2, y: p.torsoLen - 0.08, sz: 0.85 }); // shoulders
    // structured collar: stand + folded leaf
    part(rboxGeo(0.12, 0.05, 0.02, 0.008, 2), plaid, t, { x: s * 0.07, y: p.torsoLen - 0.005, z: -0.02, ry: s * 0.9, rx: -0.15 });
    part(rboxGeo(0.11, 0.13, 0.016, 0.008, 2), plaid, t, { x: s * 0.085, y: p.torsoLen - 0.04, z: 0.1, rz: s * 0.48, rx: -0.5 });
    // stitched plackets along the open front, with buttons on one side
    part(rboxGeo(0.03, 0.44, 0.012, 0.005, 2), placket, t, { x: s * 0.088, y: 0.24, z: 0.158, rz: s * 0.05, ry: s * 0.35 });
  }
  const btn = toon(0xf1e6c8, { rough: 0.35, envI: 0.4 });
  for (let i = 0; i < 4; i++) part(cylGeo(0.011, 0.011, 0.008, 12), btn, t, { x: -0.095, y: 0.42 - i * 0.11, z: 0.16, rx: Math.PI / 2, ry: -0.35 });
  part(rboxGeo(0.07, 0.075, 0.01, 0.006, 2), placket, t, { x: 0.13, y: 0.42, z: 0.15, ry: 0.55 }); // chest pocket

  // ---------------- hips: jeans + belt
  part(latheGeo([[-0.15, 0.1], [-0.06, 0.17], [0.05, 0.19], [0.1, 0.18]], { seg: 32 }), denim, j.hips, { sz: 0.8 });
  part(torusGeo(0.181, 0.02, Math.PI * 2, 8, 40), belt, j.hips, { y: 0.07, rx: Math.PI / 2, sy: 0.8 });
  part(rboxGeo(0.06, 0.045, 0.014, 0.008, 2), buckle, j.hips, { y: 0.07, z: 0.147 });
  for (const x of [-0.12, 0.12]) part(rboxGeo(0.014, 0.05, 0.01, 0.004, 1), denim, j.hips, { x, y: 0.07, z: 0.11, ry: x * 4 }); // belt loops

  // ---------------- arms: rolled plaid sleeves, bare forearms, fingerless gloves
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(foldify(limbGeo(0.082, 0.072, p.upperArm - 0.02), { amount: 0.006, freq: 6, seed: side }), plaidArm, j['ua' + s], { own: true });
    part(torusGeo(0.074, 0.026, Math.PI * 2, 10, 28), plaidArm, j['ua' + s], { y: -p.upperArm + 0.05, rx: Math.PI / 2 });
    part(torusGeo(0.07, 0.02, Math.PI * 2, 10, 28), plaidArm, j['ua' + s], { y: -p.upperArm + 0.015, rx: Math.PI / 2 });
    part(limbGeo(0.058, 0.044, p.foreArm - 0.03, { bulge: 0.12 }), skin, j['la' + s]);
    buildFist(rig['hand' + s], skin, { size: 0.95, side, glove });
  }

  // ---------------- legs: twill denim with outer seams and rolled hems
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(foldify(limbGeo(0.112, 0.094, p.thigh, { bulge: 0.04, seg: 22 }), { amount: 0.004, freq: 5, seed: side * 2 }), denim, j['th' + s], { own: true });
    part(rboxGeo(0.008, p.thigh * 0.9, 0.012, 0.003, 1), seam, j['th' + s], { x: side * 0.108, y: -p.thigh * 0.5, shadow: false });
    part(foldify(limbGeo(0.096, 0.09, p.shin - 0.04, { bulge: 0.02, seg: 22 }), { amount: 0.005, freq: 6, seed: side * 3 }), denim, j['sh' + s], { own: true });
    part(rboxGeo(0.008, p.shin * 0.8, 0.012, 0.003, 1), seam, j['sh' + s], { x: side * 0.093, y: -p.shin * 0.45, shadow: false });
    part(torusGeo(0.094, 0.018, Math.PI * 2, 8, 28), denim, j['sh' + s], { y: -p.shin + 0.07, rx: Math.PI / 2 }); // rolled hem
    buildSneaker(rig['foot' + s], { upper: shoe, sole, accent: sole, size: 1.02 });
  }

  return {
    update(dt, f) {
      face.update(dt, f);
    },
  };
}

// ---------------- poses & moves
const P = makePoses({
  stance: {
    hips: [0, -0.38, 0],
    torso: [0.1, 0.24, 0],
    head: [-0.02, 0.14, 0],
    uaL: [-0.82, 0, 0.3],
    laL: [-2.0, 0, 0],
    uaR: [-0.55, 0, -0.34],
    laR: [-2.1, 0, 0],
    thL: [-0.45, 0, 0.08],
    shL: [0.55, 0, 0],
    thR: [0.22, 0, -0.08],
    shR: [0.38, 0, 0],
  },
});

const WIND_JAB = { uaL: [-0.6, 0, 0.35], laL: [-2.2, 0, 0], torso: [0.12, 0.35, 0] };
const KICK_CHAMBER = { thR: [-1.55, 0, 0], shR: [2.05, 0, 0], torso: [-0.05, 0.2, 0], thL: [-0.2, 0, 0.08], shL: [0.3, 0, 0], uaL: [-0.6, 0, 0.6], uaR: [-0.2, 0, -0.6] };
const KICK_EXT = { thR: [-1.62, 0, 0], shR: [0.04, 0, 0], torso: [-0.32, 0.38, 0], hips: [0, 0.1, 0], thL: [-0.1, 0, 0.08], shL: [0.18, 0, 0], uaL: [-0.4, 0, 0.8], uaR: [-0.1, 0, -0.7], laR: [-1.2, 0, 0] };
const UPPER_WIND = { thL: [-1.0, 0, 0.1], shL: [1.5, 0, 0], thR: [-0.2, 0, -0.1], shR: [1.4, 0, 0], torso: [0.55, 0.5, 0], uaR: [0.35, 0, -0.4], laR: [-2.4, 0, 0], head: [-0.3, 0, 0] };
const UPPERCUT = { noGround: true, pos: [0, 0.35, 0], uaR: [-2.85, 0, -0.15], laR: [-0.45, 0, 0], torso: [-0.3, -0.35, 0], head: [-0.25, 0, 0], uaL: [-0.3, 0, 0.6], laL: [-1.7, 0, 0], thL: [-0.6, 0, 0.1], shL: [1.2, 0, 0], thR: [0.2, 0, -0.1], shR: [0.6, 0, 0] };

export const Sambhu = {
  id: 'sambhu',
  name: 'SAMBHU',
  title: 'The Rickshaw Rocket',
  style: 'Balanced • Agile',
  description: 'Fast hands, quick feet and a heart of gold. Strings punches into kicks and closes distance in a blink.',
  portrait: `${BASE}assets/portraits/sambhu.png`,
  art: `${BASE}assets/portraits/sambhu-full.png`,
  accent: '#F4C321',
  trailColor: '#ffd85a',
  stats: { power: 3, speed: 5, defense: 3, range: 3 },
  scale: 0.86,
  proportions: { legLen: 0.93, thigh: 0.43, shin: 0.4, footH: 0.11, torsoLen: 0.57, neck: 0.08, headR: 0.29, shoulderW: 0.23, hipW: 0.1, upperArm: 0.3, foreArm: 0.28 },
  walkSpeed: 3.3,
  backSpeed: 2.7,
  stride: 1.1,
  jumpVel: 10.2,
  jumpX: 3.4,
  dashSpeed: 12,
  weight: 1.0,
  maxHealth: 140,
  hurtHeight: 1.82,
  crouchHeight: 1.12,
  palettes: SAMBHU_PALETTES,
  build: buildModel,
  gltf: { clips: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', crouch: 'Crouch', block: 'Block', hit: 'Hit', knockdown: 'Knockdown', down: 'Down', getup: 'GetUp', victory: 'Victory', defeat: 'Defeat', jab: 'Punch', kick: 'Kick', special: 'Special' } },

  poses: P,
  loops: {
    // round intro: rolls shoulders, beckons, settles into stance
    intro: [
      [0, { uaR: [-1.5, 0, -0.3], laR: [-1.6, 0, 0], torso: [-0.05, 0.1, 0], head: [-0.1, 0.3, 0] }],
      [0.35, { uaR: [-1.5, 0, -0.3], laR: [-0.6, 0, 0], torso: [-0.05, 0.1, 0], head: [-0.1, 0.3, 0] }],
      [0.6, { uaR: [-1.5, 0, -0.3], laR: [-1.7, 0, 0], torso: [-0.05, 0.1, 0], head: [-0.1, 0.3, 0] }],
      [0.85, { uaR: [-1.5, 0, -0.3], laR: [-0.7, 0, 0], torso: [-0.05, 0.1, 0], head: [-0.1, 0.3, 0] }],
      [1.3, {}],
    ],
    victory: [
      [0, {}],
      [0.3, { torso: [-0.15, 0.2, 0], uaR: [-2.9, 0, -0.3], laR: [-0.3, 0, 0], uaL: [-0.4, 0, 0.5], laL: [-1.9, 0, 0], head: [-0.2, 0.2, 0], thL: [0, 0, 0.12], shL: [0.05, 0, 0], thR: [0.05, 0, -0.12], shR: [0.05, 0, 0] }],
      [0.55, { noGround: true, pos: [0, 0.3, 0], torso: [-0.2, 0.2, 0], uaR: [-3.0, 0, -0.2], laR: [-0.1, 0, 0], uaL: [-0.4, 0, 0.5], laL: [-1.9, 0, 0], head: [-0.25, 0.2, 0], thL: [-0.6, 0, 0.12], shL: [1.0, 0, 0], thR: [-0.2, 0, -0.12], shR: [0.6, 0, 0] }],
      [0.85, { torso: [-0.12, 0.25, 0], uaR: [-2.95, 0, -0.25], laR: [-0.25, 0, 0], uaL: [-0.3, 0, 0.55], laL: [-1.9, 0, 0], head: [-0.15, 0.25, 0], thL: [0, 0, 0.12], shL: [0.05, 0, 0], thR: [0.05, 0, -0.12], shR: [0.05, 0, 0] }],
    ],
  },

  commands: {
    punch: 'jab',
    kick: 'kick',
    crouchPunch: 'lowPunch',
    crouchKick: 'sweep',
    airPunch: 'jumpKick',
    airKick: 'jumpKick',
    dashPunch: 'dashAttack',
    dashKick: 'dashAttack',
    special: 'special',
  },

  moveList: [
    ['Quick Punch', 'F'],
    ['Double-Punch Combo', 'F, F (→ G)'],
    ['Front Kick', 'G'],
    ['Jump Kick', 'W + G'],
    ['Low Jab / Sweep', 'S + F / S + G'],
    ['Auto Rocket Punch', 'Shift + F'],
    ['Rickshaw Power Combo', 'R (50 energy)'],
  ],

  moves: {
    jab: move('jab', {
      name: 'Quick Punch',
      duration: 0.34,
      hits: [hit(0.08, 0.14, 5, { height: 'high', reach: [0.2, 1.25], kb: 2.0, stun: 0.3, bstun: 0.16, limb: 'handL' })],
      cancels: { punch: 'doublePunch' },
      cancelAfter: 0.11,
      anim: [
        [0, {}],
        [0.04, WIND_JAB],
        [0.09, LIMB.jabL],
        [0.15, LIMB.jabL],
        [0.34, {}],
      ],
    }),
    doublePunch: move('doublePunch', {
      name: 'Double-Punch Combo',
      duration: 0.52,
      hits: [
        hit(0.06, 0.11, 4, { height: 'high', reach: [0.2, 1.25], kb: 1.2, stun: 0.34, limb: 'handL' }),
        hit(0.2, 0.27, 6, { height: 'mid', reach: [0.2, 1.35], kb: 3.2, stun: 0.4, bstun: 0.2, limb: 'handR' }),
      ],
      lunge: [{ at: 0.15, until: 0.25, speed: 2.5 }],
      cancels: { kick: 'kick' },
      cancelAfter: 0.26,
      anim: [
        [0, LIMB.jabL],
        [0.07, LIMB.jabL],
        [0.13, { uaR: [-0.3, 0, -0.4], laR: [-2.2, 0, 0], torso: [0.12, -0.2, 0] }],
        [0.21, LIMB.crossR],
        [0.32, LIMB.crossR],
        [0.52, {}],
      ],
    }),
    kick: move('kick', {
      name: 'Front Kick',
      duration: 0.52,
      hits: [hit(0.17, 0.25, 8, { height: 'mid', reach: [0.2, 1.55], kb: 4.5, stun: 0.38, bstun: 0.2, sfx: 'kick', limb: 'footR' })],
      lunge: [{ at: 0.1, until: 0.2, speed: 2 }],
      anim: [
        [0, {}],
        [0.1, KICK_CHAMBER],
        [0.18, KICK_EXT],
        [0.28, KICK_EXT],
        [0.38, KICK_CHAMBER],
        [0.52, {}],
      ],
    }),
    lowPunch: move('lowPunch', {
      name: 'Low Jab',
      duration: 0.32,
      base: 'crouch',
      crouch: true,
      hits: [hit(0.08, 0.14, 4, { height: 'low', reach: [0.2, 1.2], kb: 1.5, stun: 0.28, limb: 'handL' })],
      anim: [
        [0, {}],
        [0.09, { uaL: [-1.3, 0, 0.05], laL: [-0.1, 0, 0], torso: [0.55, -0.15, 0] }],
        [0.17, { uaL: [-1.3, 0, 0.05], laL: [-0.1, 0, 0], torso: [0.55, -0.15, 0] }],
        [0.32, {}],
      ],
    }),
    sweep: move('sweep', {
      name: 'Rickshaw Sweep',
      duration: 0.64,
      base: 'crouch',
      crouch: true,
      hits: [hit(0.18, 0.28, 7, { height: 'low', reach: [0.2, 1.6], kb: 2.5, kd: true, launch: 3, sfx: 'kick', limb: 'footL' })],
      anim: [
        [0, {}],
        [0.12, { root: [0, 0.9, 0], thL: [-1.2, 0, 0.9], shL: [0.4, 0, 0], torso: [0.6, -0.5, 0], uaR: [-0.6, 0, -0.9], laR: [-0.2, 0, 0] }],
        [0.24, { root: [0, -0.4, 0], thL: [-1.45, 0, 0.1], shL: [0.15, 0, 0], torso: [0.6, 0.3, 0], uaR: [-0.6, 0, -0.9], laR: [-0.2, 0, 0] }],
        [0.38, { root: [0, -0.55, 0], thL: [-1.45, 0, 0.1], shL: [0.2, 0, 0], torso: [0.6, 0.3, 0] }],
        [0.64, {}],
      ],
    }),
    jumpKick: move('jumpKick', {
      name: 'Jump Kick',
      duration: 0.5,
      base: 'jumpFall',
      air: true,
      hits: [hit(0.1, 0.34, 12, { y: [-0.45, 1.3], reach: [0.1, 1.5], kb: 4.5, stun: 0.45, bstun: 0.24, sfx: 'kick', heavy: true, limb: 'footR' })],
      anim: [
        [0, { noGround: true, thR: [-1.3, 0, 0], shR: [1.9, 0, 0], thL: [-1.0, 0, 0], shL: [1.8, 0, 0] }],
        [0.1, { noGround: true, thR: [-1.45, 0, 0], shR: [0.05, 0, 0], thL: [-0.3, 0, 0.1], shL: [1.9, 0, 0], torso: [-0.4, 0.3, 0], uaL: [-1.0, 0, 0.9], uaR: [-0.6, 0, -0.9] }],
        [0.36, { noGround: true, thR: [-1.45, 0, 0], shR: [0.05, 0, 0], thL: [-0.3, 0, 0.1], shL: [1.9, 0, 0], torso: [-0.4, 0.3, 0], uaL: [-1.0, 0, 0.9], uaR: [-0.6, 0, -0.9] }],
        [0.5, { noGround: true }],
      ],
    }),
    dashAttack: move('dashAttack', {
      name: 'Auto Rocket Punch',
      duration: 0.54,
      base: 'run',
      hits: [hit(0.12, 0.26, 10, { height: 'mid', reach: [0.1, 1.45], kb: 6, stun: 0.45, bstun: 0.24, heavy: true, limb: 'handL' })],
      lunge: [{ at: 0, until: 0.24, speed: 8 }],
      cooldown: 0.5,
      anim: [
        [0, {}],
        [0.1, { uaL: [-1.62, 0, 0], laL: [-0.05, 0, 0], uaR: [-0.1, 0, -0.7], laR: [-0.6, 0, 0], torso: [0.45, -0.4, 0], thL: [-1.0, 0, 0], shL: [0.9, 0, 0], thR: [0.45, 0, 0], shR: [0.5, 0, 0] }],
        [0.3, { uaL: [-1.62, 0, 0], laL: [-0.05, 0, 0], uaR: [-0.1, 0, -0.7], laR: [-0.6, 0, 0], torso: [0.45, -0.4, 0], thL: [-1.0, 0, 0], shL: [0.9, 0, 0], thR: [0.45, 0, 0], shR: [0.5, 0, 0] }],
        [0.54, P.stance],
      ],
    }),
    special: move('special', {
      name: 'Rickshaw Power Combo',
      special: true,
      duration: 1.45,
      energyCost: 50,
      cooldown: 2.5,
      iframes: [0, 0.22],
      sfxStart: 'special',
      cinematic: { duration: 0.35, slowmo: 0.45 },
      lunge: [
        { at: 0.0, until: 0.2, speed: 9 },
        { at: 0.2, until: 0.95, speed: 2.4 },
      ],
      hits: [
        hit(0.2, 0.26, 4, { height: 'high', reach: [0.1, 1.4], kb: 0.8, stun: 0.6, limb: 'handL', chip: 0.2 }),
        hit(0.34, 0.4, 4, { height: 'mid', reach: [0.1, 1.4], kb: 0.8, stun: 0.6, limb: 'handR', chip: 0.2 }),
        hit(0.5, 0.57, 5, { height: 'mid', reach: [0.1, 1.6], kb: 0.8, stun: 0.6, sfx: 'kick', limb: 'footR', chip: 0.2 }),
        hit(0.67, 0.74, 5, { height: 'high', reach: [0.1, 1.6], kb: 0.8, stun: 0.6, sfx: 'kick', limb: 'footL', chip: 0.2 }),
        hit(0.98, 1.07, 8, { height: 'mid', y: [0.6, 2.2], reach: [0.0, 1.5], kb: 4.5, launch: 8, kd: true, sfx: 'heavy', heavy: true, limb: 'handR', spark: 'gold', chip: 0.25 }),
      ],
      fx: [
        { at: 0, type: 'aura', color: 0xffc53a },
        { at: 0.98, type: 'burst', color: 0xffc53a },
      ],
      anim: [
        [0, { thL: [-0.8, 0, 0.1], shL: [1.2, 0, 0], torso: [0.3, 0, 0], uaL: [-0.4, 0, 0.7], laL: [-1.9, 0, 0], uaR: [-0.4, 0, -0.7], laR: [-1.9, 0, 0] }],
        [0.14, { thL: [-0.8, 0, 0.1], shL: [1.2, 0, 0], torso: [0.4, 0, 0], ...WIND_JAB }],
        [0.22, LIMB.jabL],
        [0.29, {}],
        [0.36, LIMB.crossR],
        [0.44, {}],
        [0.53, KICK_EXT],
        [0.6, KICK_CHAMBER],
        [0.7, { thL: [-1.95, 0, 0.25], shL: [0.05, 0, 0], torso: [-0.45, -0.45, 0], hips: [0, -0.6, 0], thR: [0.1, 0, -0.08], shR: [0.1, 0, 0], uaR: [-0.4, 0, -1.0] }],
        [0.8, { thL: [-0.9, 0, 0.1], shL: [1.3, 0, 0] }],
        [0.92, UPPER_WIND],
        [1.0, UPPERCUT],
        [1.18, UPPERCUT],
        [1.45, {}],
      ],
    }),
  },
};
