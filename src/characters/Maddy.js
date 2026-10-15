import * as THREE from 'three';
import { dynamic, toon, skinMat, fabricMat, hairMat, metalMat, rubberMat, foldify, headGeo, limbGeo, latheGeo, sphereGeo, rboxGeo, cylGeo, torusGeo, bentConeGeo, part, plaidTex, denimTex, buildFist, buildSneaker, buildFace, canvasTex } from './ModelKit.js';
import { hit, move, makePoses, LIMB } from './MoveData.js';

// MADDY — the hostel's sleepless genius from "Maddy: The Ghost of Room 404".
// Tricky and technical: quick strings, a slide tackle and a glowing physics
// textbook he hurls across the stage. Look from the comic cover: messy sandy
// hair, open blue-and-white plaid shirt over a black tee, jeans, sneakers.

export const MADDY_PALETTES = [
  { skin: 0xe2a77a, hair: 0xe2b558, shirt: '#e9f1fb', plaid: '#3b78c4', plaidThin: '#173a6b', tee: 0x1a1a1f, print: 0xffffff, jeans: '#2f5a9e', shoe: 0xdb3a34, sole: 0xf4f4f4, iris: 0x2b5578 },
  { skin: 0xd59a6c, hair: 0x6b3f1d, shirt: '#2a2a2a', plaid: '#d43b3b', plaidThin: '#111111', tee: 0xf0f0f0, print: 0xdb212a, jeans: '#1d2a40', shoe: 0x2a2a2a, sole: 0xffffff, iris: 0x3a2412 },
];

function atomTexture(color) {
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = color;
    g.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translate(64, 64);
      g.rotate((i * Math.PI) / 3);
      g.beginPath();
      g.ellipse(0, 0, 54, 20, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    g.fillStyle = color;
    g.beginPath();
    g.arc(64, 64, 10, 0, Math.PI * 2);
    g.fill();
  });
}

function spike(head, mat, R, theta, phi, r, h, bend, tilt, twist = 0, flat = 0.6) {
  const n = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
  const g = new THREE.Group();
  g.position.copy(n).multiplyScalar(R * 0.88);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  g.rotateX(-tilt);
  g.rotateZ(twist);
  head.add(g);
  part(bentConeGeo(r, h, bend, 12), mat, g, { sz: flat });
}

