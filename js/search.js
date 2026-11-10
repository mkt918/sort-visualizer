/* search.js — 探索topic（線形探索・二分探索）のUI配線。
 *
 * js/studio.js と同じ隔離パターンを採る: app.js からは onEnter/onExit の
 * 2メソッドだけで委譲し、このモジュールの中で完結させる。
 * ソートとは違う独自の Player/Race インスタンスを持ち、DOM要素もすべて
 * search* というidに分けてあるので、ソート側の状態には一切触れない。
 *
 * データは二分探索の前提（ソート済み配列）を守るため、常に昇順で作る。
 * 「編集して実行」「じぶんで書く」に相当する自由記述モードは今回のスコープ外。 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var ORDER = ['linear', 'binary'];

  var PRESET_LABELS = { unique: 'ユニーク値', duplicates: '重複あり' };
  var PRESET_ORDER = ['unique', 'duplicates'];

  /* excluded は新しい色を作らず idle を薄くしただけの表現なので、凡例も
   * idle と同じ色を opacity だけ落として流用する（render.js の buildLegend 参照）。 */
  var LEGEND_ITEMS = [
    ['idle', '未処理'],
    ['compare', '比較中'],
    ['pivot', '中央（二分探索）'],
    ['idle', '絞り込みで除外', 0.35],
    ['sorted', '見つかった']
  ];

  var el = {};
  var player = new SV.Player();
  var race = new SV.Race();
  var initialized = false;

  var state = {
    algoId: ORDER[0],
    presetId: 'unique',
    n: 12,
    values: [],
    targetMode: 'found',   // 'found' | 'notfound'
    target: null,
    mode: 'solo',           // 'solo' | 'race' | 'stats'
    model: null,
    chartView: null,
    codeView: null,
    watchMap: null,
    showFullCode: false,
    raceViewA: null,
    raceViewB: null
  };
  var raceFinished = false;

  function $(id) { return document.getElementById(id); }
  function algo() { return SV.searchAlgorithms[state.algoId]; }

  /* ---------------- データ生成 ---------------- */

  /* 探索topic専用のデータ作り。二分探索の前提を守るため、常に昇順に並べる。
   * presets.js のランダム生成をそのまま流用し、ソートするだけに留める
   * （値の作り方を二重管理しない）。 */
  function makeValues(presetId, n) {
    var base = presetId === 'duplicates'
      ? SV.presets.make('duplicates', n)
      : SV.presets.make('random', n);
    return base.slice().sort(function (a, b) { return a - b; });
  }

  function pickTarget(values, mode) {
    if (mode === 'found') {
      if (!values.length) return 0;
      return values[Math.floor(Math.random() * values.length)];
    }
    var max = values.length ? Math.max.apply(null, values) : 0;
    return max + 1 + Math.floor(Math.random() * 10);
  }

  /* ---------------- 組み立て ---------------- */

  function buildAlgoTabs() {
    el.algos.innerHTML = '';
    ORDER.forEach(function (id) {
      var A = SV.searchAlgorithms[id];
      var b = document.createElement('button');
      b.className = 'btn btn--sm';
      b.type = 'button';
      b.textContent = A.name;
      b.setAttribute('data-algo', A.id);
      b.setAttribute('aria-selected', String(A.id === state.algoId));
      b.addEventListener('click', function () {
        if (state.algoId === A.id) return;
        state.algoId = A.id;
        syncAlgoTabs();
        rebuild();
      });
      el.algos.appendChild(b);
    });
  }

  function syncAlgoTabs() {
    var buttons = el.algos.querySelectorAll('[data-algo]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-selected',
        String(buttons[i].getAttribute('data-algo') === state.algoId));
    }
  }

  function buildPresetButtons() {
    el.presets.innerHTML = '';
    PRESET_ORDER.forEach(function (id) {
      var b = document.createElement('button');
      b.className = 'btn btn--sm';
      b.type = 'button';
      b.textContent = PRESET_LABELS[id];
      b.setAttribute('data-preset', id);
      b.setAttribute('aria-pressed', String(id === state.presetId));
      b.addEventListener('click', function () {
        state.presetId = id;
        syncPresetButtons();
        newData();
      });
      el.presets.appendChild(b);
    });
  }

  function syncPresetButtons() {
    var buttons = el.presets.querySelectorAll('[data-preset]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed',
        String(buttons[i].getAttribute('data-preset') === state.presetId));
    }
  }

  function syncTargetButtons() {
    var buttons = el.targetSwitch.querySelectorAll('[data-target]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed',
        String(buttons[i].getAttribute('data-target') === state.targetMode));
    }
  }

  /* ---------------- データの再生成 ---------------- */

  function newData() {
    state.values = makeValues(state.presetId, state.n);
    state.target = pickTarget(state.values, state.targetMode);
    refreshForMode();
  }

  function newTarget() {
    state.target = pickTarget(state.values, state.targetMode);
    refreshForMode();
  }

  function refreshForMode() {
    if (state.mode === 'race') rebuildRace();
    else if (state.mode === 'stats') rebuildStats();
    else rebuild();
  }

  /* ---------------- ソロ ---------------- */

  function applyResult(rec, model, A, foundIndex) {
    state.model = model;
    state.chartView = SV.render.buildChart(el.chart, state.values);
    state.codeView = SV.render.buildCode(el.code, model);
    SV.render.setCodeScope(state.codeView, model, state.showFullCode);
    state.watchMap = SV.render.buildWatch(el.watch, A.watchVars);

    el.stageTitle.textContent = A.name;
    el.stageSummary.textContent = A.summary + '（探す値: ' + state.target + '）';
    el.cntOrder.textContent = A.order;
    el.cntTheory.textContent = A.theoryLabel(state.n);
    el.seek.max = String(Math.max(0, rec.steps.length - 1));
    el.seek.value = '0';

    player.load(rec.steps);
  }

  function rebuild() {
    var A = algo();
    var model = SV.buildVba(A.vba(state.n, state.target));
    var rec = new SV.Recorder(state.values, A.watchVars);
    var found;
    try {
      found = A.generate(rec, model.lines, state.target);
    } catch (err) {
      el.narration.textContent = '生成に失敗しました: ' + err.message;
      return;
    }
    applyResult(rec, model, A, found);
  }

  function onChange(step, index, total) {
    if (!step) return;
    SV.render.updateChart(state.chartView, step);
    SV.render.setActiveLine(el.code, state.codeView, step.line);
    SV.render.updateWatch(state.watchMap, step.vars);
    SV.render.updateNarration(el.narration, step, index, total);
    el.cntCompare.textContent = String(step.counters.compare);
    el.seek.value = String(index);
    el.btnPrev.disabled = index <= 0;
    el.btnNext.disabled = index >= total - 1;
    if (SV.Sound) SV.Sound.playForStep(step);
  }

  function onPlayState(p) {
    el.btnPlay.textContent = p.playing ? '⏸ 一時停止' : '▶ 再生';
    el.btnPlay.setAttribute('aria-pressed', String(p.playing));
  }

  /* ---------------- レース（線形 vs 二分、固定） ---------------- */

  function raceLane(algoId, values, target) {
    var A = SV.searchAlgorithms[algoId];
    var model = SV.buildVba(A.vba(values.length, target));
    var rec = new SV.Recorder(values.slice(), A.watchVars);
    A.generate(rec, model.lines, target);
    return rec.steps;
  }

  function renderRaceLane(i, lane) {
    var view = i === 0 ? state.raceViewA : state.raceViewB;
    var step = lane.steps[lane.index];
    SV.render.updateChart(view, step);
    (i === 0 ? el.raceStepA : el.raceStepB).textContent = String(lane.index);
    (i === 0 ? el.raceCompareA : el.raceCompareB).textContent = String(step.counters.compare);
  }

  function resetRaceStatus() {
    [el.raceStatusA, el.raceStatusB].forEach(function (s) {
      s.textContent = '';
      s.removeAttribute('data-state');
    });
    el.raceBtnPlay.textContent = '▶ レース開始';
  }

  function rebuildRace() {
    race.pause();
    var stepsA = raceLane('linear', state.values, state.target);
    var stepsB = raceLane('binary', state.values, state.target);

    state.raceViewA = SV.render.buildChart(el.raceChartA, state.values);
    state.raceViewB = SV.render.buildChart(el.raceChartB, state.values);
    el.raceTotalA.textContent = String(Math.max(0, stepsA.length - 1));
    el.raceTotalB.textContent = String(Math.max(0, stepsB.length - 1));

    race.load([stepsA, stepsB]);
    raceFinished = false;
    resetRaceStatus();
    renderRaceLane(0, race.lanes[0]);
    renderRaceLane(1, race.lanes[1]);
  }

  function onRaceTick(lanes) {
    renderRaceLane(0, lanes[0]);
    renderRaceLane(1, lanes[1]);
    if (SV.Sound) {
      SV.Sound.playForStep(lanes[0].steps[lanes[0].index]);
      SV.Sound.playForStep(lanes[1].steps[lanes[1].index]);
    }
  }

  function onRaceFinish(winner, lanes) {
    var names = ['線形探索', '二分探索'];
    var statusEls = [el.raceStatusA, el.raceStatusB];
    var other = winner === 0 ? 1 : 0;

    statusEls[winner].textContent = '🏁 ' + names[winner] + ' が先に完了！';
    statusEls[winner].setAttribute('data-state', 'finished');

    var otherLane = lanes[other];
    var otherTotal = Math.max(0, otherLane.steps.length - 1);
    statusEls[other].textContent =
      names[other] + ' はまだ ' + otherLane.index + ' / ' + otherTotal + ' 歩';

    raceFinished = true;
    el.raceBtnPlay.textContent = '▶ もう一度';
  }

  function startRace() {
    if (raceFinished) {
      race.reset();
      raceFinished = false;
      resetRaceStatus();
      renderRaceLane(0, race.lanes[0]);
      renderRaceLane(1, race.lanes[1]);
    }
    race.play();
    el.raceBtnPlay.textContent = '⏸ 一時停止';
  }

  /* ---------------- 統計（平均step数） ----------------
   * 現在の配列の全要素をそれぞれ探し、比較回数を集計して平均を出す。
   * 理論値の式に頼らず実測で出すので、常に正確な数字になる。
   * fast モード（Recorderにopts.fast:trueを渡す）でステップ記録を省き、
   * カウンタだけを高速に集計する。 */
  function measure(algoId, values, target) {
    var A = SV.searchAlgorithms[algoId];
    var rec = new SV.Recorder(values.slice(), A.watchVars, { fast: true });
    A.generate(rec, {}, target);
    return rec.compare;
  }

  function average(nums) {
    if (!nums.length) return 0;
    var sum = 0;
    for (var i = 0; i < nums.length; i++) sum += nums[i];
    return sum / nums.length;
  }

  function rebuildStats() {
    var values = state.values, n = values.length;
    el.statsN.textContent = String(n);

    var linearCounts = [], binaryCounts = [];
    for (var i = 0; i < n; i++) {
      linearCounts.push(measure('linear', values, values[i]));
      binaryCounts.push(measure('binary', values, values[i]));
    }
    var notFoundTarget = pickTarget(values, 'notfound');
    var linearNotFound = measure('linear', values, notFoundTarget);
    var binaryNotFound = measure('binary', values, notFoundTarget);

    var linearAvg = average(linearCounts);
    var binaryAvg = average(binaryCounts);

    el.statsTable.innerHTML = '';
    var head = document.createElement('tr');
    ['', '平均比較回数（見つかる）', '理論値', '見つからない場合'].forEach(function (t) {
      var th = document.createElement('th');
      th.textContent = t;
      head.appendChild(th);
    });
    el.statsTable.appendChild(head);

    [
      { name: '線形探索', avg: linearAvg, theory: SV.searchAlgorithms.linear.theoryLabel(n), nf: linearNotFound },
      { name: '二分探索', avg: binaryAvg, theory: SV.searchAlgorithms.binary.theoryLabel(n), nf: binaryNotFound }
    ].forEach(function (row) {
      var tr = document.createElement('tr');
      [row.name, row.avg.toFixed(2) + ' 回', row.theory, row.nf + ' 回'].forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = String(v);
        tr.appendChild(td);
      });
      el.statsTable.appendChild(tr);
    });

    var maxAvg = Math.max(linearAvg, binaryAvg, 1);
    el.statsBars.innerHTML = '';
    [
      { label: '線形探索', avg: linearAvg },
      { label: '二分探索', avg: binaryAvg }
    ].forEach(function (row) {
      var wrap = document.createElement('div');
      wrap.className = 'stats-bar';

      var label = document.createElement('span');
      label.className = 'stats-bar__label';
      label.textContent = row.label;

      var track = document.createElement('div');
      track.className = 'stats-bar__track';
      var fill = document.createElement('div');
      fill.className = 'stats-bar__fill';
      fill.style.width = (row.avg / maxAvg * 100).toFixed(1) + '%';
      track.appendChild(fill);

      var value = document.createElement('span');
      value.className = 'stats-bar__value';
      value.textContent = row.avg.toFixed(2) + ' 回';

      wrap.appendChild(label);
      wrap.appendChild(track);
      wrap.appendChild(value);
      el.statsBars.appendChild(wrap);
    });

    el.statsNote.textContent = 'n=' + n + ' が大きくなるほど、二分探索の速さがはっきり出ます。' +
      '本数を増やして比べてみましょう。';
  }

  /* ---------------- モード切替 ---------------- */

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;

    var buttons = el.modeSwitch.querySelectorAll('[data-mode]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-mode') === mode));
    }

    var isSolo = mode === 'solo', isRace = mode === 'race', isStats = mode === 'stats';

    el.soloView.hidden = !isSolo;
    el.raceView.hidden = !isRace;
    el.statsView.hidden = !isStats;
    el.algos.hidden = !isSolo;
    el.inspector.hidden = !isSolo;
    el.workbench.classList.toggle('is-race', isRace);
    el.workbench.classList.toggle('is-stats', isStats);

    if (isRace) {
      player.pause();
      el.stageTitle.textContent = '線形探索 vs 二分探索';
      el.stageSummary.textContent = '同じ配列・同じ探す値で、2つの探索を同時に走らせます。';
      rebuildRace();
    } else if (isStats) {
      player.pause();
      race.pause();
      el.stageTitle.textContent = '平均比較回数';
      el.stageSummary.textContent = '配列の本数を変えて、線形探索と二分探索の差を確かめましょう。';
      rebuildStats();
    } else {
      race.pause();
      rebuild();
    }
  }

  /* ---------------- 速度 ---------------- */

  function setSpeed(v) {
    player.setSpeed(v);
    race.setSpeed(v);
    var buttons = el.speedSet.querySelectorAll('[data-speed]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed',
        String(Number(buttons[i].getAttribute('data-speed')) === v));
    }
  }

  /* ---------------- コードのコピー ---------------- */

  function flash(button, message, ok) {
    var original = button.getAttribute('data-label') || button.textContent;
    button.setAttribute('data-label', original);
    button.setAttribute('data-state', ok ? 'success' : 'error');
    button.textContent = message;
    setTimeout(function () {
      button.removeAttribute('data-state');
      button.textContent = original;
    }, 1600);
  }

  function copyCode() {
    var text = state.model.text;
    var done = function () { flash(el.btnCopy, '✓ コピーしました', true); };
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
      flash(el.btnCopy, ok ? '✓ コピーしました' : '× コピーできません', ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  /* ---------------- キーボード ---------------- */

  function onKey(e) {
    var t = e.target;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (state.mode === 'stats') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (state.mode === 'race') {
        if (race.playing) { race.pause(); el.raceBtnPlay.textContent = '▶ 再開'; }
        else { startRace(); }
      } else {
        player.toggle();
      }
    }
    else if (state.mode === 'solo' && e.key === 'ArrowLeft')  { e.preventDefault(); player.pause(); player.prev(); }
    else if (state.mode === 'solo' && e.key === 'ArrowRight') { e.preventDefault(); player.pause(); player.next(); }
    else if (e.key === 'r' || e.key === 'R') { newData(); }
  }

  /* ---------------- 初期化（onEnterで初回だけ） ---------------- */

  function init() {
    [
      'algos', 'presets', 'stageTitle', 'stageSummary', 'chart', 'narration',
      'seek', 'btnPlay', 'btnPrev', 'btnNext', 'btnReset', 'speedSet',
      'code', 'chkFull', 'btnCopy', 'watch',
      'cntCompare', 'cntTheory', 'cntOrder', 'legend',
      'soloView', 'raceView', 'statsView', 'inspector', 'modeSwitch',
      'raceStatusA', 'raceStatusB', 'raceChartA', 'raceChartB',
      'raceStepA', 'raceStepB', 'raceTotalA', 'raceTotalB',
      'raceCompareA', 'raceCompareB', 'raceBtnPlay', 'raceBtnReset',
      'statsN', 'statsTable', 'statsBars', 'statsNote',
      'count', 'btnShuffle', 'targetSwitch'
    ].forEach(function (name) {
      var id = 'search' + name.charAt(0).toUpperCase() + name.slice(1);
      el[name] = $(id);
    });
    el.workbench = $('searchWorkbench');

    player.onChange = onChange;
    player.onStateChange = onPlayState;
    race.onTick = onRaceTick;
    race.onFinish = onRaceFinish;

    SV.render.buildLegend(el.legend, LEGEND_ITEMS);
    buildAlgoTabs();
    buildPresetButtons();

    el.btnPlay.addEventListener('click', function () { player.toggle(); });
    el.btnPrev.addEventListener('click', function () { player.pause(); player.prev(); });
    el.btnNext.addEventListener('click', function () { player.pause(); player.next(); });
    el.btnReset.addEventListener('click', function () { player.pause(); player.seek(0); });
    el.btnShuffle.addEventListener('click', newData);
    el.btnCopy.addEventListener('click', copyCode);

    el.modeSwitch.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-mode]') : null;
      if (btn) setMode(btn.getAttribute('data-mode'));
    });

    el.raceBtnPlay.addEventListener('click', function () {
      if (race.playing) {
        race.pause();
        el.raceBtnPlay.textContent = '▶ 再開';
      } else {
        startRace();
      }
    });
    el.raceBtnReset.addEventListener('click', function () {
      race.reset();
      raceFinished = false;
      resetRaceStatus();
      renderRaceLane(0, race.lanes[0]);
      renderRaceLane(1, race.lanes[1]);
    });

    el.seek.addEventListener('input', function () {
      player.pause();
      player.seek(Number(el.seek.value));
    });

    el.speedSet.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-speed]') : null;
      if (!btn) return;
      setSpeed(Number(btn.getAttribute('data-speed')));
    });

    el.count.addEventListener('change', function () {
      state.n = Number(el.count.value);
      newData();
    });

    el.chkFull.addEventListener('change', function () {
      state.showFullCode = el.chkFull.checked;
      SV.render.setCodeScope(state.codeView, state.model, state.showFullCode);
      var step = player.current();
      if (step) SV.render.setActiveLine(el.code, state.codeView, step.line);
    });

    el.targetSwitch.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-target]') : null;
      if (!btn) return;
      var mode = btn.getAttribute('data-target');
      if (mode === state.targetMode) return;
      state.targetMode = mode;
      syncTargetButtons();
      newTarget();
    });

    state.n = Number(el.count.value);
    setSpeed(Number(el.speedSet.querySelector('[aria-pressed="true"]').getAttribute('data-speed')));

    initialized = true;
  }

  /* ---------------- 公開API ---------------- */
  /* キーボードショートカットは、この画面が表示されている間だけ有効にする
   * （sortWorkbench 側にも同じスペース/矢印/Rのハンドラがあるため、
   * topic切り替え後も残ったままだと二重発火する）。onEnter/onExitで
   * addEventListener / removeEventListener を対にする。 */

  function onEnter() {
    if (!initialized) init();
    document.addEventListener('keydown', onKey);
    newData();
    onPlayState(player);
  }

  function onExit() {
    document.removeEventListener('keydown', onKey);
    player.pause();
    race.pause();
  }

  SV.Search = { onEnter: onEnter, onExit: onExit };
})(window.SV);
