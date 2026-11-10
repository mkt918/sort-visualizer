/* 二分探索。ソート済み配列が前提（探索topicのデータは常に昇順で作る）。
 * low/high/mid を管理し、a(mid) と target の大小で範囲を半分に絞り込む。
 * mid は棒グラフ上でソートの「基準（pivot）」と同じ色をそのまま「中央」の
 * 意味で流用する（新しい色を増やさない）。範囲外になった要素は mark.excluded
 * で渡し、薄く表示する。 */
window.SV = window.SV || {};
SV.searchAlgorithms = SV.searchAlgorithms || {};

(function (SV) {
  'use strict';

  /* [0, low-1] と [high+1, n-1] を1本の配列にして返す（絞り込みで外れた範囲）。 */
  function excludedRange(n, low, high) {
    var out = [];
    for (var i = 0; i < low; i++) out.push(i);
    for (var i2 = high + 1; i2 < n; i2++) out.push(i2);
    return out;
  }

  SV.searchAlgorithms.binary = {
    id: 'binary',
    name: '二分探索',
    summary: '中央の値と比べ、探す値がそれより大きいか小さいかで範囲を半分に絞り込む。これを繰り返す。',
    watchVars: ['low', 'high', 'mid', 'target'],
    order: 'O(log n)',
    noSwap: true,
    theoryLabel: function (n) {
      var worst = n > 0 ? Math.floor(Math.log2(n)) + 1 : 0;
      return '最悪でも ⌊ log₂ ' + n + ' ⌋ + 1 = ' + worst + ' 回で終わる';
    },

    vba: function (n, target) {
      var BS = String.fromCharCode(92); // VBAの整数除算演算子 '\'。ツール経由での破損を避けるため文字コードで組み立てる。
      var w = SV.wrapVba('BinarySearch', n,
        ', low As Long, high As Long, mid As Long, target As Long, found As Long');
      w.core = [
        "",
        "    ' ----- 探索（二分探索。配列は昇順に並んでいる前提） -----",
        "    target = " + target + "                        '#setTarget",
        "    low = 0                                    '#initLow",
        "    high = n - 1                               '#initHigh",
        "    found = -1                                 '#initFound",
        "    Do While low <= high                       '#loopTop",
        "        mid = (low + high) " + BS + " 2              '#calcMid",
        "        If a(mid) = target Then                '#compareEq",
        "            found = mid                        '#markFound",
        "            Exit Do                            '#exitDo",
        "        ElseIf a(mid) < target Then             '#compareLt",
        "            low = mid + 1                      '#moveLow",
        "        Else                                   '#elseBranch",
        "            high = mid - 1                     '#moveHigh",
        "        End If                                 '#endIf",
        "    Loop                                       '#loopEnd"
      ].join("\n");
      return w;
    },

    generate: function (rec, L, target) {
      var a = rec.a, n = rec.n;
      var low = 0, high = n - 1, mid, found = -1;

      rec.set('target', target);
      rec.step(L.setTarget, {}, '探す値は ' + target + ' です。');
      rec.set('low', low);
      rec.step(L.initLow, { excluded: excludedRange(n, low, high) }, 'low を左端 0 にします。');
      rec.set('high', high);
      rec.step(L.initHigh, { excluded: excludedRange(n, low, high) }, 'high を右端 ' + high + ' にします。');
      rec.step(L.initFound, { excluded: excludedRange(n, low, high) }, 'まだ見つかっていません（found = -1）。');

      while (low <= high) {
        rec.step(L.loopTop, { excluded: excludedRange(n, low, high) },
          'low=' + low + ', high=' + high + '。範囲が残っているので続けます。');

        mid = Math.floor((low + high) / 2);
        rec.set('mid', mid);
        rec.step(L.calcMid, { pivot: mid, excluded: excludedRange(n, low, high) },
          '真ん中 mid = ' + mid + '。a(' + mid + ')=' + a[mid] + ' を見ます。');

        rec.countCompare();
        if (a[mid] === target) {
          found = mid;
          rec.step(L.compareEq, { pivot: mid, excluded: excludedRange(n, low, high) },
            'a(' + mid + ')=' + a[mid] + ' = ' + target + ' ？ → はい。見つかりました。');
          rec.markSorted(mid);
          rec.step(L.markFound, { compare: [mid] }, 'found に ' + mid + ' を記録します。');
          rec.step(L.exitDo, { compare: [mid] }, 'これ以上見る必要が無いので、ループを抜けます。');
          break;
        } else if (a[mid] < target) {
          rec.step(L.compareEq, { pivot: mid, excluded: excludedRange(n, low, high) },
            'a(' + mid + ')=' + a[mid] + ' = ' + target + ' ？ → いいえ。');
          rec.step(L.compareLt, { pivot: mid, excluded: excludedRange(n, low, high) },
            'a(' + mid + ')=' + a[mid] + ' < ' + target + ' なので、答えは右半分にあります。');
          low = mid + 1;
          rec.set('low', low);
          rec.step(L.moveLow, { excluded: excludedRange(n, low, high) }, 'low を ' + low + ' にします。');
        } else {
          rec.step(L.compareEq, { pivot: mid, excluded: excludedRange(n, low, high) },
            'a(' + mid + ')=' + a[mid] + ' = ' + target + ' ？ → いいえ。');
          rec.step(L.elseBranch, { pivot: mid, excluded: excludedRange(n, low, high) },
            'a(' + mid + ')=' + a[mid] + ' > ' + target + ' なので、答えは左半分にあります。');
          high = mid - 1;
          rec.set('high', high);
          rec.step(L.moveHigh, { excluded: excludedRange(n, low, high) }, 'high を ' + high + ' にします。');
        }
      }

      rec.set('mid', null);
      if (found < 0) {
        rec.step(L.loopEnd, { excluded: excludedRange(n, low, high) },
          'low > high になり、範囲が空になりました。' + target + ' は配列の中にありませんでした。');
      } else {
        rec.step(L.loopEnd, {}, '探索が終わりました。');
      }
      return found;
    }
  };
})(window.SV);
