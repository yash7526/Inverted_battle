// Best-of-three round flow: intro → fight → K.O./time → victory pose → next round
// or match end. Drives announcements, the round timer and slow-motion K.O.s.

export class RoundManager {
  constructor({ state, audio, hud, loop, camera, onMatchEnd }) {
    this.state = state;
    this.audio = audio;
    this.hud = hud;
    this.loop = loop;
    this.camera = camera;
    this.onMatchEnd = onMatchEnd;
    this.fighters = null;
    this.phase = 'idle';
  }

  startMatch(fighters, labels) {
    this.fighters = fighters;
    this.labels = labels; // { 0: 'YOU WIN', 1: 'YOU LOSE' } or player names
    this.wins = [0, 0];
    this.round = 0;
    this.perfects = [0, 0];
    fighters.forEach((f) => {
      f.energy = 0;
      f.stats = { damageDealt: 0, maxCombo: 0, hitsLanded: 0, specials: 0 };
    });
    this.nextRound();
  }

  nextRound() {
    this.round++;
    const [a, b] = this.fighters;
    a.resetForRound(-2.2);
    b.resetForRound(2.2);
    a.energy = Math.min(a.energy, 100);
    b.energy = Math.min(b.energy, 100);
    this.timeLeft = this.state.settings.roundTime;
    this.phase = 'intro';
    this.phaseTime = 0;
    this.fightCalled = false;
    this.loop.timeScale = 1;
    this.camera.setMode('fight');
    const final = this.wins[0] === 1 && this.wins[1] === 1;
    const label = final ? 'FINAL ROUND' : `ROUND ${this.round}`;
    this.hud.announce(label, { size: 'lg', duration: 1.3 });
    this.audio.announce(final ? 'Final round' : `Round ${this.round}`);
    this.hud.setRound(this.round, this.wins);
    this.hud.setTimer(this.timeLeft);
  }

  onKO(attacker) {
    if (this.phase !== 'fight') return;
    const winner = this.fighters.indexOf(attacker);
    this._endRound(winner, 'ko');
  }

  _endRound(winner, reason) {
    this.phase = 'ko';
    this.phaseTime = 0;
    this.winner = winner;
    this.fighters.forEach((f) => (f.canAct = false));
    if (winner >= 0) this.wins[winner]++;
    const w = winner >= 0 ? this.fighters[winner] : null;
    const perfect = w && w.hp >= w.def.maxHealth;
    if (perfect) this.perfects[winner]++;
    if (reason === 'ko') {
      this.loop.timeScale = 0.28;
      this.hud.announce('K.O.', { size: 'xl', duration: 1.6, style: 'ko' });
      this.audio.play('ko');
      this.audio.announce('K.O.');
      if (perfect) setTimeout(() => this.hud.announce('PERFECT', { size: 'lg', duration: 1.4, style: 'gold' }), 900);
    } else {
      this.hud.announce(winner < 0 ? 'DRAW' : 'TIME!', { size: 'xl', duration: 1.6 });
      this.audio.announce(winner < 0 ? 'Draw' : 'Time');
    }
    this.hud.setRound(this.round, this.wins);
  }

  update(dt, rawDt) {
    if (!this.fighters) return;
    this.phaseTime += rawDt;
    const [a, b] = this.fighters;

    switch (this.phase) {
      case 'intro':
        if (this.phaseTime > 1.45 && !this.fightCalled) {
          this.fightCalled = true;
          this.hud.announce('FIGHT!', { size: 'xl', duration: 0.9, style: 'fight' });
          this.audio.announce('Fight!');
        }
        if (this.phaseTime > 1.75) {
          this.phase = 'fight';
          this.phaseTime = 0;
          a.canAct = b.canAct = true;
        }
        break;

      case 'fight':
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        this.hud.setTimer(this.timeLeft);
        if (this.timeLeft <= 0) {
          const ra = a.hp / a.def.maxHealth;
          const rb = b.hp / b.def.maxHealth;
          const winner = Math.abs(ra - rb) < 1e-4 ? -1 : ra > rb ? 0 : 1;
          this._endRound(winner, 'time');
        }
        break;

      case 'ko':
        if (this.phaseTime > 1.1) this.loop.timeScale = Math.min(1, this.loop.timeScale + rawDt * 2);
        if (this.phaseTime > 1.7 && !this.posed) {
          const settled = this.fighters.every((f) => f.grounded && f.state !== 'attack' && f.hitstop <= 0);
          if (settled || this.phaseTime > 3.2) {
            this.posed = true;
            this.loop.timeScale = 1;
            if (this.winner >= 0) {
              const w = this.fighters[this.winner];
              const l = this.fighters[1 - this.winner];
              w.setVictory();
              l.setDefeat();
              this.camera.setMode('victory', { focus: w });
              this.audio.play(this.winner === 0 || !this.labels.cpu ? 'victory' : 'defeat');
            } else {
              a.setDefeat();
              b.setDefeat();
            }
          }
        }
        if (this.posed && this.phaseTime > 4.6) {
          this.posed = false;
          if (this.wins[0] >= 2 || this.wins[1] >= 2) {
            this.phase = 'over';
            this.onMatchEnd(this.wins[0] >= 2 ? 0 : 1, this.matchSummary());
          } else this.nextRound();
        }
        break;

      default:
        break;
    }
  }

  matchSummary() {
    return {
      wins: [...this.wins],
      rounds: this.round,
      perfects: [...this.perfects],
      stats: this.fighters.map((f) => ({ ...f.stats })),
    };
  }

  stop() {
    this.phase = 'idle';
    this.fighters = null;
    this.loop.timeScale = 1;
  }
}
