/* vba.js — VBAソースを「唯一の正」として扱うためのユーティリティ。
 *
 * 各アルゴリズムは行末に '#name というマーカーコメントを書く。
 * ここでそれを剥がして行番号を自動採番するので、VBAを1行足しても
 * JS側の行番号がズレることが構造的に起きない。
 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var MARKER = /^([\s\S]*?)[ \t]*'#([A-Za-z0-9_]+)[ \t]*$/;

  function splitLines(s) {
    if (s === '' || s === undefined || s === null) return [];
    return String(s).replace(/\r\n/g, '\n').split('\n');
  }

  /* parts: { header, core, footer } — いずれも末尾に改行を含まない文字列。
   * core と footer は先頭を '\n' にしておくと空行区切りになる。 */
  function buildVba(parts) {
    var h = splitLines(parts.header);
    var c = splitLines(parts.core);
    var f = splitLines(parts.footer);
    var all = h.concat(c, f);
    var lines = {};

    var display = all.map(function (ln, i) {
      var m = ln.match(MARKER);
      if (!m) return ln;
      lines[m[2]] = i + 1;              // 行番号は1始まり
      return m[1].replace(/[ \t]+$/, '');
    });

    return {
      display: display,                 // マーカーを剥がした表示用の行配列
      lines: lines,                     // { outer: 12, compare: 14, ... }
      coreFrom: h.length + 1,           // 画面に出す範囲（1始まり・両端含む）
      coreTo: h.length + c.length,
      lineCount: all.length,
      text: display.join('\r\n')        // Excel貼り付け／.bas 用は CRLF
    };
  }

  /* 全アルゴリズム共通の読み込み・書き出し部分。n を埋め込むので、
   * 画面の本数を変えるとコードの n も追従する。 */
  function wrap(subName, n, dimTail) {
    var last = Math.max(n - 1, 0);
    var header =
      'Sub ' + subName + '()\n' +
      '    Dim a(' + last + ') As Long\n' +
      '    Dim n As Long' + dimTail + '\n' +
      '    n = ' + n + '\n' +
      '\n' +
      "    ' A列（A1〜A" + n + "）の数値を配列 a に読み込む\n" +
      '    For i = 0 To n - 1\n' +
      '        a(i) = Cells(i + 1, 1).Value\n' +
      '    Next i';
    var footer =
      '\n' +
      "    ' 並べ替えた結果を B列 に書き出す\n" +
      '    For i = 0 To n - 1\n' +
      '        Cells(i + 1, 2).Value = a(i)\n' +
      '    Next i\n' +
      'End Sub';
    return { header: header, footer: footer };
  }

  var KEYWORDS = /\b(Sub|End|Dim|As|Long|For|To|Step|Next|If|Then|Else|Do|Loop|While|Until|And|Or|Not|Mod|Cells|Value|Option|Explicit|Const|True|False)\b/g;

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ごく簡単なVBAの色分け。文字列リテラルは使っていないので、
   * 最初の ' 以降をコメントとして扱えば足りる。 */
  function highlight(line) {
    var q = line.indexOf("'");
    var code = q >= 0 ? line.slice(0, q) : line;
    var comment = q >= 0 ? line.slice(q) : '';
    var out = escapeHtml(code)
      .replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>')
      .replace(KEYWORDS, '<span class="tok-kw">$1</span>');
    if (comment) out += '<span class="tok-com">' + escapeHtml(comment) + '</span>';
    return out;
  }

  SV.buildVba = buildVba;
  SV.wrapVba = wrap;
  SV.highlightVba = highlight;
  SV.escapeHtml = escapeHtml;
})(window.SV);
