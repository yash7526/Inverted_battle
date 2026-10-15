// requestAnimationFrame loop with clamped delta time and a global time-scale
// (used for slow-motion K.O. and hit-stop effects).

export class GameLoop {
  constructor(update) {
    this.update = update;
    this.running = false;
    this.rafId = 0;
    this.last = 0;
    this.timeScale = 1;
    this.elapsed = 0;
    this._tick = this._tick.bind(this);
    this._onVisibility = () => {
      // Avoid a huge delta after the tab was hidden.
      this.last = performance.now();
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    document.addEventListener('visibilitychange', this._onVisibility);
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  _tick(now) {
    if (!this.running) return;
    const rawDt = Math.min((now - this.last) / 1000, 1 / 20); // clamp spikes
    this.last = now;
    this.elapsed += rawDt;
    this.update(rawDt * this.timeScale, rawDt);
    this.rafId = requestAnimationFrame(this._tick);
  }
}
