import * as THREE from 'three';

// Hit detection + resolution. Each attack hit-window connects at most once.
// Handles blocking, chip damage, combo scaling, counter hits, armor, energy drain,
// hit-stop, knockback, wall recoil, energy gain and all impact feedback.

const COMIC_WORDS = ['POW!', 'WHAM!', 'BAM!', 'THWACK!', 'KRAKK!', 'BOOM!'];

export class CombatSystem {
  constructor({ effects, audio, camera, collision, hooks = {} }) {
    this.effects = effects;
    this.audio = audio;
    this.camera = camera;
    this.collision = collision;
    this.hooks = hooks;
    this.combo = [0, 0]; // hits in the current combo performed BY fighter i
    this.fighters = [];
    this._p = new THREE.Vector3();
  }

  reset() {
    this.combo = [0, 0];
  }

  update(fighters) {
    this.fighters = fighters;
    for (let i = 0; i < 2; i++) {
      const a = fighters[i];
      const d = fighters[1 - i];
      if (a.state !== 'attack' || !a.move) continue;
      const hits = a.move.hits;
      for (let h = 0; h < hits.length; h++) {
        if (a.hitsDone.has(h)) continue;
        const hd = hits[h];
        if (a.moveTime < hd.at || a.moveTime > hd.until) continue;
        if (!this.overlaps(a, d, hd)) continue;
        a.hitsDone.add(h);
        this.resolve(a, d, hd, i, this._impactPoint(a, d, hd));
        if (a.state !== 'attack') break;
      }
    }
    // Combo ends once the victim is free again.
    for (let i = 0; i < 2; i++) {
      const victim = fighters[1 - i];
      if (this.combo[i] > 0 && victim.state !== 'hit' && victim.state !== 'knockdown') {
        this.hooks.onComboEnd?.(i, this.combo[i]);
        this.combo[i] = 0;
      }
    }
  }

  overlaps(a, d, hd) {
    if (d.invulnerable) return false;
    const forward = (d.x - a.x) * a.facing; // distance in front of the attacker
    const body = 0.32;
    if (!hd.radial && forward < -0.15) return false;
    if (forward + body < hd.reach[0] || forward - body > hd.reach[1]) return false;
    const y0 = a.y + hd.y[0];
    const y1 = a.y + hd.y[1];
    const [h0, h1] = d.hurtRange();
    return y1 >= h0 && y0 <= h1;
  }

  _impactPoint(a, d, hd) {
    const p = a.limbWorld(hd.limb, this._p);
    const [h0, h1] = d.hurtRange();
    p.x = d.x - a.facing * 0.28;
    p.y = THREE.MathUtils.clamp(p.y, h0 + 0.15, h1 - 0.1);
    p.z = 0.25;
    return p;
  }

  /** Projectile contact (called by ProjectileSystem). */
  resolveProjectileHit(p, d, hd) {
    const a = p.owner;
    const i = this.fighters.indexOf(a);
    const pos = this._p.set(p.x, THREE.MathUtils.clamp(p.y, d.hurtRange()[0] + 0.15, d.hurtRange()[1] - 0.1), 0.3);
    this.resolve(a, d, hd, i, pos, { x: p.x, facing: p.dir, projectile: true });
  }

  resolve(a, d, hd, i, pos, src = null) {
    const srcX = src ? src.x : a.x;
    const srcFacing = src ? src.facing : a.facing;

    if (d.canBlock(hd, srcX)) {
      const shield = !!d.def.shield;
      const chip = Math.round(hd.damage * hd.chip * (shield ? d.def.shield.chipScale : 1));
      d.applyBlock(hd, srcX, chip);
      a.energy = Math.min(a.maxEnergy, a.energy + 2);
      d.hitstop = 0.05;
      if (!src) a.hitstop = 0.05;
      if (!src && this.collision.atWall(d)) a.vx = -a.facing * 3.5;
      this.effects.block(pos, shield ? d.def.shield.color : 0x9fe8ff, shield);
      this.audio.play(shield ? 'shield' : 'block');
      this.camera.shake(0.06);
      this.hooks.onBlock?.(a, d);
      return;
    }

    const continuing = d.state === 'hit' || d.state === 'knockdown';
    const counter = d.state === 'attack' && d.moveTime < (d.move?.activeEnd ?? 0) && !d.armored;
    this.combo[i] = continuing ? this.combo[i] + 1 : 1;
    const scale = Math.max(0.5, 1 - 0.1 * (this.combo[i] - 1));
    let damage = hd.damage * scale * (counter ? 1.2 : 1);
    damage = Math.max(1, Math.round(damage));

    // armor frames: take reduced damage but keep attacking
    if (d.armored && !a.move?.special) {
      const dmg = Math.max(1, Math.round(damage * 0.6));
      d.applyArmoredHit(hd, dmg);
      a.stats.damageDealt += dmg;
      a.hitstop = d.hitstop = 0.06;
      this.effects.block(pos, 0xff3a4a, true);
      this.audio.play('heavy', 0.6);
      this.camera.shake(0.12);
      this.hooks.onArmor?.(a, d);
      this.combo[i] = 0;
      return;
    }

    d.applyHit(hd, srcX, srcFacing, damage);
    a.energy = Math.min(a.maxEnergy, a.energy + damage * 0.9);
    a.connected = true;
    a.stats.damageDealt += damage;
    a.stats.hitsLanded++;
    a.stats.maxCombo = Math.max(a.stats.maxCombo, this.combo[i]);

    const stop = d.ko ? 0.16 : hd.heavy ? 0.1 : 0.065;
    d.hitstop = stop;
    if (!src) a.hitstop = stop;
    if (!src && this.collision.atWall(d)) a.vx = -a.facing * hd.knockback * 0.6;

    const color = hd.spark === 'electric' ? 0x6fe3ff : hd.spark === 'gold' ? 0xffc53a : hd.spark === 'ghost' ? 0x9dffc8 : hd.spark === 'dark' ? 0xff3355 : null;
    this.effects.hit(pos, { heavy: hd.heavy || d.ko, color });
    this.audio.play(hd.sfx, hd.heavy ? 1 : 0.5);
    this.camera.shake(d.ko ? 0.5 : hd.heavy ? 0.3 : 0.14);
    if (hd.heavy && Math.random() < 0.55) {
      this.effects.comicText(pos, COMIC_WORDS[(Math.random() * COMIC_WORDS.length) | 0]);
    }
    if (hd.drain) this.hooks.onDrain?.(a, d, hd.drain);
    if (counter) this.hooks.onCounter?.(a, d);
    this.hooks.onHit?.(a, d, damage, this.combo[i]);
    if (d.ko) this.hooks.onKO?.(a, d);
  }
}
