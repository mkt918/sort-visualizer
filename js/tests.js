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
            var r = runAlgo(id, input);
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
      check(A.name + ' · 途中でも値が失われない（tmp を含めて数える）', function () {
        var input = SV.presets.make('reversed', 10);
        var r = runAlgo(id, input);
        var exact = 0, held = 0;
        r.rec.steps.forEach(function (s, k) {
          var tmp = s.vars.tmp;
          var pool = s.array.slice();
          var holding = (tmp !== null && tmp !== undefined);
          if (holding) pool.push(tmp);
          assert(containsAll(pool, input), 'step ' + k + ' で値が失われた');
          if (holding) { held++; }
          else {
            assert(samePermutation(s.array, input),
              'step ' + k + '（tmp が空）なのに要素が変化している');
            exact++;
          }
        });
        return 'tmp が空の ' + exact + ' ステップは完全一致 / 退避中 ' + held + ' ステップ';
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

    return results;
  }

  SV.runTests = runTests;
})(window.SV);
