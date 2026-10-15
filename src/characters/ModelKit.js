import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// ModelKit — shared building blocks for the stylised 3D cartoon fighters:
// rim-lit "premium toy" materials, smooth tapered limbs, lathe torsos, faces with
// blinking eyes and expressions, fists, sneakers, boots, spiky hair tufts and
// plaid fabric. Character files compose these instead of raw primitives.
// ---------------------------------------------------------------------------

const geoCache = new Map();
export function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

// ------------------------------------------------------------------ materials
const RIM_CHUNK_DECL = /* glsl */ `#include <common>
uniform float uRim;
uniform vec3 uRimColor;`;
const RIM_CHUNK_APPLY = /* glsl */ `
{
  float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  outgoingLight += uRimColor * pow(rimF, 2.6) * uRim;
}
#include <opaque_fragment>`;

// Character-only reflection environment (a soft studio "room" set by the Game).
// Only fighter materials receive it, so arena lighting is untouched.
const ENV = { tex: null };
export function setCharacterEnv(tex) {
  ENV.tex = tex;
}

function rimHook(m, rim, rimColor, envI) {
  m.userData.rimU = { value: rim };
  m.userData.rimColorU = { value: new THREE.Color(rimColor) };
  m.userData.envI = envI;
  if (ENV.tex) {
    m.envMap = ENV.tex;
    m.envMapIntensity = envI;
  }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = m.userData.rimU;
    shader.uniforms.uRimColor = m.userData.rimColorU;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', RIM_CHUNK_DECL).replace('#include <opaque_fragment>', RIM_CHUNK_APPLY);
  };
  m.customProgramCacheKey = () => 'iu-rimlit';
  return m;
}

/**
 * Base stylised PBR material with a restrained fresnel rim light. Every character
 * material shares one rim-lit shader variant per material type.
 */
export function toon(color, { rough = 0.6, metal = 0, rim = 0.14, rimColor = 0xdfe9ff, envI = 0.3, ...rest } = {}) {
  return rimHook(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...rest }), rim, rimColor, envI);
}

/** Skin: soft, slightly velvety (sheen fakes light scattering under the skin). */
export function skinMat(color, { rim = 0.12, rimColor = 0xffd9c0 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xff8a6a), specularIntensity: 0.35 });
  return rimHook(m, rim, rimColor, 0.22);
}

/** Woven fabric: matte with a soft sheen and a fine weave normal map. */
export function fabricMat(colorOrMap, { rough = 0.86, sheen = 0.6, weave = 'cloth', repeat = [6, 6], normalScale = 0.55, side = THREE.FrontSide, rim = 0.1 } = {}) {
  const isMap = colorOrMap && colorOrMap.isTexture;
  const m = new THREE.MeshPhysicalMaterial({
    color: isMap ? 0xffffff : colorOrMap,
    map: isMap ? colorOrMap : null,
    roughness: rough,
    metalness: 0,
    sheen,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xffffff).multiplyScalar(0.55),
    specularIntensity: 0.25,
    side,
  });
  m.normalMap = weave === 'twill' ? twillNormal(repeat) : weave === 'knit' ? knitNormal(repeat) : clothNormal(repeat);
  m.normalScale.set(normalScale, normalScale);
  return rimHook(m, rim, 0xdfe9ff, 0.18);
}

/** Hair: satin, not glossy plastic. */
export function hairMat(color, { rim = 0.22, rimColor = 0xc8d4ff } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, metalness: 0, sheen: 0.8, sheenRoughness: 0.35, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45), specularIntensity: 0.4 });
  m.normalMap = strandNormal();
  m.normalScale.set(0.32, 0.32);
  return rimHook(m, rim, rimColor, 0.25);
}

/** Brushed or polished metal (gold trim, steel). Needs the character environment. */
export function metalMat(color, { rough = 0.32, brushed = true, envI = 1.0, rim = 0.08 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.92 });
  if (brushed) m.roughnessMap = brushedRough();
  return rimHook(m, rim, 0xffffff, envI);
}

/** Painted / anodised armor: semi-metallic with fine wear and optional panel lines. */
export function armorMat(color, { rough = 0.42, metal = 0.55, panels = false, repeat = [3, 3], envI = 0.7, rim = 0.12, rimColor = 0xdfe9ff } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  m.roughnessMap = wearRough();
  if (panels) {
    m.normalMap = panelNormal(repeat);
    m.normalScale.set(0.8, 0.8);
  }
  return rimHook(m, rim, rimColor, envI);
}

