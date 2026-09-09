/* missions.js — 「じぶんで書く」モードの段階的なお題（ミッション）。
 *
 * 既習事項（線形探索・最大最小）から選択ソートへ自然に接続する5段階。
 * 各ミッションは { id, order, title, prompt, hint, starters, answer, judge } を持つ。
 *   starters.blank / skeleton / example — 生徒が選ぶ3種の出発点
 *   answer                              — 模範解答（tests.js が judge を通ることを検証する）
 *   judge(lines, values) -> {ok, message, cases?}
 *
 * ミッション1〜3は「今表示されているデータ」で判定する（1つのデータに対して正しく動くか）。
 * ミッション4・5は8種類の固定パターン（+ 今表示されているデータ）で判定する（どんなデータでも動くか）。
 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  function isSorted(a) {
    for (var i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false;
    return true;
  }

  function samePermutation(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort(function (p, q) { return p - q; });
    var y = b.slice().sort(function (p, q) { return p - q; });
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  function runLines(lines, values, opts) {
    return SV.Interpreter.run(lines.slice(), values.slice(), null, opts);
  }

  function errMessage(e) {
    return 'エラー: ' + e.message + (e.atLine ? '（' + e.atLine + '行目）' : '');
  }

  /* ミッション4・5の自動判定に使う、8種類の固定パターン。
   * ランダム系は呼ぶたびに新しく生成する（たまたま1回通っただけ、を防ぐため）。 */
  function buildTestDatasets() {
    return [
      SV.presets.make('random', 8),
      SV.presets.make('random', 16),
      SV.presets.make('reversed', 10),
      SV.presets.make('nearly', 12),
      SV.presets.make('duplicates', 10),
      [7],
      [9, 2],
      [4, 4, 4, 4]
    ];
  }

  /* extra（今表示されているデータ）があれば9本目として加える。 */
  function judgeAcrossDatasets(lines, extra) {
    var datasets = buildTestDatasets();
    if (extra && extra.length) datasets = datasets.concat([extra.slice()]);

    var cases = [], okCount = 0;
    datasets.forEach(function (input) {
      var label = input.length + '個（' + input.slice(0, 6).join(',') + (input.length > 6 ? ', ...' : '') + '）';
      try {
        var rec = runLines(lines, input, { fast: true });
        if (isSorted(rec.a) && samePermutation(rec.a, input)) {
          cases.push({ ok: true, label: label });
          okCount++;
        } else {
          cases.push({ ok: false, label: label, reason: '昇順になっていません: ' + rec.a.join(', ') });
        }
      } catch (e) {
        cases.push({ ok: false, label: label, reason: errMessage(e) });
      }
    });
    return { ok: okCount === datasets.length, okCount: okCount, total: datasets.length, cases: cases };
  }

  var MISSIONS = [
    {
      id: 'm1',
      order: 1,
      title: 'ミッション1: 2つを入れ替える',
      prompt: '配列の先頭2つ、a(0) と a(1) の値を入れ替えてみましょう（今表示されているデータで確認します）。',
      hint: 'tmp = a(0) のように、いったん別の場所に値を預けてから書き換えるのが基本の形です（3行になります）。',
      starters: {
        blank: [''],
        skeleton: [
          "' a(0) と a(1) を入れ替えます",
          'tmp = a(0)',
          "' ここに続きを書きましょう（a(0) に a(1) を、a(1) に tmp を代入する2行）"
        ],
        example: [
          "' 今は a(2) と a(3) を入れ替えるコードです。a(0) と a(1) を入れ替えるように書き換えてみましょう",
          'tmp = a(2)',
          'a(2) = a(3)',
          'a(3) = tmp'
        ]
      },
      answer: ['tmp = a(0)', 'a(0) = a(1)', 'a(1) = tmp'],
      judge: function (lines, values) {
        if (!values || values.length < 2) return { ok: false, message: '本数を2以上にしてください。' };
        var rec;
        try { rec = runLines(lines, values, { fast: true }); }
        catch (e) { return { ok: false, message: errMessage(e) }; }
        if (rec.a[0] !== values[1] || rec.a[1] !== values[0]) {
          return { ok: false, message: 'a(0) と a(1) が入れ替わっていません（今は a(0)=' + rec.a[0] + ', a(1)=' + rec.a[1] + '）。' };
        }
        for (var i = 2; i < rec.a.length; i++) {
          if (rec.a[i] !== values[i]) {
            return { ok: false, message: 'a(' + i + ') が変わってしまっています。a(0) と a(1) 以外は触らないようにしましょう。' };
          }
        }
        return { ok: true, message: '✓ a(0) と a(1) が正しく入れ替わりました！' };
      }
    },

    {
      id: 'm2',
      order: 2,
      title: 'ミッション2: 一番小さい値を見つける',
      prompt: '配列全体から一番小さい値を探して、その位置を minIdx に入れましょう（線形探索と同じ考え方です）。まだ入れ替えはしません。',
      hint: '最初は minIdx = 0 としておき、a(1) から順に「今の候補より小さいか」を比べて、小さければ minIdx を更新します。',
      starters: {
        blank: [''],
        skeleton: [
          "' 一番小さい値の位置を minIdx に入れます",
          'minIdx = 0',
          'For i = 1 To n - 1',
          "    ' ここに、a(i) が a(minIdx) より小さいときに minIdx を更新する処理を書きましょう",
          'Next i'
        ],
        example: [
          "' 今は「一番大きい値」の位置を maxIdx に入れるコードです。最小値を探すように書き換えましょう",
          'maxIdx = 0',
          'For i = 1 To n - 1',
          '    If a(i) > a(maxIdx) Then',
          '        maxIdx = i',
          '    End If',
          'Next i'
        ]
      },
      answer: [
        'minIdx = 0',
        'For i = 1 To n - 1',
        '    If a(i) < a(minIdx) Then',
        '        minIdx = i',
        '    End If',
        'Next i'
      ],
      judge: function (lines, values) {
        if (!values || values.length < 1) return { ok: false, message: '本数を1以上にしてください。' };
        var rec;
        try { rec = runLines(lines, values, { fast: true }); }
        catch (e) { return { ok: false, message: errMessage(e) }; }
        if (!samePermutation(rec.a, values)) {
          return { ok: false, message: 'このミッションでは配列そのものはまだ変えません（入れ替えは次のミッションで）。' };
        }
        if (rec.vars.minIdx === null || rec.vars.minIdx === undefined) {
          return { ok: false, message: 'minIdx という変数が使われていないようです。' };
        }
        var trueMinIdx = 0;
        for (var i = 1; i < values.length; i++) if (values[i] < values[trueMinIdx]) trueMinIdx = i;
        if (rec.vars.minIdx !== trueMinIdx) {
          return { ok: false, message: 'minIdx = ' + rec.vars.minIdx + ' でした。本当の最小値の位置は ' +
            trueMinIdx + '（a(' + trueMinIdx + ')=' + values[trueMinIdx] + '）です。' };
        }
        return { ok: true, message: '✓ minIdx = ' + trueMinIdx + ' を正しく見つけられました！' };
      }
    },

    {
      id: 'm3',
      order: 3,
      title: 'ミッション3: 見つけた最小値を先頭と交換する',
      prompt: 'ミッション2で見つけた minIdx の値を、a(0) と交換しましょう。実行後、a(0) が配列全体の最小値になっていればOKです。',
      hint: 'ミッション1で書いた「入れ替え」の3行を、a(0) と a(minIdx) の間で行います。',
      starters: {
        blank: [''],
        skeleton: [
          "' minIdx に最小値の位置が入るところまではミッション2と同じです",
          'minIdx = 0',
          'For i = 1 To n - 1',
          '    If a(i) < a(minIdx) Then',
          '        minIdx = i',
          '    End If',
          'Next i',
          "' ここで a(0) と a(minIdx) を入れ替えましょう"
        ],
        example: [
          "' 探索はできていますが、まだ何も交換していません。a(0) と a(minIdx) を入れ替える3行を足しましょう",
          'minIdx = 0',
          'For i = 1 To n - 1',
          '    If a(i) < a(minIdx) Then',
          '        minIdx = i',
          '    End If',
          'Next i'
        ]
      },
      answer: [
        'minIdx = 0',
        'For i = 1 To n - 1',
        '    If a(i) < a(minIdx) Then',
        '        minIdx = i',
        '    End If',
        'Next i',
        'tmp = a(0)',
        'a(0) = a(minIdx)',
        'a(minIdx) = tmp'
      ],
      judge: function (lines, values) {
        if (!values || values.length < 1) return { ok: false, message: '本数を1以上にしてください。' };
        var rec;
        try { rec = runLines(lines, values, { fast: true }); }
        catch (e) { return { ok: false, message: errMessage(e) }; }
        var trueMin = Math.min.apply(null, values);
        if (rec.a[0] !== trueMin) {
          return { ok: false, message: 'a(0) が全体の最小値になっていません（今は a(0)=' + rec.a[0] + '、本当の最小値は ' + trueMin + '）。' };
        }
        if (!samePermutation(rec.a, values)) {
          return { ok: false, message: '値が失われたか、増えてしまっています。' };
        }
        return { ok: true, message: '✓ a(0) が最小値になりました！' };
      }
    },

    {
      id: 'm4',
      order: 4,
      title: 'ミッション4: 全部並べる',
      prompt: 'ミッション2・3を、a(0) だけでなく a(1), a(2), ... 全部の位置で繰り返して、配列全体を並べ替えましょう（様々なデータで自動的に確認します）。',
      hint: '外側にもう1つ For を足し、内側の探索範囲を「まだ確定していない部分」に絞ります（選択ソートの形）。',
      starters: {
        blank: [''],
        skeleton: [
          "' ミッション2・3を、i = 0, 1, 2, ... 全部の位置で繰り返します",
          'For i = 0 To n - 2',
          '    minIdx = i',
          '    For j = i + 1 To n - 1',
          "        ' ここに、a(j) が a(minIdx) より小さいときに minIdx を更新する処理",
          '    Next j',
          "    ' ここで a(i) と a(minIdx) を入れ替える",
          'Next i'
        ],
        example: [
          "' これはバブルソートの例です。読んで動きを確認してから、",
          "' 選択ソートの考え方（最小値を探して先頭と交換）で書き直してみましょう",
          'For i = 0 To n - 2',
          '    For j = 0 To n - 2 - i',
          '        If a(j) > a(j + 1) Then',
          '            tmp = a(j)',
          '            a(j) = a(j + 1)',
          '            a(j + 1) = tmp',
          '        End If',
          '    Next j',
          'Next i'
        ]
      },
      answer: [
        'For i = 0 To n - 2',
        '    minIdx = i',
        '    For j = i + 1 To n - 1',
        '        If a(j) < a(minIdx) Then',
        '            minIdx = j',
        '        End If',
        '    Next j',
        '    tmp = a(i)',
        '    a(i) = a(minIdx)',
        '    a(minIdx) = tmp',
        'Next i'
      ],
      judge: function (lines, values) {
        var r = judgeAcrossDatasets(lines, values);
        if (r.ok) return { ok: true, message: '✓ ' + r.total + '種類のデータすべてで正しく並べ替えられました！', cases: r.cases };
        return { ok: false, message: r.okCount + ' / ' + r.total + ' 種類で成功。うまくいかないデータがあります。', cases: r.cases };
      }
    },

    {
      id: 'm5',
      order: 5,
      title: 'ミッション5（自由課題）: 好きな方法で並べる',
      prompt: '手段は問いません。様々なデータすべてで配列 a を昇順に並べ替えられれば合格です。バブルソート・選択ソート・自分で考えた方法、何でもOK。',
      hint: '思いつかなければ、ミッション4の解答をコピーしてもOKです。まずは動かして、そこから工夫してみましょう。',
      starters: {
        blank: [''],
        skeleton: [
          "' 好きな方法で、a を昇順に並べ替えてみましょう。",
          "' バブルソート・選択ソート・自分で考えた方法、何でもOKです。"
        ],
        example: [
          "' これは選択ソートです。このまま実行してもOK。工夫して回数を減らせないか試してみましょう",
          'For i = 0 To n - 2',
          '    minIdx = i',
          '    For j = i + 1 To n - 1',
          '        If a(j) < a(minIdx) Then',
          '            minIdx = j',
          '        End If',
          '    Next j',
          '    tmp = a(i)',
          '    a(i) = a(minIdx)',
          '    a(minIdx) = tmp',
          'Next i'
        ]
      },
      answer: [
        'For i = 0 To n - 2',
        '    For j = 0 To n - 2 - i',
        '        If a(j) > a(j + 1) Then',
        '            tmp = a(j)',
        '            a(j) = a(j + 1)',
        '            a(j + 1) = tmp',
        '        End If',
        '    Next j',
        'Next i'
      ],
      judge: function (lines, values) {
        var r = judgeAcrossDatasets(lines, values);
        if (r.ok) return { ok: true, message: '✓ ' + r.total + '種類のデータすべてで正しく並べ替えられました！合格です。', cases: r.cases };
        return { ok: false, message: r.okCount + ' / ' + r.total + ' 種類で成功。', cases: r.cases };
      },
      compareToReference: true // このミッションだけ、合格後に既存アルゴリズムとの回数比較を出す
    }
  ];

  /* あなたの回数 vs 既存アルゴリズムの回数（ミッション5用）。
   * 同じ1つのデータで、あなたのコードと代表的な既存アルゴリズムを両方走らせて比較する。 */
  function compareCounts(lines, values) {
    var out = {};
    try {
      var mine = runLines(lines, values, { fast: true });
      out.you = { compare: mine.compare, swap: mine.swap, ok: isSorted(mine.a) && samePermutation(mine.a, values) };
    } catch (e) {
      out.you = { error: errMessage(e) };
    }
    ['bubble', 'selection', 'quick'].forEach(function (id) {
      var A = SV.algorithms[id];
      if (!A) return;
      var model = SV.buildVba(A.vba(values.length));
      var rec = new SV.Recorder(values.slice(), A.watchVars, { fast: true });
      A.generate(rec, model.lines);
      out[id] = { compare: rec.compare, swap: rec.swap, name: A.name };
    });
    return out;
  }

  SV.Missions = {
    list: MISSIONS,
    get: function (id) {
      for (var i = 0; i < MISSIONS.length; i++) if (MISSIONS[i].id === id) return MISSIONS[i];
      return null;
    },
    buildTestDatasets: buildTestDatasets,
    judgeAcrossDatasets: judgeAcrossDatasets,
    compareCounts: compareCounts,
    samePermutation: samePermutation,
    isSorted: isSorted
  };
})(window.SV);
