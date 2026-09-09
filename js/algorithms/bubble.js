/* バブルソート — 理解枠。
 * generate() は VBA と1行ずつ対応する順序で書く。
 * 速いJSではなく、VBAの写像であることが要件。 */
window.SV = window.SV || {};
SV.algorithms = SV.algorithms || {};

SV.algorithms.bubble = {
  id: 'bubble',
  name: 'バブルソート',
  tier: 'basic',
  summary: '隣り合う2つを比べて、逆なら入れ替える。これを端から端まで、範囲を狭めながら繰り返す。',
  watchVars: ['i', 'j', 'tmp'],
  order: 'O(n\u00B2)',
  theoryNote: 'n(n-1)/2',
  theoryCompare: function (n) { return n * (n - 1) / 2; },

  vba: function (n) {
    var w = SV.wrapVba('BubbleSort', n, ', i As Long, j As Long, tmp As Long');
    w.core = [
      "",
      "    ' ----- 並べ替え（バブルソート） -----",
      "    For i = 0 To n - 2                        '#outer",
      "        For j = 0 To n - 2 - i                '#inner",
      "            If a(j) > a(j + 1) Then           '#compare",
      "                tmp = a(j)                    '#sw1",
      "                a(j) = a(j + 1)               '#sw2",
      "                a(j + 1) = tmp                '#sw3",
      "            End If                            '#endIf",
      "        Next j                                '#nextJ",
      "    Next i                                    '#nextI"
    ].join("\n");
    return w;
  },

  generate: function (rec, L) {
    var a = rec.a, n = rec.n;
    var i, j, tmp, left, right, willSwap;

    for (i = 0; i <= n - 2; i++) {
      rec.set('i', i);
      rec.set('j', null);
      rec.step(L.outer, {}, (i + 1) + '周目。a(0) 〜 a(' + (n - 1 - i) + ') の範囲を、左から順に見ていきます。');

      for (j = 0; j <= n - 2 - i; j++) {
        rec.set('j', j);
        rec.step(L.inner, { cursor: [j, j + 1] },
          'j = ' + j + '。a(' + j + ') と a(' + (j + 1) + ') の組を見ます。');

        left = a[j];
        right = a[j + 1];
        rec.countCompare();
        willSwap = left > right;
        rec.step(L.compare, { compare: [j, j + 1] },
          'a(' + j + ')=' + left + ' > a(' + (j + 1) + ')=' + right + ' ？ → ' +
          (willSwap ? 'はい。逆なので入れ替えます。' : 'いいえ。順番どおりなので、そのまま次へ。'));

        if (willSwap) {
          tmp = a[j];
          rec.set('tmp', tmp);
          rec.step(L.sw1, { swap: [j, j + 1] }, 'tmp に a(' + j + ')=' + tmp + ' を退避します。');

          a[j] = a[j + 1];
          rec.step(L.sw2, { swap: [j, j + 1] }, 'a(' + j + ') に a(' + (j + 1) + ')=' + a[j] + ' を上書きします。');

          a[j + 1] = tmp;
          rec.countSwap();
          rec.step(L.sw3, { swap: [j, j + 1] }, 'a(' + (j + 1) + ') に tmp=' + tmp + ' を書き戻して、入れ替え完了。');
          rec.set('tmp', null);
        }
      }

      rec.set('j', null);
      rec.markSorted(n - 1 - i);
      rec.step(L.nextI, {},
        '右端まで到達しました。この範囲でいちばん大きい値が a(' + (n - 1 - i) + ') に確定します。');
    }

    rec.markAllSorted();
    rec.clearVars();
    rec.step(L.nextI, {}, '並べ替えが終わりました。');
  }
};