/** Rubber / flexible joint material. */
export function rubberMat(color, { ribbed = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
  if (ribbed) {
    m.normalMap = ribNormal();
    m.normalScale.set(1, 1);
  }
  return rimHook(m, 0.06, 0xffffff, 0.12);
}

/** Unlit glowing material (visors, LEDs, ghost eyes). */
export function glow(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}

// ------------------------------------------------------------------ geometry
/**
 * Smooth tapered limb segment hanging from its joint (top at y=0, bottom at y=-len),
 * with rounded ends that overlap the neighbouring joints so no seams show.
 */
export function limbGeo(r0, r1, len, { bulge = 0.06, seg = 18 } = {}) {
  return cached(`limb${r0}|${r1}|${len}|${bulge}|${seg}`, () => {
    const pts = [];
    const capSteps = 6;
    for (let i = 0; i <= capSteps; i++) {
      const a = -Math.PI / 2 + (i / capSteps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, r1 * Math.cos(a)), -len + r1 * Math.sin(a)));
    }
    // gentle muscle bulge in the upper half
    const midR = Math.max(r0, r1) * (1 + bulge);
    pts.push(new THREE.Vector2((r1 + midR) / 2, -len * 0.62));
    pts.push(new THREE.Vector2(midR, -len * 0.35));
    for (let i = 0; i <= capSteps; i++) {
      const a = (i / capSteps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, r0 * Math.cos(a)), r0 * Math.sin(a)));
    }
    return new THREE.LatheGeometry(pts, seg);
  });
}

/**
 * Torso / body shell from a radius profile [[y, r], ...] listed bottom → top.
 * `phiGap` opens the front (an unbuttoned shirt or jacket).
 */
export function latheGeo(profile, { seg = 28, phiGap = 0, closeTop = true, closeBottom = true } = {}) {
  const key = `lathe${JSON.stringify(profile)}|${seg}|${phiGap}|${closeTop}|${closeBottom}`;
  return cached(key, () => {
    const pts = [];
    if (closeBottom) pts.push(new THREE.Vector2(0.0001, profile[0][0] - 0.005));
    for (const [y, r] of profile) pts.push(new THREE.Vector2(r, y));
    if (closeTop) pts.push(new THREE.Vector2(0.0001, profile[profile.length - 1][0] + 0.005));
    // smooth the profile with a spline for a sculpted look
    const curve = new THREE.SplineCurve(pts);
    const smooth = curve.getPoints(Math.max(24, pts.length * 4));
    const g = new THREE.LatheGeometry(smooth, seg, phiGap / 2, Math.PI * 2 - phiGap);
    g.computeVertexNormals();
    return g;
  });
}

