import * as THREE from 'three';
import { Fighter } from './Fighter.js';

// Renders a head-and-shoulders portrait (HUD, select cards) and a full-body
// victory pose (results screen) for any character without supplied artwork.
// New fighters therefore get portraits automatically.

const SIZE = 256;

function toDataURL(renderer, rt, w, h) {
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  // flip Y and convert linear → sRGB (render targets are linear, no tone mapping)
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    lut[i] = Math.round(Math.min(1, s * 1.02) * 255);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((h - 1 - y) * w + x) * 4;
      const di = (y * w + x) * 4;
      const a = buf[si + 3];
      img.data[di] = lut[buf[si]];
      img.data[di + 1] = lut[buf[si + 1]];
      img.data[di + 2] = lut[buf[si + 2]];
      img.data[di + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function downscale(canvas, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, w, h);
  return c.toDataURL('image/png');
}

export function renderPortraits(renderer, defs) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f55, 1.6));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(1.5, 3, 4);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 2.2);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);

  for (const def of defs) {
    if (def.portrait && def.art) continue;
    const f = new Fighter(def, { index: 0, hooks: {} });
    f.addToScene(scene);
    f.blob.visible = false;
    f.shield && (f.shield.group.visible = false);
    f.resetForRound(0);
    f.facing = 1;
    f.canAct = false;
    const still = { held: {}, pressed: {} };

    // ---- portrait: stance, face 3/4 to camera
    f.enter('idle');
    for (let i = 0; i < 40; i++) f.update(1 / 60, still, { x: 5 });
    f.rig.root.rotation.y = 0.45;
    f.rig.root.updateMatrixWorld(true);
    const head = f.limbWorld('head').clone();
    const hr = def.proportions.headR * def.scale;
    const rt = new THREE.WebGLRenderTarget(SIZE * 2, SIZE * 2);
    cam.aspect = 1;
    cam.fov = 24;
    cam.updateProjectionMatrix();
    cam.position.set(head.x + 0.35, head.y + hr * 1.3, head.z + hr * 9);
    cam.lookAt(head.x + 0.02, head.y + hr * 0.75, head.z);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    if (!def.portrait) def.portrait = downscale(toDataURL(renderer, rt, SIZE * 2, SIZE * 2), SIZE, SIZE);
    rt.dispose();

    // ---- art: full body victory pose
    f.enter('victory');
    for (let i = 0; i < 120; i++) f.update(1 / 60, still, { x: 5 });
    f.rig.root.rotation.y = 0.35;
    f.rig.root.updateMatrixWorld(true);
    const rt2 = new THREE.WebGLRenderTarget(SIZE * 2, SIZE * 3);
    cam.aspect = 2 / 3;
    cam.fov = 30;
    cam.updateProjectionMatrix();
    cam.position.set(0.5, 1.15, 5.2);
    cam.lookAt(0, 1.05, 0);
    renderer.setRenderTarget(rt2);
    renderer.clear();
    renderer.render(scene, cam);
    if (!def.art) def.art = downscale(toDataURL(renderer, rt2, SIZE * 2, SIZE * 3), SIZE * 2, SIZE * 3);
    rt2.dispose();

    f.dispose(scene);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
}
