/* studio.js — 「じぶんで書く」モードのUI配線。
 *
 * app.js からは setMode('studio') の追加と、このモジュールへの委譲だけで済むように、
 * 公開APIを onEnter / onExit / onDataChanged の3つだけに絞っている。
 *
 * 内部の流れ:
 *   ミッションを選ぶ → 出発点（白紙/骨組み/お手本）を選ぶ → textarea に反映
 *   → 書く（editor.js がアシスト） → 「実行して確かめる」
 *     → 構文チェック → インタプリタ実行 → 既存の player.load() でアニメーション
 *     → judge() で合否判定 → （ミッション5だけ）既存アルゴリズムとの回数比較
 *
 * localStorage にミッションごとにコードを自動保存する（共有PC教室を想定して
 * 「保存内容を消す」ボタンも用意する）。
 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var STORAGE_PREFIX = 'sortvis.studio.';

  var el = {};
  var player = new SV.Player();
  var editorCtrl = null;
  var initialized = false;

  var state = {
    missionId: SV.Missions ? SV.Missions.list[0].id : null,
    starter: null,
    values: [],
    watchMap: null,
    chartView: null,
    codeViewModel: null,
    hintShown: false
  };

  function $(id) { return document.getElementById(id); }
  function mission() { return SV.Missions.get(state.missionId); }

  function storageKey(missionId) { return STORAGE_PREFIX + missionId; }
  function loadSaved(missionId) {
    try { return localStorage.getItem(storageKey(missionId)); } catch (e) { return null; }
  }
  function saveCode(missionId, text) {
    try { localStorage.setItem(storageKey(missionId), text); } catch (e) { /* 保存できなくても致命ではない */ }
  }
  function clearSaved(missionId) {
    try { localStorage.removeItem(storageKey(missionId)); } catch (e) { /* 無視 */ }
  }

  /* ---------------- 組み立て ---------------- */

  function buildMissionSelect() {
    el.missionSelect.innerHTML = '';
    SV.Missions.list.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.title;
      el.missionSelect.appendChild(opt);
    });
  }

  function buildPalette() {
    el.palette.innerHTML = '';
    SV.Editor.palette.forEach(function (item) {
      var btn = document.createElement('button');
      btn.className = 'btn btn--sm';
      btn.type = 'button';
      btn.textContent = item.label;
      btn.addEventListener('click', function () {
        editorCtrl.insertSnippet(item.insert);
        el.editor.focus();
      });
      el.palette.appendChild(btn);
    });
  }

  /* ---------------- コード表示 ⇄ 編集の切り替え ----------------
   * 実行前は textarea（編集可能）、実行してアニメーションを見ている間は
   * 読み取り専用のハイライト表示（既存の solo モードと同じ render.buildCode）。 */

  function showEditor() {
    el.editor.hidden = false;
    el.codeView.hidden = true;
  }

  function showCodeView(model) {
    el.editor.hidden = true;
    el.codeView.hidden = false;
    state.codeViewModel = SV.render.buildCode(el.codeView, model);
    SV.render.setCodeScope(state.codeViewModel, model, true);
  }

  /* ---------------- 判定・比較の表示 ---------------- */

  function hideJudge() { el.judge.hidden = true; }

  function showJudge(result) {
    el.judge.hidden = false;
    el.judge.setAttribute('data-ok', String(result.ok));
    el.judgeMessage.textContent = result.message;
    el.judgeCases.innerHTML = '';
    if (result.cases) {
      result.cases.forEach(function (c) {
        var li = document.createElement('li');
        li.setAttribute('data-ok', String(c.ok));
        li.textContent = c.label + '：' + (c.ok ? '成功' : c.reason);
        el.judgeCases.appendChild(li);
      });
    }
  }

  function hideCompare() { el.compare.hidden = true; }

  function showCompare(cmp) {
    el.compare.hidden = false;
    el.compareTable.innerHTML = '';

    var head = document.createElement('tr');
    ['', '比較', '書き込み/交換'].forEach(function (t) {
      var th = document.createElement('th');
      th.textContent = t;
      head.appendChild(th);
    });
    el.compareTable.appendChild(head);

    var rows = [
      { key: 'you', label: 'あなた' },
      { key: 'bubble', label: null },
      { key: 'selection', label: null },
      { key: 'quick', label: null }
    ];
    rows.forEach(function (r) {
      var data = cmp[r.key];
      if (!data) return;
      var tr = document.createElement('tr');
      if (r.key === 'you') tr.className = 'is-you';
      var label = r.label || data.name || r.key;
      [label, (data.compare === undefined ? '—' : data.compare), (data.swap === undefined ? '—' : data.swap)]
        .forEach(function (v) {
          var td = document.createElement('td');
          td.textContent = String(v);
          tr.appendChild(td);
        });
      el.compareTable.appendChild(tr);
    });
  }

  /* ---------------- データのプレビュー（コード実行前） ---------------- */

  function previewCurrentData() {
    player.pause();
    showEditor();
    state.chartView = SV.render.buildChart(el.chart, state.values);
    var previewStep = {
      line: 0, array: state.values.slice(), mark: {},
      sorted: state.values.map(function () { return false; }),
      vars: {}, counters: { compare: 0, swap: 0 }
    };
    SV.render.updateChart(state.chartView, previewStep);
    el.narration.textContent = '';
    el.cntCompare.textContent = '0';
    el.cntSwap.textContent = '0';
    el.watch.innerHTML = '';
    el.seek.max = '0';
    el.seek.value = '0';
    player.load([]);
  }

  /* ---------------- ミッション・出発点の選択 ---------------- */

  function updateStarterButtons() {
    var buttons = el.starters.querySelectorAll('[data-starter]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-starter') === state.starter));
    }
  }

  function applyStarter(kind) {
    var m = mission();
    var text = (m.starters[kind] || ['']).join('\n');
    el.editor.value = text;
    state.starter = kind;
    updateStarterButtons();
    saveCode(state.missionId, text);
    hideJudge();
    hideCompare();
    if (editorCtrl) editorCtrl.checkNow();
    reportSyntax(SV.Editor.checkSyntax(text));
    el.editor.focus();
  }

  function selectMission(id) {
    state.missionId = id;
    el.missionSelect.value = id;
    var m = mission();
    el.prompt.textContent = m.prompt;
    el.hintText.textContent = m.hint;
    if (state.hintShown) el.hintText.hidden = false;

    hideJudge();
    hideCompare();

    var saved = loadSaved(id);
    if (saved !== null && saved !== '') {
      el.editor.value = saved;
      state.starter = null;
      updateStarterButtons();
      reportSyntax(SV.Editor.checkSyntax(saved));
    } else {
      applyStarter('skeleton');
    }
    previewCurrentData();
  }

  /* ---------------- 構文エラー表示 ---------------- */

  function reportSyntax(result) {
    if (result.ok) {
      el.syntaxError.hidden = true;
      el.syntaxError.textContent = '';
    } else {
      el.syntaxError.hidden = false;
      el.syntaxError.textContent = '⚠ ' + (result.line ? result.line + '行目: ' : '') + result.message;
    }
  }

  /* ---------------- 実行 ---------------- */

  function runCode() {
    var text = el.editor.value;
    saveCode(state.missionId, text);

    var syntax = SV.Editor.checkSyntax(text);
    if (!syntax.ok) { reportSyntax(syntax); return; }
    reportSyntax(syntax);

    var lines = text.replace(/\r\n/g, '\n').split('\n');
    var rec;
    try {
      rec = SV.Interpreter.run(lines.slice(), state.values.slice(), null);
    } catch (e) {
      reportSyntax({ ok: false, line: e.atLine, message: e.message });
      return;
    }

    var model = {
      display: lines.slice(), lines: {}, coreFrom: 1, coreTo: lines.length,
      lineCount: lines.length, text: lines.join('\r\n')
    };
    showCodeView(model);

    state.chartView = SV.render.buildChart(el.chart, state.values);
    state.watchMap = SV.render.buildWatch(el.watch, rec.watchVars);
    el.seek.max = String(Math.max(0, rec.steps.length - 1));
    el.seek.value = '0';
    player.load(rec.steps);

    var m = mission();
    var judged = m.judge(lines, state.values);
    showJudge(judged);

    if (judged.ok && m.compareToReference) {
      showCompare(SV.Missions.compareCounts(lines, state.values));
    } else {
      hideCompare();
    }
  }

  /* ---------------- コピー ---------------- */

  function copyCode() {
    var text = el.editor.value;
    var flash = function (msg, ok) {
      var original = el.btnCopy.textContent;
      el.btnCopy.setAttribute('data-state', ok ? 'success' : 'error');
      el.btnCopy.textContent = msg;
      setTimeout(function () { el.btnCopy.removeAttribute('data-state'); el.btnCopy.textContent = original; }, 1600);
    };
    var fail = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      flash(ok ? '✓ コピーしました' : '× コピーできません', ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash('✓ コピーしました', true); }, fail);
    } else {
      fail();
    }
  }

  /* ---------------- 初期化（onEnterで初回だけ） ---------------- */

  function init() {
    // [DOM の id, el.* に格納するキー名] の対。他ファイル（app.js等）の書き方に合わせて、
    // id とキー名の対応を明示的に1行ずつ書く（省略記法で機械的に導出しない）。
    [
      ['studioMissionSelect', 'missionSelect'],
      ['studioPrompt', 'prompt'],
      ['studioStarters', 'starters'],
      ['studioEditor', 'editor'],
      ['studioCodeView', 'codeView'],
      ['studioSyntaxError', 'syntaxError'],
      ['studioPalette', 'palette'],
      ['studioBtnHint', 'btnHint'],
      ['studioHintText', 'hintText'],
      ['studioBtnCopy', 'btnCopy'],
      ['studioBtnClear', 'btnClear'],
      ['studioBtnRun', 'btnRun'],
      ['studioChart', 'chart'],
      ['studioBtnPlay', 'btnPlay'],
      ['studioBtnPrev', 'btnPrev'],
      ['studioBtnNext', 'btnNext'],
      ['studioSeek', 'seek'],
      ['studioNarration', 'narration'],
      ['studioWatch', 'watch'],
      ['studioCntCompare', 'cntCompare'],
      ['studioCntSwap', 'cntSwap'],
      ['studioJudge', 'judge'],
      ['studioJudgeMessage', 'judgeMessage'],
      ['studioJudgeCases', 'judgeCases'],
      ['studioCompare', 'compare'],
      ['studioCompareTable', 'compareTable']
    ].forEach(function (pair) { el[pair[1]] = $(pair[0]); });

    buildMissionSelect();
    buildPalette();

    editorCtrl = SV.Editor.attach(el.editor, {
      onSyntaxCheck: reportSyntax
    });

    el.editor.addEventListener('input', function () {
      saveCode(state.missionId, el.editor.value);
      if (state.starter !== null) { state.starter = null; updateStarterButtons(); }
    });

    el.missionSelect.addEventListener('change', function () { selectMission(el.missionSelect.value); });

    el.starters.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-starter]') : null;
      if (btn) applyStarter(btn.getAttribute('data-starter'));
    });

    el.btnHint.addEventListener('click', function () {
      state.hintShown = !state.hintShown;
      el.btnHint.setAttribute('aria-pressed', String(state.hintShown));
      el.hintText.hidden = !state.hintShown;
    });

    el.btnCopy.addEventListener('click', copyCode);

    el.btnClear.addEventListener('click', function () {
      clearSaved(state.missionId);
      applyStarter('skeleton');
    });

    el.btnRun.addEventListener('click', runCode);

    el.btnPlay.addEventListener('click', function () { player.toggle(); });
    el.btnPrev.addEventListener('click', function () { player.pause(); player.prev(); });
    el.btnNext.addEventListener('click', function () { player.pause(); player.next(); });
    el.seek.addEventListener('input', function () { player.pause(); player.seek(Number(el.seek.value)); });

    player.onChange = function (step, index, total) {
      if (!step) return;
      SV.render.updateChart(state.chartView, step);
      if (state.codeViewModel) SV.render.setActiveLine(el.codeView, state.codeViewModel, step.line);
      if (state.watchMap) SV.render.updateWatch(state.watchMap, step.vars);
      SV.render.updateNarration(el.narration, step, index, total);
      el.cntCompare.textContent = String(step.counters.compare);
      el.cntSwap.textContent = String(step.counters.swap);
      el.seek.value = String(index);
      if (SV.Sound) SV.Sound.playForStep(step);
    };
    player.onStateChange = function (p) {
      el.btnPlay.textContent = p.playing ? '⏸' : '▶';
    };

    initialized = true;
  }

  /* ---------------- 公開API ---------------- */

  function onEnter(values) {
    if (!initialized) init();
    state.values = values.slice();
    selectMission(state.missionId);
  }

  function onExit() {
    player.pause();
  }

  function onDataChanged(values) {
    state.values = values.slice();
    hideJudge();
    hideCompare();
    previewCurrentData();
  }

  SV.Studio = { onEnter: onEnter, onExit: onExit, onDataChanged: onDataChanged };
})(window.SV);
