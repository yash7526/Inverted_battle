// Shared helpers for building character move-sets and pose libraries.
// All times are in seconds. Attacks have startup (before the first hit window),
// active (inside hit windows) and recovery (after the last window) phases.

export const HEIGHTS = {
  high: [1.25, 1.85],
  mid: [0.65, 1.35],
  low: [0.0, 0.55],
};

/**
 * Hit window factory.
 * @param {number} at      window opens (s from move start)
 * @param {number} until   window closes
 * @param {number} damage
 * @param {object} o       options (see defaults below)
 */
export function hit(at, until, damage, o = {}) {
  const height = o.height || 'mid';
  return {
    at,
    until,
    damage,
    height, // high (whiffs on crouchers), mid, low (must crouch-block or jump)
    y: o.y || HEIGHTS[height],
    reach: o.reach || [0.2, 1.3], // distance in front of the attacker's centre
    knockback: o.kb ?? 2.5,
    launch: o.launch ?? 0,
    knockdown: !!o.kd,
    hitstun: o.stun ?? 0.3,
    blockstun: o.bstun ?? 0.18,
    chip: o.chip ?? 0, // fraction of damage dealt through a block
    sfx: o.sfx || 'punch',
    heavy: !!o.heavy,
    radial: !!o.radial, // hits on both sides (reach may be negative)
    limb: o.limb || 'handL',
    spark: o.spark || null,
    drain: o.drain || 0, // energy removed from the victim
  };
}

/** Move factory with sane defaults. */
export function move(id, o) {
  const m = {
    id,
    name: o.name || id,
    duration: o.duration,
    base: o.base || 'stance',
    hits: o.hits || [],
    anim: o.anim,
    lunge: o.lunge || [], // [{at, until, speed}] forward velocity
    impulses: o.impulses || [], // [{at, vx, vy}] one-shot physics kicks
    cancels: o.cancels || null, // { punch: 'nextMove' } chain into another move
    cancelAfter: o.cancelAfter ?? 0,
    air: !!o.air,
    crouch: !!o.crouch,
    energyCost: o.energyCost || 0,
    cooldown: o.cooldown || 0,
    iframes: o.iframes || null, // [from, to]
    fx: o.fx || [], // [{at, type}] visual / audio events
    cinematic: o.cinematic || null, // { duration, slowmo }
    sfxStart: o.sfxStart ?? 'whoosh',
    special: !!o.special,
    endsOnLand: o.endsOnLand ?? !!o.air,
    projectiles: o.projectiles || [], // [{at, speed, y, range, kind, hit}]
    teleport: o.teleport || null, // {at, dist, height} reappear in front of the opponent
    hover: o.hover || null, // [from, to] gravity suspended
    vanish: o.vanish || null, // [from, to] fade out (visual)
    armor: o.armor || null, // [from, to] hits don't interrupt (damage reduced)
    trail: o.trail ?? true,
  };
  const first = m.hits.length ? Math.min(...m.hits.map((h) => h.at)) : m.duration;
  const last = m.hits.length ? Math.max(...m.hits.map((h) => h.until)) : 0;
  m.startup = first;
  m.activeEnd = last;
  m.range = o.aiRange ?? (m.hits.length ? Math.max(...m.hits.map((h) => h.reach[1])) : 0);
  if (m.projectiles.length) {
    m.startup = Math.min(m.startup, ...m.projectiles.map((p) => p.at));
    m.range = o.aiRange ?? Math.max(m.range, ...m.projectiles.map((p) => p.range));
  }
  m.lowest = m.hits.some((h) => h.height === 'low');
  return m;
}

