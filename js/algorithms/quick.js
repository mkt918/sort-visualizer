/* クイックソート — 見せる枠。
 * 再帰は未習前提なので、コードは「参考」扱い。読ませることより、
 * ピボットを軸に左右へ分かれていく動きの派手さを楽しませる位置づけ。
 *
 * 手続きが2つ（呼び出し役の QuickSortCaller と再帰する QuickSort）に
 * 分かれるため、共通の SV.wrapVba() は使わず、この関数の中で
 * ヘッダ・コア・フッタを自前で組む。 */
window.SV = window.SV || {};
SV.algorithms = SV.algorithms || {};

SV.algorithms.quick = {
  id: 'quick',
  name: 'クイックソート',
  tier: 'advanced',
  // 手続きが2つ（呼び出し役とQuickSort本体）に分かれ、再帰もするため、
  // 「編集して実行」の簡易インタプリタは対応していない（単一Sub・非再帰専用）。
  supportsInterpreter: false,
  summary: '基準（ピボット）を1つ決め、それより小さい値を左へ、大きい値を右へ分ける。分かれた左右をそれぞれ同じ方法でさらに分ける（再帰）。',
  watchVars: ['lo', 'hi', 'pivot', 'i', 'j'],
  order: '平均 O(n log n) / 最悪 O(n\u00B2)',
  theoryLabel: function (n) {
    return '平均 n log\u2082n \u2248 ' + Math.round(n * Math.log2(Math.max(n, 1))) +
           ' 回程度 / データ次第で最悪 n(n-1)/2 = ' + (n * (n - 1) / 2) + ' 回まで悪化';
  },

  vba: function (n) {
    var last = Math.max(n - 1, 0);
    var BS = String.fromCharCode(92); // VBAの整数除算演算子 '\'。ツール経由での破損を避けるため文字コードで組み立てる。
    var full = [
      'Sub QuickSortCaller()',
      '    Dim a(' + last + ') As Long',
      '    Dim n As Long, i As Long',
      '    n = ' + n,
      '',
      "    ' A列（A1〜A" + n + "）の数値を配列 a に読み込む",
      '    For i = 0 To n - 1',
      '        a(i) = Cells(i + 1, 1).Value',
      '    Next i',
      '',
      "    ' ----- 並べ替え（クイックソート） -----",
      "    Call QuickSort(a, 0, n - 1)               '#call",
      '',
      "    ' 並べ替えた結果を B列 に書き出す",
      '    For i = 0 To n - 1',
      '        Cells(i + 1, 2).Value = a(i)',
      '    Next i',
      'End Sub',
      '',
      "' 範囲 [lo, hi] を再帰的に並べ替える",
      "Sub QuickSort(a() As Long, lo As Long, hi As Long)  '#subHead",
      '    Dim pivot As Long, i As Long, j As Long, tmp As Long',
      "    If lo >= hi Then Exit Sub                 '#baseCase",
      "    pivot = a((lo + hi) " + BS + " 2)             '#pickPivot",
      "    i = lo                                    '#initI",
      "    j = hi                                    '#initJ",
      "    Do While i <= j                           '#partTop",
      "        Do While a(i) < pivot                 '#skipLeft",
      "            i = i + 1                         '#incI",
      '        Loop',
      "        Do While a(j) > pivot                 '#skipRight",
      "            j = j - 1                         '#decJ",
      '        Loop',
      "        If i <= j Then                        '#canSwap",
      "            tmp = a(i)                        '#sw1",
      "            a(i) = a(j)                       '#sw2",
      "            a(j) = tmp                        '#sw3",
      "            i = i + 1                         '#advI",
      "            j = j - 1                         '#advJ",
      "        End If                                '#endIf",
      "    Loop                                      '#partLoop",
      "    Call QuickSort(a, lo, j)                  '#recurLeft",
      "    Call QuickSort(a, i, hi)                  '#recurRight",
      'End Sub'
    ].join('\n');

    // 2つの Sub がひと続きなので、header/footer に切り出さず全体を core にする。
    // （core-only 表示という概念がそのまま「全部見せる」と一致する）
    return { header: '', core: full, footer: '' };
  },

  generate: function (rec, L) {
    var a = rec.a;

    rec.step(L.call, {}, 'QuickSort を配列全体（0 〜 ' + (rec.n - 1) + '）に対して呼び出します。');

    function quickSort(lo, hi) {
      rec.set('lo', lo);
      rec.set('hi', hi);

      if (lo >= hi) {
        if (lo === hi) rec.markSorted(lo);
        rec.step(L.baseCase, {},
          '範囲 [' + lo + ', ' + hi + '] は要素が1つ以下なので、これ以上分けません。');
        return;
      }

      var mid = Math.floor((lo + hi) / 2);
      var pivot = a[mid];
      rec.set('pivot', pivot);
      rec.step(L.pickPivot, { pivot: mid, cursor: [lo, hi] },
        '範囲 [' + lo + ', ' + hi + '] の真ん中 a(' + mid + ')=' + pivot + ' を基準にします。');

      var i = lo, j = hi;
      rec.set('i', i);
      rec.step(L.initI, { pivot: mid, cursor: [i] }, 'i を左端 ' + lo + ' に置きます。');
      rec.set('j', j);
      rec.step(L.initJ, { pivot: mid, cursor: [j] }, 'j を右端 ' + hi + ' に置きます。');

      while (i <= j) {
        rec.step(L.partTop, { cursor: [i, j] }, 'i <= j の間、次の組を探します。');

        while (a[i] < pivot) {
          rec.countCompare();
          rec.step(L.skipLeft, { cursor: [i] }, 'a(' + i + ')=' + a[i] + ' は基準より小さいので、そのまま右へ。');
          i++;
          rec.set('i', i);
          rec.step(L.incI, { cursor: [i] }, 'i を進めます（i = ' + i + '）。');
        }
        rec.countCompare();
        rec.step(L.skipLeft, { cursor: [i] }, 'a(' + i + ')=' + a[i] + ' は基準以上なので、ここで止めます。');

        while (a[j] > pivot) {
          rec.countCompare();
          rec.step(L.skipRight, { cursor: [j] }, 'a(' + j + ')=' + a[j] + ' は基準より大きいので、そのまま左へ。');
          j--;
          rec.set('j', j);
          rec.step(L.decJ, { cursor: [j] }, 'j を戻します（j = ' + j + '）。');
        }
        rec.countCompare();
        rec.step(L.skipRight, { cursor: [j] }, 'a(' + j + ')=' + a[j] + ' は基準以下なので、ここで止めます。');

        if (i <= j) {
          rec.step(L.canSwap, { compare: [i, j] }, 'i <= j なので、この2つを入れ替えます。');
          if (i !== j) {
            var tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
            rec.countSwap();
            rec.step(L.sw3, { swap: [i, j] }, 'a(' + i + ') と a(' + j + ') を入れ替えました。');
          } else {
            rec.step(L.sw3, {}, 'i と j が同じ位置なので、実際には動きません。');
          }
          i++;
          rec.set('i', i);
          rec.step(L.advI, { cursor: [i] }, 'i を1つ進めます。');
          j--;
          rec.set('j', j);
          rec.step(L.advJ, { cursor: [j] }, 'j を1つ戻します。');
        } else {
          rec.step(L.endIf, {}, 'i > j になったので、この回は入れ替えません。');
        }
      }

      rec.step(L.partLoop, {}, '分割が終わりました。左は基準以下、右は基準以上に分かれています。');

      rec.step(L.recurLeft, {}, '左側 [' + lo + ', ' + j + '] を同じ方法でさらに分けます。');
      quickSort(lo, j);

      rec.step(L.recurRight, {}, '右側 [' + i + ', ' + hi + '] を同じ方法でさらに分けます。');
      quickSort(i, hi);
    }

    quickSort(0, rec.n - 1);

    rec.markAllSorted();
    rec.set('lo', null); rec.set('hi', null); rec.set('pivot', null);
    rec.set('i', null); rec.set('j', null);
    rec.step(L.call, {}, '並べ替えが終わりました。');
  }
};
