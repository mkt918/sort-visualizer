/* race.js — 2つのアルゴリズムを同じ初期配列で並走させる。
 * 「1ステップ＝1比較or1交換」を同速で刻み、どちらかが完走した瞬間に
 * 両方止める。止まった時点のステップ数の差が、そのまま計算量の差になる。 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  function Race() {
    this.lanes = [];
    this.speed = 12;
    this.playing = false;
    this.onTick = null;       // (lanes) => void
    this.onFinish = null;     // (winnerIndex, lanes) => void
    this._raf = 0;
    this._last = 0;
    this._acc = 0;
  }

  function makeLane(steps) {
    var last = Math.max(0, steps.length - 1);
    return { steps: steps, index: 0, done: last <= 0 };
  }

  Race.prototype.load = function (stepsArrays) {
    this.pause();
    this.lanes = stepsArrays.map(makeLane);
    this._acc = 0;
    this._emit();
  };

  Race.prototype.setSpeed = function (v) {
    this.speed = Math.max(0.5, v);
  };

  Race.prototype.reset = function () {
    this.pause();
    this.lanes.forEach(function (lane) {
      lane.index = 0;
      lane.done = lane.steps.length - 1 <= 0;
    });
    this._acc = 0;
    this._emit();
  };

  Race.prototype.allDone = function () {
    return this.lanes.length > 0 && this.lanes.every(function (l) { return l.done; });
  };

  Race.prototype.play = function () {
    if (!this.lanes.length || this.playing) return;
    if (this.allDone()) this.reset();
    this.playing = true;
    this._last = 0;
    this._acc = 0;
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  };

  Race.prototype.pause = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.playing = false;
  };

  Race.prototype._tick = function (ts) {
    if (!this.playing) return;
    if (!this._last) this._last = ts;
    var dt = (ts - this._last) / 1000;
    this._last = ts;
    if (dt > 0.1) dt = 0.1;
    this._acc += dt * this.speed;

    var moved = false;
    var winner = null;

    while (this._acc >= 1) {
      this._acc -= 1;
      for (var i = 0; i < this.lanes.length; i++) {
        var lane = this.lanes[i];
        if (lane.done) continue;
        var last = lane.steps.length - 1;
        if (lane.index < last) {
          lane.index++;
          moved = true;
        }
        if (lane.index >= last) {
          lane.done = true;
          if (winner === null) winner = i;   // 最初に完走したレーン
        }
      }
      if (winner !== null) break;             // 誰かゴールしたら、その場でレース終了
    }

    if (moved) this._emit();

    if (winner !== null) {
      this.pause();
      if (this.onFinish) this.onFinish(winner, this.lanes);
      return;
    }
    if (this.playing) this._raf = requestAnimationFrame(this._tick);
  };

  Race.prototype._emit = function () {
    if (this.onTick) this.onTick(this.lanes);
  };

  SV.Race = Race;
})(window.SV);
