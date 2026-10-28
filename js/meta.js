/* 화면 1: 사건 정보 (머리말, 제목, 발생개요, 첨부) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, h = U.h, D = App.DATA, UI = App.UI;

  function jurisdiction() {
    const sSel = h('select', { id: 'f-station', 'aria-label': '관할소방서' });
    const cSel = h('select', { id: 'f-center', 'aria-label': '관할 119안전센터' });
    const show = h('output', { class: 'juris-out', for: 'f-station f-center', style: 'white-space:pre-line' });
    const fillStations = () => sSel.replaceChildren(h('option', { value: '', text: '소방서 선택' }), ...D.STATIONS.map((s) => h('option', { value: s.name, text: s.name + '소방서' })));
    const fillCenters = () => {
      const st = D.STATIONS.find((s) => s.name === App.S.values.station);
      cSel.replaceChildren(h('option', { value: '', text: st ? '센터 선택' : '먼저 소방서 선택' }), ...(st ? st.centers.map((c) => h('option', { value: c, text: c + '119안전센터' })) : []));
      cSel.disabled = !st;
    };
    const badge = h('span', { class: 'badge badge-auto', hidden: true, text: '자동' });
    const sync = () => {
      fillStations(); sSel.value = App.S.values.station; fillCenters(); cSel.value = App.S.values.center;
      show.textContent = '보고서 표시: ' + App.Model.jurisdictionText(App.S);
      badge.hidden = !App.S.autoSel.station;
    };
    /* 관제일지 불러오기 등으로 값이 바뀌면 화면을 맞춘다(입력 중인 목록은 건드리지 않는다) */
    const refresh = () => {
      if (sSel.value !== App.S.values.station) { sSel.value = App.S.values.station; fillCenters(); }
      if (cSel.value !== App.S.values.center) cSel.value = App.S.values.center;
      show.textContent = '보고서 표시: ' + App.Model.jurisdictionText(App.S);
      badge.hidden = !App.S.autoSel.station;
    };
    sSel.addEventListener('change', () => { App.S.values.station = sSel.value; App.S.values.center = ''; App.S.autoSel.station = false; fillCenters(); show.textContent = '보고서 표시: ' + App.Model.jurisdictionText(App.S); badge.hidden = true; App.State.changed('station'); });
    cSel.addEventListener('change', () => { App.S.values.center = cSel.value; App.S.autoSel.station = false; show.textContent = '보고서 표시: ' + App.Model.jurisdictionText(App.S); badge.hidden = true; App.State.changed('center'); });
    sync();
    UI.addRefresher(refresh);
    return h('div', { class: 'field wide' }, h('label', { for: 'f-station' }, '관할소방서', h('br'), '(관할센터) ', badge), h('div', { class: 'field-row' }, sSel, cSel), show,
      h('small', { class: 'hint', text: '관제일지를 올리면 관할119안전센터로 자동 선택됩니다. 직접 바꿀 수도 있으며, 선택하지 않으면 보고서에 ○○소방서(○○119안전센터)로 표시됩니다.' }));
  }

  /* ── 보고서 종류: 관제일지에서 화재/구조를 자동 판별하고, 직접 고를 수도 있다 ── */
  function reportTypeField() {
    const T = D.REPORT_TYPES;
    const sel = h('select', { id: 'f-reportType', 'aria-label': '보고서 종류' },
      h('option', { value: '', text: '자동 (관제일지 기준)' }),
      Object.keys(T).map((k) => h('option', { value: k, text: T[k].name + ' 등 사고상황보고서' })));
    const out = h('output', { class: 'juris-out' });
    const show = () => {
      const t = App.Model.reportType(App.S), auto = App.S.log.auto.reportType;
      sel.value = App.S.values.reportType || '';
      out.textContent = '보고서 표시: ' + T[t].title.replace(/ /g, '') + (App.S.values.reportType ? ' (직접 선택)' : auto ? ' (관제일지 분류로 자동 판별)' : ' (관제일지를 올리면 자동 판별, 지금은 기본값)');
    };
    sel.addEventListener('change', () => { App.S.values.reportType = sel.value; show(); App.State.changed('reportType'); });
    UI.addRefresher(() => { if (document.activeElement !== sel) show(); else out.textContent = '보고서 표시: ' + T[App.Model.reportType(App.S)].title.replace(/ /g, ''); });
    show();
    return h('div', { class: 'field wide' }, h('label', { for: 'f-reportType' }, '보고서 종류'), h('div', { class: 'field-row' }, sel), out,
      h('small', { class: 'hint', text: '관제일지의 분류·종별에 "화재"가 있으면 화재, 아니면 구조로 자동 선택됩니다. 다르면 직접 바꿔 주세요.' }));
  }

  /* ── 라. 건물구조: ○조, ○층, 연면적○㎡, 바닥면적○㎡ ── */
  function structureGroup() {
    const unit = (s) => h('span', { class: 'suffix', 'aria-hidden': 'true', text: s });
    const out = h('output', { class: 'juris-out' });
    UI.addRefresher(() => { const x = App.Model.structureText(App.S.values); out.textContent = x ? '보고서 표시: ' + x : '보고서 표시: (비워 두면 표시되지 않습니다)'; });
    return h('fieldset', { class: 'group wide' }, h('legend', { text: '라. 건물구조 (선택)' }),
      h('div', { class: 'grid4' },
        UI.field({ key: 'structKind', label: '구조 (○조)', placeholder: '예) 철근콘크리트', extra: unit('조') }),
        UI.field({ key: 'structFloors', label: '층수 (○층)', placeholder: '예) 4/1', extra: unit('층'), hint: '지상/지하는 4/1처럼 적어도 됩니다.' }),
        UI.field({ key: 'areaTotal', label: '연면적', placeholder: '예) 892.92', extra: unit('㎡'), inputMode: 'decimal' }),
        UI.field({ key: 'areaFloor', label: '바닥면적', placeholder: '예) 184.88', extra: unit('㎡'), inputMode: 'decimal' })),
      out);
  }

  /* ── 대상 비고: 지하2층~지상6층(필요하면 더 추가), 글자가 있는 층만 보고서에 나온다 ── */
  function floorsGroup() {
    const box = h('div', { class: 'floor-grid' }), bar = h('div', { class: 'toolbar' });
    const out = h('output', { class: 'juris-out' });
    const R = () => App.S.floorRange;
    const showOut = () => { const n = App.Model.targetNotes(App.S); out.textContent = n.length ? '보고서 표시: ※ ' + n.join('  ※ ') : '보고서 표시: (층별 내용을 적으면 표시됩니다)'; };
    const draw = (focusKey) => {
      box.replaceChildren(...D.floorKeys(R()).map((k) => h('label', { class: 'floor-item' }, h('span', { text: D.floorLabel(k) }),
        h('input', { type: 'text', id: 'f-floor-' + k, value: App.S.floors[k] || '', maxLength: 120, autocomplete: 'off', placeholder: '예) 창고', 'aria-label': `대상 비고 ${D.floorLabel(k)}`, oninput: (e) => { App.S.floors[k] = e.target.value; showOut(); App.State.changed('floor'); } }))));
      const below = R().below, above = R().above, F = D.FLOORS;
      bar.replaceChildren(
        h('button', { type: 'button', class: 'btn-mini', disabled: below >= F.belowMax, onclick: () => { R().below++; draw('B' + R().below); App.State.changed('floor'); }, text: `+ 지하 ${below + 1}층 추가` }),
        h('button', { type: 'button', class: 'btn-mini', disabled: below <= F.belowMin, onclick: () => trim('B' + below), text: `− 지하 ${below}층 빼기` }),
        h('button', { type: 'button', class: 'btn-mini', disabled: above >= F.aboveMax, onclick: () => { R().above++; draw(R().above + 'F'); App.State.changed('floor'); }, text: `+ 지상 ${above + 1}층 추가` }),
        h('button', { type: 'button', class: 'btn-mini', disabled: above <= F.aboveMin, onclick: () => trim(above + 'F'), text: `− 지상 ${above}층 빼기` }));
      showOut();
      if (focusKey) { const e = U.$('#f-floor-' + focusKey, box); if (e) e.focus(); }
    };
    async function trim(key) {
      if (String(App.S.floors[key] || '').trim() && !(await U.confirmDialog(`${D.floorLabel(key)}에 적은 내용이 있습니다. 이 층을 빼면 내용도 사라집니다. 계속할까요?`, '빼기'))) return;
      delete App.S.floors[key];
      if (key[0] === 'B') R().below--; else R().above--;
      draw(); App.State.changed('floor');
    }
    draw();
    return h('fieldset', { class: 'group wide' }, h('legend', { text: '대상 비고 (※ 용도, 층별)' }),
      h('small', { class: 'hint', text: '층마다 용도·상호 등을 적으세요. 비워 둔 층은 보고서에 나오지 않습니다. 지하 3층 이하·지상 7층 이상은 아래 버튼으로 추가합니다.' }),
      box, bar, out);
  }

  /* ── 이미지 올리기: 파일 선택 / 끌어놓기 / 붙여넣기(Ctrl+V) / 주소 지도 자동 가져오기 ── */
  let redrawAttach = null;
  App.on('images', () => { if (redrawAttach) redrawAttach(); });

  async function addFiles(a, files) {
    const list = App.S.images[a.key];
    const room = a.max - list.length;
    const imgs = Array.from(files || []).filter((f) => f && /^image\//.test(f.type));
    if (!imgs.length) { U.toast('이미지 파일(png, jpg 등)을 올려 주세요.', 'err'); return; }
    if (room <= 0) { U.toast(`${a.label}은(는) 최대 ${a.max}장입니다. 먼저 [삭제]해 주세요.`, 'err'); return; }
    const done = [];
    for (const f of imgs.slice(0, room)) {
      try { const im = await U.loadImage(f); list.push(im); done.push(im); } catch (e) { U.toast(e.message, 'err'); }
    }
    /* 전체 한도를 넘으면 모든 첨부 이미지를 조금 더 줄인다 */
    const saved = await U.fitImagesTotal(App.S.images);
    if (redrawAttach) redrawAttach();
    App.State.changed('img');
    const red = done.filter((im) => im.reduced);
    if (red.length) {
      const before = red.reduce((x, im) => x + im.origBytes, 0), after = red.reduce((x, im) => x + im.bytes, 0);
      U.toast(`용량이 큰 이미지 ${red.length}장을 자동으로 줄여 첨부했습니다 (${U.fmtBytes(before)} → ${U.fmtBytes(after)})` + (saved > 0 ? ', 전체 용량 한도에 맞춰 첨부 이미지를 추가로 줄였습니다.' : '.'));
    } else if (saved > 0) U.toast('첨부 이미지 전체 용량 한도에 맞춰 이미지를 조금 더 줄였습니다.');
  }
  async function pasteFromClipboard(a) {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((x) => x.startsWith('image/'));
        if (type) { const blob = await it.getType(type); await addFiles(a, [new File([blob], 'paste.' + type.split('/')[1], { type })]); return; }
      }
      U.toast('클립보드에 이미지가 없습니다. 캡처(Win+Shift+S)한 뒤 다시 눌러 주세요.', 'err');
    } catch (_) {
      U.toast('이 브라우저에서는 버튼으로 붙여넣을 수 없습니다. 아래 칸을 한 번 클릭한 뒤 Ctrl+V를 눌러 주세요.', 'err');
    }
  }

  function attachments() {
    const wrap = h('div', { class: 'attach-grid' });
    const draw = () => {
      wrap.replaceChildren(...D.ATTACH.map((a) => {
        const list = App.S.images[a.key];
        const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', class: 'sr-only', multiple: a.max > 1, id: 'f-img-' + a.key, onchange: (ev) => { const files = Array.from(ev.target.files); ev.target.value = ''; addFiles(a, files); } });
        const box = h('div', { class: 'attach dropzone', tabindex: 0, role: 'group', 'aria-label': `${a.label} 이미지 칸. 끌어다 놓거나 클릭한 뒤 Ctrl+V로 붙여넣기` },
          h('h3', { text: a.label + (a.max > 1 ? ` (최대 ${a.max}장)` : '') }),
          h('div', { class: 'thumbs' + (a.key === 'photos' ? '' : ' frame') }, list.map((im, i) => h('figure', {}, h('img', { src: im.dataUrl, alt: a.label + ' ' + (i + 1), title: `${im.w}×${im.h}px · ${U.fmtBytes(U.dataUrlBytes(im.dataUrl))}` }),
            h('small', { class: 'hint img-size', text: U.fmtBytes(U.dataUrlBytes(im.dataUrl)) }),
            h('button', { type: 'button', class: 'btn-mini', 'aria-label': `${a.label} ${i + 1} 삭제`, onclick: () => { list.splice(i, 1); draw(); App.State.changed('img'); }, text: '삭제' })))),
          list.length < a.max ? h('div', { class: 'attach-btns' },
            h('label', { class: 'btn file-btn' }, '+ 이미지 올리기', input),
            h('button', { type: 'button', class: 'btn', onclick: () => pasteFromClipboard(a), text: '📋 붙여넣기' }),
            h('small', { class: 'hint', text: '이미지를 여기로 끌어다 놓거나, 이 칸을 클릭한 뒤 Ctrl+V' })) : h('small', { class: 'hint', text: '최대 장수에 도달했습니다.' }));
        box.addEventListener('paste', (ev) => {
          const files = Array.from((ev.clipboardData && ev.clipboardData.files) || []).filter((f) => /^image\//.test(f.type));
          if (files.length) { ev.preventDefault(); addFiles(a, files); }
        });
        box.addEventListener('dragover', (ev) => { ev.preventDefault(); box.classList.add('over'); });
        box.addEventListener('dragleave', () => box.classList.remove('over'));
        box.addEventListener('drop', (ev) => { ev.preventDefault(); box.classList.remove('over'); addFiles(a, ev.dataTransfer && ev.dataTransfer.files); });
        return box;
      }));
    };
    redrawAttach = draw;
    draw();
    return wrap;
  }

  /* 주소 지도 자동 가져오기 + 쉬운 대안(지도 사이트 열기 → 캡처 → 붙여넣기) */
  function mapTools() {
    const status = h('output', { class: 'map-status', role: 'status', 'aria-live': 'polite' });
    const chk = h('input', { type: 'checkbox', checked: App.S.mapAuto, onchange: (e) => { App.S.mapAuto = e.target.checked; App.State.changed('mapAuto'); } });
    const btn = h('button', { type: 'button', class: 'btn btn-primary', text: '🗺 주소로 지도 자동 가져오기' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; const old = btn.textContent; btn.textContent = '가져오는 중…';
      try { await App.Maps.autoFill({ onStatus: (t) => { status.textContent = t; } }); } finally { btn.disabled = false; btn.textContent = old; }
    });
    const addr = () => { const p = String(App.Fields.get(App.S, 'place') || '').replace(/\(.*$/, '').trim(); return `${(App.S.log.auto && App.S.log.auto.city) || D.DEFAULTS.city} ${p}`.trim(); };
    const link = (label, base) => { const a = h('a', { class: 'btn', target: '_blank', rel: 'noopener noreferrer', href: base, text: label }); a.addEventListener('click', () => { a.href = base + encodeURIComponent(addr()); }); return a; };
    return h('div', { class: 'map-tools' },
      h('div', { class: 'toolbar' }, btn,
        h('label', { class: 'check' }, chk, ' 관제일지를 올릴 때 지도 자동 가져오기')),
      h('p', { class: 'hint', text: '"나. 장소" 주소로 위치도(주변 지도)와 확대지도를 비어 있는 칸에 넣습니다. 인터넷이 필요하며, 이때 주소 문구가 OpenStreetMap 서버로 전송됩니다(끄려면 위 체크를 해제하고 버튼도 누르지 마세요). 건물 사진(전경)은 자동으로 받을 수 없어 확대지도가 들어가며, 실제 사진은 올리거나 붙여넣어 바꾸세요.' }),
      h('div', { class: 'toolbar' },
        h('strong', { text: '자동이 안 될 때(가장 쉬운 방법):' }),
        link('카카오맵 열기', 'https://map.kakao.com/?q='), link('네이버지도 열기', 'https://map.naver.com/p/search/'),
        h('span', { class: 'hint', text: '→ 지도에서 Win+Shift+S로 캡처 → 아래 위치도 칸을 클릭 → Ctrl+V' })),
      status);
  }

  function build(root) {
    root.replaceChildren(
      h('datalist', { id: 'dl-stations' }, D.STATIONS.map((s) => h('option', { value: s.name + '소방서' }))),
      UI.card('머리말', '초록색 [자동] 칸은 기본값이 이미 들어 있습니다. 고치면 [수정됨]으로 바뀌고, [↺ 자동값]으로 되돌릴 수 있습니다.',
        h('div', { class: 'grid' },
          UI.field({ key: 'to', label: '수신' }),
          UI.field({ key: 'ref', label: '참조 (소방서명, 선택)', list: 'dl-stations', placeholder: '선택 또는 직접 입력', hint: '비워 두면 표시되지 않습니다.' }),
          UI.field({ key: 'from', label: '발신' }),
          UI.field({ key: 'origin', label: '발신지' }),
          UI.field({ key: 'reportAt', label: '보고일자', resetLabel: '↺ 현재 시각', hint: '처음 연 시각이 자동으로 들어갑니다.' }),
          UI.field({ key: 'receiveAt', label: '접수시간', placeholder: '예) 10:16', hint: '상단의 [관제일지 엑셀 올리기]로 올리면 자동으로 들어갑니다.' }),
          UI.field({ key: 'writer', label: '작성자', placeholder: '예) 소방교 홍길동' }),
          UI.field({ key: 'manager', label: '보고책임자', placeholder: '예) 소방령 홍길동(상황1팀)' }),
          jurisdiction())),
      UI.card('제목', null, h('div', { class: 'grid' }, reportTypeField(), UI.field({ key: 'title', label: '제목 (시 구 동 사고명칭 요약)', required: true, wide: true, placeholder: '예) 대구 북구 관음동 건물 천장 반자 붕괴사고', hint: '관제일지를 올리면 "시 구 동 + 사고 분류"가 자동 입력됩니다. 뒤에 사고명칭 요약을 덧붙여 주세요.' }))),
      UI.card('1. 발생개요', null, h('div', { class: 'grid' },
        UI.field({ key: 'date', label: '가. 일시 (접수시간, 초 단위까지)', required: true, placeholder: '예) 2026. 10. 10.(토) 10:16:07', hint: '관제일지의 접수시간이 초 단위까지 자동 입력됩니다.' }),
        UI.field({ key: 'place', label: '나. 장소 (○구 ○로○길 ○(○동 ○-○))', required: true, placeholder: '예) 북구 관음중앙로28길 5(관음동 1284-2)', hint: '관제일지의 도로명주소와 지번으로 자동 입력됩니다.' }),
        UI.field({ key: 'target', label: '다. 대상 (○건물 ○층(상호))', required: true, placeholder: '예) K마트 건물 2층(물품 판매 홍보관)', hint: '건물명·층·호수·상호가 관제일지에서 찾아지면 자동 입력됩니다. 찾지 못한 부분은 직접 덧붙여 주세요.' }),
        structureGroup(),
        floorsGroup(),
        UI.field({ key: 'targetNote', label: '기타 비고 (층 구분 없는 용도·참고, 선택)', placeholder: '예) 건물 앞 도로 폐쇄 중', wide: true }),
        UI.field({ key: 'cause', label: '마. 원인 (화재·사고 원인)', placeholder: '예) 전기적요인 추정', hint: '관제일지에 "원인" 또는 "○○ 추정" 보고가 있으면 자동 입력됩니다. 없으면 "조사중"으로 들어가며, 직접 고칠 수 있습니다.', wide: true }),
        UI.field({ key: 'content', label: '바. 사고내용 (사고·화재의 핵심 요약, 인명피해 및 대피자 현황 요약)', required: true, multiline: true, rows: 5, wide: true, placeholder: '한 줄에 하나씩 쓰면 ○ 표시로 나뉘어 들어갑니다.', hint: '관제일지의 현장상황·대피자·인명피해로 초안이 자동 입력됩니다. 확인 후 고쳐 주세요.' }))),
      UI.card('위치도 · 건물전경 · 현장사진 (선택)', `이미지는 이 PC의 브라우저에만 저장되며 보고서 마지막 장에 들어갑니다. 용량이 큰 이미지는 장당 약 ${D.IMAGE.maxKB}KB 이하로 자동으로 줄여 저장합니다.`, mapTools(), attachments()),
      UI.navButtons(null, 'status'));
  }

  App.Meta = { build };
})();
