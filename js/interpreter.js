/* interpreter.js — VBA（疑似）のごく一部を実際に解釈して実行する、簡易インタプリタ。
 *
 * 2つの用途で使う。
 *   (1) 既存4アルゴリズム（バブル・選択・挿入・シェル）の「編集して実行」— 単一Sub・非再帰のコアループのみ。
 *       クイック・マージ・ヒープは複数Subにまたがる再帰構造で対象外（画面には「参考」として表示するだけ）。
 *   (2) 「じぶんで書く」モード — 白紙から自由記述したコードを実行する。変数名は事前に分からないので、
 *       コードから自動抽出する（collectVarNames）。
 *
 * 対応する文法（VBAのごく一部）:
 *   For 変数 = 式 To 式 [Step 式]  /  Next [変数]  /  Exit For
 *   Do While 式 / Do Until 式  /  Loop  /  Exit Do
 *   While 式  /  Wend   ※ While〜Wend は実際のVBA同様、Exit で早期に抜けられない
 *   If 式 Then [同じ行に文]  /  Else  /  End If
 *   代入: 変数 = 式  /  a(式) = 式   ※ 配列は a のみ（w など他の名前はエラーにする）
 *   式: 数値・変数・a(式)・+ - * \ Mod・比較演算子・And/Or/Not・カッコ・単項マイナス
 *
 * 比較回数（rec.countCompare）は、条件式の中に配列要素 a(...) を含む cmp（比較）ノードだけを数える。
 * 「j >= 0」のような添字チェックそのものは数えない。手書きの generate()（挿入ソートが a(j) > tmp だけ
 * 数える、など）と定義を揃えることで、「じぶんで書いたコード」と既存アルゴリズムの回数比較に意味を持たせる。
 *
 * VBAの And / Or は実際の仕様どおり短絡評価しない（両辺を必ず評価する）。これは実物のExcel VBAでも
 * 同じ挙動で、`Do While j >= 0 And a(j) > tmp` は j = -1 のとき実際に「範囲外」エラーになる、という
 * 本物のVBAのクセをそのまま再現している（エラーメッセージでその旨を補足する）。
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
    DO: 'DO', WHILE: 'WHILE', UNTIL: 'UNTIL', LOOP: 'LOOP', WEND: 'WEND', EXIT: 'EXIT',
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
     優先順位: Or < And < Not < 比較 < 加減 < 乗除 < 単項マイナス < 括弧/値
     ============================================================ */

  function ExprParser(toks) {
    this.toks = toks;
    this.pos = 0;
  }
  ExprParser.prototype.peek = function () { return this.toks[this.pos]; };
  ExprParser.prototype.next = function () { return this.toks[this.pos++]; };

  ExprParser.prototype.parseExpr = function () { return this.parseOr(); };

  ExprParser.prototype.parseOr = function () {
    var left = this.parseAnd();
    while (true) {
      var t = this.peek();
      if (t && t.t === 'KW' && t.v === 'OR') {
        this.next();
        left = { k: 'or', l: left, r: this.parseAnd() };
      } else break;
    }
    return left;
  };

  ExprParser.prototype.parseAnd = function () {
    var left = this.parseNot();
    while (true) {
      var t = this.peek();
      if (t && t.t === 'KW' && t.v === 'AND') {
        this.next();
        left = { k: 'and', l: left, r: this.parseNot() };
      } else break;
    }
    return left;
  };

  ExprParser.prototype.parseNot = function () {
    var t = this.peek();
    if (t && t.t === 'KW' && t.v === 'NOT') { this.next(); return { k: 'not', v: this.parseNot() }; }
    return this.parseCompare();
  };

  ExprParser.prototype.parseCompare = function () {
    var left = this.parseAdd();
    var t = this.peek();
    if (t && t.t === 'OP' && ['<', '>', '<=', '>=', '=', '<>'].indexOf(t.v) >= 0) {
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

    if (t0.t === 'KW' && t0.v === 'WHILE') {
      return { type: 'while', cond: parseExprToks(toks.slice(1)) };
    }

    if (t0.t === 'KW' && t0.v === 'WEND') return { type: 'wend' };

    if (t0.t === 'KW' && t0.v === 'EXIT') {
      var t1 = toks[1];
      if (t1 && t1.t === 'KW' && t1.v === 'FOR') return { type: 'exit-for' };
      if (t1 && t1.t === 'KW' && t1.v === 'DO') return { type: 'exit-do' };
      throw new SyntaxErrorVBA('Exit の後には For か Do が必要です（Exit For / Exit Do）。');
    }

    if (t0.t === 'KW' && t0.v === 'END') return { type: 'end-if' };

    if (t0.t === 'KW' && t0.v === 'ELSE') return { type: 'else' };

    if (t0.t === 'KW' && t0.v === 'IF') {
      var thenIdx = splitAt(toks, 'THEN');
      if (thenIdx < 0) throw new SyntaxErrorVBA('If 文に Then がありません。');
      var ifCond = parseExprToks(toks.slice(1, thenIdx));
      var rest = toks.slice(thenIdx + 1);
      if (rest.length === 0) return { type: 'if-block', cond: ifCond };
      return { type: 'if-inline', cond: ifCond, stmt: parseInlineStmt(rest) };
    }

    // それ以外は代入文とみなす
    return parseAssignFromToks(toks);
  }

  /* If ... Then <ここ> の「同じ行に書く文」用。Exit For / Exit Do はそのまま
   * 特殊形として認識し、それ以外は代入文として読む（If x = 3 Then Exit For など）。 */
  function parseInlineStmt(toks) {
    if (toks.length === 2 && toks[0].t === 'KW' && toks[0].v === 'EXIT') {
      if (toks[1].t === 'KW' && toks[1].v === 'FOR') return { type: 'exit-for' };
      if (toks[1].t === 'KW' && toks[1].v === 'DO') return { type: 'exit-do' };
    }
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
     変数の自動抽出（「じぶんで書く」モード用）
     watchVars を呼び出し側が指定しないとき、コード中の代入先・For変数から
     出現順に集める。a と n は配列・本数として別枠なので除く。
     ============================================================ */

  function collectVarNames(stmts) {
    var seen = {}, names = [];
    function add(name) {
      if (!name || name === 'a' || name === 'n') return;
      if (!seen[name]) { seen[name] = true; names.push(name); }
    }
    stmts.forEach(function (s) {
      if (s.type === 'for') add(s.varName);
      else if (s.type === 'assign' && s.target.kind === 'var') add(s.target.name);
      else if (s.type === 'if-inline' && s.stmt && s.stmt.target && s.stmt.target.kind === 'var') add(s.stmt.target.name);
    });
    return names;
  }

  /* ============================================================
     実行環境
     ============================================================ */

  function evalExpr(e, env) {
    switch (e.k) {
      case 'num': return e.v;
      case 'neg': return -evalExpr(e.v, env);
      case 'not': return !evalExpr(e.v, env);
      case 'var': {
        if (e.name === 'n') return env.a.length;
        if (!(e.name in env.vars)) throw new SyntaxErrorVBA('変数 ' + e.name + ' は使われていません。');
        var v = env.vars[e.name];
        if (v === null || v === undefined) throw new SyntaxErrorVBA('変数 ' + e.name + ' はまだ値がありません。');
        return v;
      }
      case 'index': {
        if (e.name !== 'a') {
          throw new SyntaxErrorVBA('配列は a しか使えません（' + e.name + ' という配列は使えません）。');
        }
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
      case 'and': {
        // 実際のVBAの And は短絡評価しない（両辺を必ず評価する）。
        // j >= 0 And a(j) > tmp を書くと、j = -1 でも a(j) が評価されて
        // 範囲外エラーになる——これは本物のExcel VBAでも同じ、有名な仕様。
        var la = evalExpr(e.l, env);
        var ra;
        try {
          ra = evalExpr(e.r, env);
        } catch (err) {
          throw enrichAndOrError(err);
        }
        return !!la && !!ra;
      }
      case 'or': {
        var lo = evalExpr(e.l, env);
        var ro;
        try {
          ro = evalExpr(e.r, env);
        } catch (err) {
          throw enrichAndOrError(err);
        }
        return !!lo || !!ro;
      }
    }
    throw new SyntaxErrorVBA('式を評価できません。');
  }

  function enrichAndOrError(err) {
    if (err instanceof SyntaxErrorVBA && !err.andOrHint) {
      err.andOrHint = true;
      err.message += '（VBAの And ・ Or は、左側の結果が決まっていても右側を必ず評価します。' +
        '先に If で範囲を確認してから中の処理を書くほうが安全です）';
    }
    return err;
  }

  /* 式のテキスト表現（実況・変数ウォッチ用） */
  function exprText(e) {
    switch (e.k) {
      case 'num': return String(e.v);
      case 'neg': return '-' + exprText(e.v);
      case 'not': return 'Not ' + exprText(e.v);
      case 'var': return e.name;
      case 'index': return e.name + '(' + exprText(e.idx) + ')';
      case 'bin': return exprText(e.l) + ' ' + (e.op === 'MOD' ? 'Mod' : e.op) + ' ' + exprText(e.r);
      case 'cmp': return exprText(e.l) + ' ' + e.op + ' ' + exprText(e.r);
      case 'and': return exprText(e.l) + ' And ' + exprText(e.r);
      case 'or': return exprText(e.l) + ' Or ' + exprText(e.r);
    }
    return '?';
  }

  /* 式の中で使われている配列インデックス（cursor/compare の描画に使う）。
   * 評価できるものだけ拾い、失敗したら無視する（描画のヒントなので厳密でなくてよい）。 */
  function collectIndices(e, env, out) {
    if (!e) return;
    if (e.k === 'index') {
      try { out.push(evalExpr(e.idx, env)); } catch (err) { /* 無視 */ }
    } else if (e.k === 'bin' || e.k === 'cmp' || e.k === 'and' || e.k === 'or') {
      collectIndices(e.l, env, out); collectIndices(e.r, env, out);
    } else if (e.k === 'neg' || e.k === 'not') {
      collectIndices(e.v, env, out);
    }
  }

  /* 式の中に配列アクセス a(...) が含まれているか（比較回数の判定に使う）。 */
  function exprContainsIndex(e) {
    if (!e) return false;
    if (e.k === 'index') return true;
    if (e.k === 'bin' || e.k === 'cmp' || e.k === 'and' || e.k === 'or') {
      return exprContainsIndex(e.l) || exprContainsIndex(e.r);
    }
    if (e.k === 'neg' || e.k === 'not') return exprContainsIndex(e.v);
    return false;
  }

  /* 条件式に含まれる cmp（比較）ノードのうち、配列要素を含むものだけを数える。
   * And/Or/Not でくくられていても再帰的に見つける。 */
  function countCompares(e, rec) {
    if (!e) return;
    if (e.k === 'cmp') {
      if (exprContainsIndex(e.l) || exprContainsIndex(e.r)) rec.countCompare();
    } else if (e.k === 'and' || e.k === 'or') {
      countCompares(e.l, rec); countCompares(e.r, rec);
    } else if (e.k === 'not') {
      countCompares(e.v, rec);
    }
  }

  /* ============================================================
     ジャンプ対応表の構築（For/Next, Do/Loop, While/Wend, If/Else/End If の対応）
     ============================================================ */

  function buildJumpMap(stmts) {
    var matchNext = {}, matchFor = {};
    var matchLoop = {}, matchDo = {};
    var matchWend = {}, matchWhile = {};
    var matchEndIf = {}, ifOf = {};
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
      } else if (s.type === 'while') stack.push({ kind: 'while', line: i });
      else if (s.type === 'wend') {
        var topW = stack.pop();
        if (!topW || topW.kind !== 'while') throw new SyntaxErrorVBA((i + 1) + ' 行目: 対応する While がありません。');
        matchWhile[i] = topW.line; matchWend[topW.line] = i;
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
    if (stack.length) {
      var unclosed = stack[stack.length - 1];
      var kindName = { for: 'For', do: 'Do', while: 'While', if: 'If' }[unclosed.kind] || unclosed.kind;
      throw new SyntaxErrorVBA((unclosed.line + 1) + ' 行目の ' + kindName + ' が閉じられていません。');
    }

    return { matchNext: matchNext, matchFor: matchFor, matchDo: matchDo, matchLoop: matchLoop,
             matchWhile: matchWhile, matchWend: matchWend, matchEndIf: matchEndIf, ifOf: ifOf };
  }

  var MAX_EXEC_STEPS = 60000;

  /* ============================================================
     公開API
     ============================================================ */

  /* rawLines: 表示されている行文字列の配列（1始まりの行番号は index+1 に対応）。
   * values: 初期配列。
   * watchVars: 変数ウォッチに出す名前一覧。省略（null/undefined）すると
   *            コードから自動抽出する（「じぶんで書く」モード用）。
   * opts.fast: true にすると steps[] を記録せず、最終結果と回数だけ返す（採点・高速判定用）。
   * 戻り値: Recorder（.a が最終配列、.compare/.swap が回数、.steps がある場合は再生用ステップ列）。 */
  function run(rawLines, values, watchVars, opts) {
    opts = opts || {};

    var stmts = rawLines.map(function (ln) {
      try { return parseStatement(ln); }
      catch (err) { err.atLine = null; throw err; }
    });

    // どの行でエラーが起きたか分かるように、行番号を後付けする
    for (var li = 0; li < rawLines.length; li++) {
      try { parseStatement(rawLines[li]); }
      catch (err) { err.atLine = li + 1; throw err; }
    }

    if (!watchVars) watchVars = collectVarNames(stmts);

    var jumps = buildJumpMap(stmts);

    var rec = new SV.Recorder(values, watchVars, opts);
    var env = { a: rec.a, vars: {} };
    for (var w = 0; w < watchVars.length; w++) env.vars[watchVars[w]] = null;

    var loopStack = []; // { kind:'for', varName, to, step, forLine } / { kind:'do', doLine } / { kind:'while', whileLine }
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

      if (s.type === 'exit-for') {
        rec.step(line, {}, 'ループを抜けます。', []);
        pc = execExitFor(loopStack, jumps, line);
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
          countCompares(s.cond, rec);
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
        rec.step(line, {}, 'ループを抜けます。', []);
        pc = execExitDo(loopStack, jumps, line);
        continue;
      }

      if (s.type === 'while') {
        // Wend から While 行へ戻って条件を再評価するたびにここを通る。Do と同じ理由で積み増さない。
        var topFrameW = loopStack[loopStack.length - 1];
        if (!topFrameW || topFrameW.kind !== 'while' || topFrameW.whileLine !== pc) {
          loopStack.push({ kind: 'while', whileLine: pc });
        }
        countCompares(s.cond, rec);
        var cvW = evalExpr(s.cond, env);
        var idxsW = []; collectIndices(s.cond, env, idxsW);
        rec.step(line, { cursor: idxsW },
          exprText(s.cond) + ' ？ → ' + (cvW ? 'はい。続けます。' : 'いいえ。ループを抜けます。'), []);
        if (!cvW) { loopStack.pop(); pc = jumps.matchWend[pc] + 1; continue; }
        pc++;
        continue;
      }

      if (s.type === 'wend') {
        var dfrW = loopStack[loopStack.length - 1];
        if (!dfrW || dfrW.kind !== 'while') throw new SyntaxErrorVBA(line + ' 行目: 対応する While がありません。');
        pc = dfrW.whileLine; // While の行に戻って条件を再評価する
        continue;
      }

      if (s.type === 'if-block' || s.type === 'if-inline') {
        countCompares(s.cond, rec);
        var cond = evalExpr(s.cond, env);
        var idxs2 = []; collectIndices(s.cond, env, idxs2);
        var isSimpleCmp = s.cond.k === 'cmp';
        var mark = isSimpleCmp && idxs2.length >= 2 ? { compare: idxs2.slice(0, 2) } : { cursor: idxs2 };
        rec.step(line, mark, exprText(s.cond) + ' ？ → ' + (cond ? 'はい。' : 'いいえ。'), []);

        if (s.type === 'if-inline') {
          if (cond) {
            if (s.stmt.type === 'exit-for') { pc = execExitFor(loopStack, jumps, line); continue; }
            if (s.stmt.type === 'exit-do') { pc = execExitDo(loopStack, jumps, line); continue; }
            execAssign(s.stmt, env, rec, line);
          }
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

  /* Exit For / Exit Do は「単独の文」と「If ... Then Exit For のような同一行の文」の
   * 両方から呼ばれるので、対応するループを探して次のpcを決める処理を共通化する。 */
  function execExitFor(loopStack, jumps, line) {
    var top = loopStack[loopStack.length - 1];
    if (!top || top.kind !== 'for') {
      throw new SyntaxErrorVBA(line + ' 行目: Exit For は、今いちばん内側の For〜Next の中でしか使えません。');
    }
    loopStack.pop();
    return jumps.matchNext[top.forLine] + 1;
  }

  function execExitDo(loopStack, jumps, line) {
    var top = loopStack[loopStack.length - 1];
    if (!top || top.kind !== 'do') {
      throw new SyntaxErrorVBA(line + ' 行目: Exit Do は、今いちばん内側の Do〜Loop の中でしか使えません' +
        '（While〜Wend の中では使えません。これも実際のVBAの仕様です）。');
    }
    loopStack.pop();
    return jumps.matchLoop[top.doLine] + 1;
  }

  function execAssign(s, env, rec, line) {
    var val = evalExpr(s.expr, env);
    var mark = {}, text;
    if (s.target.kind === 'var') {
      env.vars[s.target.name] = val;
      rec.set(s.target.name, val); // 変数ウォッチ（rec.vars）は for/next 以外の代入でも即時に反映する
      text = s.target.name + ' に ' + val + ' を代入します。';
      var idxs = []; collectIndices(s.expr, env, idxs);
      if (idxs.length) mark.cursor = idxs;
    } else {
      if (s.target.name !== 'a') {
        throw new SyntaxErrorVBA(line + ' 行目: 配列は a しか使えません（' + s.target.name + ' は使えません）。');
      }
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

  SV.Interpreter = {
    run: run,
    parseStatement: parseStatement,
    tokenize: tokenize,
    collectVarNames: collectVarNames,
    buildJumpMap: buildJumpMap, // editor.js のリアルタイム構文チェックが、実行せずに対応関係だけ検査するのに使う
    SyntaxErrorVBA: SyntaxErrorVBA
  };
})(window.SV);