export function sphereGeo(r, w = 28, h = 20) {
  return cached(`sph${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
}
export function capsuleGeo(r, len, seg = 14) {
  return cached(`cap${r}|${len}|${seg}`, () => new THREE.CapsuleGeometry(r, len, 6, seg));
}
export function rboxGeo(w, h, d, r = 0.03, seg = 3) {
  return cached(`rbox${w}|${h}|${d}|${r}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
}
export function cylGeo(rt, rb, h, seg = 20, open = false) {
  return cached(`cyl${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}
export function torusGeo(r, t, arc = Math.PI * 2, rs = 10, ts = 28) {
  return cached(`tor${r}|${t}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
}

/** A cone bent along +z (or -z) — spiky hair tufts, claws, flames. Base at y=0. */
export function bentConeGeo(r, h, bend = 0.4, seg = 10) {
  return cached(`bcone${r}|${h}|${bend}|${seg}`, () => {
    const g = new THREE.ConeGeometry(r, h, seg, 6);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / h;
      p.setZ(i, p.getZ(i) - bend * h * y * y);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Tube along points with radius tapering from r0 to r1 (hair strands, cables, brows). */
export function taperTubeGeo(points, r0, r1, { tubular = 24, radial = 8 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  // TubeGeometry is built with radius 1 → scale each ring toward the curve point
  const frames = tubular + 1;
  for (let i = 0; i < frames; i++) {
    const t = i / tubular;
    const r = r0 + (r1 - r0) * t;
    const c = curve.getPointAt(t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + n.getX(k) * r, c.y + n.getY(k) * r, c.z + n.getZ(k) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * One smooth cartoon head: a sphere sculpted into cranium, cheeks, jaw and chin so
 * there are no seams between separate blobs.
 */
export function headGeo(R, { jaw = 0.12, chin = 0.1, cheek = 0.08, back = 0.04, flat = 0.06, seg = 40 } = {}) {
  return cached(`head${R}|${jaw}|${chin}|${cheek}|${back}|${flat}|${seg}`, () => {
    const g = new THREE.SphereGeometry(R, seg, Math.round(seg * 0.75));
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).divideScalar(R);
      const low = Math.max(0, -v.y); // 0 at equator → 1 at bottom
      const front = Math.max(0, v.z);
      // widen + square the lower face, push the chin forward, round the cheeks
      const sx = 1 + cheek * Math.sin(Math.PI * Math.min(1, low * 1.6)) * front - jaw * low * low * 0.6;
      let x = v.x * sx;
      let y = v.y * (1 - low * flat);
      let z = v.z * (1 + chin * low * front) - back * Math.max(0, -v.z) * Math.max(0, v.y);
      if (v.y < 0) z += chin * low * front * 0.35;
      p.setXYZ(i, x * R, y * R, z * R);
    }
    g.computeVertexNormals();
    return g;
  });
}

// ------------------------------------------------------------------ surface maps
/** Build a tangent-space normal map from a height function h(x, y) in [0,1]. */
function normalFromHeight(key, size, height, strength = 2, repeat = [1, 1]) {
  const base = cached('nmap' + key, () => {
    const hgt = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hgt[y * size + x] = height(x / size, y / size);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const at = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
        img.data[i + 2] = (1 / l) * 0.5 * 255 + 127;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
  const t = base.clone();
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}
const TAU = Math.PI * 2;
export const clothNormal = (r = [6, 6]) => normalFromHeight('cloth', 128, (x, y) => 0.5 + 0.25 * Math.sin(x * TAU * 16) * Math.sin(y * TAU * 16 + (Math.floor(x * 32) % 2) * Math.PI) + 0.08 * Math.sin((x + y) * TAU * 3), 3, r);
export const twillNormal = (r = [3, 6]) => normalFromHeight('twill', 128, (x, y) => 0.5 + 0.3 * Math.sin((x + y * 0.5) * TAU * 20) + 0.06 * Math.sin(y * TAU * 4), 3.5, r);
export const knitNormal = (r = [6, 6]) => normalFromHeight('knit', 128, (x, y) => 0.5 + 0.3 * Math.abs(Math.sin(x * TAU * 12 + Math.sin(y * TAU * 24) * 0.6)), 3, r);
export const strandNormal = () => normalFromHeight('strand', 128, (x, y) => 0.5 + 0.25 * Math.sin(x * TAU * 28 + Math.sin(y * TAU * 2) * 2) + 0.15 * Math.sin(x * TAU * 61), 3, [2, 1]);
export const ribNormal = () => normalFromHeight('rib', 64, (x, y) => 0.5 + 0.5 * Math.sin(y * TAU * 6), 4, [1, 3]);
export const panelNormal = (r = [3, 3]) =>
  normalFromHeight(
    'panel',
    128,
    (x, y) => {
      const gx = Math.min(Math.abs(x - 0.5), Math.abs(x), Math.abs(1 - x));
      const gy = Math.min(Math.abs(y - 0.02), Math.abs(y - 0.6));
      const groove = Math.min(gx < 0.012 ? gx / 0.012 : 1, gy < 0.012 ? gy / 0.012 : 1);
      return 0.35 + 0.65 * groove;
    },
    6,
    r
  );
export function brushedRough() {
  return cached('brushed', () =>
    canvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#5a5a5a';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          const v = 70 + Math.random() * 70;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(0, Math.random() * h, w, Math.random() * 1.5 + 0.3);
        }
      },
      { repeat: [2, 2], linear: true }
    )
  );
}
export function wearRough() {
  return cached('wear', () =>
    canvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#6e6e6e';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2500; i++) {
          const v = 80 + Math.random() * 90;
          g.fillStyle = `rgba(${v},${v},${v},0.5)`;
          g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 3, Math.random() * 3);
        }
        g.strokeStyle = 'rgba(200,200,200,0.35)';
        for (let i = 0; i < 40; i++) {
          g.beginPath();
          const x = Math.random() * w;
          const y = Math.random() * h;
          g.moveTo(x, y);
          g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 10);
          g.stroke();
        }
      },
      { repeat: [2, 2], linear: true }
    )
  );
}

/** Soft cloth folds: displace a (cloned) geometry along its normals. */
export function foldify(geo, { amount = 0.012, freq = 9, vertical = 1, seed = 1 } = {}) {
  const g = geo.clone();
  g.computeVertexNormals();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(x, z);
    const d =
      amount *
      (Math.sin(a * freq + seed + y * 3 * vertical) * 0.6 + Math.sin(a * freq * 2.3 + y * 9 + seed * 2) * 0.25 + Math.sin(y * 21 + a * 3) * 0.15);
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ mesh helper
export function part(geo, material, parent, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, s = null, shadow = true, own = false, name } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s !== null) m.scale.setScalar(s);
  else m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  if (own) m.userData.ownGeometry = true;
  if (name) m.name = name;
  parent.add(m);
  return m;
}

