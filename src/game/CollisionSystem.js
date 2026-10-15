// Push-boxes and arena boundaries: fighters can never overlap or leave the stage.

export class CollisionSystem {
  constructor(limit = 7) {
    this.limit = limit;
    this.minSeparation = 0.78;
  }

  clamp(f) {
    if (f.x < -this.limit) {
      f.x = -this.limit;
      if (f.vx < 0) f.vx = 0;
    } else if (f.x > this.limit) {
      f.x = this.limit;
      if (f.vx > 0) f.vx = 0;
    }
  }

  atWall(f, margin = 0.15) {
    return Math.abs(f.x) >= this.limit - margin;
  }

  update(a, b) {
    this.clamp(a);
    this.clamp(b);
    const dx = b.x - a.x;
    // Only resolve when the bodies are at similar heights (lets a high jump pass overhead
    // briefly without the jumper being shoved).
    const vertical = Math.abs(a.y - b.y) < 1.1;
    if (!vertical) return;
    const dist = Math.abs(dx);
    if (dist >= this.minSeparation) return;
    const dir = dx !== 0 ? Math.sign(dx) : a.facing || 1;
    const overlap = this.minSeparation - dist;
    a.x -= (dir * overlap) / 2;
    b.x += (dir * overlap) / 2;
    // If a wall stopped one of them, the other absorbs the rest of the push.
    const ax = a.x;
    const bx = b.x;
    this.clamp(a);
    this.clamp(b);
    if (a.x !== ax) b.x = a.x + dir * this.minSeparation;
    if (b.x !== bx) a.x = b.x - dir * this.minSeparation;
    this.clamp(a);
    this.clamp(b);
  }
}
