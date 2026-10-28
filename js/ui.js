/* 화면 공통 부품: 입력 칸(자동/수정됨 표시), 탭, 상단바 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, h = U.h;
  const refreshers = [];

  /* 입력 칸 한 줄. 자동기입 항목은 [자동]/[수정됨] 표시와 되돌리기 버튼을 갖는다 */
  function field(o) {
    const id = 'f-' + o.key;
    const auto = App.Fields.isAuto(o.key);
    const input = o.multiline
      ? h('textarea', { id, rows: o.rows || 4, placeholder: o.placeholder || '' })
      : h('input', { id, type: o.type || 'text', placeholder: o.placeholder || '', list: o.list || null, autocomplete: 'off', inputMode: o.inputMode || null, maxLength: o.max || 500 });
    const badge = h('span', { class: 'badge', 'aria-hidden': 'true' });
    const reset = h('button', { type: 'button', class: 'btn-mini', title: '자동값으로 되돌리기', hidden: true, onclick: () => { App.Fields.reset(App.S, o.key); input.value = App.Fields.get(App.S, o.key); App.State.changed(o.key); } }, o.resetLabel || '↺ 자동값');
    const hint = o.hint ? h('small', { class: 'hint', text: o.hint }) : null;
    const wrap = h('div', { class: 'field ' + (o.wide ? 'wide ' : '') + (o.cls || '') },
      h('label', { for: id }, o.label, o.required ? h('span', { class: 'req', 'aria-label': '필수' }, ' *') : null),
      h('div', { class: 'field-row' }, input, auto ? badge : null, auto ? reset : null, o.extra || null), hint);
    input.addEventListener('input', () => { if (o.digits) { const d = input.value.replace(/[^\d]/g, ''); if (d !== input.value) input.value = d; } App.Fields.set(App.S, o.key, input.value); App.State.changed(o.key); });
    const refresh = () => {
      const v = App.Fields.get(App.S, o.key);
      if (document.activeElement !== input && input.value !== v) input.value = v;
      if (auto) {
        const lk = App.Fields.isLocked(o.key);
        badge.textContent = lk ? '수정됨' : '자동';
        badge.className = 'badge ' + (lk ? 'badge-edit' : 'badge-auto');
        reset.hidden = !lk;
        wrap.classList.toggle('is-auto', !lk);
      }
    };
    refreshers.push(refresh); refresh();
    return wrap;
  }
  const refreshAll = () => refreshers.forEach((f) => f());
  App.on('change', refreshAll);

  function card(title, desc, ...kids) {
    return h('section', { class: 'card' }, h('h2', { text: title }), desc ? h('p', { class: 'card-desc', text: desc }) : null, ...kids);
  }

  /* ── 탭 ── */
  function showTab(id) {
    App.State.tab = id;
    document.body.dataset.tab = id;
    U.$$('.tab').forEach((t) => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    U.$$('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + id; });
    applySplit();
    try { sessionStorage.setItem('daio-tab', id); } catch (_) { /* 무시 */ }
    App.emit('tab', id);
    window.scrollTo(0, 0);
  }
  /* 넓은 화면(901px~)에서 1·2·3 화면은 왼쪽 입력 + 오른쪽 미리보기·내보내기를 50:50으로 함께 보여 준다 */
  function applySplit() {
    const split = App.State.tab !== 'preview' && window.innerWidth > 900;
    document.body.classList.toggle('split', split);
    const pv = U.$('#tab-preview');
    if (pv) pv.hidden = App.State.tab !== 'preview' && !split;
  }
  function buildTabs() {
    window.addEventListener('resize', () => {
      const was = document.body.classList.contains('split');
      applySplit();
      if (was !== document.body.classList.contains('split')) App.emit('tab', App.State.tab);
    });
    const nav = U.$('#tabs');
    nav.append(...App.DATA.TABS.map((t) => h('button', { type: 'button', class: 'tab', role: 'tab', id: 'tabbtn-' + t.id, 'aria-controls': 'tab-' + t.id, dataset: { tab: t.id }, onclick: () => showTab(t.id), text: t.label })));
    nav.addEventListener('keydown', (e) => {
      const ids = App.DATA.TABS.map((t) => t.id); let i = ids.indexOf(App.State.tab);
      if (e.key === 'ArrowRight') i = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') i = (i + ids.length - 1) % ids.length; else return;
      showTab(ids[i]); U.$('#tabbtn-' + ids[i]).focus(); e.preventDefault();
    });
  }
  const navButtons = (prev, next) => h('div', { class: 'nav-buttons' },
    prev ? h('button', { type: 'button', class: 'btn', onclick: () => showTab(prev), text: '◀ 이전' }) : h('span'),
    next ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => showTab(next), text: '다음 ▶' }) : null);

  /* 어느 탭의 어떤 칸으로 이동 */
  function goTo(tab, id) {
    showTab(tab);
    setTimeout(() => { const e = id && document.getElementById(id); if (e) { e.scrollIntoView({ block: 'center' }); e.focus(); } }, 30);
  }

  /* ── 상단바: 차수 / 백업 / 새 보고서 ── */
  function buildTopbar() {
    const sel = h('select', { id: 'rev-select', 'aria-label': '저장된 차수 불러오기', onchange: async () => {
      const id = sel.value; if (!id) return;
      if (await U.confirmDialog('선택한 차수의 내용으로 바꿉니다. 지금 작성 중인 내용은 사라집니다(첨부 이미지는 유지). 계속할까요?', '불러오기')) {
        if (App.State.loadRevision(id)) { App.emit('rebuild'); App.State.changed(); U.toast('차수를 불러왔습니다.'); }
      }
      sel.value = '';
    } });
    const fillRev = () => {
      sel.replaceChildren(h('option', { value: '', text: '차수 불러오기…' }), ...App.State.revisions().map((r) => h('option', { value: r.id, text: `${r.label} (${U.fmtDateTime(r.savedAt)})` })));
    };
    App.on('revisions', fillRev); fillRev();

    const bar = U.$('#topbar-actions');
    const logIn = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', class: 'sr-only', id: 'f-logfile', onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && App.Actions) App.Actions.upload(f); } });
    bar.append(
      h('div', { class: 'upload-menu' },
        h('label', { class: 'btn btn-upload file-btn', title: '시스템에서 내려받은 관제일지(엑셀)를 올립니다. 파일은 이 PC 안에서만 처리되며 외부로 전송되지 않습니다.' }, '관제일지 엑셀 올리기', logIn),
        h('p', { class: 'file-status', id: 'log-status', role: 'status', 'aria-live': 'polite' })),
      sel,
      h('button', { type: 'button', class: 'btn', onclick: saveRev, text: '차수 저장' }),
      h('button', { type: 'button', class: 'btn', onclick: exportBackup, text: '백업 내보내기' }),
      h('label', { class: 'btn file-btn' }, '백업 불러오기', h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: importBackup })),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: newReport, text: '새 보고서' }));
    setupLogDrop();
  }
  /* 관제일지 엑셀 끌어다 놓기: 화면 어디에 놓아도 올라간다(이미지 칸·백업 불러오기에는 영향 없음) */
  function setupLogDrop() {
    const okName = (f) => /\.(xlsx|xls|csv)$/i.test(f.name || '');
    const hasFiles = (ev) => !!(ev.dataTransfer && Array.from(ev.dataTransfer.types || []).indexOf('Files') >= 0);
    const inImageBox = (ev) => !!(ev.target && ev.target.closest && ev.target.closest('.dropzone'));
    const veil = h('div', { class: 'log-drop-veil no-print', 'aria-hidden': 'true' }, h('p', { text: '여기에 놓으면 관제일지 엑셀을 불러옵니다' }));
    document.body.append(veil);
    const btn = U.$('#topbar-actions .btn-upload');
    let depth = 0;
    const show = (on) => { veil.classList.toggle('on', on); if (btn) btn.classList.toggle('drag-over', on); };
    window.addEventListener('dragenter', (ev) => { if (!hasFiles(ev) || inImageBox(ev)) return; depth++; show(true); });
    window.addEventListener('dragover', (ev) => { if (!hasFiles(ev)) return; if (inImageBox(ev)) { show(false); return; } ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; show(true); });
    window.addEventListener('dragleave', (ev) => { if (!hasFiles(ev)) return; depth = Math.max(0, depth - 1); if (!depth) show(false); });
    window.addEventListener('drop', (ev) => {
      if (!hasFiles(ev)) return;
      depth = 0; show(false);
      if (inImageBox(ev)) return;
      ev.preventDefault();
      const files = Array.from(ev.dataTransfer.files || []);
      if (files.length > 1) { U.toast('관제일지 파일은 한 번에 하나만 올릴 수 있습니다. 하나만 끌어다 놓아 주세요.', 'err'); return; }
      const f = files[0];
      if (!f) return;
      if (!okName(f)) { U.toast('엑셀 파일(.xlsx, .xls) 또는 .csv 파일만 올릴 수 있습니다.', 'err'); return; }
      if (App.Actions) App.Actions.upload(f);
      else U.toast('화면이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.', 'err');
    });
  }
  async function saveRev() {
    const n = App.State.revisions().length + 1;
    const inp = h('input', { type: 'text', value: n + '보', maxLength: 20, 'aria-label': '차수 이름' });
    const ok = await U.dialog({ title: '차수 저장', body: h('div', {}, h('p', { text: '지금 내용을 한 시점의 기록으로 보관합니다. (예: 1보, 2보, 최종)' }), inp), buttons: [{ label: '취소', value: false }, { label: '저장', value: () => true, primary: true }] });
    if (ok && App.State.saveRevision(inp.value.trim())) { App.emit('revisions'); U.toast('차수를 저장했습니다.'); }
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(App.State.allForBackup())], { type: 'application/json' });
    U.downloadBlob(blob, `재난올인원_백업_${U.stampName()}.json`);
    U.toast('백업 파일을 내려받았습니다.');
  }
  function importBackup(ev) {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    const fr = new FileReader();
    fr.onload = async () => {
      let data;
      try { data = JSON.parse(fr.result); } catch (_) { U.toast('백업 파일 형식이 올바르지 않습니다.', 'err'); return; }
      if (!data || data.app !== 'disaster-all-in-one' || !data.state) { U.toast('이 프로그램의 백업 파일이 아닙니다.', 'err'); return; }
      if (!(await U.confirmDialog('백업 파일의 내용으로 바꿉니다. 지금 작성 중인 내용은 사라집니다. 계속할까요?', '불러오기'))) return;
      App.State.replace(data.state);
      try { if (Array.isArray(data.revisions)) localStorage.setItem('disaster-all-in-one:rev:v1', JSON.stringify(data.revisions.slice(-10))); } catch (_) { /* 무시 */ }
      App.emit('rebuild'); App.emit('revisions'); App.State.changed(); U.toast('백업을 불러왔습니다.');
    };
    fr.onerror = () => U.toast('파일을 읽지 못했습니다.', 'err');
    fr.readAsText(f);
  }
  async function newReport() {
    if (!(await U.confirmDialog('새 보고서를 시작합니다. 지금 내용과 저장된 차수가 모두 지워집니다. 필요하면 먼저 [백업 내보내기]를 하세요. 계속할까요?', '새로 시작'))) return;
    App.State.reset(); App.emit('rebuild'); App.emit('revisions'); App.State.changed(); showTab('meta'); U.toast('새 보고서를 시작했습니다.');
  }

  App.UI = { resetRefreshers: () => { refreshers.length = 0; }, addRefresher: (fn) => { refreshers.push(fn); fn(); }, field, card, buildTabs, showTab, navButtons, goTo, buildTopbar, refreshAll };
})();
