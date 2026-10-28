/* 화면 2: 현황 (인명피해 표, 동원 인원·장비) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, h = U.h, D = App.DATA, UI = App.UI;

  /* 인명피해 표의 입력 칸. 나이와 성별은 따로 입력하고, 보고서에는 "나이/성별" 한 칸(예: 78세 / 여)으로 합쳐 나온다.
     w = 칸 너비(rem). 칸을 늘리려면 이 목록에 한 줄만 더하면 된다 */
  const COLS = [
    { k: 'name', t: '성명', w: 4, ph: '홍O연' },
    { k: 'age', t: '나이', w: 3.4, ph: '78세', max: 20 },
    { k: 'sex', t: '성별', w: 3.4, ph: '여', list: 'dl-sex', max: 20 },
    { k: 'injury', t: '부상정도', w: 18, ph: '허리통증', multi: true, big: true, max: 300 }, /* 글이 길면 칸 안에서 줄이 바뀌며 늘어난다 */
    { k: 'hospital', t: '이송병원', w: 4.4, ph: '척척병원', suffix: '병원', skip: /(병원|의원|의료원|센터|클리닉|응급실|보건소|이송|거부|종결|사망|없음|미상|확인)/ },
    { k: 'unit', t: '구급대', w: 4.4, ph: '노원구급', list: 'dl-units', suffix: '구급', skip: /(구급|자차|센터|119|이송|없음|미상|확인)/ },
    { k: 'remark', t: '비고', w: 4.6, ph: '', multi: true },
  ];
  /* 이송병원·구급대: 이름만 쓰면 뒤에 "병원"/"구급"을 자동으로 붙인다(이미 붙어 있거나 자차·미이송 같은 말이면 그대로 둔다) */
  const autoSuffix = (col, v) => { v = String(v || '').trim(); return col.suffix && /^[가-힣A-Za-z]+$/.test(v) && !col.skip.test(v) ? v + col.suffix : v; };
  const W_NO = 1.6, W_LEVEL = 4.2, W_DEL = 2.6;
  const W_TOTAL = () => W_NO + W_LEVEL + W_DEL + COLS.reduce((a, c) => a + c.w, 0); /* 표 전체 최소 너비(rem): 이보다 좁으면 표가 줄지 않고 옆으로 밀어 볼 수 있다 */

  /* 부상정도·비고: 입력하는 동안 글이 다 보이도록 줄이 바뀌고 칸이 아래로 늘어난다(줄바꿈 키는 쓰지 않음) */
  const grow = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  function cellArea(c, col, i) {
    const t = h('textarea', { rows: 1, class: 'cell-area', value: c[col.k] || '', placeholder: col.ph, maxLength: col.max || 100, 'aria-label': `${i + 1}번 ${col.t}`, autocomplete: 'off',
      oninput: (e) => { const v = e.target.value.replace(/[\r\n]+/g, ' '); if (v !== e.target.value) e.target.value = v; c[col.k] = v; grow(e.target); App.State.changed('cas'); },
      onkeydown: (e) => { if (e.key === 'Enter') e.preventDefault(); } });
    requestAnimationFrame(() => grow(t));
    if (!col.big) return t;
    /* 큰 입력창: 칸을 누르면 같은 자리에서 넓고 높은 입력창으로 펼쳐지고, 벗어나면 다시 접힌다(표 모양은 흔들리지 않음) */
    const wrap = h('div', { class: 'cell-wrap' }, t);
    t.title = '클릭하면 큰 입력창으로 펼쳐집니다 (Esc: 접기)';
    /* 표 바깥으로 잘리지 않도록 화면 기준(fixed)으로 칸 위에 겹쳐 띄운다 */
    const place = () => {
      const r = wrap.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const w = Math.min(Math.max(r.width, 440), vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - w - 8));
      t.style.width = w + 'px'; t.style.left = left + 'px';
      const hh = t.offsetHeight; t.style.top = Math.max(8, Math.min(r.top, vh - hh - 8)) + 'px';
    };
    const onMove = () => place();
    t.addEventListener('focus', () => { wrap.style.height = wrap.offsetHeight + 'px'; t.classList.add('open'); grow(t); place(); window.addEventListener('scroll', onMove, true); window.addEventListener('resize', onMove); });
    t.addEventListener('input', () => { if (t.classList.contains('open')) place(); });
    t.addEventListener('blur', () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); t.classList.remove('open'); t.style.width = t.style.left = t.style.top = ''; wrap.style.height = ''; grow(t); });
    t.addEventListener('keydown', (e) => { if (e.key === 'Escape') t.blur(); });
    return wrap;
  }

  function casualtyCard() {
    const body = h('tbody');
    const cnt = h('output', { class: 'count' });
    const draw = (focusLast) => {
      body.replaceChildren(...App.S.casualties.map((c, i) => h('tr', {},
        h('td', { class: 'no', text: String(i + 1) }),
        h('td', { class: 'lv' }, h('select', { class: 'lv-select', title: '부상 구분(요약 문구 계산에 사용)', 'aria-label': `${i + 1}번 부상 구분`, onchange: (e) => { c.level = e.target.value; e.target.dataset.level = c.level; App.State.changed('cas'); }, dataset: { level: c.level || '경상' } }, D.LEVELS.map((l) => h('option', { value: l, text: l, selected: (c.level || '경상') === l })))),
        COLS.map((col) => h('td', {}, col.multi ? cellArea(c, col, i) : h('input', { type: 'text', value: c[col.k] || '', placeholder: col.ph, list: col.list || null, maxLength: col.max || 100, 'aria-label': `${i + 1}번 ${col.t}`, autocomplete: 'off', oninput: (e) => { c[col.k] = e.target.value; App.State.changed('cas'); }, onchange: col.suffix ? (e) => { const v = autoSuffix(col, e.target.value); if (v !== e.target.value) { e.target.value = v; c[col.k] = v; App.State.changed('cas'); } } : null, title: col.suffix ? `이름만 입력하면 "${col.suffix}"가 자동으로 붙습니다` : null }))),
        h('td', {}, h('button', { type: 'button', class: 'btn-mini', 'aria-label': `${i + 1}번 행 삭제`, onclick: () => { App.Calc.filled(c) ? U.confirmDialog(`${i + 1}번 행을 삭제할까요?`, '삭제').then((ok) => { if (ok) { App.S.casualties.splice(i, 1); draw(); App.State.changed('cas'); } }) : (App.S.casualties.splice(i, 1), draw(), App.State.changed('cas')); }, text: '삭제' })))));
      cnt.textContent = App.S.casualties.length ? `${App.S.casualties.length}행` : '행이 없습니다. [+ 행 추가] 또는 [엑셀 붙여넣기]를 누르세요.';
      if (focusLast) { const ins = body.querySelectorAll('tr:last-child input'); if (ins[0]) ins[0].focus(); }
    };
    const add = () => { App.S.casualties.push({ name: '', age: '', sex: '', injury: '', hospital: '', unit: '', remark: '', level: '경상' }); draw(true); App.State.changed('cas'); };
    const paste = async () => {
      const ta = h('textarea', { rows: 10, 'aria-label': '엑셀에서 복사한 내용', placeholder: '엑셀에서 표를 복사(Ctrl+C)한 뒤 여기에 붙여넣기(Ctrl+V)\n열 순서: [연번] 성명 / 나이·성별(한 칸, 예: 78세 / 여) / 부상정도 / 이송병원 / (병원도착일자: 사용 안 함, 비워 두어도 됨) / 구급대 / 비고' });
      const ok = await U.dialog({ title: '엑셀에서 붙여넣기', body: h('div', {}, h('p', { text: '엑셀에서 복사한 표를 붙여넣으세요. 맨 앞 연번 열은 있어도 되고 없어도 됩니다.' }), ta), buttons: [{ label: '취소', value: false }, { label: '표에 추가', value: () => true, primary: true }] });
      if (!ok) return;
      const rows = ta.value.split(/\r?\n/).map((l) => l.split('\t').map((x) => x.trim())).filter((r) => r.some(Boolean));
      let n = 0;
      rows.forEach((r) => {
        if (r.length >= 6 && /^\d+$/.test(r[0])) r = r.slice(1);
        if (/^(성명|이름)$/.test(r[0])) return; /* 머리글 줄 */
        const as = App.Calc.splitAgeSex(r[1]); /* 엑셀의 "나이/성별" 한 칸을 나이·성별로 나눠 넣는다 */
        App.S.casualties.push({ name: r[0] || '', age: as.age, sex: as.sex, injury: r[2] || '', hospital: autoSuffix(COLS[4], r[3]), unit: autoSuffix(COLS[5], r[5]), remark: r[6] || '', level: '경상' }); n++;
      });
      draw(); App.State.changed('cas'); U.toast(n ? `${n}행을 추가했습니다.` : '붙여넣은 내용에서 행을 찾지 못했습니다.', n ? '' : 'err');
    };
    draw(false);
    return UI.card('가. 인명피해', '요약 문구는 아래 표에서 자동으로 만들어집니다. 표는 직접 입력하거나 엑셀에서 붙여넣으세요.',
      h('datalist', { id: 'dl-units' }, h('option', { value: '자차' })),
      h('datalist', { id: 'dl-sex' }, h('option', { value: '남' }), h('option', { value: '여' })),
      h('div', { class: 'grid' }, UI.field({ key: 'casualtyLine', label: '인명피해 요약 (보고서 "가. 인명피해 :" 뒤에 표시)', wide: true })),
      h('div', { class: 'toolbar' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: add, text: '+ 행 추가' }),
        h('button', { type: 'button', class: 'btn', onclick: paste, text: '엑셀 붙여넣기' }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: App.S.maskNames, onchange: (e) => { App.S.maskNames = e.target.checked; App.State.changed('mask'); } }), ' 보고서에서 성명 가운데 글자 가리기'),
        cnt),
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table cas-grid', style: `min-width:${W_TOTAL()}rem` },
        h('caption', { class: 'sr-only', text: '인명피해 표' }),
        h('colgroup', {}, [W_NO, W_LEVEL].concat(COLS.map((c) => c.w), [W_DEL]).map((w) => h('col', { style: `width:${w}rem` }))),
        h('thead', {}, h('tr', {}, h('th', { text: '연번' }), h('th', { text: '구분', title: '요약 문구 계산에 사용(보고서 표에는 나오지 않음)' }), COLS.map((c) => h('th', { text: c.t })), h('th', { text: '삭제' }))),
        body)));
  }

  /* 나. 재산피해: 동산·부동산 금액(만원)과 내용. 요약 문구는 금액 합계로 자동 계산된다 */
  function propertyCard() {
    const money = (key, label) => UI.field({ key, label, placeholder: '예) 300', hint: '만원 단위 숫자만 입력합니다. (예: 300 → 300만원, 12000 → 1억 2,000만원)', max: 9, digits: true, inputMode: 'numeric' });
    return UI.card('나. 재산피해', '금액을 넣으면 아래 요약 문구가 자동으로 만들어집니다. 금액이 없으면 "조사중"으로 표시됩니다.',
      h('div', { class: 'grid' },
        UI.field({ key: 'propertyLine', label: '재산피해 요약 (보고서 "나. 재산피해 :" 뒤에 표시)', wide: true }),
        money('propMovable', '동산 피해액 (만원)'),
        money('propImmovable', '부동산 피해액 (만원)'),
        UI.field({ key: 'propImmovableNote', label: '※ 부동산 내용', placeholder: '예) 내부 9㎡ 소손, 주방 등 10㎡ 오손, 2층 복도 20㎡ 오손', wide: true, hint: '비워 두면 보고서에 나오지 않습니다.' }),
        UI.field({ key: 'propMovableNote', label: '※ 동산 내용', placeholder: '예) 배터리, 배터리충전기, TV, 컴퓨터 모니터, 에어컨, 침대 등 가재도구 일체 오·소손', wide: true, hint: '비워 두면 보고서에 나오지 않습니다.' })));
  }

  /* 숫자 입력 묶음: 관제일지에서 자동 집계되고, 직접 고친 칸은 그대로 유지된다. 숫자를 넣은 항목만 보고서에 나온다 */
  function countCard(title, key, list, lineKey, unit) {
    const group = App.S[key];
    const inputs = {}, tags = {}, labels = {};
    const notes = h('ul', { class: 'basis-list' });
    const basis = h('details', { class: 'cat-help basis' }, h('summary', { text: '자동 집계 근거 보기' }), notes);
    const grid = h('div', { class: 'num-grid' }, list.map((k) => {
      tags[k] = h('small', { class: 'num-tag' });
      inputs[k] = h('input', { type: 'number', min: 0, max: 9999, step: 1, inputMode: 'numeric', value: group[k] || '', 'aria-label': `${title} ${k}`, oninput: (e) => { group[k] = e.target.value.replace(/[^\d]/g, '').slice(0, 4); App.S.mobEdit[key][k] = true; App.State.changed(key); } });
      labels[k] = h('label', { class: 'num' }, h('span', {}, k, ' ', tags[k]), inputs[k]);
      return labels[k];
    }));
    const refresh = () => {
      const A = App.S.log.auto;
      list.forEach((k) => {
        const v = group[k] || '';
        if (document.activeElement !== inputs[k] && inputs[k].value !== v) inputs[k].value = v;
        const edited = !!App.S.mobEdit[key][k], hasAuto = A[key][k] > 0;
        labels[k].classList.toggle('is-auto', !edited && hasAuto);
        tags[k].textContent = !edited && hasAuto ? '자동' : (edited && hasAuto && String(A[key][k]) !== v ? '수정됨' : '');
      });
      const list2 = App.S.log.auto.notes[key] || [];
      notes.replaceChildren(...list2.map((x) => h('li', { text: x })));
      basis.hidden = !list2.length;
    };
    UI.addRefresher(refresh);
    const redo = h('button', { type: 'button', class: 'btn-mini', onclick: () => {
      if (!App.S.log.fileName) { U.toast('먼저 화면 상단의 [관제일지 엑셀 올리기]로 관제일지를 올려 주세요.', 'err'); return; }
      App.Auto.resetGroup(App.S, key); App.State.changed(key); U.toast(`${title.replace(/^.\.\s*/, '')}을(를) 관제일지 기준으로 다시 채웠습니다.`);
    }, text: '↺ 관제일지 기준으로 다시 채우기' });
    return UI.card(title, '관제일지를 올리면 숫자가 자동으로 채워집니다. 칸을 직접 고치면 그 칸은 유지됩니다. 비워 두거나 0이면 보고서에 표시되지 않습니다.',
      grid,
      h('div', { class: 'toolbar' }, redo), basis,
      h('div', { class: 'grid' }, UI.field({ key: lineKey, label: `보고서 표시 문구 (${unit} 합계 자동 계산)`, wide: true })));
  }

  function build(root) {
    root.replaceChildren(
      UI.card('2. 피해상황', null, casualtyCard(), propertyCard()),
      UI.card('3. 동원현황', null,
        countCard('가. 인원', 'people', D.PEOPLE, 'peopleLine', '명'),
        countCard('나. 장비', 'equip', D.EQUIP, 'equipLine', '대')),
      UI.navButtons('meta', 'actions'));
  }
  App.Status = { build };
})();
