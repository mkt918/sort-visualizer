# ソートの動きを見る — VBAで読むアルゴリズム

ソートアルゴリズムの動きを棒グラフで可視化しながら、**対応するVBAコードの実行行を同じ画面で追える**授業用ツール。
教員がプロジェクタで投影して説明し、生徒も自分のPCで触る想定。

対象は「If・ループ・最大最小・線形探索・配列」まで既習のプログラミング初級者。

配布先: <https://mkt918.github.io/sort-visualizer/>（GitHub Pages 公開後にリンクが有効になる）

## 使い方

`index.html` をブラウザで開くだけ。ビルド不要・外部依存ゼロなので、
ネットワークが無い教室でも、`file://`（ファイルをダブルクリック）で動く。

| 操作 | キー |
|---|---|
| 再生 / 一時停止 | スペース |
| 1ステップ戻る / 進む | ← / → |
| データを作り直す | R |

- **アルゴリズム**: 【まず理解する】バブル・選択・挿入／【動きを見る】シェル・クイック の5種。
- **データ**: ランダム / 逆順 / ほぼ整列済み / 重複多め。本数は 8〜60。
- **コードをコピー**: 画面のVBAを、A列読み込み・B列書き出しまで含んだ完全版でクリップボードへ。
  Excelで `Alt+F11` → 挿入 → 標準モジュール → 貼り付け → `F5`。詳しくは [excel/Excelでの使い方.md](excel/Excelでの使い方.md)。
- **🏁 2つ並べてレース**: 同じ初期データを2つのアルゴリズムで同時に走らせ、片方が完走した瞬間に両方止める。
  ステップ数の差がそのまま計算量の差として見える。既定はバブル vs クイック。

`tests.html` を開くと自己検証が走る（現在 38/38 パス）。

## 設計の核心

### 1. ステップ列の事前生成

アルゴリズムは「実行」せず、`generate()` が**全ステップを配列に吐き出す**。
再生・一時停止・1ステップ戻る・シークバー・レースは、すべてこの配列のインデックス操作に還元される。個別実装しない。

各ステップは `{ line, array, mark, sorted, vars, counters, narration }` を丸ごと保持する。
差分ではなくスナップショットにしてあるので、逆行とシークが自明に実装できる（上限 60000 ステップでガード）。

レースモード（`js/race.js`）は、この同じ `steps` 配列を2本、1ステップずつ同速で進めるだけの薄いラッパー。
どちらかが最後のステップに達した瞬間に両方停止し、もう片方の到達位置をそのまま表示する。

### 2. VBAソースが唯一の正 — 行番号は自動採番

JS実装とVBAコードの二重管理がこのツール最大のリスク。行番号をJS側にベタ書きすると、VBAを1行足した瞬間に全部ズレる。
そこで **VBAソースの行末に `'#マーカー` を書き、`SV.buildVba()` がそれを剥がして行番号を採番する。**

```vba
    For i = 0 To n - 2                        '#outer
        For j = 0 To n - 2 - i                '#inner
            If a(j) > a(j + 1) Then           '#compare
```

`generate()` は `rec.step(L.compare, ...)` と書く。行番号がコードから外れることが構造的に起きない。
マーカー名を綴り間違えると `line` が `undefined` になり、`tests.html` の「行番号がコードの実在行を指す」で必ず落ちる。

クイックソートだけは手続きが2つ（呼び出し役の `QuickSortCaller` と再帰する `QuickSort`）に分かれるため、
共通の `SV.wrapVba()` は使わず `quick.js` の中で全文を自前で組み立てている（`js/algorithms/quick.js` 参照）。

### 3. 表示用とExcel貼り付け用を1ソースから切り出す

画面に出すのは並べ替えのコアループだけ（初級者に読ませたいのはそこだけ）。
コピーボタンが渡すのは、A列読み込み・B列書き出しを含む**そのままF5で動く完全版**。
`coreFrom` / `coreTo` で表示範囲を切り出しているだけなので、両者がズレることはない。

配列サイズと `n` は画面の本数から生成するので、棒を30本にすればコードも `Dim a(29)` / `n = 30` になる。

`excel/SortDemo.bas`（5アルゴリズムをまとめた配布用ファイル）だけは、A列の件数を自動で数える形
（`n = Cells(Rows.Count, 1).End(xlUp).Row`）に書き換えている。生成方法は
[excel/Excelでの使い方.md](excel/Excelでの使い方.md) の「開発者向け」を参照。

## アルゴリズムの追加方法

`js/algorithms/<id>.js` を作り、`SV.algorithms.<id>` に以下の形で登録して、
`index.html` と `tests.html` の両方にスクリプトタグを、`js/app.js` の `ORDER` にIDを足す。

```js
SV.algorithms.insertion = {
  id: 'insertion', name: '挿入ソート',
  tier: 'basic',              // basic（理解させる）| advanced（動きを見せる）
  summary: '…',
  watchVars: ['i', 'j', 'tmp'],
  order: 'O(n²)',
  // 理論値がきれいな式になるなら theoryNote + theoryCompare(n)、
  // データ次第で変わるなら theoryLabel(n) で完全な文を返す（shell/quick を参照）。
  theoryNote: 'n(n-1)/2',
  theoryCompare: function (n) { return n * (n - 1) / 2; },
  vba: function (n) { … SV.wrapVba(…) + マーカー付き core … },
  generate: function (rec, L) { … VBAと1行ずつ対応させて書く … }
};
```

