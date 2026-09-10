/* tests.js — 外部依存なしの自己検証。
 * tests.html から呼ぶほか、node からも同じ関数を実行できる。 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var CASES_N = [0, 1, 2, 3, 5, 8, 12, 20];

  function isSorted(a) {
    for (var i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false;
    return true;
  }

  /* big が small のすべての要素を（重複も含めて）持っているか */
  function containsAll(big, small) {
    var m = {}, i, v;
    for (i = 0; i < big.length; i++) { m[big[i]] = (m[big[i]] || 0) + 1; }
    for (i = 0; i < small.length; i++) {
      v = small[i];
      if (!m[v]) return false;
      m[v]--;
    }
    return true;
  }

  function samePermutation(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort(function (p, q) { return p - q; });
    var y = b.slice().sort(function (p, q) { return p - q; });
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  function runAlgo(algoId, values) {
    var A = SV.algorithms[algoId];
    var model = SV.buildVba(A.vba(values.length));
    var rec = new SV.Recorder(values, A.watchVars);
    A.generate(rec, model.lines);
    return { A: A, model: model, rec: rec };
  }

  function runTests() {
    var results = [];

    function check(name, fn) {
      try {
        var msg = fn();
        results.push({ name: name, ok: true, detail: msg || '' });
      } catch (e) {
        results.push({ name: name, ok: false, detail: e.message });
      }
    }

    function assert(cond, msg) { if (!cond) throw new Error(msg); }

    var algoIds = Object.keys(SV.algorithms);

    algoIds.forEach(function (id) {
      var A = SV.algorithms[id];

      /* (a) 並べ替えの正しさ — 全プリセット × 境界を含む本数 */
      check(A.name + ' · 昇順に並び、要素が失われない', function () {
        var count = 0;
        SV.presets.order.forEach(function (pid) {
          CASES_N.forEach(function (n) {
            var input = SV.presets.make(pid, n);
            assert(input.length === n, pid + ' が本数 n=' + n + ' 通りの配列を作っていない（実際は ' + input.length + '）');
            assert(input.every(function (v) { return typeof v === 'number' && isFinite(v); }),
              pid + ' n=' + n + ' の初期データに数値以外が混ざっている: ' + input);
            var r = runAlgo(id, input);
            assert(r.rec.a.every(function (v) { return typeof v === 'number' && isFinite(v); }),
              pid + ' n=' + n + ' の結果に数値以外が混ざっている（isSortedが undefined 同士の比較を見逃す穴）: ' + r.rec.a);
            assert(isSorted(r.rec.a), pid + ' n=' + n + ' が昇順になっていない: ' + r.rec.a);
            assert(samePermutation(r.rec.a, input),
              pid + ' n=' + n + ' で要素が変わった');
            count++;
          });
        });
        return count + ' ケース';
      });

      /* (b) 行番号がVBAソースの有効行を指しているか */
      check(A.name + ' · 全ステップの行番号がコードの実在行を指す', function () {
        var input = SV.presets.make('random', 12);
        var r = runAlgo(id, input);
        assert(r.rec.steps.length > 0, 'ステップが生成されていない');
        r.rec.steps.forEach(function (s, k) {
          assert(typeof s.line === 'number' && !isNaN(s.line),
            'step ' + k + ' の line が数値でない（マーカー名の綴り違い）');
          assert(s.line >= 1 && s.line <= r.model.lineCount,
            'step ' + k + ' の line=' + s.line + ' が範囲外');
          var text = r.model.display[s.line - 1];
          assert(text && text.trim() !== '',
            'step ' + k + ' が空行 (line=' + s.line + ') を指している');
        });
        return r.rec.steps.length + ' ステップ';
      });

      /* (c) 途中の状態でも値が失われないこと。
       * tmp への退避中は配列に同じ値が一時的に2つ並ぶ（VBAの実際の挙動）。
       * これは仕様なので、tmp を含めて数えて「消えていない」ことを検証する。 */
      check(A.name + ' · 途中でも値が失われない（tmp / extra を含めて数える）', function () {
        var input = SV.presets.make('reversed', 10);
        var r = runAlgo(id, input);
        var exact = 0, held = 0;
        r.rec.steps.forEach(function (s, k) {
          var tmp = s.vars.tmp;
          var pool = s.array.slice();
          var holding = (tmp !== null && tmp !== undefined) || (s.extra && s.extra.length > 0);
          if (tmp !== null && tmp !== undefined) pool.push(tmp);
          if (s.extra) pool = pool.concat(s.extra);
          assert(containsAll(pool, input), 'step ' + k + ' で値が失われた');
          if (holding) { held++; }
          else {
            assert(samePermutation(s.array, input),
              'step ' + k + '（退避中の値なし）なのに要素が変化している');
            exact++;
          }
        });
        return '退避なしの ' + exact + ' ステップは完全一致 / 退避中 ' + held + ' ステップ';
      });

      /* (d) 逆行してステップ0に戻ると初期配列に一致する */
      check(A.name + ' · ステップ0まで戻すと初期配列に戻る', function () {
        var input = SV.presets.make('random', 10);
        var r = runAlgo(id, input);
        var first = r.rec.steps[0];
        assert(first, 'ステップが無い');
        for (var i = 0; i < input.length; i++) {
          assert(first.array[i] === input[i],
            'step 0 の a(' + i + ') が ' + first.array[i] + '（期待 ' + input[i] + '）');
        }
        return 'OK';
      });

      /* (e) カウンタが単調非減少 */
      check(A.name + ' · 比較・交換のカウンタが減らない', function () {
        var input = SV.presets.make('nearly', 12);
        var r = runAlgo(id, input);
        var c = 0, s = 0;
        r.rec.steps.forEach(function (st, k) {
          assert(st.counters.compare >= c, 'step ' + k + ' で比較回数が減った');
          assert(st.counters.swap >= s, 'step ' + k + ' で交換回数が減った');
          c = st.counters.compare; s = st.counters.swap;
        });
        return '比較 ' + c + ' / 交換 ' + s;
      });

      /* (f) VBAソースにマーカーが残っていない */
      check(A.name + ' · 表示コードにマーカーが残っていない', function () {
        var r = runAlgo(id, SV.presets.make('random', 10));
        assert(r.model.text.indexOf("'#") < 0, "'# が残っている");
        assert(r.model.text.indexOf('Sub ') === 0, 'Sub で始まっていない');
        assert(/End Sub$/.test(r.model.text), 'End Sub で終わっていない');
        assert(r.model.coreFrom >= 1 && r.model.coreTo <= r.model.lineCount &&
               r.model.coreFrom <= r.model.coreTo, 'コア範囲が不正');
        return 'line ' + r.model.coreFrom + '〜' + r.model.coreTo + ' を表示';
      });

      /* (g) 配列サイズがコードの Dim に反映されているか */
      check(A.name + ' · Dim a(n-1) と n がデータ本数に追従する', function () {
        [8, 20].forEach(function (n) {
          var r = runAlgo(id, SV.presets.make('random', n));
          assert(r.model.text.indexOf('Dim a(' + (n - 1) + ') As Long') >= 0,
            'n=' + n + ' で Dim a(' + (n - 1) + ') が見つからない');
          assert(r.model.text.indexOf('n = ' + n) >= 0,
            'n=' + n + ' で n = ' + n + ' が見つからない');
        });
        return 'OK';
      });

      /* (i) 「編集して実行」インタプリタ対応の4アルゴリズムだけ、
       * 画面に出ているのと同じコア行テキストを実際に解釈・実行させ、
       * 手書きの generate() と同じ結果（ソート結果・比較回数）になることを確かめる。
       * ここが崩れると、生徒が何も編集していないのに「実行」しただけで
       * 結果が変わってしまう＝インタプリタが画面のコードを正しく再現できていない、
       * という重大な不具合になる。 */
      if (A.supportsInterpreter !== false) {
        check(A.name + ' · 編集インタプリタが手書きgenerate()と同じ結果になる（未編集時）', function () {
          var count = 0;
          SV.presets.order.forEach(function (pid) {
            CASES_N.forEach(function (n) {
              var input = SV.presets.make(pid, n);
              var model = SV.buildVba(A.vba(n));
              var coreLines = model.display.slice(model.coreFrom - 1, model.coreTo);

              var interpRec;
              try {
                interpRec = SV.Interpreter.run(coreLines, input.slice(), A.watchVars);
              } catch (e) {
                throw new Error(pid + ' n=' + n + ' でインタプリタが失敗: ' + e.message +
                  (e.atLine ? '（' + e.atLine + '行目）' : ''));
              }
              assert(isSorted(interpRec.a), pid + ' n=' + n + ' がインタプリタ実行後に昇順になっていない');
              assert(samePermutation(interpRec.a, input), pid + ' n=' + n + ' で要素が変わった');

              var handRec = runAlgo(id, input).rec;
              assert(interpRec.compare === handRec.compare,
                pid + ' n=' + n + ': インタプリタ比較=' + interpRec.compare + ' / generate比較=' + handRec.compare +
                '（比較回数は行単位で1:1対応するはずなので、生成と解釈がズレている）');
              count++;
            });
          });
          return count + ' ケース';
        });
      }
    });

    /* (h) 理論値との整合 — 計算量の説明が嘘にならないことを担保する */
    check('バブルソート · 逆順のとき比較回数が n(n-1)/2 と一致', function () {
      [5, 10, 16].forEach(function (n) {
        var input = SV.presets.make('reversed', n);
        var r = runAlgo('bubble', input);
        var expect = SV.algorithms.bubble.theoryCompare(n);
        assert(r.rec.compare === expect,
          'n=' + n + ': 実測 ' + r.rec.compare + ' / 理論 ' + expect);
        assert(r.rec.swap === expect, 'n=' + n + ': 逆順なら交換も ' + expect + ' 回のはず');
      });
      return 'OK';
    });

    check('選択ソート · 比較回数は常に n(n-1)/2、交換は n-1 回', function () {
      SV.presets.order.forEach(function (pid) {
        [5, 10, 16].forEach(function (n) {
          var r = runAlgo('selection', SV.presets.make(pid, n));
          var expect = SV.algorithms.selection.theoryCompare(n);
          assert(r.rec.compare === expect,
            pid + ' n=' + n + ': 実測 ' + r.rec.compare + ' / 理論 ' + expect);
          assert(r.rec.swap === n - 1,
            pid + ' n=' + n + ': 交換 ' + r.rec.swap + '（期待 ' + (n - 1) + '）');
        });
      });
      return 'OK';
    });

    check('ほぼ整列済みのほうが逆順より交換が少ない（バブル）', function () {
      var n = 16;
      var nearly = runAlgo('bubble', SV.presets.make('nearly', n)).rec.swap;
      var rev = runAlgo('bubble', SV.presets.make('reversed', n)).rec.swap;
      assert(nearly < rev, 'ほぼ整列 ' + nearly + ' / 逆順 ' + rev);
      return 'ほぼ整列 ' + nearly + ' 回 < 逆順 ' + rev + ' 回';
    });

    /* ============================================================
       「じぶんで書く」モード向けに拡張したインタプリタの検証
       ============================================================ */

    check('インタプリタ · And / Or / Not が評価できる', function () {
      var r1 = SV.Interpreter.run(
        ['If a(0) > 0 And a(1) > 0 Then x = 1', 'If a(0) > 100 Or a(1) > 0 Then x = 2', 'If Not (a(0) > 100) Then x = 3'],
        [5, 5], ['x']);
      assert(r1.vars.x === 3, 'And/Or/Not の組み合わせが期待通りに評価されていない: x=' + r1.vars.x);
      return 'OK';
    });

    check('インタプリタ · And/Or は短絡評価しない（実際のVBAと同じ挙動）', function () {
      // j = -1 のとき、j >= 0 が false でも a(j) が評価されて範囲外エラーになる。
      // これは実物のExcel VBAでも同じ、有名な仕様。短絡評価してしまうバグの再発を防ぐ。
      var threw = false, msg = '';
      try {
        SV.Interpreter.run(['j = -1', 'If j >= 0 And a(j) > 0 Then x = 1'], [5], ['j', 'x']);
      } catch (e) { threw = true; msg = e.message; }
      assert(threw, '範囲外アクセスが検出されなかった（短絡評価にすり替わっている）');
      assert(msg.indexOf('範囲外') >= 0, 'エラー内容が範囲外エラーではない: ' + msg);
      return 'OK';
    });

    check('インタプリタ · Exit For がいちばん内側の For を抜ける', function () {
      var r = SV.Interpreter.run(
        ['For i = 0 To 9', '    If i = 3 Then Exit For', 'Next i'],
        [1, 2, 3], ['i']);
      assert(r.vars.i === 3, 'Exit For 後の i が期待と違う: ' + r.vars.i);
      return 'OK';
    });

    check('インタプリタ · While〜Wend が Do While〜Loop と同じ結果になる', function () {
      var input = SV.presets.make('random', 8);
      var r1 = SV.Interpreter.run(['i = 0', 'Do While i < n', '    i = i + 1', 'Loop'], input.slice(), ['i']);
      var r2 = SV.Interpreter.run(['i = 0', 'While i < n', '    i = i + 1', 'Wend'], input.slice(), ['i']);
      assert(r1.vars.i === r2.vars.i, 'Do/While と While/Wend で結果が違う');
      assert(r1.vars.i === input.length, '最終的な i が本数と一致しない');
      return 'OK';
    });

    check('インタプリタ · While〜Wend の中では Exit Do が使えない（実際のVBAの仕様）', function () {
      var threw = false;
      try {
        SV.Interpreter.run(['i = 0', 'While i < 10', '    If i = 3 Then Exit Do', '    i = i + 1', 'Wend'], [1], ['i']);
      } catch (e) { threw = true; }
      assert(threw, 'While〜Wend の中で Exit Do が通ってしまった（実際のVBAでは構文として不成立）');
      return 'OK';
    });

    check('インタプリタ · If ... Then Exit For / Exit Do の1行形式が使える', function () {
      var r1 = SV.Interpreter.run(['For i = 0 To 9', '    If i = 2 Then Exit For', 'Next i'], [1], ['i']);
      assert(r1.vars.i === 2, '1行形式の Exit For が効いていない');
      var r2 = SV.Interpreter.run(['i = 0', 'Do While i < 10', '    If i = 2 Then Exit Do', '    i = i + 1', 'Loop'], [1], ['i']);
      assert(r2.vars.i === 2, '1行形式の Exit Do が効いていない');
      return 'OK';
    });

    check('インタプリタ · 配列は a のみ。他の名前はエラーになる', function () {
      var threw = false, msg = '';
      try { SV.Interpreter.run(['x = w(0)'], [1, 2, 3], ['x']); }
      catch (e) { threw = true; msg = e.message; }
      assert(threw, 'w(0) のような未知の配列名がエラーにならなかった（沈黙バグの再発）');
      assert(msg.indexOf('a しか使えません') >= 0, 'エラー文言が想定と違う: ' + msg);
      return 'OK';
    });

    check('インタプリタ · 変数の自動抽出（collectVarNames）', function () {
      var stmts = ['minIdx = 0', 'For i = 1 To n - 1', '    If a(i) < a(minIdx) Then minIdx = i', 'Next i']
        .map(SV.Interpreter.parseStatement);
      var names = SV.Interpreter.collectVarNames(stmts);
      assert(names.indexOf('minIdx') >= 0 && names.indexOf('i') >= 0,
        '想定した変数が抽出されていない: ' + JSON.stringify(names));
      assert(names.indexOf('a') < 0 && names.indexOf('n') < 0,
        'a や n は配列・本数側の予約語なので抽出対象から除くはず: ' + JSON.stringify(names));
      return JSON.stringify(names);
    });

    check('インタプリタ · watchVars 省略時は自動抽出で実行できる', function () {
      var lines = ['minIdx = 0', 'For i = 1 To n - 1', '    If a(i) < a(minIdx) Then minIdx = i', 'Next i'];
      var input = [5, 2, 8, 1, 9];
      var r = SV.Interpreter.run(lines, input); // watchVars を渡さない
      var trueMin = input.indexOf(Math.min.apply(null, input));
      assert(r.vars.minIdx === trueMin, 'minIdx=' + r.vars.minIdx + '（期待 ' + trueMin + '）');
      return 'OK';
    });

    check('インタプリタ · 比較カウントは配列要素を含む cmp だけ（j >= 0 は数えない）', function () {
      // Do While の条件そのものに配列要素を含むケースが、以前は0回にバグっていた。
      var r = SV.Interpreter.run(['i = 0', 'Do While a(i) < 100', '    i = i + 1', 'Loop'], [1, 2, 3, 200], ['i']);
      assert(r.compare === 4, 'a(i)<100 の判定回数が期待と違う: ' + r.compare + '（期待 4）');

      // i < 3 のような添字チェックそのものは数えない、というのを And 越しでも確認する。
      // （上限方向のチェックなので、非短絡評価でも配列の範囲外に踏み込まない安全な形にしている。
      //   j >= 0 のような下限チェックを And で組むと、j が負に達したとき a(j) が範囲外エラーに
      //   なる——これは別のテストで意図的に確認している、実際のVBAの仕様どおりの挙動）。
      var r2 = SV.Interpreter.run(
        ['i = 0', 'Do While i < 3 And a(i) > 0', '    i = i + 1', 'Loop'],
        [1, 1, 1, 0], ['i']);
      assert(r2.compare === 4, '配列を含む比較だけを数えていない: compare=' + r2.compare + '（期待 4）');
      assert(r2.vars.i === 3, 'ループの終わり方が想定と違う: i=' + r2.vars.i);
      return 'OK';
    });

    check('インタプリタ · 代入した変数がその場でウォッチに反映される（for/nextを介さない代入）', function () {
      // tmp = a(j) のような単純代入が、次の For/Next の同期まで古い値を表示し続ける、
      // という表示遅延バグが無いことを確認する（rec.vars への即時反映）。
      var r = SV.Interpreter.run(['tmp = a(0)'], [42], ['tmp']);
      assert(r.vars.tmp === 42, '代入直後の変数が rec.vars に反映されていない: ' + r.vars.tmp);
      return 'OK';
    });

    check('インタプリタ · fast モードは steps を記録せず最終結果だけ返す', function () {
      var lines = ['For i = 0 To n - 2', '    For j = 0 To n - 2 - i', '        If a(j) > a(j + 1) Then',
                   '            tmp = a(j)', '            a(j) = a(j + 1)', '            a(j + 1) = tmp',
                   '        End If', '    Next j', 'Next i'];
      var input = SV.presets.make('reversed', 12);
      var rFast = SV.Interpreter.run(lines.slice(), input.slice(), ['i', 'j', 'tmp'], { fast: true });
      var rFull = SV.Interpreter.run(lines.slice(), input.slice(), ['i', 'j', 'tmp']);
      assert(rFast.steps.length === 0, 'fast モードなのに steps が記録されている: ' + rFast.steps.length);
      assert(isSorted(rFast.a), 'fast モードの最終結果が昇順になっていない');
      assert(rFast.compare === rFull.compare && rFast.swap === rFull.swap,
        'fast モードと通常モードで回数が違う: fast=' + rFast.compare + '/' + rFast.swap +
        ' full=' + rFull.compare + '/' + rFull.swap);
      return 'compare=' + rFast.compare + ' swap=' + rFast.swap;
    });

    /* ============================================================
       「じぶんで書く」モードのミッション判定
       ============================================================ */

    if (SV.Missions) {
      var MISSION_TEST_VALUES = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0];

      SV.Missions.list.forEach(function (m) {
        /* 模範解答が合格すること。判定関数のバグで「生徒が正解しているのに
         * 不合格になる」のが最悪のケースなので、全ミッションで必須の検証にする。 */
        check('ミッション' + m.order + ' · 模範解答が合格する（' + m.title + '）', function () {
          var r = m.judge(m.answer, MISSION_TEST_VALUES.slice());
          assert(r.ok, '模範解答が不合格: ' + r.message +
            (r.cases ? ' / ' + r.cases.filter(function (c) { return !c.ok; })
              .map(function (c) { return c.label + ':' + c.reason; }).join(' | ') : ''));
          return r.message;
        });

        /* 何もしない（空）コードは、自明に整列済みなデータ以外では不合格になること。
         * 判定がゆるすぎて何でも合格してしまう、という逆方向のバグを防ぐ。 */
        check('ミッション' + m.order + ' · 空のコードは不合格になる', function () {
          var r = m.judge([''], MISSION_TEST_VALUES.slice());
          assert(!r.ok, '空のコードなのに合格してしまった: ' + r.message);
          return 'OK（' + r.message + '）';
        });
      });

      check('ミッション4/5 · テストデータに1個・全部同じ値などの境界ケースを含む', function () {
        var sets = SV.Missions.buildTestDatasets();
        assert(sets.some(function (s) { return s.length === 1; }), '要素数1のケースが無い');
        assert(sets.some(function (s) { return s.length >= 2 && s.every(function (v) { return v === s[0]; }); }),
          '全部同じ値のケースが無い');
        return sets.length + ' 種類';
      });

      check('ミッション5 · compareCounts が既存アルゴリズムと比較できる', function () {
        var cmp = SV.Missions.compareCounts(SV.Missions.get('m5').answer, MISSION_TEST_VALUES.slice());
        assert(cmp.you && cmp.you.ok, 'あなたの結果が正しく並んでいない: ' + JSON.stringify(cmp.you));
        assert(cmp.bubble && typeof cmp.bubble.compare === 'number', 'バブルソートとの比較が無い');
        assert(cmp.selection && typeof cmp.selection.compare === 'number', '選択ソートとの比較が無い');
        assert(cmp.quick && typeof cmp.quick.compare === 'number', 'クイックソートとの比較が無い');
        return 'あなた: 比較' + cmp.you.compare + '/交換' + cmp.you.swap;
      });
    }

    /* ============================================================
       「じぶんで書く」モードのエディタ支援（editor.js の純関数）

       実機で「エディタに入力できない・ボタンも反応しない」という報告があった。
       原因は、1文字打つだけで予測変換候補が開き、その状態で Enter/↑↓/Tab を
       全部横取りしていたこと（Next i と打って Enter すると Next If に化ける等）。
       ここが今回のバグ修正の本丸。keyAction / suggest を純関数に切り出したので
       DOM 無しで固められる。
       ============================================================ */

    if (SV.Editor) {
      var ED = SV.Editor;

      /* handleEnter / handleTab 用の最小の偽 textarea */
      var fakeTA = function (value, caret) {
        if (caret === undefined) caret = value.length;
        return {
          value: value, selectionStart: caret, selectionEnd: caret,
          focus: function () {}, dispatchEvent: function () {}
        };
      };

      check('エディタ · 候補が開いていても Enter は必ず改行（Next i → Next If にならない）', function () {
        assert(ED.keyAction('Enter', { popupOpen: true }) === 'newline', 'popup ありの Enter が newline でない');
        assert(ED.keyAction('Enter', { popupOpen: false }) === 'newline', 'popup なしの Enter が newline でない');
        return 'OK';
      });

      check('エディタ · ↑↓は予測変換に奪わせない（カーソル移動をブラウザに任せる）', function () {
        assert(ED.keyAction('ArrowUp', { popupOpen: true }) === null, 'popup ありの ArrowUp が null でない');
        assert(ED.keyAction('ArrowDown', { popupOpen: true }) === null, 'popup ありの ArrowDown が null でない');
        assert(ED.keyAction('ArrowUp', { popupOpen: false }) === null, 'popup なしの ArrowUp が null でない');
        return 'OK';
      });

      check('エディタ · Tab は候補ありで確定・候補なしでインデント', function () {
        assert(ED.keyAction('Tab', { popupOpen: true }) === 'confirm', '候補ありの Tab が confirm でない');
        assert(ED.keyAction('Tab', { popupOpen: false }) === 'indent', '候補なしの Tab が indent でない');
        assert(ED.keyAction('Tab', { popupOpen: false, shift: true }) === 'outdent', 'Shift+Tab が outdent でない');
        return 'OK';
      });

      check('エディタ · Esc は候補が開いているときだけ横取りする', function () {
        assert(ED.keyAction('Escape', { popupOpen: true }) === 'close', '候補ありの Esc が close でない');
        assert(ED.keyAction('Escape', { popupOpen: false }) === null, '候補なしの Esc が null でない');
        return 'OK';
      });

      check('エディタ · 1文字の変数（i / j / n / a / k）では候補を出さない', function () {
        ['i', 'j', 'n', 'a', 'k'].forEach(function (ch) {
          assert(ED.suggest(ch, []).length === 0, '「' + ch + '」1文字で候補が出た');
        });
        return 'OK';
      });

      check('エディタ · 2文字以上で候補が出る（Fo→For、Wh→While）', function () {
        var fo = ED.suggest('Fo', []);
        assert(fo.length > 0 && fo[0].name === 'For', 'Fo の先頭候補が For でない: ' + JSON.stringify(fo));
        var wh = ED.suggest('Wh', []).map(function (c) { return c.name; });
        assert(wh.indexOf('While') >= 0, 'Wh の候補に While が無い: ' + wh.join(','));
        return 'OK';
      });

      check('エディタ · 既存の変数名はキーワードより先に出る（mi → minIdx が Mod より先）', function () {
        var s = ED.suggest('mi', ['minIdx']);
        assert(s.length > 0 && s[0].name === 'minIdx', '先頭が minIdx でない: ' + JSON.stringify(s));
        return 'OK';
      });

      check('エディタ · 打ち切った語は候補に出さない / 候補は5件まで', function () {
        var s = ED.suggest('For', []).map(function (c) { return c.name; });
        assert(s.indexOf('For') < 0, 'For と打ち切ったのに For が候補に出た');
        assert(ED.suggest('xx', []).length === 0, '該当なしの語で候補が出た');
        assert(ED.suggest('e', ['ea', 'eb', 'ec', 'ed', 'ee', 'ef']).length <= 5, '候補が5件を超えた');
        return 'OK';
      });

      check('エディタ · Enter で For…To の後に Next 変数 が自動で入る', function () {
        var ta = fakeTA('For i = 0 To n - 1');
        ED.handleEnter(ta);
        assert(/\n {4}\nNext i$/.test(ta.value), '想定と違う: ' + JSON.stringify(ta.value));
        return 'OK';
      });

      check('エディタ · Enter で If…Then の後に End If が自動で入る', function () {
        var ta = fakeTA('If a(i) > a(j) Then');
        ED.handleEnter(ta);
        assert(/\n {4}\nEnd If$/.test(ta.value), '想定と違う: ' + JSON.stringify(ta.value));
        return 'OK';
      });

      check('エディタ · Enter で Do While→Loop、While→Wend が入る', function () {
        var ta1 = fakeTA('Do While i < n');
        ED.handleEnter(ta1);
        assert(/\nLoop$/.test(ta1.value), 'Do While → Loop が入らない: ' + JSON.stringify(ta1.value));
        var ta2 = fakeTA('While i < n');
        ED.handleEnter(ta2);
        assert(/\nWend$/.test(ta2.value), 'While → Wend が入らない: ' + JSON.stringify(ta2.value));
        return 'OK';
      });

      check('エディタ · If … Then Exit For では End If を足さない', function () {
        var ta = fakeTA('If i = 3 Then Exit For');
        ED.handleEnter(ta);
        assert(ta.value.indexOf('End If') < 0, 'End If を足してしまった: ' + JSON.stringify(ta.value));
        return 'OK';
      });

      check('エディタ · Tab で4スペースのインデントが入る', function () {
        var ta = fakeTA('x', 1);
        ED.handleTab(ta, false);
        assert(ta.value === 'x    ', '想定と違う: ' + JSON.stringify(ta.value));
        return 'OK';
      });
    }

    return results;
  }

  SV.runTests = runTests;
})(window.SV);
