/* シェルソート — 見せる枠。
 * 挿入ソートの延長で非可算だが、離れた要素同士を先に整えることで
 * 「工夫すると速くなる」を体感させる。ギャップ（間隔）を段階的に縮める。 */
window.SV = window.SV || {};
SV.algorithms = SV.algorithms || {};

SV.algorithms.shell = {
  id: 'shell',
  name: 'シェルソート',
  tier: 'advanced',
  summary: '最初は離れた要素同士を比べて大まかに整え、間隔（ギャップ）を半分ずつ縮めながら仕上げる。挿入ソートの発展形。',
  watchVars: ['gap', 'i', 'j', 'tmp'],
  order: 'O(n log\u00B2 n) 程度',
  theoryLabel: function (n) {
    return 'ギャップ列に依存（厳密な式は無い）。n(n-1)/2 = ' + (n * (n - 1) / 2) + ' 回よりずっと少ないはず';
  },

  vba: function (n) {
    var BS = String.fromCharCode(92); // VBAの整数除算演算子 '\'。ツール経由での破損を避けるため文字コードで組み立てる。
    var w = SV.wrapVba('ShellSort', n, ', gap As Long, i As Long, j As Long, tmp As Long');
    w.core = [
      "",
      "    ' ----- 並べ替え（シェルソート） -----",
      "    gap = n " + BS + " 2                          '#initGap",
      "    Do While gap > 0                          '#gapTop",
      "        For i = gap To n - 1                  '#outer",
      "            tmp = a(i)                        '#hold",
      "            j = i - gap                       '#initJ",
      "            Do While j >= 0                   '#loopTop",
      "                If a(j) > tmp Then             '#compare",
      "                    a(j + gap) = a(j)          '#shift",
      "                    j = j - gap                '#decJ",
      "                Else                           '#else",
      "                    Exit Do                    '#exitDo",
      "                End If                         '#endIf",
      "            Loop                               '#loop",
      "            a(j + gap) = tmp                   '#place",
      "        Next i                                '#nextI",
      "        gap = gap " + BS + " 2                     '#halveGap",
      "    Loop                                      '#gapLoop"
    ].join("\n");
    return w;
  },

  generate: function (rec, L) {
    var a = rec.a, n = rec.n;
    var gap, i, j, tmp, doShift;

    gap = Math.floor(n / 2);
    rec.set('gap', gap);
    rec.step(L.initGap, {}, 'まず間隔 gap = ' + gap + ' から始めます（本数を2で割った整数）。');

    while (gap > 0) {
      rec.step(L.gapTop, {}, 'gap = ' + gap + ' で、離れた要素どうしを整えます。');

      for (i = gap; i <= n - 1; i++) {
        rec.set('i', i);
        tmp = a[i];
        rec.set('tmp', tmp);
        rec.step(L.outer, { cursor: [i] },
          'a(' + i + ')=' + tmp + ' を、' + gap + ' 個離れた左側と比べながら差し込みます。');

        rec.step(L.hold, { cursor: [i] }, 'tmp に a(' + i + ')=' + tmp + ' を退避します。');

        j = i - gap;
        rec.set('j', j);
        rec.step(L.initJ, { cursor: j >= 0 ? [j] : [] }, 'j = ' + j + '（i から gap を引いた位置）。');

        while (true) {
          rec.step(L.loopTop, { cursor: j >= 0 ? [j] : [] },
            j >= 0 ? 'j = ' + j + ' はまだ0以上。比較を続けます。' : 'j が0未満になったので抜けます。');

          if (j < 0) { rec.step(L.exitDo, {}, '左端を超えたので、ここで挿入します。'); break; }

          rec.countCompare();
          doShift = a[j] > tmp;
          rec.step(L.compare, { compare: [j], cursor: [j] },
            'a(' + j + ')=' + a[j] + ' > tmp=' + tmp + ' ？ → ' +
            (doShift ? 'はい。' + gap + ' 個右へずらします。' : 'いいえ。ここで止めます。'));

          if (!doShift) { rec.step(L.exitDo, {}, '正しい位置が見つかりました。'); break; }

          a[j + gap] = a[j];
          rec.countSwap();
          rec.step(L.shift, { swap: [j, j + gap] },
            'a(' + (j + gap) + ') に a(' + j + ')=' + a[j] + ' を上書きします。');

          j = j - gap;
          rec.set('j', j);
          rec.step(L.decJ, {}, 'j をさらに ' + gap + ' 減らします（j = ' + j + '）。');
        }

        a[j + gap] = tmp;
        rec.step(L.place, { swap: [j + gap] }, 'a(' + (j + gap) + ') に tmp=' + tmp + ' を差し込みます。');
        rec.set('j', null);
        rec.set('tmp', null);
      }

      rec.set('i', null);
      rec.step(L.nextI, {}, 'gap = ' + gap + ' での整列が終わりました。');

      gap = Math.floor(gap / 2);
      rec.set('gap', gap);
      rec.step(L.halveGap, {}, '間隔を半分にします（次は gap = ' + gap + '）。');
    }

    rec.step(L.gapLoop, {}, 'gap が0になりました。');
    rec.markAllSorted();
    rec.clearVars();
    rec.step(L.gapLoop, {}, '並べ替えが終わりました。');
  }
};