function buildModel(rig, pal) {
  const p = rig.p;
  const R = p.headR;
  const skin = skinMat(pal.skin);
  const hair = hairMat(pal.hair, { rim: 0.3, rimColor: 0xfff2c8 });
  const plaid = fabricMat(plaidTex(pal.shirt, pal.plaid, pal.plaidThin, { repeat: [4, 3] }), { side: THREE.DoubleSide, repeat: [10, 8] });
  const plaidArm = fabricMat(plaidTex(pal.shirt, pal.plaid, pal.plaidThin, { repeat: [2, 2] }), { repeat: [6, 6] });
  const tee = fabricMat(pal.tee, { weave: 'knit', repeat: [10, 10], sheen: 0.4 });
  const print = new THREE.MeshStandardMaterial({ map: atomTexture('#' + new THREE.Color(pal.print).getHexString()), transparent: true, roughness: 0.85 });
  const jeans = fabricMat(denimTex(pal.jeans), { weave: 'twill', repeat: [6, 10], rough: 0.8, sheen: 0.35 });
  const seam = toon(new THREE.Color(pal.jeans).multiplyScalar(0.6), { rough: 0.85, rim: 0 });
  const shoe = toon(pal.shoe, { rough: 0.5, rim: 0.12, envI: 0.35 });
  const sole = rubberMat(pal.sole);
  const canvasM = fabricMat(0x5b6b48, { rough: 0.9, repeat: [4, 4] }); // olive canvas pouch
  const steel = metalMat(0xbfc4cc, { rough: 0.3 });
  const j = rig.j;

  // ---------------- head: lean face, knowing smirk
  const head = new THREE.Group();
  head.position.y = R * 0.95;
  j.head.add(head);
  part(headGeo(R, { jaw: 0.34, chin: 0.2, cheek: 0.05, flat: 0.1 }), skin, head, { sx: 0.89, sy: 1.07, sz: 0.94 });
  for (const s of [1, -1]) {
    part(sphereGeo(R * 0.24, 16, 12), skin, head, { x: s * R * 0.86, y: -R * 0.04, sx: 0.42, sy: 1.05, sz: 0.72 });
    part(torusGeo(R * 0.12, R * 0.03, Math.PI * 2, 6, 14), skin, head, { x: s * R * 0.9, y: -R * 0.04, ry: Math.PI / 2, sy: 1.4, shadow: false });
  }
  const face = buildFace(head, { R: R * 0.95, skin, eyeX: R * 0.34, eyeY: R * 0.1, eyeR: R * 0.23, iris: pal.iris, brow: pal.hair, browW: R * 0.33, browT: R * 0.065, mouthY: -R * 0.46, mouthW: R * 0.26, noseR: R * 0.11, smirk: -0.22, liner: 0x2a1a10 });

  // blond hair: sculpted cap, a fringe of forward-flicking spikes, crown spikes fanning back
  part(new THREE.SphereGeometry(R * 1.03, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, head, { y: R * 0.05, rx: -0.45, sx: 0.95, own: true });
  part(new THREE.SphereGeometry(R * 1.01, 24, 12, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.42), hair, head, { sx: 0.96, own: true });
  // fringe: uneven tufts that flick forward over the forehead (messier than Sambhu's quiff)
  const fringe = [[-3, 0.8, 0.95, 0.1], [-2, 0.7, 0.75, -0.2], [-1, 0.95, 0.85, 0.25], [0, 0.8, 0.7, -0.1], [1, 1.0, 0.95, 0.3], [2, 0.75, 0.7, -0.25], [3, 0.85, 0.9, 0.15]];
  for (const [i, h, tilt, tw] of fringe) spike(head, hair, R, 0.78, i * 0.3, R * 0.34, R * h, -0.55, -tilt, tw);
  const crown = [
    [0.35, 0.3, 1.3, 0.5, 0.7],
    [0.35, -0.4, 1.25, 0.5, 0.7],
    [0.2, 1.2, 1.2, 0.45, 0.6],
    [0.2, -1.3, 1.2, 0.45, 0.6],
    [0.3, 2.3, 1.1, 0.4, 0.5],
    [0.3, -2.2, 1.1, 0.4, 0.5],
    [0.5, 3.1, 1.0, 0.35, 0.4],
    [0.6, 1.7, 0.85, 0.35, 0.3],
    [0.6, -1.7, 0.85, 0.35, 0.3],
    [0.75, 2.6, 0.75, 0.3, 0.2],
    [0.75, -2.6, 0.75, 0.3, 0.2],
  ];
  for (const [th, ph, h, b, t] of crown) spike(head, hair, R, th, ph, R * 0.36, R * h, b, t, ph * 0.08);
  // pencil tucked behind the ear
  part(cylGeo(0.011, 0.011, 0.15, 8), toon(0xf2c230, { rough: 0.5 }), head, { x: R * 0.9, y: R * 0.22, z: -R * 0.05, rx: 1.1, rz: 0.2 });
  part(cylGeo(0.001, 0.011, 0.025, 8), toon(0xe8c9a0), head, { x: R * 0.9, y: R * 0.22 + 0.07, z: -R * 0.05 + 0.03, rx: 1.1, rz: 0.2, shadow: false });

  part(cylGeo(0.063, 0.078, 0.17, 18), skin, j.torso, { y: p.torsoLen + 0.03 });

  // ---------------- torso: printed tee + open plaid shirt
  const t = j.torso;
  const teeProfile = [
    [-0.02, 0.158],
    [0.14, 0.156],
    [0.3, 0.168],
    [0.42, 0.188],
    [0.5, 0.183],
    [p.torsoLen + 0.01, 0.11],
  ];
  part(latheGeo(teeProfile, { seg: 36 }), tee, t, { sz: 0.72 });
  part(torusGeo(0.072, 0.011, Math.PI * 2, 6, 24), tee, t, { y: p.torsoLen - 0.005, rx: Math.PI / 2, sy: 0.8 });
  part(new THREE.PlaneGeometry(0.16, 0.16), print, t, { y: 0.36, z: 0.14, rx: -0.12, shadow: false, own: true });
  const shirtProfile = teeProfile.map(([y, r], i) => [y - (i === 0 ? 0.08 : 0), r + 0.026 + (i === 0 ? 0.04 : 0)]);
  part(foldify(latheGeo(shirtProfile, { seg: 40, phiGap: 1.3, closeTop: false, closeBottom: false }), { amount: 0.01, freq: 6, seed: 3 }), plaid, t, { sz: 0.78, own: true });
  for (const s of [1, -1]) {
    part(sphereGeo(0.09, 22, 16), plaidArm, t, { x: s * 0.19, y: p.torsoLen - 0.08, sz: 0.85 });
    part(rboxGeo(0.11, 0.05, 0.018, 0.008, 2), plaid, t, { x: s * 0.066, y: p.torsoLen - 0.005, z: -0.02, ry: s * 0.9, rx: -0.15 });
    part(rboxGeo(0.1, 0.13, 0.016, 0.008, 2), plaid, t, { x: s * 0.075, y: p.torsoLen - 0.04, z: 0.098, rz: s * 0.55, rx: -0.45 });
  }
  // shirt pocket with a clipped pen
  part(rboxGeo(0.07, 0.075, 0.012, 0.006, 2), plaid, t, { x: 0.125, y: 0.4, z: 0.142, ry: 0.6 });
  part(cylGeo(0.008, 0.008, 0.1, 8), toon(0x1b3a62, { rough: 0.35, envI: 0.5 }), t, { x: 0.112, y: 0.44, z: 0.15, ry: 0.6 });
  part(rboxGeo(0.004, 0.035, 0.006, 0.002, 1), steel, t, { x: 0.116, y: 0.465, z: 0.158, ry: 0.6, shadow: false });

  // ---------------- hips: jeans, belt and a compact utility pouch
  part(latheGeo([[-0.15, 0.1], [-0.06, 0.16], [0.05, 0.175], [0.1, 0.165]], { seg: 32 }), jeans, j.hips, { sz: 0.8 });
  part(torusGeo(0.168, 0.017, Math.PI * 2, 8, 36), toon(0x2b2b2b, { rough: 0.5 }), j.hips, { y: 0.07, rx: Math.PI / 2, sy: 0.8 });
  part(rboxGeo(0.045, 0.035, 0.012, 0.006, 2), steel, j.hips, { y: 0.07, z: 0.137 });
  const pouch = new THREE.Group();
  pouch.position.set(-0.16, 0.0, 0.05);
  pouch.rotation.y = -0.9;
  j.hips.add(pouch);
  part(rboxGeo(0.07, 0.09, 0.045, 0.014, 3), canvasM, pouch);
  part(rboxGeo(0.074, 0.035, 0.05, 0.012, 2), canvasM, pouch, { y: 0.03, z: 0.004 });
  part(cylGeo(0.008, 0.008, 0.006, 10), steel, pouch, { y: 0.024, z: 0.03, rx: Math.PI / 2, shadow: false });

  // ---------------- arms: full sleeves with buttoned cuffs; watch on the left wrist
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(foldify(limbGeo(0.075, 0.066, p.upperArm), { amount: 0.006, freq: 6, seed: side }), plaidArm, j['ua' + s], { own: true });
    part(foldify(limbGeo(0.064, 0.058, p.foreArm - 0.04), { amount: 0.007, freq: 7, seed: side * 2 }), plaidArm, j['la' + s], { own: true });
    part(cylGeo(0.063, 0.066, 0.055, 18), plaidArm, j['la' + s], { y: -p.foreArm + 0.05 });
    part(cylGeo(0.007, 0.007, 0.006, 8), toon(0xf4f4f4), j['la' + s], { x: side * 0.05, y: -p.foreArm + 0.05, z: 0.04, rz: Math.PI / 2, shadow: false });
    if (s === 'L') {
      part(torusGeo(0.05, 0.012, Math.PI * 2, 8, 24), toon(0x1e1e1e, { rough: 0.5 }), j['la' + s], { y: -p.foreArm + 0.005, rx: Math.PI / 2 });
      part(cylGeo(0.022, 0.022, 0.012, 16), steel, j['la' + s], { y: -p.foreArm + 0.005, z: 0.055, rx: Math.PI / 2 });
    }
    buildFist(rig['hand' + s], skin, { size: 0.9, side });
  }

  // ---------------- legs
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(foldify(limbGeo(0.1, 0.086, p.thigh, { bulge: 0.03, seg: 22 }), { amount: 0.004, freq: 5, seed: side * 4 }), jeans, j['th' + s], { own: true });
    part(rboxGeo(0.007, p.thigh * 0.9, 0.012, 0.003, 1), seam, j['th' + s], { x: side * 0.096, y: -p.thigh * 0.5, shadow: false });
    part(foldify(limbGeo(0.088, 0.082, p.shin - 0.04, { bulge: 0.02, seg: 22 }), { amount: 0.005, freq: 6, seed: side * 5 }), jeans, j['sh' + s], { own: true });
    part(cylGeo(0.088, 0.096, 0.07, 20), jeans, j['sh' + s], { y: -p.shin + 0.07 });
    buildSneaker(rig['foot' + s], { upper: shoe, sole, accent: sole, size: 1.0 });
  }

  // the physics textbook he throws, held during the wind-up
  const book = dynamic(new THREE.Group());
  part(rboxGeo(0.2, 0.26, 0.06, 0.01), toon(0x16325a, { rough: 0.5 }), book);
  part(rboxGeo(0.19, 0.25, 0.064, 0.005), toon(0xfff8e6, { rough: 0.8 }), book, { x: 0.006 });
  book.position.set(0, -0.12, 0.08);
  book.visible = false;
  rig.handR.add(book);

  return {
    update(dt, f) {
      face.update(dt, f);
      book.visible = f.state === 'attack' && f.move?.id === 'special' && f.moveTime < 0.4;
    },
  };
}