/** Generic pose library. `style` overrides individual poses per character. */
export function makePoses(overrides = {}) {
  const guardArms = {
    uaL: [-0.78, 0, 0.32],
    laL: [-1.95, 0, 0],
    uaR: [-0.55, 0, -0.32],
    laR: [-2.05, 0, 0],
  };
  const crouchLegs = {
    hips: [0, -0.3, 0],
    thL: [-1.55, 0, 0.22],
    shL: [2.25, 0, 0],
    thR: [-0.95, 0, -0.22],
    shR: [2.25, 0, 0],
  };
  const poses = {
    stance: {
      hips: [0, -0.35, 0],
      torso: [0.08, 0.22, 0],
      head: [0, 0.12, 0],
      ...guardArms,
      thL: [-0.42, 0, 0.08],
      shL: [0.5, 0, 0],
      thR: [0.22, 0, -0.08],
      shR: [0.35, 0, 0],
    },
    run: {
      hips: [0, 0.05, 0],
      torso: [0.45, -0.05, 0],
      head: [-0.35, 0, 0],
      uaL: [-0.6, 0, 0.2],
      laL: [-1.6, 0, 0],
      uaR: [-0.6, 0, -0.2],
      laR: [-1.6, 0, 0],
      thL: [-0.5, 0, 0],
      shL: [0.6, 0, 0],
      thR: [0.2, 0, 0],
      shR: [0.6, 0, 0],
    },
    backdash: {
      hips: [0, -0.35, 0],
      torso: [-0.25, 0.2, 0],
      head: [0.1, 0.1, 0],
      ...guardArms,
      thL: [-0.85, 0, 0.1],
      shL: [1.2, 0, 0],
      thR: [0.35, 0, -0.1],
      shR: [0.7, 0, 0],
    },
    jumpUp: {
      noGround: true,
      torso: [0.15, 0.1, 0],
      head: [-0.1, 0, 0],
      uaL: [-1.2, 0, 0.45],
      laL: [-1.4, 0, 0],
      uaR: [-1.0, 0, -0.45],
      laR: [-1.5, 0, 0],
      thL: [-1.45, 0, 0.1],
      shL: [2.0, 0, 0],
      thR: [-0.6, 0, -0.1],
      shR: [1.6, 0, 0],
    },
    jumpFall: {
      noGround: true,
      torso: [0.05, 0.1, 0],
      uaL: [-0.5, 0, 0.9],
      laL: [-0.7, 0, 0],
      uaR: [-0.5, 0, -0.9],
      laR: [-0.7, 0, 0],
      thL: [-0.7, 0, 0.1],
      shL: [0.9, 0, 0],
      thR: [-0.2, 0, -0.1],
      shR: [0.7, 0, 0],
    },
    crouch: {
      ...crouchLegs,
      torso: [0.45, 0.3, 0],
      head: [-0.35, 0, 0],
      ...guardArms,
    },
    block: {
      hips: [0, -0.35, 0],
      torso: [0.22, 0.15, 0],
      head: [0.3, 0.1, 0],
      uaL: [-1.35, 0, 0.12],
      laL: [-2.35, 0, 0],
      uaR: [-1.25, 0, -0.12],
      laR: [-2.35, 0, 0],
      thL: [-0.42, 0, 0.08],
      shL: [0.55, 0, 0],
      thR: [0.25, 0, -0.08],
      shR: [0.4, 0, 0],
    },
    crouchBlock: {
      ...crouchLegs,
      torso: [0.6, 0.2, 0],
      head: [0.2, 0, 0],
      uaL: [-1.35, 0, 0.12],
      laL: [-2.35, 0, 0],
      uaR: [-1.25, 0, -0.12],
      laR: [-2.35, 0, 0],
    },
    hitHigh: {
      hips: [0.05, -0.2, 0],
      torso: [-0.42, 0.15, 0.1],
      head: [-0.5, 0.25, 0.12],
      uaL: [-0.3, 0, 0.75],
      laL: [-0.9, 0, 0],
      uaR: [-0.1, 0, -0.65],
      laR: [-0.7, 0, 0],
      thL: [-0.2, 0, 0.08],
      shL: [0.3, 0, 0],
      thR: [0.3, 0, -0.08],
      shR: [0.3, 0, 0],
    },
    hitBody: {
      hips: [-0.1, -0.2, 0],
      torso: [0.65, -0.1, 0],
      head: [0.35, 0, 0],
      uaL: [-0.75, 0, 0.15],
      laL: [-1.5, 0, 0],
      uaR: [-0.75, 0, -0.15],
      laR: [-1.5, 0, 0],
      thL: [-0.55, 0, 0.08],
      shL: [0.75, 0, 0],
      thR: [0.15, 0, -0.08],
      shR: [0.5, 0, 0],
    },
    hitLow: {
      ...crouchLegs,
      torso: [0.15, 0.4, 0.15],
      head: [-0.35, 0.2, 0],
      uaL: [-0.4, 0, 0.7],
      laL: [-0.9, 0, 0],
      uaR: [-0.3, 0, -0.6],
      laR: [-0.8, 0, 0],
    },
    fall: {
      noGround: true,
      root: [-0.95, 0, 0],
      pos: [0, 0.35, 0],
      torso: [-0.25, 0, 0],
      head: [-0.35, 0, 0],
      uaL: [-2.5, 0, 0.6],
      laL: [-0.4, 0, 0],
      uaR: [-2.5, 0, -0.6],
      laR: [-0.4, 0, 0],
      thL: [-0.9, 0, 0.1],
      shL: [0.9, 0, 0],
      thR: [-0.4, 0, -0.1],
      shR: [0.6, 0, 0],
    },
    down: {
      noGround: true,
      root: [-1.5708, 0, 0],
      pos: [0, 0.2, 0],
      head: [0.25, 0.3, 0],
      uaL: [-0.3, 0, 1.25],
      laL: [-0.5, 0, 0],
      uaR: [-0.2, 0, -1.3],
      laR: [-0.4, 0, 0],
      thL: [-0.35, 0, 0.15],
      shL: [0.7, 0, 0],
      thR: [0, 0, -0.12],
      shR: [0.15, 0, 0],
    },
    getup: {
      hips: [0, -0.2, 0],
      torso: [0.75, 0.1, 0],
      head: [-0.4, 0, 0],
      uaL: [-0.9, 0, 0.3],
      laL: [-0.3, 0, 0],
      uaR: [-0.6, 0, -0.3],
      laR: [-1.2, 0, 0],
      thL: [-1.6, 0, 0.15],
      shL: [2.1, 0, 0],
      thR: [-0.5, 0, -0.15],
      shR: [2.4, 0, 0],
    },
    victory: {
      torso: [-0.12, 0.25, 0],
      head: [-0.15, 0.25, 0],
      uaR: [-2.95, 0, -0.25],
      laR: [-0.25, 0, 0],
      uaL: [-0.3, 0, 0.55],
      laL: [-1.9, 0, 0],
      thL: [0, 0, 0.12],
      shL: [0.05, 0, 0],
      thR: [0.05, 0, -0.12],
      shR: [0.05, 0, 0],
    },
    defeat: {
      hips: [0, 0.1, 0],
      torso: [0.7, 0, 0.05],
      head: [0.55, 0, 0],
      uaL: [0.05, 0, 0.18],
      laL: [-0.3, 0, 0],
      uaR: [-0.3, 0, -0.18],
      laR: [-0.4, 0, 0],
      thL: [-1.55, 0, 0.12],
      shL: [1.6, 0, 0],
      thR: [0.1, 0, -0.1],
      shR: [2.4, 0, 0],
    },
  };
  for (const [k, v] of Object.entries(overrides)) {
    poses[k] = { ...(poses[k] || {}), ...v };
  }
  return poses;
}

// Reusable attack limb poses (partial).
export const LIMB = {
  jabL: { uaL: [-1.57, 0, 0.04], laL: [-0.12, 0, 0], torso: [0.12, -0.22, 0], head: [0.02, 0.2, 0] },
  crossR: {
    uaR: [-1.6, 0, -0.04],
    laR: [-0.1, 0, 0],
    torso: [0.16, 0.6, 0],
    hips: [0, 0.05, 0],
    head: [0, -0.3, 0],
    thR: [0.38, 0, -0.08],
    shR: [0.15, 0, 0],
  },
};
