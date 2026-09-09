/* ヒープソート — 見せる枠。
 * 配列を「木」として扱う（親 i の子は 2i+1, 2i+2）。まず全体を最大ヒープに
 * 組み替え、根（最大値）を末尾と交換して確定させることを繰り返す。
 *
 * 手続きが3つ（呼び出し役の HeapSortCaller、全体制御の HeapSort、
 * 部分木を整える Heapify）に分かれるため、共通の SV.wrapVba() は使わず、
 * quick.js と同様にこの関数の中でヘッダ・コア・フッタを自前で組む。 */
window.SV = window.SV || {};
SV.algorithms = SV.algorithms || {};

SV.algorithms.heap = {
  id: 'heap',
  name: 'ヒープソート',
  tier: 'advanced',
  // 手続きが3つ（呼び出し役・HeapSort・Heapify）に分かれ、再帰もするため、
  // 「編集して実行」の簡易インタプリタは対応していない（単一Sub・非再帰専用）。
  supportsInterpreter: false,
  summary: '配列を「木」とみなし、まず全体を最大ヒープ（親が子より必ず大きい状態）に組み替える。木の根（最大値）を末尾と交換して確定させ、残りを組み直すことを繰り返す。',
  watchVars: ['i', 'root', 'largest', 'left', 'right', 'tmp'],
  order: 'O(n log n)',
  theoryLabel: function (n) {
    return '常に n log₂n ≈ ' + Math.round(n * Math.log2(Math.max(n, 1))) + ' 回程度（データによらず安定）';
  },

  vba: function (n) {
    var last = Math.max(n - 1, 0);
    var BS = String.fromCharCode(92);
    var full = [
      'Sub HeapSortCaller()',
      '    Dim a(' + last + ') As Long',
      '    Dim n As Long, i As Long',
      '    n = ' + n,
      '',
      "    ' A列（A1〜A" + n + "）の数値を配列 a に読み込む",
      '    For i = 0 To n - 1',
      '        a(i) = Cells(i + 1, 1).Value',
      '    Next i',
      '',
      "    ' ----- 並べ替え（ヒープソート） -----",
      "    Call HeapSort(a, n)                       '#call",
      '',
      "    ' 並べ替えた結果を B列 に書き出す",
      '    For i = 0 To n - 1',
      '        Cells(i + 1, 2).Value = a(i)',
      '    Next i',
      'End Sub',
      '',
      "' 配列全体を最大ヒープに組み替えたあと、根を1つずつ確定させる",
      "Sub HeapSort(a() As Long, n As Long)                    '#subHead",
      '    Dim i As Long, tmp As Long',
      "    For i = n " + BS + " 2 - 1 To 0 Step -1              '#buildTop",
      "        Call Heapify(a, n, i)                           '#buildCall",
      "    Next i                                              '#buildNext",
      "    For i = n - 1 To 1 Step -1                          '#extractTop",
      "        tmp = a(0)                                      '#exSw1",
      "        a(0) = a(i)                                     '#exSw2",
      "        a(i) = tmp                                      '#exSw3",
      "        Call Heapify(a, i, 0)                           '#extractHeapify",
      "    Next i                                              '#extractNext",
      'End Sub',
      '',
      "' root を頂点とする部分木を、サイズ heapSize の範囲で最大ヒープに保つ",
      "Sub Heapify(a() As Long, heapSize As Long, root As Long)   '#heapifyHead",
      '    Dim largest As Long, left As Long, right As Long, tmp As Long',
      "    largest = root                                      '#initLargest",
      "    left = 2 * root + 1                                 '#calcLeft",
      "    right = 2 * root + 2                                '#calcRight",
      "    If left < heapSize Then                             '#checkLeftBound",
      "        If a(left) > a(largest) Then                    '#compareLeft",
      "            largest = left                               '#setLeft",
      "        End If                                            '#endIfLeft",
      "    End If                                                '#endIfLeftBound",
      "    If right < heapSize Then                             '#checkRightBound",
      "        If a(right) > a(largest) Then                    '#compareRight",
      "            largest = right                               '#setRight",
      "        End If                                            '#endIfRight",
      "    End If                                                '#endIfRightBound",
      "    If largest <> root Then                              '#needSwap",
      "        tmp = a(root)                                    '#hSw1",
      "        a(root) = a(largest)                             '#hSw2",
      "        a(largest) = tmp                                 '#hSw3",
      "        Call Heapify(a, heapSize, largest)                '#recurse",
      "    End If                                                '#endIfSwap",
      'End Sub'
    ].join('\n');

    return { header: '', core: full, footer: '' };
  },

  generate: function (rec, L) {
    var a = rec.a, n = rec.n;

    rec.step(L.call, {}, '配列全体（本数 ' + n + '）を最大ヒープに組み替えてから、確定を繰り返します。');

    function heapify(heapSize, root) {
      rec.set('root', root);
      rec.step(L.heapifyHead, { cursor: [root] },
        'a(' + root + ') を頂点とする部分木を整えます（対象範囲は先頭から ' + heapSize + ' 個）。');

      var largest = root;
      rec.set('largest', largest);
      rec.step(L.initLargest, { pivot: largest }, 'まず largest = ' + root + '（自分自身）とします。');

      var left = 2 * root + 1;
      rec.set('left', left);
      rec.step(L.calcLeft, { pivot: largest }, '左の子の位置 left = 2 * ' + root + ' + 1 = ' + left + '。');

      var right = 2 * root + 2;
      rec.set('right', right);
      rec.step(L.calcRight, { pivot: largest }, '右の子の位置 right = 2 * ' + root + ' + 2 = ' + right + '。');

      rec.step(L.checkLeftBound, { pivot: largest },
        left < heapSize ? 'left(' + left + ') は範囲内です。比較します。' : 'left(' + left + ') は範囲外なので、左の子は無視します。');
      if (left < heapSize) {
        rec.countCompare();
        var leftBigger = a[left] > a[largest];
        rec.step(L.compareLeft, { compare: [left, largest], pivot: largest },
          'a(' + left + ')=' + a[left] + ' > a(' + largest + ')=' + a[largest] + ' ？ → ' +
          (leftBigger ? 'はい。左の子のほうが大きい。' : 'いいえ。'));
        if (leftBigger) {
          largest = left;
          rec.set('largest', largest);
          rec.step(L.setLeft, { pivot: largest }, 'largest を左の子 ' + left + ' に更新します。');
        }
      }

      rec.step(L.checkRightBound, { pivot: largest },
        right < heapSize ? 'right(' + right + ') は範囲内です。比較します。' : 'right(' + right + ') は範囲外なので、右の子は無視します。');
      if (right < heapSize) {
        rec.countCompare();
        var rightBigger = a[right] > a[largest];
        rec.step(L.compareRight, { compare: [right, largest], pivot: largest },
          'a(' + right + ')=' + a[right] + ' > a(' + largest + ')=' + a[largest] + ' ？ → ' +
          (rightBigger ? 'はい。右の子のほうが大きい。' : 'いいえ。'));
        if (rightBigger) {
          largest = right;
          rec.set('largest', largest);
          rec.step(L.setRight, { pivot: largest }, 'largest を右の子 ' + right + ' に更新します。');
        }
      }

      if (largest !== root) {
        rec.step(L.needSwap, { compare: [root, largest] },
          'largest(' + largest + ') が root(' + root + ') と違うので、子のほうが大きい状態。入れ替えます。');

        var tmp = a[root];
        rec.set('tmp', tmp);
        rec.step(L.hSw1, { swap: [root] }, 'tmp に a(' + root + ')=' + tmp + ' を退避します。');

        a[root] = a[largest];
        rec.step(L.hSw2, { swap: [root, largest] }, 'a(' + root + ') に a(' + largest + ')=' + a[root] + ' を入れます。');

        a[largest] = tmp;
        rec.countSwap();
        rec.step(L.hSw3, { swap: [root, largest] }, 'a(' + largest + ') に tmp=' + tmp + ' を書き戻します。');
        rec.set('tmp', null);

        rec.step(L.recurse, {}, '入れ替えた先（' + largest + '）でも木が崩れていないか、もう一度確認します。');
        heapify(heapSize, largest);
      } else {
        rec.step(L.needSwap, {}, 'root がすでに一番大きいので、この部分木は崩れていません。');
      }
    }

    // 1) 全体を最大ヒープに組み替える（末尾側の親から順に）
    for (var i = Math.floor(n / 2) - 1; i >= 0; i--) {
      rec.set('i', i);
      rec.step(L.buildTop, { cursor: [i] }, 'i = ' + i + ' を頂点として、部分木を整えます。');
      rec.step(L.buildCall, {}, 'Heapify を呼び出します。');
      heapify(n, i);
    }
    rec.set('i', null);
    rec.step(L.buildNext, {}, 'これで配列全体が最大ヒープになりました。根 a(0) が全体の最大値です。');

    // 2) 根（最大値）を末尾と交換し、範囲を1つ狭めて組み直す
    for (var k = n - 1; k >= 1; k--) {
      rec.set('i', k);
      rec.step(L.extractTop, { cursor: [0, k] },
        '最大値 a(0)=' + a[0] + ' を、まだ確定していない範囲の末尾 a(' + k + ') と交換します。');

      var tmp2 = a[0];
      rec.set('tmp', tmp2);
      rec.step(L.exSw1, { swap: [0] }, 'tmp に a(0)=' + tmp2 + ' を退避します。');

      a[0] = a[k];
      rec.step(L.exSw2, { swap: [0, k] }, 'a(0) に a(' + k + ')=' + a[0] + ' を入れます。');

      a[k] = tmp2;
      rec.countSwap();
      rec.step(L.exSw3, { swap: [0, k] }, 'a(' + k + ') に tmp=' + tmp2 + ' を書き戻します。');
      rec.markSorted(k);
      rec.set('tmp', null);

      rec.step(L.extractHeapify, {}, '根が崩れたので、範囲を ' + k + ' 個に狭めて Heapify で組み直します。');
      heapify(k, 0);
    }

    rec.markAllSorted();
    rec.set('i', null); rec.set('root', null); rec.set('largest', null);
    rec.set('left', null); rec.set('right', null); rec.set('tmp', null);
    rec.step(L.extractNext, {}, '並べ替えが終わりました。');
  }
};
