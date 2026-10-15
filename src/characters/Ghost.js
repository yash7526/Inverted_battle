import * as THREE from 'three';
import { dynamic, glow, headGeo, limbGeo, latheGeo, sphereGeo, cylGeo, bentConeGeo, part, buildClaw } from './ModelKit.js';
import { hit, move, makePoses } from './MoveData.js';

// THE 404 GHOST — the restless spirit of hostel Room 404 from the "Maddy" comic.
// Floats instead of walking, has the longest reach in the roster, and can vanish
// and reappear right above its victim. Look from the comic cover: pale green
// translucent body, gaunt face, wild flowing hair, long clawed arms, wispy tail.

export const GHOST_PALETTES = [
  { body: 0xbdf0d6, glow: 0x2a9c86, core: 0x0f6f6a, hair: 0xb2e3cf, eye: 0x9dfff0, nail: 0x1d4a46, mouth: 0x08201d, rim: 0xa8ffe0 },
  { body: 0xdcd6ff, glow: 0x6a4fd8, core: 0x3a237a, hair: 0xc9c0f2, eye: 0xffa6ec, nail: 0x3d3266, mouth: 0x150d24, rim: 0xd8c4ff },
];

/** Shroud: an open lathe that flares out and ends in a ragged, rippling hem. */
function shroudGeo(top, bottom, rTop, rBottom) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(rBottom + (rTop - rBottom) * Math.pow(t, 0.7), bottom + (top - bottom) * t));
  }
  const g = new THREE.LatheGeometry(pts, 36);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < bottom + 0.02) {
      const a = Math.atan2(p.getX(i), p.getZ(i));
      p.setY(i, y - (0.5 + 0.5 * Math.sin(a * 7)) * 0.12 - (0.5 + 0.5 * Math.sin(a * 13 + 1)) * 0.05);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Spectral material: translucent in the middle, denser and glowing at the edges
 * (fresnel), so the silhouette stays readable on bright and dark stages.
 */
function spectralMat(color, pal, { opacity = 0.62, edge = 0.95, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, transparent: true, opacity: 1, emissive: pal.glow, emissiveIntensity: 0.22, side, depthWrite: true });
  m.userData.baseOpacity = 1;
  const u = { uCoreA: { value: opacity }, uEdgeA: { value: edge }, uEdge: { value: new THREE.Color(pal.rim) } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCoreA; uniform float uEdgeA; uniform vec3 uEdge;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 1.8);
          outgoingLight += uEdge * fr * 0.55;
          diffuseColor.a *= mix(uCoreA, uEdgeA, fr);
        }
        #include <opaque_fragment>`
      );
  };
  m.customProgramCacheKey = () => 'iu-spectral';
  return m;
}

