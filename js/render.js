/* render.js — DOM描画。棒グラフ・コードペイン・変数ウォッチ・カウンタ。
 * 棒は毎ステップ作り直さず、最初に作って属性だけ差し替える。 */
window.SV = window.SV || {};
(function (SV) {
  'use strict';

  var DENSE_AT = 24;          // これを超えたら数値ラベルを隠す（潰れて逆に読めなくなる）
  var H_BASE = 6;             // 最小の棒でも見えるように下駄をはかせる（%）
  var H_SPAN = 84;

  /* ---------------- 棒グラフ ---------------- */

  function buildChart(el, values) {
    var frag = document.createDocumentFragment();
    var n = values.length;
    el.innerHTML = '';
    el.setAttribute('data-dense', n > DENSE_AT ? 'true' : 'false');

    for (var i = 0; i < n; i++) {
      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('data-state', 'idle');

      var track = document.createElement('div');
      track.className = 'bar__track';

      var value = document.createElement('span');
      value.className = 'bar__value';

      var col = document.createElement('span');
      col.className = 'bar__col';

      var index = document.createElement('span');
      index.className = 'bar__index';
      index.textContent = String(i);

      track.appendChild(value);
      track.appendChild(col);
      bar.appendChild(track);
      bar.appendChild(index);
      frag.appendChild(bar);
    }
    el.appendChild(frag);
    return {
      bars: Array.prototype.slice.call(el.children),
      max: Math.max.apply(null, values.concat([1]))
    };
  }

  function stateOf(step, i) {
    var m = step.mark;
    if (m.swap && m.swap.indexOf(i) >= 0) return 'swap';
    if (m.compare && m.compare.indexOf(i) >= 0) return 'compare';
    if (m.pivot === i) return 'pivot';
    if (step.sorted[i]) return 'sorted';
    return 'idle';
  }

  function updateChart(view, step) {
    var bars = view.bars, a = step.array, i, bar, h;
    for (i = 0; i < bars.length; i++) {
      bar = bars[i];
      h = H_BASE + (a[i] / view.max) * H_SPAN;
      bar.style.setProperty('--h', h.toFixed(2) + '%');
      bar.firstChild.firstChild.textContent = String(a[i]);
      bar.setAttribute('data-state', stateOf(step, i));
      if (step.mark.cursor && step.mark.cursor.indexOf(i) >= 0) {
        bar.setAttribute('data-cursor', 'true');
      } else {
        bar.removeAttribute('data-cursor');
      }
    }
  }

  /* ---------------- コードペイン ---------------- */

  function buildCode(el, model) {
    var frag = document.createDocumentFragment();
    el.innerHTML = '';
    for (var i = 0; i < model.display.length; i++) {
      var li = document.createElement('li');
      li.className = 'code__line';
      li.setAttribute('data-line', String(i + 1));

      var no = document.createElement('span');
      no.className = 'code__no';
      no.textContent = String(i + 1);

      var src = document.createElement('span');
      src.className = 'code__src';
      src.innerHTML = SV.highlightVba(model.display[i]) || '&nbsp;';

      li.appendChild(no);
      li.appendChild(src);
      frag.appendChild(li);
    }
    el.appendChild(frag);
    return { lines: Array.prototype.slice.call(el.children), active: null };
  }

  function setCodeScope(view, model, showAll) {
    for (var i = 0; i < view.lines.length; i++) {
      var no = i + 1;
      var visible = showAll || (no >= model.coreFrom && no <= model.coreTo);
      view.lines[i].classList.toggle('is-hidden', !visible);
    }
  }

  function setActiveLine(el, view, line) {
    if (view.active) view.active.classList.remove('is-active');
    var li = view.lines[line - 1];
    view.active = li || null;
    if (!li) return;
    li.classList.add('is-active');

    var top = li.offsetTop - el.offsetTop;
    var bottom = top + li.offsetHeight;
    if (top < el.scrollTop) {
      el.scrollTop = top - 8;
    } else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom - el.clientHeight + 8;
    }
  }

  /* ---------------- 変数ウォッチ ---------------- */

  function buildWatch(el, watchVars) {
    var map = {};
    el.innerHTML = '';
    for (var i = 0; i < watchVars.length; i++) {
      var name = watchVars[i];
      var item = document.createElement('div');
      item.className = 'watch__item';

      var k = document.createElement('span');
      k.className = 'watch__k';
      k.textContent = name;

      var v = document.createElement('span');
      v.className = 'watch__v';
      v.textContent = '-';

      item.appendChild(k);
      item.appendChild(v);
      el.appendChild(item);
      map[name] = { item: item, value: v, shown: '-' };
    }
    return map;
  }

  function updateWatch(map, vars) {
    for (var name in map) {
      if (!Object.prototype.hasOwnProperty.call(map, name)) continue;
      var slot = map[name];
      var raw = vars[name];
      var text = (raw === null || raw === undefined) ? '-' : String(raw);
      var changed = text !== slot.shown;
      slot.shown = text;
      slot.value.textContent = text;
      slot.item.classList.toggle('is-changed', changed && text !== '-');
    }
  }

  /* ---------------- 実況・カウンタ ---------------- */

  function updateNarration(el, step, index, total) {
    el.innerHTML = '';
    var tag = document.createElement('span');
    tag.className = 'narration__step';
    tag.textContent = 'step ' + index + ' / ' + Math.max(0, total - 1) +
                      '  ·  line ' + step.line;
    el.appendChild(tag);
    el.appendChild(document.createTextNode(step.narration));
  }

  function buildLegend(el) {
    var items = [
      ['idle', '未処理'],
      ['compare', '比較中'],
      ['swap', '交換中'],
      ['pivot', '基準 / 最小の候補'],
      ['sorted', '確定済み']
    ];
    el.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var wrap = document.createElement('span');
      wrap.className = 'legend__item';

      var sw = document.createElement('span');
      sw.className = 'legend__swatch';
      sw.style.background = 'var(--bar-' + items[i][0] + ')';
      sw.style.borderTopColor = 'var(--bar-' + items[i][0] + '-edge)';

      var label = document.createElement('span');
      label.textContent = items[i][1];

      wrap.appendChild(sw);
      wrap.appendChild(label);
      el.appendChild(wrap);
    }
  }

  SV.render = {
    DENSE_AT: DENSE_AT,
    buildChart: buildChart,
    updateChart: updateChart,
    buildCode: buildCode,
    setCodeScope: setCodeScope,
    setActiveLine: setActiveLine,
    buildWatch: buildWatch,
    updateWatch: updateWatch,
    updateNarration: updateNarration,
    buildLegend: buildLegend
  };
})(window.SV);
