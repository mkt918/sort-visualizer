/* 挿入ソート — 理解枠。
 * 「手札を並べ替えるときの動き」そのもの。確定済み範囲を右へ伸ばしながら、
 * 新しい値を正しい位置までずらして差し込む。既習事項だけで完全に読める。 */
window.SV = window.SV || {};
SV.algorithms = SV.algorithms || {};

SV.algorithms.insertion = {
  id: 'insertion',
  name: '挿入ソート',
  tier: 'basic',
  summary: '左側はすでに並んでいるものとして、次の1枚を正しい位置まで右から左へずらしながら差し込む。',
  watchVars: ['i', 'j', 'tmp'],
  order: 'O(n\u00B2)',
  theoryLabel: function (n) {
    var worst = n * (n - 1) / 2;
    return '最悪（逆順）は n(n-1)/2 = ' + worst + ' 回。ほぼ整列済みなら実際の比較はずっと少ない';
  },

  vba: function (n) {
    var w = SV.wrapVba('InsertionSort', n, ', i As Long, j As Long, tmp As Long');
    w.core = [
      "",
      "    ' ----- 並べ替え（挿入ソート） -----",
      "    For i = 1 To n - 1                        '#outer",
      "        tmp = a(i)                            '#hold",
      "        j = i - 1                             '#initJ",
      "        Do While j >= 0                       '#loopTop",
      "            If a(j) > tmp Then                '#compare",
      "                a(j + 1) = a(j)                '#shift",
      "                j = j - 1                      '#decJ",
      "            Else                               '#else",
      "                Exit Do                        '#exitDo",
      "            End If                             '#endIf",
      "        Loop                                   '#loop",
      "        a(j + 1) = tmp                         '#place",
      "    Next i                                    '#nextI"
    ].join("\n");
    return w;
  },

  generate: function (rec, L) {
    var a = rec.a, n = rec.n;
    var i, j, tmp, shifted;

    if (n > 0) rec.markSorted(0);

    for (i = 1; i <= n - 1; i++) {
      rec.set('i', i);
      tmp = a[i];
      rec.set('tmp', tmp);
      rec.step(L.outer, { cursor: [i] },
        (i + 1) + '枚目。a(' + i + ')=' + tmp + ' を、左側の並んだ範囲の正しい位置に差し込みます。');

      rec.step(L.hold, { cursor: [i] }, 'tmp に a(' + i + ')=' + tmp + ' を退避します。');

      j = i - 1;
      rec.set('j', j);
      rec.step(L.initJ, { cursor: [j] }, 'j = ' + j + '。左隣から比べ始めます。');

      shifted = false;
      while (true) {
        rec.step(L.loopTop, { cursor: j >= 0 ? [j] : [] },
          j >= 0 ? 'j = ' + j + ' はまだ0以上。比較を続けます。' : 'j が -1 になりました。左端まで来たので抜けます。');

        if (j < 0) {
          rec.step(L.exitDo, {}, '左端に到達したので、ここで挿入します。');
          break;
        }

        rec.countCompare();
        var doShift = a[j] > tmp;
        rec.step(L.compare, { compare: [j], cursor: [j] },
          'a(' + j + ')=' + a[j] + ' > tmp=' + tmp + ' ？ → ' +
          (doShift ? 'はい。tmpより大きいので、右へ1つずらします。' : 'いいえ。もう並んでいるので、ここで止めます。'));

        if (!doShift) {
          rec.step(L.exitDo, {}, '正しい位置が見つかったので、ここで抜けます。');
          break;
        }

        a[j + 1] = a[j];
        rec.countSwap();
        shifted = true;
        rec.step(L.shift, { swap: [j, j + 1] },
          'a(' + (j + 1) + ') に a(' + j + ')=' + a[j] + ' を上書きして、1つ右へずらします。');

        j = j - 1;
        rec.set('j', j);
        rec.step(L.decJ, {}, 'j を1つ左へ進めます（j = ' + j + '）。');
      }

      a[j + 1] = tmp;
      rec.step(L.place, { swap: [j + 1] },
        shifted
          ? 'a(' + (j + 1) + ') に tmp=' + tmp + ' を差し込んで完了。'
          : 'a(' + i + ') はもう正しい位置にあったので、そのまま戻します。');

      rec.set('j', null);
      rec.set('tmp', null);
      for (var k = 0; k <= i; k++) rec.markSorted(k);
      rec.step(L.nextI, {}, 'a(0) 〜 a(' + i + ') が並びました。次は a(' + (i + 1 <= n - 1 ? i + 1 : i) + ') を差し込みます。');
    }

    rec.markAllSorted();
    rec.clearVars();
    rec.step(L.nextI, {}, '並べ替えが終わりました。');
  }
};
