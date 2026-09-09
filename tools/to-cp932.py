#!/usr/bin/env python3
"""tools/to-cp932.py — UTF-8のVBAソースをCP932（Shift-JIS）へ変換する。

VBEの「ファイルのインポート」はANSI（日本語環境ではCP932）でしか読まないため、
UTF-8のまま配布すると日本語コメントが必ず文字化けする。変換できない文字が
混じっていたら、位置を示して失敗する（黙って化けさせない）。

使い方:
    python tools/to-cp932.py tools/SortDemo.utf8.txt excel/SortDemo.bas
"""
import sys


def main():
    if len(sys.argv) != 3:
        print("使い方: python to-cp932.py <入力.txt> <出力.bas>", file=sys.stderr)
        return 1

    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        text = f.read()

    try:
        data = text.encode("cp932")
    except UnicodeEncodeError as e:
        line = text.count("\n", 0, e.start) + 1
        print(f"CP932に変換できない文字が {line} 行目付近にあります: {e}", file=sys.stderr)
        print(repr(text[max(0, e.start - 20):e.end + 20]), file=sys.stderr)
        return 1

    with open(dst, "wb") as f:
        f.write(data)

    print(f"書き出し完了: {dst}（{len(data)} バイト）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