const P = makePoses({
  // scrappy, slightly hunched stance — lead fist forward, rear fist by the chin
  stance: {
    hips: [0, -0.42, 0],
    torso: [0.16, 0.3, 0],
    head: [0.02, 0.12, 0],
    uaL: [-1.05, 0, 0.22],
    laL: [-1.55, 0, 0],
    uaR: [-0.5, 0, -0.38],
    laR: [-2.2, 0, 0],
    thL: [-0.5, 0, 0.1],
    shL: [0.6, 0, 0],
    thR: [0.24, 0, -0.1],
    shR: [0.42, 0, 0],
  },
});

const ELBOW = { uaR: [-1.4, 0, -1.2], laR: [-2.5, 0, 0], torso: [0.2, 0.85, 0], hips: [0, 0.15, 0], head: [0, -0.4, 0], thR: [0.35, 0, -0.1], shR: [0.2, 0, 0] };
const ROUND_CHAMBER = { hips: [0, 0.6, 0], torso: [-0.1, 0.5, -0.1], thR: [-1.0, 0, -0.9], shR: [2.0, 0, 0], uaL: [-0.6, 0, 0.9], uaR: [-0.3, 0, -0.9], thL: [-0.15, 0, 0.1], shL: [0.25, 0, 0] };
const ROUND_EXT = { hips: [0, 1.2, 0], torso: [-0.35, 0.9, -0.35], head: [0, -0.6, 0.2], thR: [-1.45, 0, -0.55], shR: [0.08, 0, 0], uaL: [-0.4, 0, 1.2], laL: [-1.4, 0, 0], uaR: [-0.1, 0, -1.0], laR: [-1.0, 0, 0], thL: [-0.05, 0, 0.12], shL: [0.18, 0, 0] };
const THROW_WIND = { uaR: [0.7, 0, -0.6], laR: [-1.3, 0, 0], torso: [-0.05, -0.65, 0], hips: [0, -0.7, 0], uaL: [-1.4, 0, 0.3], laL: [-0.5, 0, 0], thL: [-0.6, 0, 0.1], shL: [0.7, 0, 0], head: [0, 0.3, 0] };
const THROW_REL = { uaR: [-1.75, 0, -0.1], laR: [-0.1, 0, 0], torso: [0.3, 0.75, 0], hips: [0, 0.35, 0], uaL: [-0.2, 0, 0.6], laL: [-1.2, 0, 0], thL: [-0.7, 0, 0.1], shL: [0.6, 0, 0], thR: [0.5, 0, -0.1], shR: [0.4, 0, 0], head: [0, -0.4, 0] };

