import * as THREE from 'three';

// An articulated humanoid rig made of nested THREE.Groups ("joints"). Character
// builders hang stylised meshes on the joints; the AnimationController rotates them.
// The model faces +Z, its own left side is +X.

export const JOINTS = ['hips', 'torso', 'head', 'uaL', 'laL', 'uaR', 'laR', 'thL', 'shL', 'thR', 'shR'];

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

export function capsule(r, len, seg = 10) {
  return cached(`cap${r}|${len}|${seg}`, () => new THREE.CapsuleGeometry(r, len, 5, seg));
}
export function sphere(r, w = 20, h = 14) {
  return cached(`sph${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
}

export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.02, ...opts });
}

export function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

export class HumanoidRig {
  /**
   * @param {object} p proportions
   */
  constructor(p) {
    this.p = p;
    this.root = new THREE.Group(); // yaw + world position (set by Fighter)
    this.body = new THREE.Group(); // pose root: falls / spins / offsets (pivot at feet)
    this.root.add(this.body);
    this.j = {};

    const hips = (this.j.hips = new THREE.Group());
    hips.position.y = p.legLen;
    this.body.add(hips);

    const torso = (this.j.torso = new THREE.Group());
    torso.position.y = 0.04;
    hips.add(torso);

    const head = (this.j.head = new THREE.Group());
    head.position.y = p.torsoLen + p.neck;
    torso.add(head);

    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const ua = (this.j['ua' + side] = new THREE.Group());
      ua.position.set(s * p.shoulderW, p.torsoLen - 0.06, 0);
      torso.add(ua);
      const la = (this.j['la' + side] = new THREE.Group());
      la.position.y = -p.upperArm;
      ua.add(la);
      const hand = (this['hand' + side] = new THREE.Group());
      hand.position.y = -p.foreArm;
      la.add(hand);

      const th = (this.j['th' + side] = new THREE.Group());
      th.position.set(s * p.hipW, 0, 0);
      hips.add(th);
      const sh = (this.j['sh' + side] = new THREE.Group());
      sh.position.y = -p.thigh;
      th.add(sh);
      const foot = (this['foot' + side] = new THREE.Group());
      foot.position.y = -p.shin;
      sh.add(foot);
    }
    this.baseHipsY = p.legLen;
    this.height = p.legLen + p.torsoLen + p.neck + p.headR * 2;
  }

  /** Apply a full pose object (see AnimationController). */
  apply(pose) {
    for (const name of JOINTS) {
      const r = pose[name];
      if (r) this.j[name].rotation.set(r[0], r[1], r[2]);
    }
    this.body.rotation.set(pose.root[0], pose.root[1], pose.root[2]);
    this.body.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  }

  setVisible(v) {
    this.body.visible = v;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        // geometries are shared via cache; materials are per-character
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          m.map?.dispose();
          m.emissiveMap?.dispose();
          m.dispose();
        });
        if (o.userData.ownGeometry) o.geometry.dispose();
      }
    });
  }
}
