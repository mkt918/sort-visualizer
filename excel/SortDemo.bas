Attribute VB_Name = "SortDemo"
Option Explicit
'
' ソートの動きを見る ― VBAで読むアルゴリズム
'
' 使い方:
'   1. A列に数値を入れる（1行目から、空欄なしで）
'   2. 実行したいソートの Sub にカーソルを置いて F5
'   3. B列に並べ替えた結果が出る
'
' Webアプリの画面に出るコードと、比較・入れ替えの並び順は完全に一致させてある。
' 画面で動きを見てから、このコードを読むと理解しやすい。

'
' バブルソート
' A列に数値を入れて実行すると、B列に並べ替え結果を書き出す。
' n（件数）は A列を自動で数えるので、あらかじめ n を書き換える必要はない。
Sub BubbleSort()
    Dim a() As Long
    Dim n As Long, i As Long, j As Long, tmp As Long
    n = Cells(Rows.Count, 1).End(xlUp).Row
    ReDim a(n - 1)

    ' A列（A1から、データがある分だけ）の数値を配列 a に読み込む
    For i = 0 To n - 1
        a(i) = Cells(i + 1, 1).Value
    Next i

    ' ----- 並べ替え（バブルソート） -----
    For i = 0 To n - 2
        For j = 0 To n - 2 - i
            If a(j) > a(j + 1) Then
                tmp = a(j)
                a(j) = a(j + 1)
                a(j + 1) = tmp
            End If
        Next j
    Next i

    ' 並べ替えた結果を B列 に書き出す
    For i = 0 To n - 1
        Cells(i + 1, 2).Value = a(i)
    Next i
End Sub

'
' 選択ソート
' A列に数値を入れて実行すると、B列に並べ替え結果を書き出す。
' n（件数）は A列を自動で数えるので、あらかじめ n を書き換える必要はない。
Sub SelectionSort()
    Dim a() As Long
    Dim n As Long, i As Long, j As Long, minIdx As Long, tmp As Long
    n = Cells(Rows.Count, 1).End(xlUp).Row
    ReDim a(n - 1)

    ' A列（A1から、データがある分だけ）の数値を配列 a に読み込む
    For i = 0 To n - 1
        a(i) = Cells(i + 1, 1).Value
    Next i

    ' ----- 並べ替え（選択ソート） -----
    For i = 0 To n - 2
        minIdx = i
        For j = i + 1 To n - 1
            If a(j) < a(minIdx) Then
                minIdx = j
            End If
        Next j
        tmp = a(i)
        a(i) = a(minIdx)
        a(minIdx) = tmp
    Next i

    ' 並べ替えた結果を B列 に書き出す
    For i = 0 To n - 1
        Cells(i + 1, 2).Value = a(i)
    Next i
End Sub

'
' 挿入ソート
' A列に数値を入れて実行すると、B列に並べ替え結果を書き出す。
' n（件数）は A列を自動で数えるので、あらかじめ n を書き換える必要はない。
Sub InsertionSort()
    Dim a() As Long
    Dim n As Long, i As Long, j As Long, tmp As Long
    n = Cells(Rows.Count, 1).End(xlUp).Row
    ReDim a(n - 1)

    ' A列（A1から、データがある分だけ）の数値を配列 a に読み込む
    For i = 0 To n - 1
        a(i) = Cells(i + 1, 1).Value
    Next i

    ' ----- 並べ替え（挿入ソート） -----
    For i = 1 To n - 1
        tmp = a(i)
        j = i - 1
        Do While j >= 0
            If a(j) > tmp Then
                a(j + 1) = a(j)
                j = j - 1
            Else
                Exit Do
            End If
        Loop
        a(j + 1) = tmp
    Next i

    ' 並べ替えた結果を B列 に書き出す
    For i = 0 To n - 1
        Cells(i + 1, 2).Value = a(i)
    Next i
End Sub

'
' シェルソート
' A列に数値を入れて実行すると、B列に並べ替え結果を書き出す。
' n（件数）は A列を自動で数えるので、あらかじめ n を書き換える必要はない。
Sub ShellSort()
    Dim a() As Long
    Dim n As Long, gap As Long, i As Long, j As Long, tmp As Long
    n = Cells(Rows.Count, 1).End(xlUp).Row
    ReDim a(n - 1)

    ' A列（A1から、データがある分だけ）の数値を配列 a に読み込む
    For i = 0 To n - 1
        a(i) = Cells(i + 1, 1).Value
    Next i

    ' ----- 並べ替え（シェルソート） -----
    gap = n \ 2
    Do While gap > 0
        For i = gap To n - 1
            tmp = a(i)
            j = i - gap
            Do While j >= 0
                If a(j) > tmp Then
                    a(j + gap) = a(j)
                    j = j - gap
                Else
                    Exit Do
                End If
            Loop
            a(j + gap) = tmp
        Next i
        gap = gap \ 2
    Loop

    ' 並べ替えた結果を B列 に書き出す
    For i = 0 To n - 1
        Cells(i + 1, 2).Value = a(i)
    Next i
End Sub

'
' クイックソート
' A列に数値を入れて実行すると、B列に並べ替え結果を書き出す。
' n（件数）は A列を自動で数えるので、あらかじめ n を書き換える必要はない。
Sub QuickSortCaller()
    Dim a() As Long
    Dim n As Long, i As Long
    n = Cells(Rows.Count, 1).End(xlUp).Row
    ReDim a(n - 1)

    ' A列（A1から、データがある分だけ）の数値を配列 a に読み込む
    For i = 0 To n - 1
        a(i) = Cells(i + 1, 1).Value
    Next i

    ' ----- 並べ替え（クイックソート） -----
    Call QuickSort(a, 0, n - 1)

    ' 並べ替えた結果を B列 に書き出す
    For i = 0 To n - 1
        Cells(i + 1, 2).Value = a(i)
    Next i
End Sub

' 範囲 [lo, hi] を再帰的に並べ替える
Sub QuickSort(a() As Long, lo As Long, hi As Long)
    Dim pivot As Long, i As Long, j As Long, tmp As Long
    If lo >= hi Then Exit Sub
    pivot = a((lo + hi) \ 2)
    i = lo
    j = hi
    Do While i <= j
        Do While a(i) < pivot
            i = i + 1
        Loop
        Do While a(j) > pivot
            j = j - 1
        Loop
        If i <= j Then
            tmp = a(i)
            a(i) = a(j)
            a(j) = tmp
            i = i + 1
            j = j - 1
        End If
    Loop
    Call QuickSort(a, lo, j)
    Call QuickSort(a, i, hi)
End Sub