// ------------------------------------------------------------------ textures
export function canvasTex(w, h, draw, { repeat = null, linear = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

/** Woven plaid: base colour, thick stripes, thin stripes, with soft fabric grain. */
export function plaidTex(base, thick, thin, { repeat = [3, 3], size = 128 } = {}) {
  return canvasTex(
    size,
    size,
    (g, w) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, w);
      const step = w / 4;
      g.globalAlpha = 0.5;
      g.fillStyle = thick;
      for (let i = 0; i < w; i += step) {
        g.fillRect(i + 3, 0, step * 0.22, w);
        g.fillRect(0, i + 3, w, step * 0.22);
      }
      g.globalAlpha = 0.4;
      g.fillStyle = thin;
      for (let i = 0; i < w; i += step) {
        g.fillRect(i + step * 0.62, 0, 2, w);
        g.fillRect(0, i + step * 0.62, w, 2);
      }
      // weave grain
      g.globalAlpha = 0.07;
      for (let y = 0; y < w; y += 2) {
        g.fillStyle = y % 4 ? '#000' : '#fff';
        g.fillRect(0, y, w, 1);
      }
      g.globalAlpha = 1;
    },
    { repeat }
  );
}

/** Denim with twill lines and subtle fading. */
export function denimTex(base = '#3d6fc4') {
  return canvasTex(
    128,
    128,
    (g, w) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, w);
      g.globalAlpha = 0.12;
      g.strokeStyle = '#ffffff';
      for (let i = -w; i < w * 2; i += 4) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + w, w);
        g.stroke();
      }
      g.globalAlpha = 0.06;
      for (let k = 0; k < 400; k++) {
        g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
        g.fillRect(Math.random() * w, Math.random() * w, 2, 1);
      }
      g.globalAlpha = 1;
    },
    { repeat: [2, 4] }
  );
}

// ------------------------------------------------------------------ hands & feet
/**
 * A clenched fist hanging below the wrist joint (knuckles toward -y, back of the
 * hand facing outward). Four articulated fingers curl into the palm and the thumb
 * wraps across them. `glove` dresses the palm and knuckles (fingerless glove).
 */
export function buildFist(parent, material, { size = 1, side = 1, glove = null } = {}) {
  const g = new THREE.Group();
  g.scale.setScalar(size);
  parent.add(g);
  const palmM = glove || material;
  // palm: slightly tapered, rounded block
  part(rboxGeo(0.13, 0.12, 0.085, 0.035, 4), palmM, g, { y: -0.065, z: 0.005 });
  // fingers: proximal segment points forward (+z), middle segment folds back down
  const fx = [-0.045, -0.015, 0.015, 0.045];
  const len = [0.042, 0.048, 0.046, 0.038];
  for (let i = 0; i < 4; i++) {
    const x = fx[i] * side;
    const f = new THREE.Group();
    f.position.set(x, -0.118, 0.0);
    g.add(f);
    // knuckle → proximal phalanx pointing forward → middle phalanx folded back up
    // against the palm, so nothing protrudes past the knuckle line
    part(sphereGeo(0.02, 10, 8), glove || material, f, { y: 0.0, z: 0.0 });
    part(capsuleGeo(0.0175, 0.03, 8), glove || material, f, { y: -0.004, z: 0.03, rx: Math.PI / 2 });
    part(capsuleGeo(0.016, len[i] * 0.55, 8), material, f, { y: 0.02, z: 0.058, rx: -0.15 });
  }
  // thumb wraps across the front of the curled fingers
  const t = new THREE.Group();
  t.position.set(-0.062 * side, -0.07, 0.035);
  t.rotation.set(0.2, 0, side * 1.35);
  g.add(t);
  part(capsuleGeo(0.02, 0.04, 8), material, t, { y: -0.028, z: 0.03 });
  part(capsuleGeo(0.018, 0.03, 8), material, t, { y: -0.065, z: 0.045, rx: 0.3 });
  if (glove) part(torusGeo(0.058, 0.012, Math.PI * 2, 8, 24), glove, g, { y: -0.005, rx: Math.PI / 2, sx: 1.1, sy: 0.8 }); // wrist strap
  return g;
}

