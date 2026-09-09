/* tools/build-bas.js — excel/SortDemo.bas の元になるUTF-8テキストを生成する。
 *
 * js/algorithms/*.js の vba() が「唯一の正」。ここではそれを n=20 で評価し、
 * 配列サイズと本数をA列の実データ件数から自動計算する形に書き換えるだけで、
 * アルゴリズムのロジック自体は一切変更しない。
 *
 * 使い方:
 *   node tools/build-bas.js > tools/SortDemo.utf8.txt
 *   python tools/to-cp932.py tools/SortDemo.utf8.txt excel/SortDemo.bas
 *
 * アルゴリズムを追加・変更したら、この2手順を実行して excel/SortDemo.bas を
 * 作り直すこと。手で編集しない。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { console, Math, Date, JSON, Object, Array, String, Number, isNaN };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

[
  'js/vba.js', 'js/recorder.js',
  'js/algorithms/bubble.js', 'js/algorithms/selection.js',
  'js/algorithms/insertion.js', 'js/algorithms/shell.js', 'js/algorithms/quick.js'
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));

const DASH = String.fromCharCode(0x2015); // ― CP932で符号化できる全角ダッシュ（emダッシュ U+2014は不可）
const ORDER = ['bubble', 'selection', 'insertion', 'shell', 'quick'];

function moduleFor(id) {
  const A = sandbox.SV.algorithms[id];
  const model = sandbox.SV.buildVba(A.vba(20));
  let text = model.display.join('\r\n');

  // 配列サイズと件数を、A列の実データからその場で数える形に書き換える。
  // ReDim は n を求めた「あと」に置かないと a(-1) になるので、
  // 'n = 20' の行そのものを「n を数える行 + ReDim」に差し替える。
  text = text.split('Dim a(19) As Long').join('Dim a() As Long');
  text = text.split('n = 20').join(
    'n = Cells(Rows.Count, 1).End(xlUp).Row\r\n    ReDim a(n - 1)'
  );
  text = text.split('A列（A1〜A20）の数値を配列 a に読み込む')
             .join('A列（A1から、データがある分だけ）の数値を配列 a に読み込む');

  return "'\r\n' " + A.name + '\r\n' +
         "' A列に数値を入れて実行すると、B列に並べ替え結果を書き出す。\r\n" +
         "' n（件数）は A列を自動で数えるので、あらかじめ n を書き換える必要はない。\r\n" +
         text;
}

const header =
  'Attribute VB_Name = "SortDemo"\r\n' +
  'Option Explicit\r\n' +
  "'\r\n" +
  "' ソートの動きを見る " + DASH + " VBAで読むアルゴリズム\r\n" +
  "'\r\n" +
  "' 使い方:\r\n" +
  "'   1. A列に数値を入れる（1行目から、空欄なしで）\r\n" +
  "'   2. 実行したいソートの Sub にカーソルを置いて F5\r\n" +
  "'   3. B列に並べ替えた結果が出る\r\n" +
  "'\r\n" +
  "' Webアプリの画面に出るコードと、比較・入れ替えの並び順は完全に一致させてある。\r\n" +
  "' 画面で動きを見てから、このコードを読むと理解しやすい。\r\n";

const body = ORDER.map(moduleFor).join('\r\n\r\n');
process.stdout.write(header + '\r\n' + body + '\r\n');
