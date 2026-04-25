const COMBO_WINDOW_MS = 2500;

export class ScoreSystem {
  private _score = 0;
  private _credits = 0;
  private _combo = 1;
  private lastKillAt = -Infinity;

  get score(): number {
    return this._score;
  }

  get credits(): number {
    return this._credits;
  }

  get combo(): number {
    return this._combo;
  }

  addKill(scoreValue: number, creditValue: number, now: number): void {
    this._combo = now - this.lastKillAt < COMBO_WINDOW_MS ? Math.min(this._combo + 1, 8) : 1;
    this.lastKillAt = now;
    this._score += Math.round(scoreValue * this._combo);
    this._credits += creditValue;
  }

  tick(now: number): void {
    if (now - this.lastKillAt > COMBO_WINDOW_MS) this._combo = 1;
  }

  addCredits(amount: number): void {
    this._credits += amount;
  }

  addScore(amount: number): void {
    this._score += amount;
  }
}