/** Open claw hand (ghost): slender palm and long, curved, jointed fingers. */
export function buildClaw(parent, material, { size = 1, side = 1, nail = null } = {}) {
  const g = new THREE.Group();
  g.scale.setScalar(size);
  parent.add(g);
  part(sphereGeo(0.07, 18, 14), material, g, { y: -0.055, sx: 1.05, sy: 1.15, sz: 0.62 });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set((-0.05 + i * 0.033) * side, -0.11, 0.005);
    f.rotation.set(0.25, 0, (i - 1.5) * 0.14 * side);
    g.add(f);
    part(limbGeo(0.016, 0.012, 0.11, { bulge: 0, seg: 8 }), material, f);
    const tip = new THREE.Group();
    tip.position.y = -0.11;
    tip.rotation.x = 0.45;
    f.add(tip);
    part(limbGeo(0.012, 0.008, 0.09, { bulge: 0, seg: 8 }), material, tip);
    part(bentConeGeo(0.011, 0.11, -0.45, 8), nail || material, tip, { y: -0.09, rx: Math.PI }); // talon
  }
  const th = new THREE.Group();
  th.position.set(-0.07 * side, -0.06, 0.03);
  th.rotation.set(0.6, 0, side * 0.8);
  g.add(th);
  part(limbGeo(0.015, 0.011, 0.08, { bulge: 0, seg: 8 }), material, th);
  part(bentConeGeo(0.011, 0.09, -0.4, 8), nail || material, th, { y: -0.08, rx: Math.PI });
  return g;
}

/**
 * Sneaker under the ankle joint; toe points +z. Cupsole with toe spring, padded
 * collar, tongue, laces, side stripe and heel tab.
 */
export function buildSneaker(parent, { upper, sole, accent = null, size = 1, lace = null }) {
  const g = new THREE.Group();
  g.scale.setScalar(size);
  parent.add(g);
  // cupsole: two-stage, toe tipped upward
  part(rboxGeo(0.172, 0.05, 0.32, 0.022, 3), sole, g, { y: -0.098, z: 0.075 });
  part(rboxGeo(0.165, 0.035, 0.11, 0.016, 3), sole, g, { y: -0.088, z: 0.245, rx: -0.22 });
  part(rboxGeo(0.176, 0.012, 0.33, 0.006, 2), accent || sole, g, { y: -0.118, z: 0.08, shadow: false }); // tread line
  // upper: heel + vamp + rounded toe box
  part(rboxGeo(0.158, 0.11, 0.2, 0.05, 4), upper, g, { y: -0.035, z: 0.015 });
  part(sphereGeo(0.082, 20, 14), upper, g, { y: -0.045, z: 0.2, sx: 0.98, sy: 0.62, sz: 1.05 });
  part(rboxGeo(0.15, 0.07, 0.16, 0.035, 3), upper, g, { y: -0.03, z: 0.13, rx: 0.32 });
  // tongue + laces
  part(rboxGeo(0.07, 0.02, 0.14, 0.01, 2), upper, g, { y: 0.02, z: 0.11, rx: 0.5 });
  const lm = lace || accent || sole;
  for (let i = 0; i < 4; i++) part(rboxGeo(0.085, 0.01, 0.014, 0.004, 1), lm, g, { y: 0.01 - i * 0.017, z: 0.075 + i * 0.03, rx: 0.5, shadow: false });
  // padded collar + heel tab
  part(torusGeo(0.062, 0.02, Math.PI * 2, 8, 20), upper, g, { y: 0.03, z: -0.01, rx: Math.PI / 2 - 0.25, sx: 1.15 });
  part(rboxGeo(0.04, 0.05, 0.02, 0.008, 2), accent || sole, g, { y: 0.04, z: -0.085, rx: -0.2 });
  // side stripe
  if (accent) for (const s of [1, -1]) part(rboxGeo(0.006, 0.026, 0.15, 0.003, 1), accent, g, { x: s * 0.08, y: -0.045, z: 0.07, rx: -0.25, shadow: false });
  return g;
}