/** Flowing ribbon tendril: a flat tapered strip along a curve (reads better than a tube). */
function ribbonGeo(points, w0, w1, seg = 20) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)));
  const pos = [];
  const idx = [];
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    const w = w0 + (w1 - w0) * t;
    pos.push(c.x - side.x * w, c.y - side.y * w, c.z - side.z * w, c.x + side.x * w, c.y + side.y * w, c.z + side.z * w);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildModel(rig, pal) {
  const p = rig.p;
  const R = p.headR;
  const mats = [];
  const track = (m, base = m.opacity) => {
    m.userData.baseOpacity = base;
    mats.push(m);
    return m;
  };
  const body = track(spectralMat(pal.body, pal, { opacity: 0.66, edge: 0.96 }));
  const head2 = track(spectralMat(pal.body, pal, { opacity: 0.8, edge: 0.98 }));
  const wisp = track(spectralMat(pal.hair, pal, { opacity: 0.62, edge: 0.92, side: THREE.DoubleSide }));
  const nail = track(spectralMat(pal.nail, pal, { opacity: 0.92, edge: 1.0 }));
  const core = track(new THREE.MeshStandardMaterial({ color: pal.core, emissive: pal.core, emissiveIntensity: 0.6, roughness: 0.6, transparent: true, opacity: 0.85 }));
  const socket = track(new THREE.MeshBasicMaterial({ color: pal.mouth, transparent: true, opacity: 0.95 }));
  const eyeGlow = track(glow(pal.eye), 1);
  eyeGlow.transparent = true;
  const auraTex = new THREE.CanvasTexture(
    (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return c;
    })()
  );
  const j = rig.j;

  // ---------------- head: long skull, glowing almond eyes, mischievous grin
  const head = new THREE.Group();
  head.position.y = R * 0.95;
  j.head.add(head);
  part(headGeo(R, { jaw: 0.5, chin: 0.3, cheek: -0.08, flat: -0.05 }), head2, head, { sx: 0.88, sy: 1.18, sz: 0.95 });
  part(sphereGeo(R * 0.55, 20, 16), core, head, { y: -R * 0.05, s: 1 }); // dim inner core shows through
  const pupils = [];
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(s * R * 0.33, R * 0.12, R * 0.83);
    eye.rotation.z = s * 0.28; // upturned outer corners: playful, not horrifying
    head.add(eye);
    part(sphereGeo(R * 0.25, 22, 16), socket, eye, { sx: 1.25, sy: 0.82, sz: 0.38, shadow: false });
    pupils.push(dynamic(part(sphereGeo(R * 0.17, 18, 14), eyeGlow, eye, { z: R * 0.05, sx: 1.2, sy: 0.78, sz: 0.35, shadow: false })));
    part(sphereGeo(R * 0.05, 8, 6), glow(0xffffff), eye, { x: R * 0.06, y: R * 0.04, z: R * 0.1, shadow: false });
  }
  // grin: a wide crescent with little fangs, one corner hitched up
  const mouth = dynamic(new THREE.Group());
  mouth.position.set(0, -R * 0.6, R * 0.86);
  mouth.rotation.z = -0.1;
  head.add(mouth);
  part(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), socket, mouth, { sx: R * 0.42, sy: R * 0.24, sz: R * 0.12, shadow: false, own: true });
  const fang = bentConeGeo(R * 0.04, R * 0.12, 0, 6);
  for (const x of [-0.24, -0.08, 0.08, 0.24]) part(fang, head2, mouth, { x: x * R, y: -R * 0.005, z: R * 0.06, rx: Math.PI, shadow: false });

  // flowing hair tendrils (ribbons) from the crown, swaying in update()
  const strands = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 11 - 0.5) * 2.9;
    const g = dynamic(new THREE.Group());
    g.position.set(Math.sin(a) * R * 0.6, R * 0.8, -R * 0.15 + Math.cos(a) * R * 0.2);
    head.add(g);
    const len = 0.8 + ((i * 37) % 10) / 25;
    const sx = Math.sin(a);
    const pts = [
      [0, 0, 0],
      [sx * 0.08, 0.06, -0.14],
      [sx * 0.18, -0.06, -0.34],
      [sx * 0.24, -0.3 * len, -0.5 * len],
      [sx * 0.3 + 0.05, -0.62 * len, -0.58 * len],
      [sx * 0.34, -0.9 * len, -0.62 * len],
    ];
    part(ribbonGeo(pts, 0.045, 0.004), wisp, g, { own: true, shadow: false });
    g.userData.phase = i * 0.7;
    strands.push(g);
  }

  part(cylGeo(0.05, 0.07, 0.2, 16), body, j.torso, { y: p.torsoLen + 0.05 });

  // ---------------- torso: lean ribcage, glowing core, ragged shroud
  const t = j.torso;
  part(latheGeo([[0.02, 0.1], [0.18, 0.13], [0.36, 0.17], [0.5, 0.18], [p.torsoLen + 0.02, 0.1]], { seg: 32 }), body, t, { sz: 0.7 });
  const heart = dynamic(part(sphereGeo(0.075, 18, 14), core, t, { y: 0.4, z: 0.0 }));
  for (let r = 0; r < 4; r++) part(cylGeo(0.152 - r * 0.004, 0.152 - r * 0.004, 0.01, 28, true), nail, t, { y: 0.28 + r * 0.06, sz: 0.72, shadow: false }); // rib hints
  const shroud = shroudGeo(p.torsoLen - 0.05, -0.22, 0.17, 0.31);
  const shroudBase = shroud.attributes.position.array.slice();
  dynamic(part(shroud, track(spectralMat(pal.body, pal, { opacity: 0.5, edge: 0.9, side: THREE.DoubleSide })), t, { sz: 0.85, own: true }));

  // ---------------- arms: long and bony, tattered sleeves, talons + spectral shimmer
  const auras = [];
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    part(sphereGeo(0.07, 16, 12), body, j['ua' + s]);
    part(limbGeo(0.052, 0.04, p.upperArm, { bulge: 0 }), body, j['ua' + s]);
    part(limbGeo(0.043, 0.032, p.foreArm, { bulge: 0.05 }), body, j['la' + s]);
    for (let k = 0; k < 3; k++) {
      const pts = [
        [0, 0, 0],
        [side * 0.02, -0.08, -0.05],
        [side * 0.03, -0.2 - k * 0.04, -0.07],
      ];
      part(ribbonGeo(pts, 0.035, 0.003, 10), wisp, j['ua' + s], { y: -p.upperArm * (0.35 + k * 0.22), z: -0.03, own: true, shadow: false });
    }
    buildClaw(rig['hand' + s], body, { size: 1.18, side, nail });
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, color: pal.rim, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.position.y = -0.1;
    aura.scale.setScalar(0.35);
    rig['hand' + s].add(aura);
    track(aura.material, 0.35);
    auras.push(aura);
  }

  // ---------------- tail: replaces legs (rides the right-leg joints so kicks whip it)
  part(sphereGeo(0.21, 22, 16), body, j.hips, { y: 0.02, sx: 1.1, sz: 0.8 });
  part(sphereGeo(0.09, 14, 10), core, j.hips, { y: 0.02 });
  part(limbGeo(0.21, 0.14, p.thigh, { bulge: 0.02 }), body, j.thR);
  part(limbGeo(0.14, 0.05, p.shin, { bulge: 0 }), body, j.shR);
  part(bentConeGeo(0.05, 0.3, 0.4, 8), body, rig.footR, { rx: Math.PI });
  part(limbGeo(0.1, 0.05, p.thigh * 0.85, { bulge: 0 }), wisp, j.thL);
  part(limbGeo(0.05, 0.01, p.shin * 0.7, { bulge: 0 }), wisp, j.shL);
  // trailing tendrils off the tail
  for (let k = 0; k < 3; k++) {
    const pts = [
      [0, 0, 0],
      [(k - 1) * 0.06, -0.12, -0.08],
      [(k - 1) * 0.12, -0.28, -0.1],
    ];
    part(ribbonGeo(pts, 0.04, 0.003, 10), wisp, j.shR, { y: -p.shin * 0.5, own: true, shadow: false });
  }

  let time = 0;
  const sp = shroud.attributes.position;
  return {
    update(dt, f) {
      time += dt;
      const speed = Math.min(1.5, Math.abs(f.vx) / 4 + (f.y > 0.05 ? 0.4 : 0));
      strands.forEach((g, i) => {
        g.rotation.x = Math.sin(time * 2.4 + g.userData.phase) * (0.12 + speed * 0.12) - speed * 0.35;
        g.rotation.z = Math.sin(time * 1.7 + i) * 0.12;
      });
      for (let i = 0; i < sp.count; i++) {
        const y0 = shroudBase[i * 3 + 1];
        const k = Math.max(0, (0.1 - y0) / 0.35);
        const a = Math.atan2(shroudBase[i * 3], shroudBase[i * 3 + 2]);
        const w = Math.sin(time * 4 + a * 3) * 0.03 * k;
        sp.setXYZ(i, shroudBase[i * 3] * (1 + w), y0 + Math.sin(time * 3 + a * 5) * 0.02 * k, shroudBase[i * 3 + 2] * (1 + w) - speed * 0.12 * k);
      }
      sp.needsUpdate = true;
      const hurt = f.state === 'hit' || f.state === 'knockdown' || f.state === 'down';
      const attacking = f.state === 'attack';
      const flare = attacking ? 1.35 : hurt ? 0.55 : 1;
      pupils.forEach((pp) => pp.scale.set(1.2 * flare, 0.78 * (hurt ? 0.5 : 1), 0.35));
      mouth.scale.set(1, attacking ? 1.7 : hurt ? 0.6 : 1 + Math.sin(time * 2) * 0.06, 1);
      heart.scale.setScalar(1 + Math.sin(time * 3) * 0.08 + (attacking ? 0.25 : 0));
      // spectral shimmer around the claws, stronger when striking
      auras.forEach((a, i) => {
        a.scale.setScalar((attacking ? 0.55 : 0.32) + Math.sin(time * 6 + i) * 0.04);
        a.material.rotation = time * (i ? 1.3 : -1.1);
      });
      // vanish (special move)
      const alpha = 1 - f.vanish;
      for (const m of mats) m.opacity = m.userData.baseOpacity * alpha;
      rig.body.visible = alpha > 0.03;
    },
    dispose() {
      auraTex.dispose();
    },
  };
}

