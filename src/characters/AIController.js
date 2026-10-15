import { ACTIONS } from '../game/InputManager.js';

// CPU opponent. It "presses buttons" on a PlayerInput exactly like a human, so it is
// bound by the same combat rules (startup, recovery, cooldowns, energy). Decisions
// use distance, health, energy, cooldowns and the opponent's current state; the
// difficulty profile controls reaction time, aggression, blocking and combo use.

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

export class AIController {
  constructor(input, self, opponent, profile) {
    this.input = input;
    this.self = self;
    this.opp = opponent;
    this.p = profile;
    this.time = 0;
    this.decideIn = 0.5;
    this.holds = {}; // action → seconds remaining
    this.queue = []; // scheduled presses
    this.seenMove = null;
    this.mood = 'neutral';
    const def = self.def;
    const range = (cmd) => def.moves[def.commands[cmd]]?.range ?? 1.2;
    this.ranges = {
      punch: range('punch'),
      kick: range('kick'),
      low: Math.max(range('crouchPunch'), range('crouchKick')),
      special: range('special'),
    };
    this.ideal = Math.min(this.ranges.punch, this.ranges.kick) - 0.05;
  }

  get fwd() {
    return this.self.facing > 0 ? 'right' : 'left';
  }
  get back() {
    return this.self.facing > 0 ? 'left' : 'right';
  }

  press(action, { delay = 0, hold = 0.06 } = {}) {
    this.queue.push({ at: this.time + delay, action, hold });
  }

  holdFor(action, secs) {
    this.holds[action] = Math.max(this.holds[action] || 0, secs);
  }

  clearHolds() {
    this.holds = {};
  }

  update(dt) {
    this.time += dt;
    const s = this.self;
    const o = this.opp;
    const inp = this.input;

    // execute scheduled presses
    this.queue = this.queue.filter((q) => {
      if (q.at > this.time) return true;
      // translate relative directions at execution time
      const a = q.action === 'fwd' ? this.fwd : q.action === 'back' ? this.back : q.action;
      inp.tap(a);
      this.holdFor(a, q.hold);
      return false;
    });

    if (s.canAct) {
      this._react();
      this.decideIn -= dt;
      if (this.decideIn <= 0) {
        this.decideIn = this.p.reaction * rand(0.7, 1.4) + 0.05;
        this._decide();
      }
    } else {
      this.clearHolds();
      this.queue.length = 0;
    }

    for (const a of ACTIONS) {
      if (this.holds[a] > 0) {
        this.holds[a] -= dt;
        inp.held[a] = true;
      } else inp.held[a] = false;
    }
    inp.commit();
  }

  _dist() {
    return Math.abs(this.opp.x - this.self.x);
  }

  /** Defensive reactions to an incoming attack (with reaction delay). */
  _react() {
    const s = this.self;
    const o = this.opp;
    if (o.state !== 'attack' || !o.move) return;
    if (this.seenMove === o.attackSerial) return;
    this.seenMove = o.attackSerial;
    const m = o.move;
    const dist = this._dist();
    if (dist > m.range + 1.2) return;
    if (!(s.actionable || s.state === 'blockstun')) return;
    const timeToHit = m.startup - o.moveTime;
    const canSee = timeToHit > this.p.reaction * 0.5 || m.special;
    if (!canSee || Math.random() > this.p.block) return;
    const dur = m.activeEnd - o.moveTime + 0.12;
    const delay = Math.min(this.p.reaction * 0.4, Math.max(0, timeToHit - 0.06));
    this.queue.length = 0;
    this.clearHolds();
    if (m.lowest && !s.def.shield) {
      // either crouch-block or jump over the low
      if (Math.random() < 0.25 + this.p.spacing * 0.2) this.press('up', { delay });
      else {
        this.press('block', { delay, hold: dur });
        this.press('down', { delay, hold: dur });
      }
    } else {
      this.press('block', { delay, hold: dur });
    }
    this.decideIn = Math.max(this.decideIn, dur * 0.8);
  }