/** Armored superhero boot: flared shaft with ridge rings, shin guard + rounded toe. */
export function buildBoot(shin, foot, { material, sole, shinLen, flare = 0.15, trim = null }) {
  part(cylGeo(flare, 0.1, shinLen * 0.58, 28), material, shin, { y: -shinLen * 0.71 });
  part(torusGeo(flare - 0.006, 0.02, Math.PI * 2, 10, 32), trim || material, shin, { y: -shinLen * 0.42, rx: Math.PI / 2 });
  part(torusGeo(0.104, 0.012, Math.PI * 2, 8, 28), trim || material, shin, { y: -shinLen * 0.95, rx: Math.PI / 2 });
  part(rboxGeo(0.12, shinLen * 0.42, 0.05, 0.02, 3), material, shin, { y: -shinLen * 0.66, z: 0.105, rx: 0.05 }); // shin guard
  const g = new THREE.Group();
  foot.add(g);
  part(rboxGeo(0.172, 0.11, 0.24, 0.05, 4), material, g, { y: -0.04, z: 0.04 });
  part(sphereGeo(0.088, 20, 14), material, g, { y: -0.045, z: 0.19, sx: 0.98, sy: 0.68, sz: 1.05 });
  part(rboxGeo(0.18, 0.035, 0.33, 0.014, 3), sole, g, { y: -0.1, z: 0.075 });
  part(rboxGeo(0.12, 0.03, 0.1, 0.012, 2), sole, g, { y: -0.085, z: -0.05 }); // heel block
  return g;
}

// ------------------------------------------------------------------ face
/**
 * Cartoon face with blinking eyelids, gaze, eyebrows and swappable mouths.
 * Returns a controller: face.update(dt, fighter) drives blinks and expressions.
 */