// tail positions used by every pose (the generic leg angles would curl it oddly)
const TAIL = { thR: [0.35, 0, 0], shR: [0.55, 0, 0], thL: [0.6, 0, 0.25], shL: [0.5, 0, 0] };
const TAIL_UP = { thR: [0.9, 0, 0], shR: [0.7, 0, 0], thL: [1.1, 0, 0.3], shL: [0.6, 0, 0] };

const P = makePoses({
  stance: { hips: [0, -0.2, 0], torso: [0.3, 0.15, 0], head: [-0.2, 0.05, 0], uaL: [-1.25, 0, 0.6], laL: [-0.85, 0, 0], uaR: [-1.05, 0, -0.65], laR: [-1.05, 0, 0], ...TAIL },
  run: { torso: [0.75, 0, 0], head: [-0.6, 0, 0], uaL: [0.5, 0, 0.4], laL: [-0.2, 0, 0], uaR: [0.5, 0, -0.4], laR: [-0.2, 0, 0], ...TAIL_UP },
  backdash: { torso: [-0.2, 0.15, 0], head: [0.1, 0, 0], uaL: [-1.6, 0, 0.9], laL: [-0.5, 0, 0], uaR: [-1.6, 0, -0.9], laR: [-0.5, 0, 0], ...TAIL, thR: [-0.3, 0, 0] },
  crouch: { pos: [0, -0.32, 0], hips: [0, -0.2, 0], torso: [0.6, 0.15, 0], head: [-0.5, 0, 0], uaL: [-1.0, 0, 0.6], laL: [-0.8, 0, 0], uaR: [-0.9, 0, -0.6], laR: [-0.9, 0, 0], ...TAIL_UP },
  block: { torso: [0.1, 0.1, 0], head: [0.25, 0, 0], uaL: [-1.6, 0, -0.2], laL: [-1.9, 0, 0], uaR: [-1.5, 0, 0.2], laR: [-1.9, 0, 0], ...TAIL },
  crouchBlock: { pos: [0, -0.32, 0], torso: [0.6, 0.1, 0], head: [0.15, 0, 0], uaL: [-1.6, 0, -0.2], laL: [-1.9, 0, 0], uaR: [-1.5, 0, 0.2], laR: [-1.9, 0, 0], ...TAIL_UP },
  jumpUp: { noGround: true, torso: [0.1, 0, 0], uaL: [-2.4, 0, 0.6], laL: [-0.3, 0, 0], uaR: [-2.4, 0, -0.6], laR: [-0.3, 0, 0], ...TAIL, thR: [0.1, 0, 0] },
  jumpFall: { noGround: true, torso: [0.3, 0, 0], uaL: [-0.8, 0, 1.2], laL: [-0.4, 0, 0], uaR: [-0.8, 0, -1.2], laR: [-0.4, 0, 0], ...TAIL_UP },
  hitHigh: { torso: [-0.5, 0.2, 0.1], head: [-0.6, 0.3, 0], uaL: [-0.4, 0, 1.1], laL: [-0.5, 0, 0], uaR: [-0.3, 0, -1.0], laR: [-0.5, 0, 0], ...TAIL, thR: [-0.2, 0, 0] },
  hitBody: { torso: [0.8, -0.1, 0], head: [0.3, 0, 0], uaL: [-0.6, 0, 0.4], laL: [-1.2, 0, 0], uaR: [-0.6, 0, -0.4], laR: [-1.2, 0, 0], ...TAIL_UP },
  hitLow: { pos: [0, -0.3, 0], torso: [0.2, 0.4, 0.15], head: [-0.4, 0.2, 0], uaL: [-0.4, 0, 0.9], laL: [-0.6, 0, 0], uaR: [-0.3, 0, -0.8], laR: [-0.6, 0, 0], ...TAIL_UP },
  fall: { ...TAIL_UP },
  down: { ...TAIL, thR: [0.1, 0, 0], shR: [0.3, 0, 0] },
  getup: { ...TAIL_UP, torso: [0.6, 0, 0] },
  victory: { torso: [-0.25, 0, 0], head: [-0.5, 0, 0], uaL: [-2.8, 0, 0.9], laL: [-0.3, 0, 0], uaR: [-2.8, 0, -0.9], laR: [-0.3, 0, 0], ...TAIL },
  defeat: { torso: [0.9, 0, 0], head: [0.7, 0, 0], uaL: [0.1, 0, 0.3], laL: [-0.2, 0, 0], uaR: [0.1, 0, -0.3], laR: [-0.2, 0, 0], ...TAIL_UP },
});

