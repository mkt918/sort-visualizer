/* presets.js — 初期データの作り方。
 * 「ほぼ整列済みだと挿入系が激速になる」といった、データの性質で速さが変わる
 * 体験をさせたいので、ランダム以外のパターンを標準で持たせる。 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  function shuffled(lo, hi) {
    var pool = [], v, i, k, t;
    for (v = lo; v <= hi; v++) pool.push(v);
    for (i = pool.length - 1; i > 0; i--) {
      k = Math.floor(Math.random() * (i + 1));
      t = pool[i]; pool[i] = pool[k]; pool[k] = t;
    }
    return pool;
  }

  function distinct(n) {
    return shuffled(5, 99).slice(0, n);
  }

  function asc(n) {
    return distinct(n).sort(function (x, y) { return x - y; });
  }

  var presets = {
    order: ['random', 'reversed', 'nearly', 'duplicates'],
    labels: {
      random: 'ランダム',
      reversed: '逆順',
      nearly: 'ほぼ整列済み',
      duplicates: '重複多め'
    },
    make: function (id, n) {
      var arr, i, k, t, swaps, levels;
      if (n <= 0) return [];

      if (id === 'reversed') {
        arr = asc(n).reverse();

      } else if (id === 'nearly') {
        arr = asc(n);
        swaps = Math.max(1, Math.floor(n / 8));
        for (i = 0; i < swaps; i++) {
          k = Math.floor(Math.random() * Math.max(1, n - 1));
          t = arr[k]; arr[k] = arr[k + 1]; arr[k + 1] = t;
        }

      } else if (id === 'duplicates') {
        levels = [14, 32, 51, 70, 89];
        arr = [];
        for (i = 0; i < n; i++) {
          arr.push(levels[Math.floor(Math.random() * levels.length)]);
        }

      } else {
        arr = distinct(n);
      }
      return arr;
    }
  };

  SV.presets = presets;
})(window.SV);