export function buildFace(head, o) {
  const {
    R, // head radius
    skin,
    eyeY = 0.04,
    eyeX = 0.1,
    eyeR = 0.075,
    eyeZ = null,
    iris = 0x3a2412,
    brow = 0x161616,
    browW = 0.1,
    browT = 0.022,
    mouthY = -0.11,
    mouthW = 0.075,
    lip = 0x5b2416,
    teeth = true,
    nose = true,
    noseR = 0.05,
    eyes: withEyes = true,
    brows: withBrows = true,
    liner = 0x1a0f0a,
    smirk = 0,
  } = o;
  const white = toon(0xf7f4ee, { rough: 0.25, rim: 0, envI: 0.5 });
  const irisM = toon(iris, { rough: 0.25, rim: 0, envI: 0.6 });
  const black = toon(0x050505, { rough: 0.1, rim: 0, envI: 0.8 });
  const shine = glow(0xffffff);
  const lipM = toon(lip, { rough: 0.55, rim: 0 });
  const teethM = toon(0xfbf8f0, { rough: 0.3, rim: 0 });
  const browM = hairMat(brow, { rim: 0.05 });
  const linerM = toon(liner, { rough: 0.5, rim: 0 });
  const ez = eyeZ ?? Math.sqrt(Math.max(0, R * R - eyeX * eyeX - eyeY * eyeY)) - eyeR * 0.35;

  const eyes = [];
  const lids = [];
  const brows = [];
  for (const s of withEyes ? [1, -1] : []) {
    const eye = new THREE.Group();
    eye.position.set(s * eyeX, eyeY, ez);
    head.add(eye);
    part(sphereGeo(eyeR, 24, 18), white, eye, { sy: 1.18, sz: 0.62, shadow: false });
    const look = dynamic(new THREE.Group());
    eye.add(look);
    part(sphereGeo(eyeR * 0.62, 20, 16), irisM, look, { z: eyeR * 0.36, sy: 1.08, sz: 0.45, shadow: false });
    part(sphereGeo(eyeR * 0.36, 16, 12), black, look, { z: eyeR * 0.46, sy: 1.08, sz: 0.4, shadow: false });
    part(sphereGeo(eyeR * 0.14, 8, 6), shine, look, { x: eyeR * 0.2, y: eyeR * 0.24, z: eyeR * 0.56, shadow: false });
    // eyelid: skin-coloured hemisphere that rotates down over the eye
    const lid = dynamic(new THREE.Group());
    eye.add(lid);
    const lidShape = new THREE.Group();
    lidShape.scale.set(eyeR * 1.08, eyeR * 1.27, eyeR * 0.72);
    lid.add(lidShape);
    part(cached('lid', () => new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2)), skin, lidShape, { shadow: false });
    // dark lash line along the lid edge — defines the eye shape at gameplay distance
    part(cached('lidLine', () => new THREE.TorusGeometry(1.0, 0.09, 6, 28, Math.PI)), linerM, lidShape, { rx: Math.PI / 2, shadow: false });
    eyes.push(look);
    lids.push(lid);
    if (!withBrows) continue;
    const b = dynamic(new THREE.Group());
    b.position.set(s * eyeX, eyeY + eyeR * 1.55, ez + eyeR * 0.15);
    head.add(b);
    // tapered, slightly arched brow (thick at the inner end)
    part(
      cached(`brow${browW}|${browT}`, () =>
        taperTubeGeo([[-browW * 0.55, -browT * 0.3, 0], [-browW * 0.1, browT * 0.5, browT * 0.2], [browW * 0.55, browT * 0.2, -browT * 0.4]], browT * 1.15, browT * 0.45, { tubular: 14, radial: 8 })
      ),
      browM,
      b,
      { sx: s, shadow: false }
    );
    b.userData.side = s;
    brows.push(b);
  }

  if (nose) {
    const ny = eyeY - eyeR * 1.0;
    const nz = Math.sqrt(Math.max(0, R * R - ny * ny));
    part(sphereGeo(noseR, 18, 14), skin, head, { y: ny, z: nz - noseR * 0.1, sx: 0.85, sy: 0.95, sz: 1.0 });
    part(sphereGeo(noseR * 0.6, 12, 10), skin, head, { y: ny + noseR * 0.8, z: nz - noseR * 0.45, sx: 0.8, sy: 1.4, sz: 0.8 }); // soft bridge
  }

  // mouths
  const mz = Math.sqrt(Math.max(0, R * R - mouthY * mouthY)) * 0.98;
  const mouths = {};
  mouths.smile = new THREE.Group();
  part(torusGeo(mouthW, 0.012, Math.PI * 0.8, 8, 20), lipM, mouths.smile, { rz: Math.PI + Math.PI * 0.1 + smirk, shadow: false });
  if (smirk) part(sphereGeo(0.011, 8, 6), lipM, mouths.smile, { x: -Math.sign(smirk) * mouthW * 0.95, y: mouthW * 0.18, shadow: false }); // dimple at the raised corner
  const mouthDark = toon(0x3a0d0a, { rough: 0.8, rim: 0 });
  const tongue = toon(0xd9606a, { rough: 0.7, rim: 0 });
  mouths.grin = new THREE.Group();
  part(cached('grinD', () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), mouthDark, mouths.grin, { sx: mouthW * 1.25, sy: mouthW * 0.95, sz: mouthW * 0.35, shadow: false });
  part(sphereGeo(1, 16, 8), tongue, mouths.grin, { y: -mouthW * 0.62, z: mouthW * 0.05, sx: mouthW * 0.6, sy: mouthW * 0.28, sz: mouthW * 0.2, shadow: false });
  if (teeth) part(rboxGeo(mouthW * 2.2, mouthW * 0.3, mouthW * 0.2, mouthW * 0.08), teethM, mouths.grin, { y: -mouthW * 0.12, z: mouthW * 0.3, sz: 1, shadow: false });
  part(torusGeo(mouthW * 1.25, mouthW * 0.07, Math.PI, 8, 24), lipM, mouths.grin, { rz: Math.PI, sy: 0.76, shadow: false });
  mouths.open = new THREE.Group();
  part(sphereGeo(1, 20, 14), mouthDark, mouths.open, { sx: mouthW * 0.7, sy: mouthW * 0.85, sz: mouthW * 0.3, shadow: false });
  if (teeth) part(rboxGeo(mouthW * 1.0, mouthW * 0.22, mouthW * 0.12, mouthW * 0.05), teethM, mouths.open, { y: mouthW * 0.6, z: mouthW * 0.15, shadow: false });
  mouths.flat = new THREE.Group();
  part(capsuleGeo(0.012, mouthW * 1.2, 8), lipM, mouths.flat, { rz: Math.PI / 2 + 0.08, shadow: false });
  for (const g of Object.values(mouths)) {
    dynamic(g);
    g.position.set(0, mouthY, mz);
    g.rotation.x = -Math.asin(THREE.MathUtils.clamp(mouthY / R, -1, 1)) * 0.6;
    g.visible = false;
    head.add(g);
  }
  mouths.smile.visible = true;

  return new FaceController({ eyes, lids, brows, mouths, eyeR });
}

const EXPRESSIONS = {
  neutral: { lid: -1.05, brow: 0, browY: 0, mouth: 'smile' },
  fierce: { lid: -0.55, brow: 0.32, browY: -0.012, mouth: 'grin' },
  hurt: { lid: 0.35, brow: -0.35, browY: 0.01, mouth: 'open' },
  dazed: { lid: 0.15, brow: -0.15, browY: 0, mouth: 'flat' },
  happy: { lid: -0.85, brow: -0.12, browY: 0.018, mouth: 'grin' },
  focus: { lid: -0.75, brow: 0.18, browY: -0.006, mouth: 'flat' },
};

export function expressionFor(f) {
  switch (f.state) {
    case 'attack':
      return f.move?.special ? 'fierce' : f.moveTime < (f.move?.activeEnd ?? 0) + 0.05 ? 'fierce' : 'focus';
    case 'hit':
    case 'knockdown':
      return 'hurt';
    case 'down':
    case 'getup':
    case 'defeat':
      return 'dazed';
    case 'victory':
      return 'happy';
    case 'block':
    case 'blockstun':
    case 'dash':
      return 'focus';
    default:
      return 'neutral';
  }
}

