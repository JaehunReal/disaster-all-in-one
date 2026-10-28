/* 5. 그 밖의 사항(보험가입 및 언론보도내용 등): 자유 기입 칸 + 보험가입내역(보험사·금액) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, h = U.h, UI = App.UI;
  const MAX_ROWS = 30;

  /* 보험가입내역 표: [+ 보험 추가]로 행을 늘린다. 보고서에는 "○ 보험가입내역 : 보험사 금액, …"으로 나온다 */
  function insuranceBox() {
    const body = h('tbody');
    const cnt = h('output', { class: 'count' });
    const preview = h('output', { class: 'hint', 'aria-live': 'polite' });
    const sync = () => { preview.textContent = '보고서 표시: ○ 보험가입내역 : ' + App.Calc.insuranceLine(App.S); };
    const draw = (focusLast) => {
      body.replaceChildren(...App.S.insurance.map((r, i) => h('tr', {},
        h('td', { class: 'no', text: String(i + 1) }),
        h('td', {}, h('input', { type: 'text', value: r.company, maxLength: 40, placeholder: '예) ○○화재', 'aria-label': `${i + 1}번 보험사`, autocomplete: 'off', oninput: (e) => { r.company = e.target.value; App.State.changed('ins'); sync(); } })),
        h('td', {}, h('input', { type: 'text', value: r.amount, maxLength: 40, placeholder: '예) 3억원', 'aria-label': `${i + 1}번 보험 금액`, autocomplete: 'off', oninput: (e) => { r.amount = e.target.value; App.State.changed('ins'); sync(); } })),
        h('td', {}, h('button', { type: 'button', class: 'btn-mini', 'aria-label': `${i + 1}번 보험 행 삭제`, onclick: () => {
          const del = () => { App.S.insurance.splice(i, 1); draw(); App.State.changed('ins'); };
          (r.company.trim() || r.amount.trim()) ? U.confirmDialog(`${i + 1}번 보험 행을 삭제할까요?`, '삭제').then((ok) => { if (ok) del(); }) : del();
        }, text: '삭제' })))));
      cnt.textContent = App.S.insurance.length ? `${App.S.insurance.length}행` : '입력한 보험이 없으면 "조사중"으로 표시됩니다.';
      if (focusLast) { const ins = body.querySelectorAll('tr:last-child input'); if (ins[0]) ins[0].focus(); }
      sync();
    };
    const add = () => {
      if (App.S.insurance.length >= MAX_ROWS) { U.toast(`보험은 최대 ${MAX_ROWS}행까지 입력할 수 있습니다.`, 'err'); return; }
      App.S.insurance.push({ company: '', amount: '' }); draw(true); App.State.changed('ins');
    };
    draw(false);
    return h('div', { class: 'ins-box' },
      h('h3', { text: '○ 보험가입내역' }),
      h('div', { class: 'toolbar' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: add, text: '+ 보험 추가' }), cnt),
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table ins-grid' },
        h('caption', { class: 'sr-only', text: '보험가입내역 표' }),
        h('colgroup', {}, ['2.4rem', '', '', '4.4rem'].map((w) => h('col', { style: w ? `width:${w}` : '' }))),
        h('thead', {}, h('tr', {}, ['연번', '보험사', '금액', '삭제'].map((t) => h('th', { text: t })))),
        body)),
      preview);
  }

  function card() {
    return UI.card('5. 그 밖의 사항 (보험가입 및 언론보도내용 등)', '조치사항 다음에 들어가는 항목입니다. 보고서에는 보험가입내역이 먼저, 아래 자유 기입 내용이 그 뒤에 나옵니다.',
      h('div', { class: 'grid' }, UI.field({ key: 'etcNote', label: '그 밖의 사항 (언론보도내용 등)', multiline: true, rows: 3, wide: true, placeholder: '한 줄에 하나씩 쓰면 ○ 표시로 나뉘어 들어갑니다.\n예) 언론보도: ○○일보 인터넷판 보도(10:30)', hint: '비워 두면 보고서에 나오지 않습니다.' })),
      insuranceBox());
  }
  App.Etc = { card };
})();
