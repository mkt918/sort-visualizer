/* 選択ソート — 理解枠。
 * 「線形探索で最小値を探す」＋「交換」の組み合わせ。既習事項だけで完全に読める。 */
window.SV = window.SV || {};
SV.algorithms = SV.algorithms || {};

SV.algorithms.selection = {
  id: 'selection',
  name: '選択ソート',
  tier: 'basic',
  summary: '残っている範囲から最小値を線形探索で見つけ、先頭と交換する。それを1つずつ右へずらして繰り返す。',
  watchVars: ['i', 'j', 'minIdx', 'tmp'],
  order: 'O(n\u00B2)',
  theoryNote: 'n(n-1)/2',
  theoryCompare: function (n) { return n * (n - 1) / 2; },

  vba: function (n) {
    var w = SV.wrapVba('SelectionSort', n, ', i As Long, j As Long, minIdx As Long, tmp As Long');
    w.core = [
      "",
      "    ' ----- 並べ替え（選択ソート） -----",
      "    For i = 0 To n - 2                        '#outer",
      "        minIdx = i                            '#initMin",
      "        For j = i + 1 To n - 1                '#inner",
      "            If a(j) < a(minIdx) Then          '#compare",
      "                minIdx = j                    '#updateMin",
      "            End If                            '#endIf",
      "        Next j                                '#nextJ",
      "        tmp = a(i)                            '#sw1",
      "        a(i) = a(minIdx)                      '#sw2",
      "        a(minIdx) = tmp                       '#sw3",
      "    Next i                                    '#nextI"
    ].join("\n");
    return w;
  },

  generate: function (rec, L) {
    var a = rec.a, n = rec.n;
    var i, j, tmp, minIdx, better;

    for (i = 0; i <= n - 2; i++) {
      rec.set('i', i);
      rec.set('j', null);
      rec.set('minIdx', null);
      rec.set('tmp', null);
      rec.step(L.outer, { cursor: [i] },
        (i + 1) + '周目。a(' + i + ') に入れる値を、a(' + i + ') 〜 a(' + (n - 1) + ') の中から探します。');

      minIdx = i;
      rec.set('minIdx', minIdx);
      rec.step(L.initMin, { pivot: minIdx },
        'まず minIdx = ' + i + '。今のところ a(' + i + ')=' + a[i] + ' が最小の候補です。');

      for (j = i + 1; j <= n - 1; j++) {
        rec.set('j', j);
        rec.step(L.inner, { cursor: [j], pivot: minIdx }, 'j = ' + j + ' を調べます。');

        rec.countCompare();
        better = a[j] < a[minIdx];
        rec.step(L.compare, { compare: [j, minIdx], pivot: minIdx },
          'a(' + j + ')=' + a[j] + ' < a(' + minIdx + ')=' + a[minIdx] + ' ？ → ' +
          (better ? 'はい。もっと小さい値が見つかりました。' : 'いいえ。最小の候補は変わりません。'));

        if (better) {
          minIdx = j;
          rec.set('minIdx', minIdx);
          rec.step(L.updateMin, { pivot: minIdx },
            '最小の候補を minIdx = ' + j + ' に更新します。');
        }
      }

      rec.set('j', null);
      rec.step(L.nextJ, { pivot: minIdx },
        '探索おわり。この範囲の最小値は a(' + minIdx + ')=' + a[minIdx] + ' でした。');

      tmp = a[i];
      rec.set('tmp', tmp);
      rec.step(L.sw1, { swap: [i, minIdx], pivot: minIdx }, 'tmp に a(' + i + ')=' + tmp + ' を退避します。');

      a[i] = a[minIdx];
      rec.step(L.sw2, { swap: [i, minIdx], pivot: minIdx }, 'a(' + i + ') に最小値 ' + a[i] + ' を入れます。');

      a[minIdx] = tmp;
      rec.countSwap();
      rec.step(L.sw3, { swap: [i, minIdx], pivot: minIdx },
        minIdx === i
          ? 'a(' + minIdx + ') に tmp=' + tmp + ' を書き戻します。i と minIdx が同じなので、実際には値は動いていません。'
          : 'a(' + minIdx + ') に tmp=' + tmp + ' を書き戻して、入れ替え完了。');

      rec.set('tmp', null);
      rec.markSorted(i);
      rec.step(L.nextI, {}, 'a(' + i + ') が確定しました。次は a(' + (i + 1) + ') を決めます。');
    }

    rec.markAllSorted();
    rec.clearVars();
    rec.step(L.nextI, {}, '最後の1つは自動的に決まります。並べ替えが終わりました。');
  }
};