const CLAW_HIGH = { uaR: [-2.7, 0, -0.9], laR: [-0.6, 0, 0], torso: [0.05, -0.45, 0], head: [-0.3, 0.2, 0], uaL: [-1.3, 0, 0.7], laL: [-0.6, 0, 0] };
const CLAW_LOW = { uaR: [-0.9, 0, 0.35], laR: [-0.15, 0, 0], torso: [0.55, 0.5, 0], head: [-0.3, -0.3, 0], uaL: [-1.4, 0, 0.6], laL: [-0.9, 0, 0] };
const RAKE_HIGH = { uaR: [-2.6, 0, -0.8], laR: [-0.4, 0, 0], uaL: [-2.6, 0, 0.8], laL: [-0.4, 0, 0], torso: [-0.15, 0, 0], head: [-0.4, 0, 0] };
const RAKE_LOW = { uaR: [-0.9, 0, 0.2], laR: [-0.1, 0, 0], uaL: [-0.9, 0, -0.2], laL: [-0.1, 0, 0], torso: [0.7, 0, 0], head: [-0.4, 0, 0] };
const TAIL_WIND = { hips: [0, -0.9, 0], torso: [0.3, -0.5, 0], thR: [0.9, 0, 0.6], shR: [0.6, 0, 0] };
const TAIL_LASH = { hips: [0, 0.9, 0], torso: [0.2, 0.6, -0.2], head: [-0.2, -0.5, 0], thR: [-1.35, 0, -0.5], shR: [-0.25, 0, 0], thL: [0.2, 0, 0.6], uaL: [-1.6, 0, 1.0], uaR: [-0.8, 0, -1.2] };
const SCREAM = { torso: [-0.4, 0, 0], head: [-0.6, 0, 0], uaL: [-2.6, 0, 1.3], laL: [-0.2, 0, 0], uaR: [-2.6, 0, -1.3], laR: [-0.2, 0, 0], ...TAIL_UP };
const DIVE = { noGround: true, torso: [1.1, 0, 0], head: [-0.8, 0, 0], uaL: [-2.4, 0, 0.35], laL: [-0.15, 0, 0], uaR: [-2.4, 0, -0.35], laR: [-0.15, 0, 0], thR: [1.0, 0, 0], shR: [0.4, 0, 0], thL: [1.2, 0, 0.3], shL: [0.4, 0, 0] };

