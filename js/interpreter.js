/* interpreter.js — 生徒が編集したVBA（コアループだけ）を実際に解釈して実行する、簡易インタプリタ。
 *
 * 対応範囲は「単一の Sub・非再帰」の4アルゴリズム（バブル・選択・挿入・シェル）のコアループのみ。
 * クイック・マージ・ヒープは複数 Sub にまたがる再帰構造で、一般化した解釈がずっと難しくなるため
 * 対象外（画面には「参考」として表示するだけで、編集実行はできない）。
 *
 * 対応する文法（VBAのごく一部）:
 *   For 変数 = 式 To 式 [Step 式]  /  Next [変数]
 *   Do While 式 / Do Until 式  /  Loop  /  Exit Do
 *   If 式 Then [同じ行に文]  /  Else  /  End If
 *   代入: 変数 = 式  /  a(式) = 式
 *   式: 数値・変数・a(式)・+ - * \ Mod・比較演算子・カッコ・単項マイナス
 *
 * 生成される steps[] の形は generate() が作るものと完全に同じ（Recorder.step 経由）なので、
 * player.js / render.js 側は「手書きのgenerate()か、インタプリタの実行結果か」を区別しない。
 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  /* ============================================================
     字句解析
     ============================================================ */

  var KEYWORDS = {
    FOR: 'FOR', TO: 'TO', STEP: 'STEP', NEXT: 'NEXT',
    IF: 'IF', THEN: 'THEN', ELSE: 'ELSE', END: 'END',
    DO: 'DO', WHILE: 'WHILE', UNTIL: 'UNTIL', LOOP: 'LOOP', EXIT: 'EXIT',
    MOD: 'MOD', AND: 'AND', OR: 'OR', NOT: 'NOT',
    DIM: 'DIM', AS: 'AS', LONG: 'LONG'
  };

  function tokenize(line) {
    var toks = [];
    var i = 0, n = line.length;
    while (i < n) {
      var c = line[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === "'") break; // コメント、以降は無視
      if (/[0-9]/.test(c)) {
        var j = i;
        while (j < n && /[0-9]/.test(line[j])) j++;
        toks.push({ t: 'NUM', v: Number(line.slice(i, j)) });
        i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var k = i;
        while (k < n && /[A-Za-z0-9_]/.test(line[k])) k++;
        var word = line.slice(i, k);
        var up = word.toUpperCase();
        if (KEYWORDS[up]) toks.push({ t: 'KW', v: up });
        else toks.push({ t: 'ID', v: word });
        i = k; continue;
      }
      if (c === '<' && line[i + 1] === '=') { toks.push({ t: 'OP', v: '<=' }); i += 2; continue; }
      if (c === '>' && line[i + 1] === '=') { toks.push({ t: 'OP', v: '>=' }); i += 2; continue; }
      if (c === '<' && line[i + 1] === '>') { toks.push({ t: 'OP', v: '<>' }); i += 2; continue; }
      if ('+-*\\<>='.indexOf(c) >= 0) { toks.push({ t: 'OP', v: c }); i++; continue; }
      if (c === '(') { toks.push({ t: 'LP' }); i++; continue; }
      if (c === ')') { toks.push({ t: 'RP' }); i++; continue; }
      if (c === ',') { toks.push({ t: 'COMMA' }); i++; continue; }
      throw new SyntaxErrorVBA('「' + c + '」が理解できません。');
    }
    return toks;
  }

  function SyntaxErrorVBA(message) {
    this.message = message;
  }

  /* ============================================================
     式のパーサ（再帰下降）
     優先順位: 比較 < 加減 < 乗除 < 単項マイナス < 括弧/値
     ============================================================ */

  function ExprParser(toks) {
    this.toks = toks;
    this.pos = 0;
  }
  ExprParser.prototype.peek = function () { return this.toks[this.pos]; };
  ExprParser.prototype.next = function () { return this.toks[this.pos++]; };
  ExprParser.prototype.expectOp = function (v) {
    var t = this.next();
    if (!t || t.t !== 'OP' || t.v !== v) throw new SyntaxErrorVBA('「' + v + '」が必要です。');
  };

  ExprParser.prototype.parseExpr = function () { return this.parseCompare(); };

  ExprParser.prototype.parseCompare = function () {
    var left = this.parseAdd();
    var t = this.peek();
    if (t && ((t.t === 'OP' && ['<', '>', '<=', '>=', '='].indexOf(t.v) >= 0) ||
              (t.t === 'OP' && t.v === '<>'))) {
      this.next();
      var right = this.parseAdd();
      return { k: 'cmp', op: t.v, l: left, r: right };
    }
    return left;
  };

  ExprParser.prototype.parseAdd = function () {
    var left = this.parseMul();
    while (true) {
      var t = this.peek();
      if (t && t.t === 'OP' && (t.v === '+' || t.v === '-')) {
        this.next();
        left = { k: 'bin', op: t.v, l: left, r: this.parseMul() };
      } else break;
    }
    return left;
  };

  ExprParser.prototype.parseMul = function () {
    var left = this.parseUnary();
    while (true) {
      var t = this.peek();
      if (t && ((t.t === 'OP' && (t.v === '*' || t.v === '\\')) || (t.t === 'KW' && t.v === 'MOD'))) {
        this.next();
        var op = (t.t === 'KW') ? 'MOD' : t.v;
        left = { k: 'bin', op: op, l: left, r: this.parseUnary() };
      } else break;
    }
    return left;
  };

  ExprParser.prototype.parseUnary = function () {
    var t = this.peek();
    if (t && t.t === 'OP' && t.v === '-') { this.next(); return { k: 'neg', v: this.parseUnary() }; }
    return this.parsePrimary();
  };

  ExprParser.prototype.parsePrimary = function () {
    var t = this.next();
    if (!t) throw new SyntaxErrorVBA('式が途中で終わっています。');
    if (t.t === 'NUM') return { k: 'num', v: t.v };
    if (t.t === 'LP') {
      var e = this.parseExpr();
      var rp = this.next();
      if (!rp || rp.t !== 'RP') throw new SyntaxErrorVBA('「)」が必要です。');
      return e;
    }
    if (t.t === 'ID') {
      var nt = this.peek();
      if (nt && nt.t === 'LP') {
        this.next();
        var idx = this.parseExpr();
        var rp2 = this.next();
        if (!rp2 || rp2.t !== 'RP') throw new SyntaxErrorVBA('「)」が必要です。');
        return { k: 'index', name: t.v, idx: idx };
      }
      return { k: 'var', name: t.v };
    }
    throw new SyntaxErrorVBA('式の中に予期しない語があります。');
  };

  function parseExprToks(toks) {
    var p = new ExprParser(toks);
    var e = p.parseExpr();
    if (p.pos !== toks.length) throw new SyntaxErrorVBA('式の後ろに余計なものがあります。');
    return e;
  }

  /* ============================================================
     行 → 文（statement）
     ============================================================ */

  function splitAt(toks, kw) {
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].t === 'KW' && toks[i].v === kw) return i;
    }
    return -1;
  }

  function parseStatement(rawLine) {
    var toks = tokenize(rawLine);
    if (toks.length === 0) return { type: 'blank' };

    var t0 = toks[0];

    if (t0.t === 'KW' && t0.v === 'DIM') return { type: 'dim' };

    if (t0.t === 'KW' && t0.v === 'FOR') {
      var toIdx = splitAt(toks, 'TO');
      if (toIdx < 0) throw new SyntaxErrorVBA('For 文に To がありません。');
      var eqIdx = -1;
      for (var i = 1; i < toIdx; i++) { if (toks[i].t === 'OP' && toks[i].v === '=') { eqIdx = i; break; } }
      if (eqIdx < 0) throw new SyntaxErrorVBA('For 文に = がありません。');
      var varName = toks[1].v;
      var fromExpr = parseExprToks(toks.slice(eqIdx + 1, toIdx));
      var stepIdx = splitAt(toks, 'STEP');
      var toEnd = stepIdx >= 0 ? stepIdx : toks.length;
      var toExpr = parseExprToks(toks.slice(toIdx + 1, toEnd));
      var stepExpr = stepIdx >= 0 ? parseExprToks(toks.slice(stepIdx + 1)) : { k: 'num', v: 1 };
      return { type: 'for', varName: varName, from: fromExpr, to: toExpr, step: stepExpr };
    }

    if (t0.t === 'KW' && t0.v === 'NEXT') {
      return { type: 'next', varName: toks.length > 1 ? toks[1].v : null };
    }

    if (t0.t === 'KW' && t0.v === 'DO') {
      if (toks.length === 1) return { type: 'do', cond: null, negate: false };
      var mode = toks[1].v; // WHILE or UNTIL
      var cond = parseExprToks(toks.slice(2));
      return { type: 'do', cond: cond, negate: (mode === 'UNTIL') };
    }

    if (t0.t === 'KW' && t0.v === 'LOOP') return { type: 'loop' };

    if (t0.t === 'KW' && t0.v === 'EXIT') return { type: 'exit-do' };

    if (t0.t === 'KW' && t0.v === 'END') return { type: 'end-if' };

    if (t0.t === 'KW' && t0.v === 'ELSE') return { type: 'else' };

    if (t0.t === 'KW' && t0.v === 'IF') {
      var thenIdx = splitAt(toks, 'THEN');
      if (thenIdx < 0) throw new SyntaxErrorVBA('If 文に Then がありません。');
      var ifCond = parseExprToks(toks.slice(1, thenIdx));
      var rest = toks.slice(thenIdx + 1);
      if (rest.length === 0) return { type: 'if-block', cond: ifCond };
      return { type: 'if-inline', cond: ifCond, stmt: parseAssignFromToks(rest) };
    }

    // それ以外は代入文とみなす
    return parseAssignFromToks(toks);
  }

  function parseAssignFromToks(toks) {
    var eqIdx = -1, depth = 0;
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].t === 'LP') depth++;
      else if (toks[i].t === 'RP') depth--;
      else if (toks[i].t === 'OP' && toks[i].v === '=' && depth === 0) { eqIdx = i; break; }
    }
    if (eqIdx < 0) throw new SyntaxErrorVBA('代入文（= を使う文）として読めません。');

    var lhsToks = toks.slice(0, eqIdx);
    var rhs = parseExprToks(toks.slice(eqIdx + 1));

    if (lhsToks.length === 1 && lhsToks[0].t === 'ID') {
      return { type: 'assign', target: { kind: 'var', name: lhsToks[0].v }, expr: rhs };
    }
    if (lhsToks.length >= 4 && lhsToks[0].t === 'ID' && lhsToks[1].t === 'LP' && lhsToks[lhsToks.length - 1].t === 'RP') {
      var idxExpr = parseExprToks(lhsToks.slice(2, lhsToks.length - 1));
      return { type: 'assign', target: { kind: 'index', name: lhsToks[0].v, idx: idxExpr }, expr: rhs };
    }
    throw new SyntaxErrorVBA('代入の左辺が理解できません。');
  }

  /* ============================================================
     実行環境
     ============================================================ */

  function evalExpr(e, env) {
    switch (e.k) {
      case 'num': return e.v;
      case 'neg': return -evalExpr(e.v, env);
      case 'var': {
        if (e.name === 'n') return env.a.length;
        if (!(e.name in env.vars)) throw new SyntaxErrorVBA('変数 ' + e.name + ' は使われていません。');
        var v = env.vars[e.name];
        if (v === null || v === undefined) throw new SyntaxErrorVBA('変数 ' + e.name + ' はまだ値がありません。');
        return v;
      }
      case 'index': {
        var idx = evalExpr(e.idx, env);
        if (idx < 0 || idx >= env.a.length) {
          throw new SyntaxErrorVBA('a(' + idx + ') は配列の範囲外です（0〜' + (env.a.length - 1) + '）。');
        }
        return env.a[idx];
      }
      case 'bin': {
        var l = evalExpr(e.l, env), r = evalExpr(e.r, env);
        switch (e.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '\\': return Math.trunc(l / r);
          case 'MOD': return l % r;
        }
        break;
      }
      case 'cmp': {
        var lv = evalExpr(e.l, env), rv = evalExpr(e.r, env);
        switch (e.op) {
          case '<': return lv < rv;
          case '>': return lv > rv;
          case '<=': return lv <= rv;
          case '>=': return lv >= rv;
          case '=': return lv === rv;
          case '<>': return lv !== rv;
        }
        break;
      }
    }
    throw new SyntaxErrorVBA('式を評価できません。');
  }

  /* 式のテキスト表現（実況・変数ウォッチ用） */
  function exprText(e) {
    switch (e.k) {
      case 'num': return String(e.v);
      case 'neg': return '-' + exprText(e.v);
      case 'var': return e.name;
      case 'index': return e.name + '(' + exprText(e.idx) + ')';
      case 'bin': return exprText(e.l) + ' ' + (e.op === 'MOD' ? 'Mod' : e.op) + ' ' + exprText(e.r);
      case 'cmp': return exprText(e.l) + ' ' + e.op + ' ' + exprText(e.r);
    }
    return '?';
  }

  /* 式の中で使われている配列インデックス（cursor/compare の描画に使う）。
   * 評価できるものだけ拾い、失敗したら無視する（描画のヒントなので厳密でなくてよい）。 */
  function collectIndices(e, env, out) {
    if (!e) return;
    if (e.k === 'index') {
      try { out.push(evalExpr(e.idx, env)); } catch (err) { /* 無視 */ }
    } else if (e.k === 'bin' || e.k === 'cmp') {
      collectIndices(e.l, env, out); collectIndices(e.r, env, out);
    } else if (e.k === 'neg') {
      collectIndices(e.v, env, out);
    }
  }

  /* ============================================================
     ジャンプ対応表の構築（For/Next, Do/Loop, If/Else/End If の対応）
     ============================================================ */

  function buildJumpMap(stmts) {
    var matchNext = {}, matchFor = {};
    var matchLoop = {}, matchDo = {};
    var matchElse = {}, matchEndIf = {}, ifOf = {};
    var stack = [];

    for (var i = 0; i < stmts.length; i++) {
      var s = stmts[i];
      if (s.type === 'for') stack.push({ kind: 'for', line: i });
      else if (s.type === 'next') {
        var top = stack.pop();
        if (!top || top.kind !== 'for') throw new SyntaxErrorVBA((i + 1) + ' 行目: 対応する For がありません。');
        matchFor[i] = top.line; matchNext[top.line] = i;
      } else if (s.type === 'do') stack.push({ kind: 'do', line: i });
      else if (s.type === 'loop') {
        var topD = stack.pop();
        if (!topD || topD.kind !== 'do') throw new SyntaxErrorVBA((i + 1) + ' 行目: 対応する Do がありません。');
        matchDo[i] = topD.line; matchLoop[topD.line] = i;
      } else if (s.type === 'if-block') stack.push({ kind: 'if', line: i, elseLine: null });
      else if (s.type === 'else') {
        var topI = stack[stack.length - 1];
        if (!topI || topI.kind !== 'if') throw new SyntaxErrorVBA((i + 1) + ' 行目: 対応する If がありません。');
        topI.elseLine = i;
        ifOf[i] = topI.line;
      } else if (s.type === 'end-if') {
        var topI2 = stack.pop();
        if (!topI2 || topI2.kind !== 'if') throw new SyntaxErrorVBA((i + 1) + ' 行目: 対応する If がありません。');
        matchEndIf[topI2.line] = i;
        if (topI2.elseLine !== null) matchEndIf[topI2.elseLine] = i;
      }
    }
    if (stack.length) throw new SyntaxErrorVBA('For / Do / If の対応が取れていません（閉じ忘れがあります）。');

    return { matchNext: matchNext, matchFor: matchFor, matchDo: matchDo, matchLoop: matchLoop,
             matchElse: matchElse, matchEndIf: matchEndIf, ifOf: ifOf };
  }

  var MAX_EXEC_STEPS = 60000;

  /* ============================================================
     公開API
     ============================================================ */

  /* rawLines: 表示されている行文字列の配列（1始まりの行番号は index+1 に対応）。
   * values: 初期配列。watchVars: 変数ウォッチに出す名前一覧。
   * 戻り値: { steps, compare, swap } — Recorder と同じ形。 */
  function run(rawLines, values, watchVars) {
    var stmts = rawLines.map(function (ln) {
      try { return parseStatement(ln); }
      catch (err) { err.atLine = null; throw err; }
    });

    // どの行でエラーが起きたか分かるように、行番号を後付けする
    for (var li = 0; li < rawLines.length; li++) {
      try { parseStatement(rawLines[li]); }
      catch (err) { err.atLine = li + 1; throw err; }
    }

    var jumps = buildJumpMap(stmts);

    var rec = new SV.Recorder(values, watchVars);
    var env = { a: rec.a, vars: {} };
    for (var w = 0; w < watchVars.length; w++) env.vars[watchVars[w]] = null;

    var loopStack = []; // { kind:'for', varName, to, step, forLine } / { kind:'do' }
    var pc = 0;
    var guard = 0;

    function syncWatch() {
      for (var k in env.vars) {
        if (Object.prototype.hasOwnProperty.call(env.vars, k) && watchVars.indexOf(k) >= 0) {
          rec.set(k, env.vars[k]);
        }
      }
    }

    while (pc < stmts.length) {
      guard++;
      if (guard > MAX_EXEC_STEPS) {
        throw new SyntaxErrorVBA('実行が終わりません（無限ループの可能性があります）。');
      }
      var s = stmts[pc];
      var line = pc + 1;

      if (s.type === 'blank' || s.type === 'dim') { pc++; continue; }

      if (s.type === 'for') {
        var fromV = evalExpr(s.from, env);
        var toV = evalExpr(s.to, env);
        var stepV = evalExpr(s.step, env);
        env.vars[s.varName] = fromV;
        syncWatch();
        var inRange = stepV >= 0 ? fromV <= toV : fromV >= toV;
        rec.step(line, { cursor: cursorFor(s.varName, env) }, s.varName + ' = ' + fromV + ' から始めます。', []);
        if (!inRange) {
          pc = jumps.matchNext[pc] + 1;
          continue;
        }
        loopStack.push({ kind: 'for', varName: s.varName, to: toV, step: stepV, forLine: pc });
        pc++;
        continue;
      }

      if (s.type === 'next') {
        var fr = loopStack[loopStack.length - 1];
        if (!fr || fr.kind !== 'for') throw new SyntaxErrorVBA((line) + ' 行目: 対応する For がありません。');
        var nv = env.vars[fr.varName] + fr.step;
        env.vars[fr.varName] = nv;
        syncWatch();
        var stillIn = fr.step >= 0 ? nv <= fr.to : nv >= fr.to;
        rec.step(line, { cursor: cursorFor(fr.varName, env) },
          stillIn ? fr.varName + ' = ' + nv + ' にして、もう一度ループします。' : 'ループを抜けます。', []);
        if (stillIn) { pc = fr.forLine + 1; }
        else { loopStack.pop(); pc++; }
        continue;
      }

      if (s.type === 'do') {
        // Loop から Do 行へ戻って条件を再評価するたびにここを通るので、
        // 同じ Do のフレームがすでに積まれているときは積み増さない
        // （積み増すとスタックが伸び続け、対応する For/Next の対応が壊れる）。
        var topFrame = loopStack[loopStack.length - 1];
        if (!topFrame || topFrame.kind !== 'do' || topFrame.doLine !== pc) {
          loopStack.push({ kind: 'do', doLine: pc });
        }
        var condOk = true, condText = 'このまま続けます。';
        if (s.cond) {
          var cv = evalExpr(s.cond, env);
          condOk = s.negate ? !cv : cv;
          condText = exprText(s.cond) + ' ？ → ' + (condOk ? 'はい。続けます。' : 'いいえ。ループを抜けます。');
        }
        var idxs = []; collectIndices(s.cond, env, idxs);
        rec.step(line, { cursor: idxs }, condText, []);
        if (!condOk) { loopStack.pop(); pc = jumps.matchLoop[pc] + 1; continue; }
        pc++;
        continue;
      }

      if (s.type === 'loop') {
        var dfr = loopStack[loopStack.length - 1];
        if (!dfr || dfr.kind !== 'do') throw new SyntaxErrorVBA(line + ' 行目: 対応する Do がありません。');
        pc = dfr.doLine; // Do の行に戻って条件を再評価する
        continue;
      }

      if (s.type === 'exit-do') {
        var efr = null;
        for (var q = loopStack.length - 1; q >= 0; q--) { if (loopStack[q].kind === 'do') { efr = loopStack[q]; break; } }
        if (!efr) throw new SyntaxErrorVBA(line + ' 行目: Exit Do に対応する Do がありません。');
        rec.step(line, {}, 'ループを抜けます。', []);
        while (loopStack.length && loopStack[loopStack.length - 1] !== efr) loopStack.pop();
        loopStack.pop();
        pc = jumps.matchLoop[efr.doLine] + 1;
        continue;
      }

      if (s.type === 'if-block' || s.type === 'if-inline') {
        var cond = evalExpr(s.cond, env);
        var isCompare = s.cond.k === 'cmp';
        if (isCompare) rec.countCompare();
        var idxs2 = []; collectIndices(s.cond, env, idxs2);
        var mark = isCompare && idxs2.length >= 2 ? { compare: idxs2.slice(0, 2) } : { cursor: idxs2 };
        rec.step(line, mark, exprText(s.cond) + ' ？ → ' + (cond ? 'はい。' : 'いいえ。'), []);

        if (s.type === 'if-inline') {
          if (cond) execAssign(s.stmt, env, rec, line);
          pc++;
          continue;
        }
        if (cond) { pc++; continue; }
        var elseLine = jumps.ifOf ? findElseFor(pc, jumps) : null;
        if (elseLine !== null) { pc = elseLine + 1; continue; }
        pc = jumps.matchEndIf[pc] + 1;
        continue;
      }

      if (s.type === 'else') {
        // If側の実行が終わって else を素通りしてきた場合はEnd Ifまで飛ぶ
        var endIfLine = jumps.matchEndIf[pc];
        pc = endIfLine + 1;
        continue;
      }

      if (s.type === 'end-if') { pc++; continue; }

      if (s.type === 'assign') {
        execAssign(s, env, rec, line);
        pc++;
        continue;
      }

      throw new SyntaxErrorVBA(line + ' 行目: この文には対応していません。');
    }

    rec.markAllSorted();
    return rec;
  }

  function findElseFor(ifLine, jumps) {
    for (var k in jumps.ifOf) {
      if (jumps.ifOf.hasOwnProperty(k) && jumps.ifOf[k] === ifLine) return Number(k);
    }
    return null;
  }

  function cursorFor(name, env) {
    var v = env.vars[name];
    return (typeof v === 'number' && v >= 0 && v < env.a.length) ? [v] : [];
  }

  function execAssign(s, env, rec, line) {
    var val = evalExpr(s.expr, env);
    var mark = {}, text;
    if (s.target.kind === 'var') {
      env.vars[s.target.name] = val;
      text = s.target.name + ' に ' + val + ' を代入します。';
      var idxs = []; collectIndices(s.expr, env, idxs);
      if (idxs.length) mark.cursor = idxs;
    } else {
      var idx = evalExpr(s.target.idx, env);
      if (idx < 0 || idx >= env.a.length) {
        throw new SyntaxErrorVBA(line + ' 行目: a(' + idx + ') は配列の範囲外です。');
      }
      env.a[idx] = val;
      rec.countSwap();
      mark.swap = [idx];
      text = 'a(' + idx + ') に ' + val + ' を代入します。';
    }
    rec.step(line, mark, text, []);
  }

  SV.Interpreter = { run: run, parseStatement: parseStatement, tokenize: tokenize, SyntaxErrorVBA: SyntaxErrorVBA };
})(window.SV);
