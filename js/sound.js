/* sound.js — 比較・交換のたびに鳴る「ポコッ」という短い効果音。
 *
 * 外部音源ファイルは使わない（file:// でも動く方針を崩さないため）。
 * Web Audio API でその場で波形を合成する（トライアングル波＋速い減衰）。
 *
 * ブラウザの自動再生制限により AudioContext はユーザー操作なしに音を出せないため、
 * 実際の初期化は最初のユーザー操作（再生・1ステップ進むなどのクリック）まで遅らせる。
 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var STORAGE_KEY = 'sortvis.soundOn';

  var ctx = null;
  var enabled = loadPref();

  function loadPref() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === null ? true : v === '1'; // 既定はON
    } catch (e) {
      return true; // localStorageが使えない環境（プライベートモード等）では毎回ON扱い
    }
  }

  function savePref(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (e) { /* 無視してよい */ }
  }

  /* ユーザー操作のハンドラ内から呼ぶ。AudioContextの生成・再開はここでしか行わない。 */
  function unlock() {
    if (!enabled) return;
    if (!ctx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return; // Web Audio 非対応の環境では静かに諦める
      try { ctx = new Ctor(); } catch (e) { ctx = null; return; }
    }
    if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
  }

  /* 値(5〜99を想定)を、耳に心地よい音域（A3〜A5 の対数スケール）へ写像する。 */
  function pitchFor(value) {
    var lo = 5, hi = 99, minF = 220, maxF = 880;
    var t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return minF * Math.pow(maxF / minF, t);
  }

  /* 「ポコッ」1発。トライアングル波＋速い立ち上がり・減衰＋わずかなピッチ下降で
   * 木琴／ウッドブロックのような軽い質感にする。 */
  function poko(value, accent) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    var t0 = ctx.currentTime;
    var freq = typeof value === 'number' ? pitchFor(value) : 440;
    var peak = accent ? 0.16 : 0.10;

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.82), t0 + 0.06);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.12);
  }

  /* ステップの mark（compare/swap）から、鳴らすべき値を拾って1つ鳴らす。
   * compare と swap の両方があれば swap を優先する（値が動く瞬間のほうを聞かせたい）。 */
  function playForStep(step) {
    if (!enabled || !step || !step.mark) return;
    var idxs = (step.mark.swap && step.mark.swap.length) ? step.mark.swap
             : (step.mark.compare && step.mark.compare.length) ? step.mark.compare
             : null;
    if (!idxs || !idxs.length) return;
    var idx = idxs[0];
    var v = step.array && typeof step.array[idx] === 'number' ? step.array[idx] : null;
    poko(v, !!(step.mark.swap && step.mark.swap.length));
  }

  function isEnabled() { return enabled; }

  function setEnabled(v) {
    enabled = !!v;
    savePref(enabled);
    if (enabled) unlock();
  }

  SV.Sound = {
    unlock: unlock,
    poko: poko,
    playForStep: playForStep,
    isEnabled: isEnabled,
    setEnabled: setEnabled
  };
})(window.SV);