`generate` は**必ずVBAと同じ順序で書く**。速いJSではなく、VBAの写像であることが要件。
独自の最適化（早期終了など）をJS側だけに入れると、画面のコードと動きが食い違う。

追加したら `excel/SortDemo.bas` の作り直しも忘れないこと（下記「Excel連携」参照）。

## ファイル構成

```
index.html            画面
tests.html            自己検証（外部依存なしで走る）
css/tokens.css        デザイントークン（hallmark · Cobalt）
css/style.css         レイアウト
js/vba.js             マーカー解析・表示用/貼付用の切り出し・VBAの色分け
js/recorder.js        ステップ配列の記録
js/player.js          単体再生・シーク・逆行
js/race.js            2レーンを同速で並走させ、先着で両方止める
js/render.js          棒グラフ・コードペイン・変数ウォッチの描画
js/presets.js         初期データのパターン
js/app.js             UIの配線
js/algorithms/        アルゴリズム本体（bubble, selection, insertion, shell, quick）
excel/SortDemo.bas    配布用（CP932）。手で編集しない
excel/Excelでの使い方.md
tools/build-bas.js    SortDemo.bas の元テキストを生成（Node）
tools/to-cp932.py     UTF-8 → CP932 変換（Python）
```

## 決めたことと、その理由

- **Webフォントを使わない。** Cobalt テーマ本来の Space Grotesk / Inter / JetBrains Mono ではなく
  システムフォントスタックを採用した。ネットワークが無い教室で `file://` から開いても崩れないことを優先した。
- **ESモジュールを使わない。** `type="module"` は `file://` でCORSに阻まれる。
  クラシックスクリプト＋グローバル名前空間 `SV` にすることで、ダブルクリックで開ける。
- **棒の5状態は明度を階段状に離してある**（未処理80 → 交換70 → 比較58 → 確定45 → 基準33）。
  教室のプロジェクタは色再現が悪く、色相だけで分けると後ろの席から判別できない。白黒に潰れても読める。
- **数値ラベルは25本以上で自動的に隠す。** 本数を増やすと潰れて逆に読めなくなる。
- **`.bas` のダウンロードボタンは付けていない。** VBEの「ファイルのインポート」はANSI（日本語環境ではCP932）で
  読むため、ブラウザからUTF-8で吐くと日本語コメントが必ず文字化けする。
  アプリ側はクリップボード（Unicodeで正しく貼れる）に一本化し、`.bas` はビルド時に
  CP932に変換した実ファイルとして `excel/` に置いている。
- **交換の途中で同じ値の棒が2本並ぶのは仕様。** `tmp = a(j)` → `a(j) = a(j+1)` の間、配列には一時的に
  同じ値が入る。これはVBAの実際の挙動そのもので、「なぜ tmp が要るのか」が目で見える教材上の要点。
- **クイックソートのコードは「参考」扱い。** 再帰は未習前提なので、読ませることより
  ピボットを軸に左右へ分かれていく動きの派手さを楽しませる位置づけにしてある（`tier: 'advanced'`）。
- **レースは「片方が完走したら両方止める」。** 最後まで両方走らせるのではなく、勝敗が付いた瞬間に
  止めて負けている側の到達位置を見せることで、ステップ数の差＝計算量の差を強調している。
- **`excel/SortDemo.bas` の生成はNode→Pythonの2段構え。** アルゴリズムのロジックは
  `js/algorithms/*.js` の一箇所だけに持たせたい（Webアプリと配布用ファイルで別々に書くと必ずズレる）。
  一方でNode標準ライブラリはCP932への変換手段を持たないため、UTF-8生成はNode、
  CP932変換はPython（標準ライブラリで完結）という2段パイプラインにしている。

## Excel連携

`excel/SortDemo.bas` を変更したくなったら（＝アルゴリズムを追加・修正したら）、必ずこの手順で作り直す。
手で編集しない。

```bash
node tools/build-bas.js > tools/SortDemo.utf8.txt
python tools/to-cp932.py tools/SortDemo.utf8.txt excel/SortDemo.bas
```

詳しい使い方（生徒・教員向け）は [excel/Excelでの使い方.md](excel/Excelでの使い方.md) を参照。

## GitHub Pages への公開

1. このフォルダを単独のGitHubリポジトリにする（`sort-visualizer` を想定）。
2. `git remote add origin <URL>` → `git push -u origin main`。
3. リポジトリの Settings → Pages で、ブランチ `main` / フォルダ `/ (root)` を指定。
4. 数分待つと `https://<ユーザー名>.github.io/sort-visualizer/` で公開される。

## 今後の拡張候補（見送ったもの）

- マージソート・ヒープソートの追加（マージは作業用配列の描画領域が別途必要になるため今回は見送り）
- 生徒がコードを編集して実行する簡易VBAインタプリタ（`generate` を差し替えられる構造にはしてあるが未実装）
- スマホ用レイアウトの作り込み（現状は縦積みで最低限見られる状態に留めている）