export const Ghost = {
  id: 'ghost',
  name: 'GHOST 404',
  title: 'The Spirit of Room 404',
  style: 'Reach • Evasive',
  description: 'Floats, flickers and haunts. The longest arms in the roster, a tail that lashes like a whip, and a vanishing act that ends with claws from above.',
  portrait: null,
  art: null,
  accent: '#5FD39A',
  trailColor: '#9dffc8',
  stats: { power: 3, speed: 3, defense: 2, range: 5 },
  scale: 0.92,
  proportions: { legLen: 0.95, thigh: 0.45, shin: 0.42, footH: 0.11, torsoLen: 0.6, neck: 0.11, headR: 0.26, shoulderW: 0.23, hipW: 0.0, upperArm: 0.37, foreArm: 0.35 },
  floating: { height: 0.32, bob: 0.06 },
  gravityScale: 0.72,
  walkSpeed: 2.6,
  backSpeed: 2.6,
  stride: 1.2,
  jumpVel: 9.0,
  jumpX: 3.3,
  dashSpeed: 11.5,
  weight: 0.85,
  maxHealth: 136,
  hurtHeight: 1.95,
  crouchHeight: 1.15,
  palettes: GHOST_PALETTES,
  build: buildModel,
  gltf: { clips: { idle: 'Idle', walk: 'Float', run: 'Dash', jump: 'Jump', crouch: 'Crouch', block: 'Block', hit: 'Hit', knockdown: 'Knockdown', down: 'Down', getup: 'GetUp', victory: 'Victory', defeat: 'Defeat', claw: 'Claw', tailLash: 'Tail', special: 'Haunt' } },

  poses: P,
  loops: {
    intro: [
      [0, SCREAM],
      [0.6, SCREAM],
      [0.9, { ...SCREAM, head: [-0.3, 0.4, 0] }],
      [1.3, {}],
    ],
    victory: [
      [0, {}],
      [0.5, SCREAM],
      [1.1, { torso: [-0.25, 0, 0], head: [-0.5, 0, 0], uaL: [-2.8, 0, 0.9], laL: [-0.3, 0, 0], uaR: [-2.8, 0, -0.9], laR: [-0.3, 0, 0], ...TAIL }],
    ],
  },

  commands: {
    punch: 'claw',
    kick: 'tailLash',
    crouchPunch: 'graveGrab',
    crouchKick: 'floorCreep',
    airPunch: 'phantomDive',
    airKick: 'phantomDive',
    dashPunch: 'phaseRush',
    dashKick: 'phaseRush',
    special: 'special',
  },

  moveList: [
    ['Spectral Claw', 'F (→ F Double Rake)'],
    ['Tail Lash', 'G'],
    ['Grave Grab', 'S + F'],
    ['Floor Creep', 'S + G (knockdown)'],
    ['Phantom Dive', 'W + F / G'],
    ['Phase Rush', 'Shift + F (passes through attacks)'],
    ['Room 404 Haunting', 'R (50 energy)'],
  ],

  moves: {
    claw: move('claw', {
      name: 'Spectral Claw',
      duration: 0.48,
      hits: [hit(0.15, 0.23, 6, { height: 'mid', y: [0.7, 2.0], reach: [0.2, 1.65], kb: 2.6, stun: 0.36, bstun: 0.18, limb: 'handR', spark: 'ghost' })],
      cancels: { punch: 'rake' },
      cancelAfter: 0.2,
      anim: [
        [0, {}],
        [0.11, CLAW_HIGH],
        [0.19, CLAW_LOW],
        [0.28, CLAW_LOW],
        [0.48, {}],
      ],
    }),
    rake: move('rake', {
      name: 'Double Rake',
      duration: 0.6,
      hits: [hit(0.2, 0.3, 8, { height: 'mid', y: [0.5, 2.0], reach: [0.2, 1.6], kb: 4.5, stun: 0.42, bstun: 0.22, heavy: true, limb: 'handL', spark: 'ghost' })],
      lunge: [{ at: 0.12, until: 0.26, speed: 2.2 }],
      anim: [
        [0, CLAW_LOW],
        [0.14, RAKE_HIGH],
        [0.24, RAKE_LOW],
        [0.36, RAKE_LOW],
        [0.6, {}],
      ],
    }),
    tailLash: move('tailLash', {
      name: 'Tail Lash',
      duration: 0.58,
      hits: [hit(0.22, 0.32, 8, { height: 'mid', y: [0.2, 1.4], reach: [0.2, 1.6], kb: 4.5, stun: 0.4, bstun: 0.22, sfx: 'kick', limb: 'footR', spark: 'ghost' })],
      anim: [
        [0, {}],
        [0.14, TAIL_WIND],
        [0.25, TAIL_LASH],
        [0.36, TAIL_LASH],
        [0.58, {}],
      ],
    }),
    graveGrab: move('graveGrab', {
      name: 'Grave Grab',
      duration: 0.38,
      base: 'crouch',
      crouch: true,
      hits: [hit(0.1, 0.17, 5, { height: 'low', reach: [0.2, 1.5], kb: 1.6, stun: 0.3, limb: 'handR', spark: 'ghost' })],
      anim: [
        [0, {}],
        [0.1, { uaR: [-1.2, 0, 0.1], laR: [-0.05, 0, 0], torso: [0.7, 0.4, 0] }],
        [0.2, { uaR: [-1.2, 0, 0.1], laR: [-0.05, 0, 0], torso: [0.7, 0.4, 0] }],
        [0.38, {}],
      ],
    }),
    floorCreep: move('floorCreep', {
      name: 'Floor Creep',
      duration: 0.72,
      base: 'crouch',
      crouch: true,
      cooldown: 0.4,
      hits: [hit(0.16, 0.4, 7, { height: 'low', reach: [0.0, 1.5], kb: 2.5, kd: true, launch: 3.5, limb: 'handL', spark: 'ghost' })],
      lunge: [{ at: 0.1, until: 0.42, speed: 6 }],
      anim: [
        [0, {}],
        [0.14, { pos: [0, -0.55, 0], torso: [1.1, 0, 0], head: [-0.9, 0, 0], uaL: [-1.4, 0, 0.2], laL: [-0.05, 0, 0], uaR: [-1.4, 0, -0.2], laR: [-0.05, 0, 0], ...TAIL_UP }],
        [0.44, { pos: [0, -0.55, 0], torso: [1.1, 0, 0], head: [-0.9, 0, 0], uaL: [-1.4, 0, 0.2], laL: [-0.05, 0, 0], uaR: [-1.4, 0, -0.2], laR: [-0.05, 0, 0], ...TAIL_UP }],
        [0.72, {}],
      ],
    }),
    phantomDive: move('phantomDive', {
      name: 'Phantom Dive',
      duration: 0.5,
      base: 'jumpFall',
      air: true,
      hits: [hit(0.08, 0.36, 11, { y: [-0.6, 1.2], reach: [0.0, 1.5], kb: 4.5, stun: 0.45, bstun: 0.24, heavy: true, limb: 'handR', spark: 'ghost' })],
      impulses: [{ at: 0.06, vx: 3.5, vy: -3 }],
      anim: [
        [0, { noGround: true, ...RAKE_HIGH }],
        [0.08, DIVE],
        [0.38, DIVE],
        [0.5, { noGround: true }],
      ],
    }),
    phaseRush: move('phaseRush', {
      name: 'Phase Rush',
      duration: 0.55,
      base: 'run',
      cooldown: 0.7,
      iframes: [0, 0.16],
      vanish: [0.0, 0.12],
      hits: [hit(0.12, 0.3, 9, { height: 'mid', reach: [0.0, 1.4], kb: 5.5, stun: 0.45, bstun: 0.22, heavy: true, limb: 'handR', spark: 'ghost' })],
      lunge: [{ at: 0, until: 0.3, speed: 8.5 }],
      anim: [
        [0, {}],
        [0.1, { torso: [0.9, 0, 0], head: [-0.7, 0, 0], uaL: [-1.6, 0, 0.2], laL: [-0.1, 0, 0], uaR: [-1.6, 0, -0.2], laR: [-0.1, 0, 0], ...TAIL_UP }],
        [0.32, { torso: [0.9, 0, 0], head: [-0.7, 0, 0], uaL: [-1.6, 0, 0.2], laL: [-0.1, 0, 0], uaR: [-1.6, 0, -0.2], laR: [-0.1, 0, 0], ...TAIL_UP }],
        [0.55, P.stance],
      ],
    }),
    special: move('special', {
      name: 'Room 404 Haunting',
      special: true,
      duration: 1.45,
      energyCost: 50,
      cooldown: 3,
      iframes: [0, 0.66],
      vanish: [0.16, 0.56],
      teleport: { at: 0.38, dist: 0.95, height: 2.1 },
      hover: [0.38, 0.62],
      impulses: [{ at: 0.62, vx: 2.2, vy: -10 }],
      endsOnLand: false,
      sfxStart: 'special',
      cinematic: { duration: 0.45, slowmo: 0.55 },
      aiRange: 5,
      hits: [
        hit(0.63, 0.75, 6, { y: [-1.6, 1.0], reach: [-0.3, 1.5], radial: true, kb: 0.6, stun: 0.6, bstun: 0.35, chip: 0.25, limb: 'handR', spark: 'ghost' }),
        hit(0.8, 0.88, 6, { y: [-0.2, 1.6], reach: [-0.3, 1.5], radial: true, kb: 0.6, stun: 0.6, bstun: 0.35, chip: 0.25, limb: 'handL', spark: 'ghost' }),
        hit(0.92, 1.04, 12, { y: [-0.2, 1.5], radial: true, reach: [-1.4, 2.0], kb: 4.5, launch: 7, kd: true, chip: 0.25, sfx: 'heavy', heavy: true, limb: 'handR', spark: 'ghost' }),
      ],
      fx: [
        { at: 0, type: 'ghostScream' },
        { at: 0.16, type: 'phaseOut' },
        { at: 0.92, type: 'shockwave', color: 0x7dffb0 },
      ],
      anim: [
        [0, {}],
        [0.14, SCREAM],
        [0.36, SCREAM],
        [0.55, { noGround: true, ...RAKE_HIGH, torso: [0.3, 0, 0], ...TAIL_UP }],
        [0.66, DIVE],
        [0.78, { noGround: true, ...RAKE_LOW, ...TAIL_UP }],
        [0.86, { noGround: true, ...RAKE_HIGH, ...TAIL_UP }],
        [0.95, { ...RAKE_LOW, torso: [1.0, 0, 0], ...TAIL_UP }],
        [1.15, { ...RAKE_LOW, torso: [1.0, 0, 0], ...TAIL_UP }],
        [1.45, {}],
      ],
    }),
  },
};
