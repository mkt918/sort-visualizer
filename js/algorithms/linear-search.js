/* 線形探索。
 * ソートの js/algorithms/*.js と同じ形（id, name, summary, watchVars, order,
 * theoryLabel, vba(), generate()）に揃える。探索は SV.algorithms ではなく
 * 別名前空間 SV.searchAlgorithms に登録する（交換が無い・見つかる/見つからない
 * という結果がある等、ソートとは性質が違うため）。
 * generate() は探す値 target を追加引数で受け取る点だけがソート版と異なる。 */
window.SV = window.SV || {};
SV.searchAlgorithms = SV.searchAlgorithms || {};

SV.searchAlgorithms.linear = {
  id: 'linear',
  name: '線形探索',
  summary: '先頭から順に1つずつ、探している値と一致するかを比べる。見つかるまで、または端まで進む。',
  watchVars: ['i', 'target'],
  order: 'O(n)',
  noSwap: true,
  theoryLabel: function (n) {
    return '見つかる場合の平均 (n+1)/2 ≈ ' + Math.round((n + 1) / 2) +
           ' 回 / 見つからない場合は必ず n=' + n + ' 回';
  },

  vba: function (n, target) {
    var w = SV.wrapVba('LinearSearch', n, ', i As Long, target As Long, found As Long');
    w.core = [
      "",
      "    ' ----- 探索（線形探索） -----",
      "    target = " + target + "                        '#setTarget",
      "    found = -1                                 '#initFound",
      "    For i = 0 To n - 1                         '#outer",
      "        If a(i) = target Then                  '#compare",
      "            found = i                          '#markFound",
      "            Exit For                           '#exitFor",
      "        End If                                 '#endIf",
      "    Next i                                     '#nextI"
    ].join("\n");
    return w;
  },

  /* rec.step() の narration・戻り値の found index（見つからなければ -1）。
   * 手書きループは1行ずつVBAと対応させる（速いJSではなく、VBAの写像であることが要件）。 */
  generate: function (rec, L, target) {
    var a = rec.a, n = rec.n;
    var i, found = -1;

    rec.set('target', target);
    rec.step(L.setTarget, {}, '探す値は ' + target + ' です。');
    rec.step(L.initFound, {}, 'まだ見つかっていません（found = -1）。');

    for (i = 0; i < n; i++) {
      rec.set('i', i);
      rec.step(L.outer, { cursor: [i] }, 'i = ' + i + '。a(' + i + ')=' + a[i] + ' を見ます。');

      rec.countCompare();
      var hit = a[i] === target;
      rec.step(L.compare, { compare: [i] },
        'a(' + i + ')=' + a[i] + ' = ' + target + ' ？ → ' +
        (hit ? 'はい。見つかりました。' : 'いいえ。次へ進みます。'));

      if (hit) {
        found = i;
        rec.markSorted(i);
        rec.step(L.markFound, { compare: [i] }, 'found に ' + i + ' を記録します。');
        rec.step(L.exitFor, { compare: [i] }, 'これ以上見る必要が無いので、ループを抜けます。');
        break;
      }
    }

    rec.set('i', null);
    if (found < 0) {
      rec.step(L.nextI, {}, target + ' は配列の中にありませんでした。');
    } else {
      rec.step(L.nextI, {}, '探索が終わりました。');
    }
    return found;
  }
};
