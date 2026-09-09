/* recorder.js — アルゴリズムの実行を「ステップの配列」に書き出す。
 *
 * 再生・一時停止・1ステップ戻る・シークバーは、すべてこの配列の
 * インデックス操作に還元される。個別に実装しない。
 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var MAX_STEPS = 60000;

  function Recorder(values, watchVars) {
    this.a = values.slice();
    this.n = values.length;
    this.watchVars = (watchVars || []).slice();
    this.steps = [];
    this.compare = 0;
    this.swap = 0;
    this.vars = {};
    this.sorted = [];
    var i;
    for (i = 0; i < this.watchVars.length; i++) this.vars[this.watchVars[i]] = null;
    for (i = 0; i < this.n; i++) this.sorted.push(false);
  }

  Recorder.prototype.set = function (name, value) {
    this.vars[name] = value;
  };

  Recorder.prototype.countCompare = function () { this.compare++; };
  Recorder.prototype.countSwap = function () { this.swap++; };

  Recorder.prototype.markSorted = function (i) {
    if (i >= 0 && i < this.n) this.sorted[i] = true;
  };

  Recorder.prototype.markAllSorted = function () {
    for (var i = 0; i < this.n; i++) this.sorted[i] = true;
  };

  Recorder.prototype.clearVars = function () {
    for (var i = 0; i < this.watchVars.length; i++) this.vars[this.watchVars[i]] = null;
  };

  /* line: VBAの行番号 / mark: { compare, swap, cursor: number[], pivot: number }
   * narration: 日本語の実況1行
   * extra: 画面の配列 a にはまだ反映されていないが、値としては消えていない退避中の
   *        生値の配列（例: マージソートの作業用配列 w のうち、まだ a へ書き戻していない部分）。
   *        単純な swap 系アルゴリズムの tmp 1個だけなら vars.tmp で足りるので省略してよい。 */
  Recorder.prototype.step = function (line, mark, narration, extra) {
    if (this.steps.length >= MAX_STEPS) {
      throw new Error('ステップ数が上限（' + MAX_STEPS + '）を超えました。棒の本数を減らしてください。');
    }
    mark = mark || {};
    var vars = {}, k;
    for (k = 0; k < this.watchVars.length; k++) {
      vars[this.watchVars[k]] = this.vars[this.watchVars[k]];
    }
    this.steps.push({
      line: line,
      array: this.a.slice(),
      mark: {
        compare: mark.compare ? mark.compare.slice() : null,
        swap: mark.swap ? mark.swap.slice() : null,
        cursor: mark.cursor ? mark.cursor.slice() : null,
        pivot: (typeof mark.pivot === 'number') ? mark.pivot : null
      },
      sorted: this.sorted.slice(),
      vars: vars,
      counters: { compare: this.compare, swap: this.swap },
      narration: narration || '',
      extra: extra ? extra.slice() : []
    });
  };

  SV.Recorder = Recorder;
  SV.MAX_STEPS = MAX_STEPS;
})(window.SV);