  _decide() {
    const s = this.self;
    const o = this.opp;
    const p = this.p;
    const dist = this._dist();
    if (!s.actionable && s.state !== 'dash') return;
    if (this.holds.block > 0) return;

    const oppRecovering = (o.state === 'attack' && o.move && o.moveTime > o.move.activeEnd) || o.state === 'land' || o.state === 'blockstun';
    const oppDown = o.state === 'down' || o.state === 'getup' || o.state === 'knockdown';
    const lowHealth = s.hp / s.def.maxHealth < 0.3;
    const specialCost = s.def.moves.special?.energyCost ?? 100;
    const specialReady = s.energy >= specialCost && (s.cooldowns.special || 0) <= 0;

    // keep spacing during the opponent's wake-up
    if (oppDown) {
      if (dist > this.ideal + 0.4) this.holdFor(this.fwd, 0.2);
      else if (Math.random() < 0.4) this.press('block', { hold: 0.35 });
      return;
    }

    // special move
    if (specialReady && dist <= this.ranges.special + 0.1 && (oppRecovering || Math.random() < p.special * 0.45 || (lowHealth && Math.random() < p.special))) {
      this.press('special');
      return;
    }

    // punish
    if (oppRecovering && dist <= this.ranges.punch + 0.3 && Math.random() < p.punish) {
      this._attackString(true);
      return;
    }

    // anti-air: opponent jumping in
    if (o.state === 'jump' || (o.state === 'attack' && o.move?.air)) {
      if (dist < 2.2) {
        if (Math.random() < p.block) this.press('block', { hold: 0.45 });
        else this.press('kick');
        return;
      }
    }

    // approach
    if (dist > this.ideal + 0.35) {
      const r = Math.random();
      if (dist > 4.2 && r < 0.35 * p.aggression + 0.1) {
        this.press('dash');
        if (Math.random() < p.combo) this.press('punch', { delay: 0.14 });
      } else if (r < 0.06 + 0.08 * p.aggression && dist < 3.6) {
        this.holdFor(this.fwd, 0.25);
        this.press('up', { delay: 0.02 });
        this.press('kick', { delay: 0.28 });
      } else {
        this.holdFor(this.fwd, Math.min(0.6, (dist - this.ideal) / s.def.walkSpeed + 0.05));
      }
      return;
    }

    // too close — sometimes create space
    if (dist < 0.95 && Math.random() < p.spacing * 0.35) {
      if (Math.random() < 0.4) this.press('back', { hold: 0.06 }), this.press('back', { delay: 0.1, hold: 0.06 });
      else this.holdFor(this.back, 0.3);
      return;
    }

    // in range: attack or bait
    const roll = Math.random();
    if (roll < p.aggression) {
      this._attackString(false);
    } else if (roll < p.aggression + (1 - p.aggression) * 0.4) {
      this.press('block', { hold: rand(0.25, 0.5) });
    } else if (roll < p.aggression + (1 - p.aggression) * 0.7) {
      this.holdFor(this.back, rand(0.15, 0.35));
    }
    // otherwise: wait a beat
  }

  _attackString(punish) {
    const o = this.opp;
    const p = this.p;
    const dist = this._dist();
    const oppBlocksHigh = o.blocking && !o.crouching;
    const r = Math.random();
    // low attacks vs standing blockers, kicks for range, punches up close
    if ((oppBlocksHigh && !o.def.shield && r < 0.6) || r < 0.15) {
      this.holdFor('down', 0.45);
      this.press(Math.random() < 0.5 ? 'kick' : 'punch', { delay: 0.04 });
      return;
    }
    if (dist > this.ranges.punch - 0.05 || (r < 0.45 && !punish)) {
      this.press('kick');
      return;
    }
    this.press('punch');
    if (Math.random() < p.combo) {
      this.press('punch', { delay: 0.16 + rand(0, 0.06) });
      if (Math.random() < p.combo) this.press('kick', { delay: 0.42 });
    }
  }
}
