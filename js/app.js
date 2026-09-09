/* app.js — UIの配線。 */
(function (SV) {
  'use strict';

  var ORDER = ['bubble', 'selection', 'insertion', 'shell', 'quick'];
  var TIER_LABEL = { basic: 'まず理解する', advanced: '動きを見る' };

  var el = {};
  var player = new SV.Player();
  var race = new SV.Race();
  var state = {
    algoId: ORDER[0],
    presetId: 'random',
    n: 12,
    values: [],
    model: null,
    chartView: null,
    codeView: null,
    watchMap: null,
    showFullCode: false,
    raceOn: false,
    raceViewA: null,
    raceViewB: null
  };
  var raceAlgo = { a: 'bubble', b: 'quick' };
  var raceFinished = false; // どちらかが完走した後は、再生ボタンで「最初から」やり直す

  function $(id) { return document.getElementById(id); }
  function algo() { return SV.algorithms[state.algoId]; }

  /* ---------------- 組み立て ---------------- */

  function buildAlgoTabs() {
    var tiers = {}, order = [];
    ORDER.forEach(function (id) {
      var a = SV.algorithms[id];
      if (!a) return;
      if (!tiers[a.tier]) { tiers[a.tier] = []; order.push(a.tier); }
      tiers[a.tier].push(a);
    });

    el.algos.innerHTML = '';
    order.forEach(function (tier) {
      var group = document.createElement('div');
      group.className = 'algos__group';

      var label = document.createElement('span');
      label.className = 'algos__tier';
      label.textContent = TIER_LABEL[tier] || tier;
      group.appendChild(label);

      tiers[tier].forEach(function (a) {
        var b = document.createElement('button');
        b.className = 'btn btn--sm';
        b.type = 'button';
        b.textContent = a.name;
        b.setAttribute('data-algo', a.id);
        b.setAttribute('aria-selected', String(a.id === state.algoId));
        b.addEventListener('click', function () {
          if (state.algoId === a.id) return;
          state.algoId = a.id;
          syncAlgoTabs();
          rebuild();
        });
        group.appendChild(b);
      });
      el.algos.appendChild(group);
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
    SV.presets.order.forEach(function (id) {
      var b = document.createElement('button');
      b.className = 'btn btn--sm';
      b.type = 'button';
      b.textContent = SV.presets.labels[id];
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

  /* ---------------- 生成 ---------------- */

  function newData() {
    state.values = SV.presets.make(state.presetId, state.n);
    if (state.raceOn) rebuildRace(); else rebuild();
  }

  function rebuild() {
    var A = algo();
    state.model = SV.buildVba(A.vba(state.n));

    var rec = new SV.Recorder(state.values, A.watchVars);
    try {
      A.generate(rec, state.model.lines);
    } catch (err) {
      el.narration.textContent = '生成に失敗しました: ' + err.message;
      return;
    }

    state.chartView = SV.render.buildChart(el.chart, state.values);
    state.codeView = SV.render.buildCode(el.code, state.model);
    SV.render.setCodeScope(state.codeView, state.model, state.showFullCode);
    state.watchMap = SV.render.buildWatch(el.watch, A.watchVars);

    el.stageTitle.textContent = A.name;
    el.stageSummary.textContent = A.summary;
    el.cntOrder.textContent = A.order;
    el.cntTheory.textContent = A.theoryLabel
      ? A.theoryLabel(state.n)
      : '最悪 ' + A.theoryCompare(state.n) + ' 回 = ' + A.theoryNote + '（n=' + state.n + '）';
    el.seek.max = String(Math.max(0, rec.steps.length - 1));
    el.seek.value = '0';

    player.load(rec.steps);
  }

  /* ---------------- レース ---------------- */

  function buildRaceSelects() {
    function fill(select, current) {
      select.innerHTML = '';
      ORDER.forEach(function (id) {
        var a = SV.algorithms[id];
        if (!a) return;
        var opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        if (a.id === current) opt.setAttribute('selected', 'selected');
        select.appendChild(opt);
      });
    }
    fill(el.raceSelectA, raceAlgo.a);
    fill(el.raceSelectB, raceAlgo.b);

    el.raceSelectA.addEventListener('change', function () {
      raceAlgo.a = el.raceSelectA.value;
      rebuildRace();
    });
    el.raceSelectB.addEventListener('change', function () {
      raceAlgo.b = el.raceSelectB.value;
      rebuildRace();
    });
  }

  function raceLane(algoId, values) {
    var A = SV.algorithms[algoId];
    var model = SV.buildVba(A.vba(values.length));
    var rec = new SV.Recorder(values.slice(), A.watchVars);
    A.generate(rec, model.lines);
    return rec.steps;
  }

  function renderRaceLane(i, lane) {
    var view = i === 0 ? state.raceViewA : state.raceViewB;
    var step = lane.steps[lane.index];
    SV.render.updateChart(view, step);
    (i === 0 ? el.raceStepA : el.raceStepB).textContent = String(lane.index);
    (i === 0 ? el.raceCompareA : el.raceCompareB).textContent = String(step.counters.compare);
    (i === 0 ? el.raceSwapA : el.raceSwapB).textContent = String(step.counters.swap);
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
    var stepsA = raceLane(raceAlgo.a, state.values);
    var stepsB = raceLane(raceAlgo.b, state.values);

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
  }

  function onRaceFinish(winner, lanes) {
    var names = [SV.algorithms[raceAlgo.a].name, SV.algorithms[raceAlgo.b].name];
    var statusEls = [el.raceStatusA, el.raceStatusB];
    var other = winner === 0 ? 1 : 0;

    statusEls[winner].textContent = '🏁 ' + names[winner] + ' が先にゴール！';
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

  function toggleRace() {
    state.raceOn = !state.raceOn;
    el.btnRace.setAttribute('aria-pressed', String(state.raceOn));
    el.soloView.hidden = state.raceOn;
    el.raceView.hidden = !state.raceOn;
    el.algos.hidden = state.raceOn;
    el.inspector.hidden = state.raceOn;
    el.workbench.classList.toggle('is-race', state.raceOn);

    if (state.raceOn) {
      player.pause();
      el.stageTitle.textContent = 'レース';
      el.stageSummary.textContent = '同じ初期データを、2つのアルゴリズムで同時に並べ替えます。';
      rebuildRace();
    } else {
      race.pause();
      rebuild();
    }
  }

  /* ---------------- 描画 ---------------- */

  function onChange(step, index, total) {
    if (!step) return;
    SV.render.updateChart(state.chartView, step);
    SV.render.setActiveLine(el.code, state.codeView, step.line);
    SV.render.updateWatch(state.watchMap, step.vars);
    SV.render.updateNarration(el.narration, step, index, total);
    el.cntCompare.textContent = String(step.counters.compare);
    el.cntSwap.textContent = String(step.counters.swap);
    el.seek.value = String(index);
    el.btnPrev.disabled = index <= 0;
    el.btnNext.disabled = index >= total - 1;
  }

  function onPlayState(p) {
    el.btnPlay.textContent = p.playing ? '⏸ 一時停止' : '▶ 再生';
    el.btnPlay.setAttribute('aria-pressed', String(p.playing));
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

    if (e.code === 'Space') {
      e.preventDefault();
      if (state.raceOn) {
        if (race.playing) { race.pause(); el.raceBtnPlay.textContent = '▶ 再開'; }
        else { startRace(); }
      } else {
        player.toggle();
      }
    }
    else if (!state.raceOn && e.key === 'ArrowLeft')  { e.preventDefault(); player.pause(); player.prev(); }
    else if (!state.raceOn && e.key === 'ArrowRight') { e.preventDefault(); player.pause(); player.next(); }
    else if (e.key === 'r' || e.key === 'R') { newData(); }
  }

  /* ---------------- 起動 ---------------- */

  function init() {
    ['algos', 'presets', 'stageTitle', 'stageSummary', 'chart', 'narration',
     'seek', 'btnPlay', 'btnPrev', 'btnNext', 'btnReset', 'speed', 'speedOut',
     'count', 'btnShuffle', 'code', 'chkFull', 'btnCopy', 'watch',
     'cntCompare', 'cntSwap', 'cntTheory', 'cntOrder', 'legend',
     'soloView', 'raceView', 'inspector', 'workbench', 'btnRace',
     'raceSelectA', 'raceSelectB', 'raceStatusA', 'raceStatusB',
     'raceChartA', 'raceChartB', 'raceStepA', 'raceStepB',
     'raceTotalA', 'raceTotalB', 'raceCompareA', 'raceCompareB',
     'raceSwapA', 'raceSwapB', 'raceBtnPlay', 'raceBtnReset'
    ].forEach(function (id) { el[id] = $(id); });
    el.workbench = document.querySelector('.workbench');

    player.onChange = onChange;
    player.onStateChange = onPlayState;
    race.onTick = onRaceTick;
    race.onFinish = onRaceFinish;

    SV.render.buildLegend(el.legend);
    buildAlgoTabs();
    buildPresetButtons();
    buildRaceSelects();

    el.btnPlay.addEventListener('click', function () { player.toggle(); });
    el.btnPrev.addEventListener('click', function () { player.pause(); player.prev(); });
    el.btnNext.addEventListener('click', function () { player.pause(); player.next(); });
    el.btnReset.addEventListener('click', function () { player.pause(); player.seek(0); });
    el.btnShuffle.addEventListener('click', newData);
    el.btnCopy.addEventListener('click', copyCode);
    el.btnRace.addEventListener('click', toggleRace);

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

    el.speed.addEventListener('input', function () {
      var v = Number(el.speed.value);
      player.setSpeed(v);
      race.setSpeed(v);
      el.speedOut.textContent = v + '/秒';
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

    document.addEventListener('keydown', onKey);

    state.n = Number(el.count.value);
    player.setSpeed(Number(el.speed.value));
    race.setSpeed(Number(el.speed.value));
    el.speedOut.textContent = el.speed.value + '/秒';
    newData();
    onPlayState(player);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.SV);