export class FaceController {
  constructor(parts) {
    Object.assign(this, parts);
    this.blinkIn = 1 + Math.random() * 3;
    this.blink = 0;
    this.lid = EXPRESSIONS.neutral.lid;
    this.brow = 0;
    this.browY = 0;
    this.mouth = 'smile';
    this.defaultMouth = 'smile';
  }

  /** Mouth used for the neutral expression (e.g. Simba always grins). */
  setDefault(mouth) {
    this.defaultMouth = mouth;
    this.mouths[this.mouth].visible = false;
    this.mouths[mouth].visible = true;
    this.mouth = mouth;
  }

  update(dt, f) {
    const exName = expressionFor(f);
    const ex = EXPRESSIONS[exName];
    const wantMouth = exName === 'neutral' ? this.defaultMouth : ex.mouth;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.13;
      this.blinkIn = 1.8 + Math.random() * 3.2;
    }
    this.blink = Math.max(0, this.blink - dt);
    const k = 1 - Math.exp(-18 * dt);
    this.lid += (ex.lid - this.lid) * k;
    this.brow += (ex.brow - this.brow) * k;
    this.browY += (ex.browY - this.browY) * k;
    const blinkAmt = this.blink > 0 ? Math.sin((1 - this.blink / 0.13) * Math.PI) : 0;
    const lid = this.lid + (1.45 - this.lid) * blinkAmt;
    for (const l of this.lids) l.rotation.x = lid;
    for (const b of this.brows) {
      b.rotation.z = -b.userData.side * this.brow;
      b.position.y = b.userData.baseY ?? (b.userData.baseY = b.position.y);
      b.position.y = b.userData.baseY + this.browY;
    }
    if (wantMouth !== this.mouth) {
      this.mouths[this.mouth].visible = false;
      this.mouths[wantMouth].visible = true;
      this.mouth = wantMouth;
    }
    // eyes glance slightly toward the opponent / downward when crouched
    const gy = f.crouching ? -0.15 : 0;
    for (const e of this.eyes) e.rotation.x += (gy * -1 - e.rotation.x) * k;
  }
}

// ------------------------------------------------------------------ draw-call optimisation
/** Mark an object whose transform, visibility or geometry changes at runtime. */
export function dynamic(o) {
  o.userData.dynamic = true;
  return o;
}

/**
 * Merge every static mesh into one mesh per (joint, material, shadow flag).
 * Parts that animate on their own (eyes, lids, mouths, cape, tendrils…) are
 * marked dynamic and left untouched. Cuts a fighter from ~150 draw calls to ~40.
 */
export function mergeStatic(rig) {
  const targets = new Set([rig.body, ...Object.values(rig.j), rig.handL, rig.handR, rig.footL, rig.footR]);
  rig.root.updateMatrixWorld(true);
  const buckets = new Map();
  rig.body.traverse((o) => {
    if (!o.isMesh || targets.has(o)) return;
    let target = null;
    for (let a = o; a; a = a.parent) {
      if (a.userData.dynamic) return;
      if (a !== o && targets.has(a)) {
        target = a;
        break;
      }
    }
    if (!target || Array.isArray(o.material) || !o.geometry.attributes.normal) return;
    const key = `${target.uuid}|${o.material.uuid}|${o.castShadow}|${o.renderOrder}`;
    if (!buckets.has(key)) buckets.set(key, { target, material: o.material, cast: o.castShadow, order: o.renderOrder, items: [] });
    buckets.get(key).items.push(o);
  });
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue; // nothing to gain
    const geos = b.items.map((o) => {
      const rel = new THREE.Matrix4();
      for (let a = o; a !== b.target; a = a.parent) {
        a.updateMatrix();
        rel.premultiply(a.matrix);
      }
      const g = o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const n = g.attributes.position.count;
      const src = g.index ? g.index.array : null;
      const idx = new Uint32Array(src ? src.length : n);
      for (let i = 0; i < idx.length; i++) idx[i] = src ? src[i] : i;
      if (rel.determinant() < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; // mirrored part: fix winding
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.applyMatrix4(rel);
      g.groups = [];
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast;
    m.renderOrder = b.order;
    m.userData.ownGeometry = true;
    b.target.add(m);
    for (const o of b.items) {
      o.parent.remove(o);
      if (o.userData.ownGeometry) o.geometry.dispose();
    }
  }
}
