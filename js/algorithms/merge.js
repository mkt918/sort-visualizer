/* マージソート — 見せる枠。
 * 配列を半分に分け続け（再帰）、1個ずつになったら「作業用配列」に
 * 小さいほうから順に詰めながら結合し、それを元の配列へ書き戻す。
 *
 * 比較・詰め込み中は作業用配列 w だけが変化し、画面の棒グラフ（a）は
 * 動かない。結合が終わって a へ書き戻す瞬間だけ棒が動く——これは
 * 実際のVBAの挙動そのもの（比較中に a は一切変更されない）。
 *
 * 手続きが3つ（呼び出し役の MergeSortCaller、分割する MergeSort、
 * 結合する Merge）に分かれるため、共通の SV.wrapVba() は使わず、
 * quick.js / heap.js と同様にこの関数の中で全文を自前で組み立てる。 */
window.SV = window.SV || {};
SV.algorithms = SV.algorithms || {};

SV.algorithms.merge = {
  id: 'merge',
  name: 'マージソート',
  tier: 'advanced',
  // 手続きが3つ（呼び出し役・MergeSort・Merge）に分かれ、再帰もするため、
  // 「編集して実行」の簡易インタプリタは対応していない（単一Sub・非再帰専用）。
  supportsInterpreter: false,
  summary: '配列を半分ずつに分け続け、1個になったところから「作業用配列」に小さい順で詰めながら結合していく。比較中は元の配列は動かず、結合できた分だけ書き戻される。',
  watchVars: ['lo', 'mid', 'hi', 'i', 'j', 'k'],
  order: 'O(n log n)',
  // マージソートは2つの値を「交換」しない。作業用配列 w から a へ「書き戻す」だけなので、
  // 交換カウンタの文言もそれに合わせて差し替える（app.js 参照）。
  swapLabel: '書き戻し',
  swapNote: 'w から a へ書き戻した回数',
  theoryLabel: function (n) {
    return '常に n log₂n ≈ ' + Math.round(n * Math.log2(Math.max(n, 1))) + ' 回程度（データによらず安定）';
  },

  vba: function (n) {
    var last = Math.max(n - 1, 0);
    var full = [
      'Sub MergeSortCaller()',
      '    Dim a(' + last + ') As Long',
      '    Dim w(' + last + ') As Long',
      '    Dim n As Long, i As Long',
      '    n = ' + n,
      '',
      "    ' A列（A1〜A" + n + "）の数値を配列 a に読み込む",
      '    For i = 0 To n - 1',
      '        a(i) = Cells(i + 1, 1).Value',
      '    Next i',
      '',
      "    ' ----- 並べ替え（マージソート） -----",
      "    Call MergeSort(a, 0, n - 1, w)            '#call",
      '',
      "    ' 並べ替えた結果を B列 に書き出す",
      '    For i = 0 To n - 1',
      '        Cells(i + 1, 2).Value = a(i)',
      '    Next i',
      'End Sub',
      '',
      "' 範囲 [lo, hi] を半分に分けて、それぞれ並べ替えてから結合する",
      "Sub MergeSort(a() As Long, lo As Long, hi As Long, w() As Long)   '#subHead",
      '    Dim mid As Long',
      "    If lo >= hi Then Exit Sub                 '#baseCase",
      "    mid = (lo + hi) \\ 2                       '#calcMid",
      "    Call MergeSort(a, lo, mid, w)              '#recurLeft",
      "    Call MergeSort(a, mid + 1, hi, w)          '#recurRight",
      "    Call Merge(a, lo, mid, hi, w)              '#callMerge",
      'End Sub',
      '',
      "' 並び済みの2つの範囲 [lo, mid] と [mid+1, hi] を、w を使って1つに結合する",
      "Sub Merge(a() As Long, lo As Long, mid As Long, hi As Long, w() As Long)   '#mergeHead",
      '    Dim i As Long, j As Long, k As Long',
      "    i = lo                                    '#initI",
      "    j = mid + 1                               '#initJ",
      "    k = lo                                    '#initK",
      "    Do While i <= mid And j <= hi             '#loopTop",
      "        If a(i) <= a(j) Then                  '#compare",
      "            w(k) = a(i)                       '#takeLeft",
      "            i = i + 1                         '#incI",
      '        Else',
      "            w(k) = a(j)                       '#takeRight",
      "            j = j + 1                         '#incJ",
      '        End If',
      "        k = k + 1                             '#incK1",
      '    Loop',
      "    Do While i <= mid                         '#remLeftTop",
      "        w(k) = a(i)                           '#remLeftCopy",
      "        i = i + 1                             '#remLeftIncI",
      "        k = k + 1                             '#remLeftIncK",
      '    Loop',
      "    Do While j <= hi                          '#remRightTop",
      "        w(k) = a(j)                           '#remRightCopy",
      "        j = j + 1                             '#remRightIncJ",
      "        k = k + 1                             '#remRightIncK",
      '    Loop',
      "    For k = lo To hi                          '#copyBackTop",
      "        a(k) = w(k)                           '#copyBack",
      "    Next k                                    '#copyBackNext",
      'End Sub'
    ].join('\n');

    return { header: '', core: full, footer: '' };
  },

  generate: function (rec, L) {
    var a = rec.a;
    var w = new Array(rec.n).fill(0); // 作業用配列。rec.a とは別物 = 画面には反映されない

    rec.step(L.call, {}, '配列全体（0 〜 ' + (rec.n - 1) + '）を MergeSort に渡します。');

    function mergeSort(lo, hi) {
      rec.set('lo', lo);
      rec.set('hi', hi);

      if (lo >= hi) {
        if (lo === hi) rec.markSorted(lo);
        rec.step(L.baseCase, {}, '範囲 [' + lo + ', ' + hi + '] は要素が1つ以下なので、これ以上分けません。');
        return;
      }

      var mid = Math.floor((lo + hi) / 2);
      rec.set('mid', mid);
      rec.step(L.calcMid, { cursor: [lo, hi] },
        '範囲 [' + lo + ', ' + hi + '] を mid=' + mid + ' で半分に分けます。');

      rec.step(L.recurLeft, {}, '左半分 [' + lo + ', ' + mid + '] を先に並べ替えます。');
      mergeSort(lo, mid);

      rec.step(L.recurRight, {}, '右半分 [' + (mid + 1) + ', ' + hi + '] を並べ替えます。');
      mergeSort(mid + 1, hi);

      rec.step(L.callMerge, {}, '並び終わった左右を、Merge で1つに結合します。');
      merge(lo, mid, hi);
    }

    function merge(lo, mid, hi) {
      var i = lo, j = mid + 1, k = lo;
      // filled: w(lo..hi) のうち、take/remainder フェーズで値を詰め終えた個数
      // written: そのうち copyBack で a へ書き戻し済みの個数（filled 完了後にのみ進む）
      // 「詰めたのにまだ a に反映されていない値」= w(lo+written .. lo+filled-1) が
      // Recorder.step() の extra として渡す「消えていない」ぶんの正体。
      var filled = 0, written = 0;

      function emit(line, mark, narration) {
        var extra = filled > written ? w.slice(lo + written, lo + filled) : [];
        rec.step(line, mark, narration, extra);
      }

      rec.set('i', i); rec.set('j', j); rec.set('k', k);
      emit(L.initI, {}, 'i = ' + i + '（左側の先頭）。');
      emit(L.initJ, {}, 'j = ' + j + '（右側の先頭）。');
      emit(L.initK, {}, 'k = ' + k + '（作業用配列 w に詰める位置）。');

      emit(L.loopTop, { cursor: [i, j] },
        (i <= mid && j <= hi) ? '左右ともまだ残っています。比較を続けます。' : '片方が尽きたので、この比較ループを抜けます。');

      while (i <= mid && j <= hi) {
        rec.countCompare();
        var leftFirst = a[i] <= a[j];
        emit(L.compare, { compare: [i, j] },
          'a(' + i + ')=' + a[i] + ' <= a(' + j + ')=' + a[j] + ' ？ → ' +
          (leftFirst ? 'はい。左側 a(' + i + ') を先に詰めます。' : 'いいえ。右側 a(' + j + ') を先に詰めます。'));

        if (leftFirst) {
          w[k] = a[i];
          filled++;
          emit(L.takeLeft, { cursor: [i] }, 'w(' + k + ') に a(' + i + ')=' + a[i] + ' を詰めます（この時点ではまだ a は変わらない）。');
          i++;
          rec.set('i', i);
          emit(L.incI, {}, 'i を1つ進めます（i = ' + i + '）。');
        } else {
          w[k] = a[j];
          filled++;
          emit(L.takeRight, { cursor: [j] }, 'w(' + k + ') に a(' + j + ')=' + a[j] + ' を詰めます（この時点ではまだ a は変わらない）。');
          j++;
          rec.set('j', j);
          emit(L.incJ, {}, 'j を1つ進めます（j = ' + j + '）。');
        }
        k++;
        rec.set('k', k);
        emit(L.incK1, {}, 'k を1つ進めます（k = ' + k + '）。');

        emit(L.loopTop, { cursor: (i <= mid && j <= hi) ? [i, j] : [] },
          (i <= mid && j <= hi) ? '左右ともまだ残っています。比較を続けます。' : '片方が尽きたので、この比較ループを抜けます。');
      }

      emit(L.remLeftTop, {}, i <= mid ? '左側がまだ残っているので、残りをそのまま詰めます。' : '左側は残っていません。');
      while (i <= mid) {
        w[k] = a[i];
        filled++;
        emit(L.remLeftCopy, { cursor: [i] }, 'w(' + k + ') に a(' + i + ')=' + a[i] + ' を詰めます。');
        i++; rec.set('i', i);
        emit(L.remLeftIncI, {}, 'i = ' + i + '。');
        k++; rec.set('k', k);
        emit(L.remLeftIncK, {}, 'k = ' + k + '。');
        emit(L.remLeftTop, {}, i <= mid ? 'まだ左側が残っています。' : '左側を詰め終わりました。');
      }

      emit(L.remRightTop, {}, j <= hi ? '右側がまだ残っているので、残りをそのまま詰めます。' : '右側は残っていません。');
      while (j <= hi) {
        w[k] = a[j];
        filled++;
        emit(L.remRightCopy, { cursor: [j] }, 'w(' + k + ') に a(' + j + ')=' + a[j] + ' を詰めます。');
        j++; rec.set('j', j);
        emit(L.remRightIncJ, {}, 'j = ' + j + '。');
        k++; rec.set('k', k);
        emit(L.remRightIncK, {}, 'k = ' + k + '。');
        emit(L.remRightTop, {}, j <= hi ? 'まだ右側が残っています。' : '右側を詰め終わりました。');
      }

      emit(L.copyBackTop, {}, 'w に詰め終わった [' + lo + ', ' + hi + '] を、a へ書き戻します。');
      for (k = lo; k <= hi; k++) {
        a[k] = w[k];
        written++;
        rec.set('k', k);
        rec.countSwap();
        emit(L.copyBack, { swap: [k] }, 'a(' + k + ') に w(' + k + ')=' + w[k] + ' を書き戻します。');
      }
      emit(L.copyBackNext, {}, '[' + lo + ', ' + hi + '] の結合が終わりました。');
    }

    mergeSort(0, rec.n - 1);

    rec.markAllSorted();
    rec.set('lo', null); rec.set('mid', null); rec.set('hi', null);
    rec.set('i', null); rec.set('j', null); rec.set('k', null);
    rec.step(L.call, {}, '並べ替えが終わりました。');
  }
};
