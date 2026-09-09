/* editor.js — 「じぶんで書く」モード用の、アシスト付きテキストエディタ。
 *
 * <textarea> をそのまま土台にする（contenteditable にしない）。理由はIME。
 * 日本語コメントを打つとき、contenteditable はカーソル位置やComposition処理で
 * 事故りやすい。textarea なら、ブラウザ本体のIME処理に完全に任せられる。
 *
 * 提供する機能:
 *   1. 予測変換ポップアップ（キーワード・既出変数名・a/n/tmp を候補に出す）
 *   2. 自動インデント・自動閉じ（For→Next、If...Then→End If、Do While→Loop、While→Wend）
 *   3. 部品パレット（雛形挿入。studio.js 側からボタンで呼ぶ）
 *   4. 書きながらの構文チェック（デバウンス。実行はしない＝副作用も無限ループの心配も無い）
 *
 * IMEとの共存が最大の技術的急所:
 *   - compositionstart 〜 compositionend の間は、予測変換ポップアップの計算・表示を止める
 *     （変換中の文字列を「単語」として誤認識して暴発させないため）。
 *   - Enter/Tab などのキー処理は e.isComposing（と後方互換の keyCode===229）を見て、
 *     IME変換の確定操作を横取りしないようにする。ここを誤ると日本語が打てなくなる。
 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var KEYWORD_INFO = {
    For: '決まった回数くり返す',
    To: '（Forの範囲を指定）',
    Step: '（増分を指定。省略すると1）',
    Next: 'Forのくり返しの終わり',
    If: 'もし〜なら',
    Then: '（Ifの条件の終わり）',
    Else: 'そうでなければ',
    End: '（Ifの終わり。End If の形で使う）',
    Do: '条件を満たす間くり返す',
    While: '〜の間',
    Until: '〜になるまで',
    Loop: 'Do〜Loopのくり返しの終わり',
    Wend: 'While〜Wendのくり返しの終わり',
    Exit: 'ループを抜ける（Exit For / Exit Do）',
    Mod: '割った余り',
    And: 'かつ（両方とも成り立つとき）',
    Or: 'または（どちらかが成り立つとき）',
    Not: '〜ではない（真偽を逆にする）',
    Dim: '変数を宣言する'
  };
  var BUILTIN_INFO = {
    a: '並べ替える配列。a(0), a(1), ... のように使う',
    n: '配列の本数（要素数）',
    tmp: '値を一時的に預けておく変数（入れ替えでよく使う）'
  };
  var ALL_KEYWORDS = Object.keys(KEYWORD_INFO);
  var ALL_BUILTINS = Object.keys(BUILTIN_INFO);

  var PALETTE = [
    { label: 'くり返す（For）', insert: 'For i = 0 To n - 1\n    ???\nNext i' },
    { label: 'もし〜なら（If）', insert: 'If ??? Then\n    \nEnd If' },
    { label: '入れ替える（3行）', insert: 'tmp = a(???)\na(???) = a(???)\na(???) = tmp' },
    { label: '〜の間くり返す（Do While）', insert: 'Do While ???\n    \nLoop' },
    { label: 'ループを抜ける', insert: 'Exit For' }
  ];

  /* ============================================================
     テキスト操作の下請け（textarea には無い操作をここでまとめる）
     ============================================================ */

  function lineStartOf(value, pos) {
    return value.lastIndexOf('\n', pos - 1) + 1;
  }
  function lineEndOf(value, pos) {
    var idx = value.indexOf('\n', pos);
    return idx < 0 ? value.length : idx;
  }
  function indentOf(line) {
    var m = /^[ \t]*/.exec(line);
    return m ? m[0] : '';
  }

  function setValueAndCaret(el, value, caretStart, caretEnd) {
    el.value = value;
    if (caretEnd === undefined) caretEnd = caretStart;
    el.selectionStart = caretStart;
    el.selectionEnd = caretEnd;
  }

  function fireInput(el) {
    var ev;
    try { ev = new Event('input', { bubbles: true }); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent('input', true, true); }
    el.dispatchEvent(ev);
  }

  /* 現在行の直前の語（キャレット直前の識別子）を取り出す。予測変換の対象。 */
  function currentWord(value, caret) {
    var start = caret;
    while (start > 0 && /[A-Za-z0-9_]/.test(value[start - 1])) start--;
    return { text: value.slice(start, caret), start: start };
  }

  /* コード全体から「代入されている変数名」「For変数」をゆるく拾う（予測変換の候補用）。
   * 構文的に不完全な打ちかけの状態でも動く必要があるので、parseStatement は使わず
   * 正規表現でざっくり拾う（多少ノイズが混ざっても、候補が増える分には実害がない）。 */
  function scanVarNames(text) {
    var names = {}, m;
    var reAssign = /([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
    while ((m = reAssign.exec(text))) {
      var name = m[1];
      if (name !== 'a' && KEYWORDS_UP.indexOf(name.toUpperCase()) < 0) names[name] = true;
    }
    var reFor = /\bFor\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gi;
    while ((m = reFor.exec(text))) names[m[1]] = true;
    return Object.keys(names);
  }
  var KEYWORDS_UP = ['FOR', 'TO', 'STEP', 'NEXT', 'IF', 'THEN', 'ELSE', 'END', 'DO', 'WHILE',
    'UNTIL', 'LOOP', 'WEND', 'EXIT', 'MOD', 'AND', 'OR', 'NOT', 'DIM', 'AS', 'LONG'];

  /* ============================================================
     ミラーdiv方式でキャレットのピクセル位置を求める
     ============================================================ */

  function CaretMirror(textarea) {
    this.ta = textarea;
    this.el = document.createElement('div');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.position = 'absolute';
    this.el.style.visibility = 'hidden';
    this.el.style.whiteSpace = 'pre-wrap';
    this.el.style.wordWrap = 'break-word';
    this.el.style.top = '0';
    this.el.style.left = '-9999px';
    document.body.appendChild(this.el);
  }

  CaretMirror.prototype.measure = function (caretPos) {
    var ta = this.ta, mirror = this.el;
    var cs = window.getComputedStyle(ta);
    ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
     'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
     'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize'
    ].forEach(function (prop) { mirror.style[prop] = cs[prop]; });

    var before = ta.value.slice(0, caretPos);
    var after = ta.value.slice(caretPos) || '.';
    mirror.textContent = '';
    mirror.appendChild(document.createTextNode(before));
    var marker = document.createElement('span');
    marker.textContent = '|';
    mirror.appendChild(marker);
    mirror.appendChild(document.createTextNode(after));

    var taRect = ta.getBoundingClientRect();
    var top = marker.offsetTop - ta.scrollTop;
    var left = marker.offsetLeft - ta.scrollLeft;
    var lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;

    return {
      top: taRect.top + top + lineHeight + window.scrollY,
      left: taRect.left + left + window.scrollX
    };
  };

  CaretMirror.prototype.destroy = function () {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  /* ============================================================
     部品パレットの挿入
     ============================================================ */

  function insertSnippet(el, text) {
    var start = el.selectionStart, end = el.selectionEnd;
    var value = el.value;
    var indent = indentOf(value.slice(lineStartOf(value, start), start));
    var lines = text.split('\n');
    var indented = lines.map(function (ln, i) { return i === 0 ? ln : indent + ln; }).join('\n');
    var newValue = value.slice(0, start) + indented + value.slice(end);

    var phRel = indented.indexOf('???');
    var caretStart, caretEnd;
    if (phRel >= 0) {
      caretStart = start + phRel;
      caretEnd = caretStart + 3;
    } else {
      caretStart = caretEnd = start + indented.length;
    }
    setValueAndCaret(el, newValue, caretStart, caretEnd);
    el.focus();
    fireInput(el);
  }

  /* ============================================================
     自動インデント・自動閉じ（Enterキー）
     ============================================================ */

  function handleEnter(el) {
    var value = el.value;
    var pos = el.selectionStart;
    if (el.selectionStart !== el.selectionEnd) {
      // 選択範囲があるときは素直に置き換えるだけにする（複雑化を避ける）
      return false;
    }
    var ls = lineStartOf(value, pos);
    var lineBefore = value.slice(ls, pos); // キャレットより前の、現在行のテキスト
    var indent = indentOf(lineBefore);
    var trimmedUp = lineBefore.trim().toUpperCase();

    var insertAfter = null; // Enterのあと、さらに1行下に自動で足す行（インデントは同じ or 1段浅く）
    var extraIndentForBody = '';

    if (/^FOR\b.*\bTO\b/.test(trimmedUp)) {
      var forVarMatch = /^FOR\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/i.exec(lineBefore.trim());
      var forVar = forVarMatch ? forVarMatch[1] : 'i';
      insertAfter = indent + 'Next ' + forVar;
      extraIndentForBody = '    ';
    } else if (/^DO(\s+(WHILE|UNTIL)\b.*)?$/.test(trimmedUp)) {
      insertAfter = indent + 'Loop';
      extraIndentForBody = '    ';
    } else if (/^WHILE\b/.test(trimmedUp)) {
      insertAfter = indent + 'Wend';
      extraIndentForBody = '    ';
    } else if (/\bTHEN$/.test(trimmedUp) && !/\bEXIT\b/.test(trimmedUp)) {
      // 単一行 If（Then のあとに文がある）は End If を足さない
      insertAfter = indent + 'End If';
      extraIndentForBody = '    ';
    }

    var bodyIndent = indent + extraIndentForBody;
    var newValue, newCaret;
    if (insertAfter !== null) {
      newValue = value.slice(0, pos) + '\n' + bodyIndent + '\n' + insertAfter + value.slice(pos);
      newCaret = pos + 1 + bodyIndent.length;
    } else {
      newValue = value.slice(0, pos) + '\n' + indent + value.slice(pos);
      newCaret = pos + 1 + indent.length;
    }
    setValueAndCaret(el, newValue, newCaret);
    fireInput(el);
    return true;
  }

  function handleTab(el, shiftKey) {
    var value = el.value;
    var start = el.selectionStart, end = el.selectionEnd;
    if (start !== end) return false; // 複数行インデントは今回は対象外（単純さを優先）

    if (!shiftKey) {
      var newValue = value.slice(0, start) + '    ' + value.slice(end);
      setValueAndCaret(el, newValue, start + 4);
    } else {
      var ls = lineStartOf(value, start);
      var lineBefore = value.slice(ls, start);
      var strip = /^( {1,4}|\t)/.exec(lineBefore);
      if (!strip) return true; // 消せる空白が無ければ何もしない
      var newValue2 = value.slice(0, ls) + lineBefore.slice(strip[0].length) + value.slice(start);
      setValueAndCaret(el, newValue2, start - strip[0].length);
    }
    fireInput(el);
    return true;
  }

  /* ============================================================
     構文チェック（実行はしない。parseStatement + buildJumpMap だけ）
     ============================================================ */

  function checkSyntax(text) {
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    var stmts = [];
    for (var i = 0; i < lines.length; i++) {
      try {
        stmts.push(SV.Interpreter.parseStatement(lines[i]));
      } catch (e) {
        return { ok: false, line: i + 1, message: e.message };
      }
    }
    try {
      SV.Interpreter.buildJumpMap(stmts);
    } catch (e) {
      return { ok: false, line: null, message: e.message };
    }
    return { ok: true };
  }

  /* ============================================================
     エディタ本体
     ============================================================ */

  function attach(textarea, opts) {
    opts = opts || {};
    var onSyntaxCheck = opts.onSyntaxCheck || function () {};

    var mirror = new CaretMirror(textarea);
    var popupEl = document.createElement('div');
    popupEl.className = 'editor-suggest';
    popupEl.hidden = true;
    document.body.appendChild(popupEl);

    var composing = false;
    var popupItems = [];
    var popupIndex = -1;
    var popupWordStart = -1;
    var syntaxTimer = null;

    function closePopup() {
      popupEl.hidden = true;
      popupItems = [];
      popupIndex = -1;
      popupWordStart = -1;
    }

    function renderPopup() {
      popupEl.innerHTML = '';
      popupItems.forEach(function (item, i) {
        var row = document.createElement('div');
        row.className = 'editor-suggest__item' + (i === popupIndex ? ' is-active' : '');
        var name = document.createElement('span');
        name.className = 'editor-suggest__name';
        name.textContent = item.name;
        var desc = document.createElement('span');
        desc.className = 'editor-suggest__desc';
        desc.textContent = item.desc || '';
        row.appendChild(name);
        row.appendChild(desc);
        row.addEventListener('mousedown', function (e) {
          e.preventDefault(); // textareaのフォーカス・選択を保持したままクリックさせる
          popupIndex = i;
          confirmPopup();
        });
        popupEl.appendChild(row);
      });
    }

    function updatePopup() {
      if (composing) return;
      var pos = textarea.selectionStart;
      if (pos !== textarea.selectionEnd) { closePopup(); return; }
      var word = currentWord(textarea.value, pos);
      if (word.text.length === 0) { closePopup(); return; }

      var lower = word.text.toLowerCase();
      var seen = {};
      var candidates = [];

      function tryAdd(name, desc) {
        if (seen[name]) return;
        if (name.toLowerCase().indexOf(lower) !== 0) return;
        if (name.toLowerCase() === lower) return; // 完全一致まで打てたら出さない（邪魔なので）
        seen[name] = true;
        candidates.push({ name: name, desc: desc });
      }

      ALL_KEYWORDS.forEach(function (kw) { tryAdd(kw, KEYWORD_INFO[kw]); });
      ALL_BUILTINS.forEach(function (b) { tryAdd(b, BUILTIN_INFO[b]); });
      scanVarNames(textarea.value).forEach(function (v) { tryAdd(v, '（今のコードで使われている変数）'); });

      if (candidates.length === 0) { closePopup(); return; }
      candidates = candidates.slice(0, 8);

      popupItems = candidates;
      popupIndex = 0;
      popupWordStart = word.start;
      renderPopup();

      var pt = mirror.measure(pos);
      popupEl.style.top = pt.top + 'px';
      popupEl.style.left = pt.left + 'px';
      popupEl.hidden = false;
    }

    function confirmPopup() {
      if (popupIndex < 0 || !popupItems[popupIndex]) return false;
      var chosen = popupItems[popupIndex].name;
      var value = textarea.value;
      var pos = textarea.selectionStart;
      var newValue = value.slice(0, popupWordStart) + chosen + value.slice(pos);
      var newCaret = popupWordStart + chosen.length;
      setValueAndCaret(textarea, newValue, newCaret);
      closePopup();
      fireInput(textarea);
      textarea.focus();
      return true;
    }

    function scheduleSyntaxCheck() {
      if (syntaxTimer) clearTimeout(syntaxTimer);
      syntaxTimer = setTimeout(function () {
        onSyntaxCheck(checkSyntax(textarea.value));
      }, 600);
    }

    textarea.addEventListener('compositionstart', function () {
      composing = true;
      closePopup();
    });
    textarea.addEventListener('compositionend', function () {
      composing = false;
      // 変換確定直後は候補を出さない（確定操作をポップアップで邪魔しない）
      scheduleSyntaxCheck();
    });

    textarea.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return; // IME変換中は一切横取りしない

      if (!popupEl.hidden) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          popupIndex = Math.min(popupItems.length - 1, popupIndex + 1);
          renderPopup();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          popupIndex = Math.max(0, popupIndex - 1);
          renderPopup();
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          confirmPopup();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closePopup();
          return;
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handleTab(textarea, e.shiftKey);
        closePopup();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEnter(textarea);
        closePopup();
        return;
      }
      if (e.key === 'Escape') {
        closePopup();
      }
    });

    textarea.addEventListener('input', function () {
      if (!composing) updatePopup();
      scheduleSyntaxCheck();
    });

    textarea.addEventListener('blur', function () {
      // クリックで確定させる余地を残すため、少し遅らせて閉じる
      setTimeout(closePopup, 120);
    });
    textarea.addEventListener('scroll', closePopup);

    return {
      insertSnippet: function (text) { insertSnippet(textarea, text); scheduleSyntaxCheck(); },
      checkNow: function () { return checkSyntax(textarea.value); },
      destroy: function () {
        mirror.destroy();
        if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
        if (syntaxTimer) clearTimeout(syntaxTimer);
      }
    };
  }

  SV.Editor = {
    attach: attach,
    palette: PALETTE,
    checkSyntax: checkSyntax,
    scanVarNames: scanVarNames,
    insertSnippet: insertSnippet,
    handleEnter: handleEnter,
    handleTab: handleTab
  };
})(window.SV);