export const Maddy = {
  id: 'maddy',
  name: 'MADDY',
  title: 'The Hostel Genius',
  style: 'Tricky • Technical',
  description: 'Runs on chai and zero sleep. Chains quick strings, slides under attacks and hurls a glowing physics textbook across the stage.',
  portrait: null, // rendered from the 3D model at startup
  art: null,
  accent: '#3B78C4',
  trailColor: '#7fd0ff',
  stats: { power: 3, speed: 4, defense: 2, range: 5 },
  scale: 0.86,
  proportions: { legLen: 0.96, thigh: 0.45, shin: 0.42, footH: 0.11, torsoLen: 0.55, neck: 0.09, headR: 0.29, shoulderW: 0.21, hipW: 0.09, upperArm: 0.3, foreArm: 0.28 },
  walkSpeed: 3.1,
  backSpeed: 2.8,
  stride: 1.15,
  jumpVel: 10.4,
  jumpX: 3.5,
  dashSpeed: 12.5,
  weight: 0.92,
  maxHealth: 135,
  hurtHeight: 1.85,
  crouchHeight: 1.1,
  palettes: MADDY_PALETTES,
  build: buildModel,
  gltf: { clips: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', crouch: 'Crouch', block: 'Block', hit: 'Hit', knockdown: 'Knockdown', down: 'Down', getup: 'GetUp', victory: 'Victory', defeat: 'Defeat', jab: 'Punch', roundhouse: 'Kick', special: 'Throw' } },

  poses: P,
  loops: {
    // pushes imaginary glasses up, cracks knuckles
    intro: [
      [0, { uaR: [-2.2, 0, -0.5], laR: [-2.4, 0, 0], head: [0.1, 0, 0] }],
      [0.4, { uaR: [-2.4, 0, -0.45], laR: [-2.5, 0, 0], head: [-0.1, 0, 0] }],
      [0.7, { uaL: [-1.4, 0, 0.1], laL: [-1.9, 0, 0], uaR: [-1.4, 0, -0.1], laR: [-1.9, 0, 0], torso: [0.1, 0, 0] }],
      [0.9, { uaL: [-1.4, 0, -0.05], laL: [-1.6, 0, 0], uaR: [-1.4, 0, 0.05], laR: [-1.6, 0, 0], torso: [0.1, 0, 0] }],
      [1.3, {}],
    ],
    victory: [
      [0, {}],
      [0.3, { torso: [-0.2, 0, 0], head: [-0.3, 0, 0], uaL: [-2.9, 0, 0.5], laL: [-0.3, 0, 0], uaR: [-2.9, 0, -0.5], laR: [-0.3, 0, 0], thL: [0, 0, 0.12], shL: [0.05, 0, 0], thR: [0, 0, -0.12], shR: [0.05, 0, 0] }],
      [0.55, { noGround: true, pos: [0, 0.35, 0], torso: [-0.25, 0, 0], head: [-0.35, 0, 0], uaL: [-3.0, 0, 0.7], laL: [-0.2, 0, 0], uaR: [-3.0, 0, -0.7], laR: [-0.2, 0, 0], thL: [-0.9, 0, 0.12], shL: [1.6, 0, 0], thR: [-0.4, 0, -0.12], shR: [1.4, 0, 0] }],
      [0.85, { torso: [-0.2, 0, 0], head: [-0.3, 0, 0], uaL: [-2.9, 0, 0.5], laL: [-0.3, 0, 0], uaR: [-2.9, 0, -0.5], laR: [-0.3, 0, 0], thL: [0, 0, 0.12], shL: [0.05, 0, 0], thR: [0, 0, -0.12], shR: [0.05, 0, 0] }],
    ],
  },

  commands: {
    punch: 'jab',
    kick: 'roundhouse',
    crouchPunch: 'lowPunch',
    crouchKick: 'slide',
    airPunch: 'flyingKnee',
    airKick: 'flyingKnee',
    dashPunch: 'rush',
    dashKick: 'rush',
    special: 'special',
  },

  moveList: [
    ['Quick Jab', 'F'],
    ['Formula Flurry', 'F, F (3 hits)'],
    ['Roundhouse', 'G  (or F → G)'],
    ['Low Jab', 'S + F'],
    ['Slide Tackle', 'S + G (knockdown)'],
    ['Flying Knee', 'W + F / G'],
    ['Exam-Rush Shoulder', 'Shift + F'],
    ['E = mc² Textbook Toss', 'R (50 energy)'],
  ],

  moves: {
    jab: move('jab', {
      name: 'Quick Jab',
      duration: 0.3,
      hits: [hit(0.07, 0.13, 4, { height: 'high', reach: [0.2, 1.25], kb: 1.6, stun: 0.3, bstun: 0.15, limb: 'handL' })],
      cancels: { punch: 'flurry', kick: 'roundhouse' },
      cancelAfter: 0.1,
      anim: [
        [0, {}],
        [0.08, LIMB.jabL],
        [0.14, LIMB.jabL],
        [0.3, {}],
      ],
    }),
    flurry: move('flurry', {
      name: 'Formula Flurry',
      duration: 0.62,
      hits: [
        hit(0.06, 0.11, 3, { height: 'high', reach: [0.2, 1.25], kb: 0.8, stun: 0.34, limb: 'handR' }),
        hit(0.18, 0.23, 3, { height: 'high', reach: [0.2, 1.25], kb: 0.8, stun: 0.34, limb: 'handL' }),
        hit(0.32, 0.4, 7, { height: 'mid', reach: [0.1, 1.15], kb: 4.5, stun: 0.42, bstun: 0.22, sfx: 'heavy', heavy: true, limb: 'handR' }),
      ],
      lunge: [{ at: 0.04, until: 0.36, speed: 1.8 }],
      anim: [
        [0, LIMB.jabL],
        [0.07, LIMB.crossR],
        [0.13, {}],
        [0.19, LIMB.jabL],
        [0.25, { uaR: [-0.4, 0, -0.9], laR: [-2.4, 0, 0], torso: [0.15, -0.3, 0], hips: [0, -0.6, 0] }],
        [0.34, ELBOW],
        [0.44, ELBOW],
        [0.62, {}],
      ],
    }),
    roundhouse: move('roundhouse', {
      name: 'Roundhouse',
      duration: 0.6,
      hits: [hit(0.22, 0.3, 9, { height: 'high', y: [0.9, 1.9], reach: [0.2, 1.65], kb: 5, stun: 0.42, bstun: 0.22, sfx: 'kick', heavy: true, limb: 'footR' })],
      lunge: [{ at: 0.1, until: 0.22, speed: 1.6 }],
      anim: [
        [0, {}],
        [0.12, ROUND_CHAMBER],
        [0.23, ROUND_EXT],
        [0.33, ROUND_EXT],
        [0.45, ROUND_CHAMBER],
        [0.6, {}],
      ],
    }),
    lowPunch: move('lowPunch', {
      name: 'Low Jab',
      duration: 0.3,
      base: 'crouch',
      crouch: true,
      hits: [hit(0.07, 0.13, 4, { height: 'low', reach: [0.2, 1.2], kb: 1.4, stun: 0.28, limb: 'handL' })],
      anim: [
        [0, {}],
        [0.08, { uaL: [-1.3, 0, 0.05], laL: [-0.1, 0, 0], torso: [0.55, -0.15, 0] }],
        [0.15, { uaL: [-1.3, 0, 0.05], laL: [-0.1, 0, 0], torso: [0.55, -0.15, 0] }],
        [0.3, {}],
      ],
    }),
    slide: move('slide', {
      name: 'Slide Tackle',
      duration: 0.7,
      cooldown: 0.4,
      hits: [hit(0.12, 0.38, 8, { height: 'low', reach: [0.0, 1.35], kb: 2.5, kd: true, launch: 4, sfx: 'kick', limb: 'footL' })],
      lunge: [{ at: 0.06, until: 0.4, speed: 7 }],
      anim: [
        [0, { thL: [-0.8, 0, 0.1], shL: [1.2, 0, 0] }],
        [0.12, { noGround: true, root: [-0.95, 0, 0], pos: [0, 0.32, 0], thL: [-1.5, 0, 0.1], shL: [0.05, 0, 0], thR: [-0.8, 0, -0.1], shR: [1.9, 0, 0], torso: [0.35, 0.2, 0], head: [0.5, 0, 0], uaL: [-0.5, 0, 0.9], laL: [-0.6, 0, 0], uaR: [0.6, 0, -0.5], laR: [-0.4, 0, 0] }],
        [0.42, { noGround: true, root: [-0.95, 0, 0], pos: [0, 0.32, 0], thL: [-1.5, 0, 0.1], shL: [0.05, 0, 0], thR: [-0.8, 0, -0.1], shR: [1.9, 0, 0], torso: [0.35, 0.2, 0], head: [0.5, 0, 0], uaL: [-0.5, 0, 0.9], laL: [-0.6, 0, 0], uaR: [0.6, 0, -0.5], laR: [-0.4, 0, 0] }],
        [0.56, P.crouch],
        [0.7, {}],
      ],
    }),
    flyingKnee: move('flyingKnee', {
      name: 'Flying Knee',
      duration: 0.48,
      base: 'jumpFall',
      air: true,
      hits: [hit(0.08, 0.32, 11, { y: [-0.2, 1.4], reach: [0.0, 1.2], kb: 4.5, stun: 0.45, bstun: 0.24, sfx: 'heavy', heavy: true, limb: 'footR' })],
      anim: [
        [0, { noGround: true }],
        [0.08, { noGround: true, thR: [-2.1, 0, 0], shR: [2.4, 0, 0], thL: [0.3, 0, 0.1], shL: [1.4, 0, 0], torso: [0.2, 0.3, 0], uaL: [-2.2, 0, 0.4], laL: [-1.4, 0, 0], uaR: [-2.2, 0, -0.4], laR: [-1.4, 0, 0] }],
        [0.34, { noGround: true, thR: [-2.1, 0, 0], shR: [2.4, 0, 0], thL: [0.3, 0, 0.1], shL: [1.4, 0, 0], torso: [0.2, 0.3, 0], uaL: [-2.2, 0, 0.4], laL: [-1.4, 0, 0], uaR: [-2.2, 0, -0.4], laR: [-1.4, 0, 0] }],
        [0.48, { noGround: true }],
      ],
    }),
    rush: move('rush', {
      name: 'Exam-Rush Shoulder',
      duration: 0.52,
      base: 'run',
      cooldown: 0.5,
      hits: [hit(0.1, 0.26, 9, { height: 'mid', reach: [0.0, 1.2], kb: 6, stun: 0.45, bstun: 0.22, heavy: true, sfx: 'heavy', limb: 'torso' })],
      lunge: [{ at: 0, until: 0.26, speed: 8.5 }],
      anim: [
        [0, {}],
        [0.1, { torso: [0.5, -1.1, 0], hips: [0, -0.8, 0], head: [-0.2, 0.8, 0], uaL: [-0.1, 0, 0.2], laL: [-2.2, 0, 0], uaR: [-0.6, 0, -0.4], laR: [-2.0, 0, 0], thL: [-0.9, 0, 0.15], shL: [0.9, 0, 0], thR: [0.4, 0, -0.15], shR: [0.6, 0, 0] }],
        [0.3, { torso: [0.5, -1.1, 0], hips: [0, -0.8, 0], head: [-0.2, 0.8, 0], uaL: [-0.1, 0, 0.2], laL: [-2.2, 0, 0], uaR: [-0.6, 0, -0.4], laR: [-2.0, 0, 0], thL: [-0.9, 0, 0.15], shL: [0.9, 0, 0], thR: [0.4, 0, -0.15], shR: [0.6, 0, 0] }],
        [0.52, P.stance],
      ],
    }),
    special: move('special', {
      name: 'E = mc² Textbook Toss',
      special: true,
      duration: 0.95,
      energyCost: 50,
      cooldown: 2.4,
      iframes: [0, 0.18],
      sfxStart: 'special',
      cinematic: { duration: 0.32, slowmo: 0.5 },
      aiRange: 6,
      projectiles: [
        {
          at: 0.4,
          kind: 'book',
          color: 0x5ad1ff,
          speed: 9.5,
          y: 1.25,
          range: 7.5,
          from: 'handR',
          interval: 0.12,
          hits: [
            hit(0, 0, 5, { height: 'mid', kb: 0.4, stun: 0.55, bstun: 0.3, chip: 0.25, sfx: 'punch', spark: 'electric' }),
            hit(0, 0, 5, { height: 'mid', kb: 0.4, stun: 0.55, chip: 0.25, sfx: 'punch', spark: 'electric' }),
            hit(0, 0, 10, { height: 'mid', kb: 4.5, launch: 7, kd: true, sfx: 'heavy', heavy: true, spark: 'electric' }),
          ],
        },
      ],
      fx: [
        { at: 0, type: 'aura', color: 0x5ad1ff, duration: 0.6 },
        { at: 0.05, type: 'formulas' },
      ],
      anim: [
        [0, {}],
        [0.22, THROW_WIND],
        [0.3, THROW_WIND],
        [0.42, THROW_REL],
        [0.62, THROW_REL],
        [0.95, {}],
      ],
    }),
  },
};
