/* 화면 3: 조치사항 (관제일지 엑셀 → 주요사건 굵게 자동 반영) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, h = U.h, UI = App.UI, CATS = App.Classify.CATS;

  let filter = { kind: '', q: '', majorOnly: false, selOnly: false };
  let dragId = '';
  let curUi = null;

  /* 보고서에 들어갈 줄의 순서는 ord 번호로 관리한다(기본은 시각순, 위·아래 이동과 끌어놓기로 바꿀 수 있다) */
  const byOrd = (a, b) => (a.ord - b.ord) || (a.t - b.t);
  const selSorted = () => App.S.lines.filter((l) => l.selected).sort(byOrd);
  const renumber = (list) => { list.forEach((l, i) => { l.ord = i + 1; }); };
  /* 후보에서 체크한 줄은 시각이 맞는 자리에 끼워 넣는다 */
  function insertByTime(line) {
    const list = selSorted().filter((x) => x !== line); let at = 0;
    list.forEach((x, i) => { if (x.t <= line.t) at = i + 1; });
    list.splice(at, 0, line); renumber(list);
  }
  function newManual() {
    const now = Date.now();
    return { id: 'm' + now + Math.floor(Math.random() * 1000), manual: true, t: now, timeLabel: U.fmtHM(now), kind: '', cat: '', actor: '상황실', text: '', raw: '', bold: false, selected: true, ord: 0 };
  }

  function baseMs() { return App.S.log.baseMs || Date.now(); }
  function parseHM(label) {
    const m = String(label).match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (!m) return null;
    const d = new Date(baseMs()); d.setHours(+m[1], +m[2], 0, 0); return d.getTime();
  }

  /* ── 파일 올리기 ── */
  async function onFile(file, ui) {
    if (!file) return;
    const has = App.S.lines.some((l) => !l.manual);
    if (has && !(await U.confirmDialog('이미 불러온 관제일지가 있습니다. 새 파일로 바꾸면 조치사항에서 고친 내용(체크·굵게·문장)이 초기화됩니다. 직접 추가한 줄은 유지됩니다. 계속할까요?', '바꾸기'))) return;
    ui.status.textContent = '읽는 중…'; ui.status.className = 'file-status';
    try {
      const { events, receiveMs, meta } = await App.Excel.parseFile(file);
      const { lines, baseMs: bm } = App.Classify.buildLines(events);
      lines.forEach((l) => { l.ord = l.t; });
      App.S.lines = App.S.lines.filter((l) => l.manual).concat(lines);
      renumber(selSorted().sort((a, b) => a.t - b.t));
      const auto = App.Auto.analyze(events, meta);
      App.S.log = { fileName: file.name, baseMs: bm, receiveTime: U.fmtHM(receiveMs), receiveMs: (meta && meta.receiveMs) || receiveMs, count: events.length, auto };
      App.Auto.applyTo(App.S); /* 직접 고친 칸은 유지하고 나머지만 자동 기입 */
      if (App.S.mapAuto && App.Maps) App.Maps.autoFill({ silent: true }); /* 비어 있는 위치도·건물전경 칸에 지도 자동 */
      /* 접수시간을 직접 고쳤다면 그 값은 유지한다 */
      drawAll(ui); App.State.changed('log');
      U.toast(`${events.length}건을 불러왔습니다. 주요사건 ${lines.filter((l) => l.selected).length}건과 사건정보·동원현황이 자동 반영되었습니다.`);
    } catch (e) {
      ui.status.textContent = e.message; ui.status.className = 'file-status err'; U.toast(e.message, 'err');
    }
  }

  function statusText() {
    const L = App.S.log;
    if (!L.fileName) return '아직 불러온 파일이 없습니다.';
    const sel = App.S.lines.filter((l) => !l.manual && l.selected).length, maj = App.S.lines.filter((l) => l.cat && l.selected).length;
    return `${L.fileName} · ${L.count}건 · 보고서 반영 ${sel}건(자동 주요사건 ${maj}건)`;
  }

  /* ── 보고서에 들어갈 조치사항 목록 ── */
  function focusRow(ui, index, sel) {
    const rows = ui.selected.querySelectorAll('.act-row');
    const row = rows[Math.max(0, Math.min(index, rows.length - 1))];
    const el = row && row.querySelector(sel);
    if (el && !el.disabled) el.focus(); else if (row) { const alt = row.querySelector('.act-text'); if (alt) alt.focus(); }
  }
  function moveLine(line, d, ui) {
    const list = selSorted(), i = list.indexOf(line), j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(i, 1); list.splice(j, 0, line); renumber(list);
    App.State.changed('line'); drawSelected(ui);
    focusRow(ui, j, d < 0 ? '.mv-up' : '.mv-down');
  }
  function addManualAt(index, ui) {
    const list = selSorted(), l = newManual();
    App.S.lines.push(l); list.splice(Math.max(0, Math.min(index, list.length)), 0, l); renumber(list);
    drawSelected(ui); App.State.changed('line');
    focusRow(ui, list.indexOf(l), '.act-text');
  }
  function dropLine(target, after, ui) {
    const list = selSorted(), from = list.find((x) => x.id === dragId);
    if (!from || from === target) return;
    list.splice(list.indexOf(from), 1);
    list.splice(list.indexOf(target) + (after ? 1 : 0), 0, from); renumber(list);
    App.State.changed('line'); drawSelected(ui);
  }

  function drawSelected(ui) {
    const sel = selSorted();
    ui.selCount.textContent = sel.length + '줄';
    ui.selected.replaceChildren(...(sel.length ? sel.map((l, idx) => {
      const row = h('div', { class: 'act-row' + (l.bold ? ' is-bold' : '') + (l.cat ? ' is-major' : '') });
      const handle = h('span', { class: 'drag-handle', draggable: true, title: '끌어서 순서 변경', 'aria-hidden': 'true', text: '≡' });
      handle.addEventListener('dragstart', (ev) => { dragId = l.id; row.classList.add('dragging'); try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', l.id); ev.dataTransfer.setDragImage(row, 12, 12); } catch (_) { /* 무시 */ } });
      handle.addEventListener('dragend', () => { dragId = ''; row.classList.remove('dragging'); U.$$('.drop-above,.drop-below', ui.selected).forEach((r) => r.classList.remove('drop-above', 'drop-below')); });
      row.addEventListener('dragover', (ev) => {
        if (!dragId) return;
        ev.preventDefault();
        const r = row.getBoundingClientRect(), after = ev.clientY > r.top + r.height / 2;
        row.classList.toggle('drop-below', after); row.classList.toggle('drop-above', !after);
      });
      row.addEventListener('dragleave', (ev) => { if (!row.contains(ev.relatedTarget)) row.classList.remove('drop-above', 'drop-below'); });
      row.addEventListener('drop', (ev) => {
        if (!dragId) return;
        ev.preventDefault();
        const after = row.classList.contains('drop-below'); row.classList.remove('drop-above', 'drop-below');
        dropLine(l, after, ui);
      });
      const time = h('input', { type: 'text', class: 'act-time', value: l.timeLabel, maxLength: 24, 'aria-label': '시각', oninput: (e) => { l.timeLabel = e.target.value; App.State.changed('line'); }, onchange: () => { if (l.manual) { const t = parseHM(l.timeLabel); if (t != null) l.t = t; } } });
      const actor = h('input', { type: 'text', class: 'act-actor', value: l.actor, maxLength: 30, 'aria-label': '주체', placeholder: '주체', oninput: (e) => { l.actor = e.target.value; App.State.changed('line'); } });
      const text = h('textarea', { class: 'act-text', rows: 1, 'aria-label': '내용', oninput: (e) => { l.text = e.target.value; autoGrow(e.target); App.State.changed('line'); } });
      text.value = l.text;
      const up = h('button', { type: 'button', class: 'btn-mini mv-up', title: '한 칸 위로', 'aria-label': `${idx + 1}번째 줄 위로 이동`, disabled: idx === 0, onclick: () => moveLine(l, -1, ui), text: '▲' });
      const down = h('button', { type: 'button', class: 'btn-mini mv-down', title: '한 칸 아래로', 'aria-label': `${idx + 1}번째 줄 아래로 이동`, disabled: idx === sel.length - 1, onclick: () => moveLine(l, 1, ui), text: '▼' });
      const addBelow = h('button', { type: 'button', class: 'btn-mini add-below', title: '이 줄 바로 아래에 새 줄 추가', 'aria-label': `${idx + 1}번째 줄 아래에 새 줄 추가`, onclick: () => addManualAt(selSorted().indexOf(l) + 1, ui), text: '+ 아래 추가' });
      const bold = h('button', { type: 'button', class: 'btn-mini bold-btn', 'aria-pressed': l.bold, title: '굵은 줄로 강조', onclick: () => { l.bold = !l.bold; row.classList.toggle('is-bold', l.bold); bold.setAttribute('aria-pressed', l.bold); App.State.changed('line'); }, text: '굵게' });
      const del = h('button', { type: 'button', class: 'btn-mini', title: '보고서에서 빼기', onclick: () => { if (l.manual) App.S.lines = App.S.lines.filter((x) => x !== l); else l.selected = false; renumber(selSorted()); drawSelected(ui); drawCands(ui); ui.status.textContent = statusText(); App.State.changed('line'); }, text: '빼기' });
      setTimeout(() => autoGrow(text), 0);
      row.append(handle, time, actor, text, h('div', { class: 'act-btns' }, up, down, addBelow, bold, del));
      return row;
    }) : [h('p', { class: 'empty', text: '보고서에 들어갈 조치사항이 없습니다. 상단의 [관제일지 엑셀 올리기]를 누르거나 [+ 직접 추가]를 누르세요.' })]));
  }
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(200, t.scrollHeight + 2) + 'px'; }

  /* ── 관제일지 전체(후보) ── */
  function drawCands(ui) {
    const all = App.S.lines.filter((l) => !l.manual);
    const kinds = Array.from(new Set(all.map((l) => l.kind).filter(Boolean)));
    ui.chips.replaceChildren(...['', ...kinds].map((k) => h('button', { type: 'button', class: 'chip' + (filter.kind === k ? ' on' : ''), 'aria-pressed': filter.kind === k, onclick: () => { filter.kind = k; drawCands(ui); }, text: k || '전체' })));
    const q = filter.q.trim();
    const rows = all.filter((l) => (!filter.kind || l.kind === filter.kind) && (!filter.majorOnly || l.cat) && (!filter.selOnly || l.selected) && (!q || (l.raw + ' ' + l.actor + ' ' + l.text).includes(q)));
    ui.candCount.textContent = `${rows.length} / ${all.length}건`;
    ui.cands.replaceChildren(...(rows.length ? rows.slice(0, 1500).map((l) => h('tr', { class: l.cat ? 'major' : '' },
      h('td', {}, h('input', { type: 'checkbox', checked: l.selected, 'aria-label': `${l.timeLabel} ${l.kind} 보고서에 넣기`, onchange: (e) => { l.selected = e.target.checked; if (!l.selected) l.bold = false; else { if (l.cat) l.bold = true; insertByTime(l); } drawSelected(ui); ui.status.textContent = statusText(); App.State.changed('line'); } })),
      h('td', { class: 'nowrap', text: l.timeLabel }), h('td', { class: 'nowrap', text: l.kind }),
      h('td', {}, l.cat ? h('span', { class: 'cat', text: CATS[l.cat] }) : null),
      h('td', { class: 'raw', text: l.raw }))) : [h('tr', {}, h('td', { colspan: 5, class: 'empty', text: all.length ? '조건에 맞는 항목이 없습니다.' : '관제일지를 불러오면 여기에 전체 내용이 나옵니다.' }))]));
  }

  function drawAll(ui) { ui.status.textContent = statusText(); ui.status.className = 'file-status' + (App.S.log.fileName ? ' ok' : ''); drawSelected(ui); drawCands(ui); }

  function build(root) {
    const ui = {
      status: U.$('#log-status') || h('p', { class: 'file-status', role: 'status' }),
      selected: h('div', { class: 'act-list' }), selCount: h('output', { class: 'count' }),
      chips: h('div', { class: 'chips', role: 'group', 'aria-label': '상황구분 거르기' }),
      cands: h('tbody'), candCount: h('output', { class: 'count' }),
    };
    curUi = ui;
    const search = h('input', { type: 'search', placeholder: '내용 검색', 'aria-label': '관제일지 내용 검색', oninput: (e) => { filter.q = e.target.value; drawCands(ui); } });
    const chk = (label, key) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: filter[key], onchange: (e) => { filter[key] = e.target.checked; drawCands(ui); } }), ' ' + label);

    root.replaceChildren(
      UI.card('보고서에 들어갈 조치사항', '관제일지는 화면 맨 위의 [관제일지 엑셀 올리기]로 올립니다. 주요사건은 자동으로 들어가며 굵은 줄입니다. 문장·주체·시각을 고치고, [굵게]로 강조를 켜고 끌 수 있습니다. 순서는 위·아래로 옮길 수 있습니다.',
        h('details', { class: 'cat-help' }, h('summary', { text: '자동으로 굵게 표시되는 주요 조치사항 12가지' }),
          h('ul', {}, Object.values(CATS).map((c) => h('li', { text: c })))),
        h('div', { class: 'toolbar' }, ui.selCount,
          h('button', { type: 'button', class: 'btn', onclick: () => addManualAt(selSorted().length, ui), text: '+ 직접 추가' }),
          h('button', { type: 'button', class: 'btn', onclick: () => addManualAt(0, ui), text: '+ 맨 위에 추가' }),
          h('span', { class: 'hint', text: '줄 왼쪽 ≡ 를 끌어 놓거나 ▲▼로 순서를 바꾸고, [+ 아래 추가]로 원하는 위치에 새 줄을 넣을 수 있습니다.' })),
        ui.selected),
      App.Etc.card(),
      UI.card('관제일지 전체', '체크하면 보고서에 들어가고, 해제하면 빠집니다. 주요사건은 연한 파란색 줄입니다.',
        h('div', { class: 'toolbar' }, ui.chips),
        h('div', { class: 'toolbar' }, search, chk('주요사건만', 'majorOnly'), chk('선택된 것만', 'selOnly'), ui.candCount),
        h('div', { class: 'table-wrap tall' }, h('table', { class: 'grid-table cand-table' },
          h('caption', { class: 'sr-only', text: '관제일지 전체 목록' }),
          h('thead', {}, h('tr', {}, ['선택', '시각', '상황구분', '주요', '진행상황 (원문)'].map((t) => h('th', { text: t })))), ui.cands))),
      UI.navButtons('status', 'preview'));
    drawAll(ui);
  }
  App.Actions = { build, upload: (file) => { if (curUi) return onFile(file, curUi); return null; } };
})();
