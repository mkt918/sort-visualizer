/* player.js — ステップ配列の再生装置。
 * 再生・一時停止・1ステップ進む/戻る・シークは、すべてここの index 操作。 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  function Player() {
    this.steps = [];
    this.index = 0;
    this.playing = false;
    this.speed = 12;          // 1秒あたりのステップ数
    this.onChange = null;
    this.onStateChange = null;
    this._raf = 0;
    this._last = 0;
    this._acc = 0;
  }

  Player.prototype.load = function (steps) {
    this.pause();
    this.steps = steps || [];
    this.index = 0;
    this._acc = 0;
    this._emit();
  };

  Player.prototype.current = function () {
    return this.steps.length ? this.steps[this.index] : null;
  };

  Player.prototype.lastIndex = function () {
    return Math.max(0, this.steps.length - 1);
  };

  Player.prototype.atEnd = function () {
    return this.index >= this.lastIndex();
  };

  Player.prototype.seek = function (i) {
    var last = this.lastIndex();
    i = Math.round(i);
    if (i < 0) i = 0;
    if (i > last) i = last;
    if (i === this.index) return;
    this.index = i;
    this._emit();
  };

  Player.prototype.next = function () {
    if (this.atEnd()) return false;
    this.index++;
    this._emit();
    return true;
  };

  Player.prototype.prev = function () {
    if (this.index <= 0) return false;
    this.index--;
    this._emit();
    return true;
  };

  Player.prototype.play = function () {
    if (!this.steps.length || this.playing) return;
    if (this.atEnd()) { this.index = 0; this._emit(); }
    this.playing = true;
    this._last = 0;
    this._acc = 0;
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
    if (this.onStateChange) this.onStateChange(this);
  };

  Player.prototype.pause = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (!this.playing) return;
    this.playing = false;
    if (this.onStateChange) this.onStateChange(this);
  };

  Player.prototype.toggle = function () {
    if (this.playing) this.pause(); else this.play();
  };

  Player.prototype.setSpeed = function (v) {
    this.speed = Math.max(0.5, v);
  };

  Player.prototype._tick = function (ts) {
    if (!this.playing) return;
    if (!this._last) this._last = ts;
    var dt = (ts - this._last) / 1000;
    this._last = ts;
    if (dt > 0.1) dt = 0.1;           // タブ復帰時に一気に飛ばさない
    this._acc += dt * this.speed;

    var moved = false;
    while (this._acc >= 1) {
      this._acc -= 1;
      if (this.atEnd()) { this._acc = 0; this.pause(); break; }
      this.index++;
      moved = true;
    }
    if (moved) this._emit();
    if (this.playing) this._raf = requestAnimationFrame(this._tick);
  };

  Player.prototype._emit = function () {
    if (this.onChange) this.onChange(this.current(), this.index, this.steps.length);
  };

  SV.Player = Player;
})(window.SV);
