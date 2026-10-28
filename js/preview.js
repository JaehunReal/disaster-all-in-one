/* 화면 4: 보고서 미리보기 + 내보내기(Word, 인쇄/PDF, 문자 요약) + 점검 결과 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, h = U.h, UI = App.UI;
  let paperBox, checkBox, timer = 0;
  const visible = () => { const e = document.getElementById('tab-preview'); return !!e && !e.hidden; };

  /* 서식의 들여쓰기: 가·나·다 줄은 2타, ○·※ 줄은 4타(띄어쓰기 칸) */
  const SP2 = '  ', SP4 = '    ';
  function paperNodes(m) {
    const H = m.head;
    const kv = (k, v, span) => h('td', { colSpan: span }, h('b', { text: k + ' : ' }), v);
    const page1 = h('article', { class: 'paper', 'aria-label': '보고서 미리보기' },
      h('div', { class: 'secret', text: m.secret }),
      h('h1', { class: 'doc-title', text: m.title }),
      h('table', { class: 'doc-table' },
        h('colgroup', {}, ['10%', '18%', '22%', '28%', '10%', '12%'].map((w) => h('col', { style: 'width:' + w }))),
        h('tbody', {},
          h('tr', {}, kv('수신', H.to, 3), kv('보고일자', H.reportAt, 3)),
          h('tr', {}, kv('참조', H.ref, 3), kv('작성자', H.writer, 3)),
          h('tr', {}, kv('발신', H.from, 3), kv('보고책임자', H.manager, 3)),
          h('tr', {}, h('th', { text: '발신지' }), h('td', { text: H.origin }), h('th', {}, '관할소방서', h('br'), '(관할센터)'), h('td', { class: 'nl', text: H.jurisdiction }), h('th', { text: '접수시간' }), h('td', { text: H.receiveAt })),
          h('tr', {}, h('th', { text: '제목' }), h('td', { class: 'subject', colSpan: 5, text: m.subject })))),

      h('h2', { class: 'sec', text: '1. 발생개요' }),
      m.overview.map((o) => h('div', { class: 'ov' }, h('p', { class: 'i2', text: SP2 + o.label + ' : ' + o.value }), o.notes.map((n) => h('p', { class: 'i4 note', text: SP4 + '※ ' + n })))),
      h('p', { class: 'i2', text: SP2 + m.contentLabel + ' :' }),
      m.content.map((c) => h('p', { class: 'i4', text: SP4 + '○ ' + c })),

      h('h2', { class: 'sec', text: '2. 피해상황' }),
      h('p', { class: 'i2', text: SP2 + '가. 인명피해 : ' + m.casualty.line }),
      m.casualty.rows.length ? h('table', { class: 'cas-table' },
        h('thead', {}, h('tr', {}, ['연번', '성 명', '나이/성별', '부상정도', '이송병원', '구급대', '비고'].map((t) => h('th', { text: t })))),
        h('tbody', {}, m.casualty.rows.map((r) => h('tr', {}, h('td', { text: String(r.no) }), [r.name, r.ageSex, r.injury, r.hospital, r.unit, r.remark].map((v) => h('td', { text: v })))))) : null,

      h('p', { class: 'i2', text: SP2 + '나. 재산피해 : ' + m.property.line }),
      m.property.notes.map((n) => h('p', { class: 'i4 note', text: SP4 + '※ ' + n.label + ' : ' + n.text })),

      h('h2', { class: 'sec', text: '3. 동원현황' }),
      h('p', { class: 'i2', text: SP2 + '가. 인  원 : ' + m.mobil.people }),
      h('p', { class: 'i2', text: SP2 + '나. 장  비 : ' + m.mobil.equip }),

      h('h2', { class: 'sec', text: '4. 조치사항 (관제진행상황)' }),
      m.actions.length ? m.actions.map((a) => h('p', { class: 'i4 act' + (a.bold ? ' b' : '') }, SP4 + '○ ' + App.Model.actionText(a))) : h('p', { class: 'empty', text: '(조치사항 없음)' }),

      h('h2', { class: 'sec', text: '5. 그 밖의 사항 (보험가입 및 언론보도내용 등)' }),
      h('p', { class: 'i4', text: SP4 + '○ 보험가입내역 : ' + m.others.insurance }),
      m.others.notes.map((t) => h('p', { class: 'i4', text: SP4 + '○ ' + t })));

    const nodes = [page1];
    if (m.hasImages) {
      const fig = (im, i, lab) => h('figure', {}, h('img', { src: im.dataUrl, alt: lab }), h('figcaption', { text: lab }));
      const get = (k) => m.images.find((x) => x.key === k).list;
      nodes.push(h('article', { class: 'paper attach-page', 'aria-label': '첨부 이미지' },
        h('div', { class: 'secret', text: m.secret }),
        get('map').length || get('building').length ? h('div', { class: 'pair' }, get('map').map((im) => fig(im, 0, '위치도')), get('building').map((im) => fig(im, 0, '건물전경'))) : null,
        get('photos').length ? h('div', { class: 'photos' }, get('photos').map((im, i) => fig(im, i, '현장사진 ' + (i + 1)))) : null));
    }
    return nodes;
  }

  function summaryText(m) {
    const H = m.head, ov = Object.fromEntries(m.overview.map((o) => [o.label.replace(/^.\.\s*/, '').replace(/\s+/g, ''), o.value]));
    return [`[${m.subject || '제목 없음'}]`, `○ 일시: ${ov['일시'] || ''}`, `○ 장소: ${ov['장소'] || ''}`, `○ 대상: ${ov['대상'] || ''}`, `○ 인명피해: ${m.casualty.line}`, `○ 동원: 인원 ${m.mobil.people} / 장비 ${m.mobil.equip}`, `(${m.secret}) ${H.origin}`].join('\n');
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) {
      const ta = h('textarea', { value: t, 'aria-hidden': 'true', style: 'position:fixed;left:-9999px' });
      document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (__) { /* 무시 */ } ta.remove(); return ok;
    }
  }

  function renderChecks() {
    const list = App.Checks.run(App.S);
    checkBox.replaceChildren(
      h('h3', { text: '점검 결과' }),
      list.length ? h('ul', {}, list.map((c) => h('li', { class: c.level }, h('button', { type: 'button', class: 'link', onclick: () => UI.goTo(c.tab, c.id), text: (c.level === 'warn' ? '확인 ' : '참고 ') + c.text })))) : h('p', { class: 'ok', text: '문제가 발견되지 않았습니다.' }));
  }
  function render() {
    if (!visible()) return;
    paperBox.replaceChildren(...paperNodes(App.Model.build(App.S)));
    renderChecks(); fitPaper();
  }
  const schedule = () => { if (!visible()) return; clearTimeout(timer); timer = setTimeout(render, 120); };

  /* 화면을 반으로 나눈 넓은 화면(901px~)에서는 A4 용지를 칸 너비에 맞춰 줄여 보여 준다 */
  const PAPER_PX = 210 / 25.4 * 96;
  function fitPaper() {
    if (!paperBox) return;
    const w = paperBox.clientWidth;
    const k = window.innerWidth > 900 && w > 0 ? Math.min(1, (w - 8) / PAPER_PX) : 1;
    paperBox.style.setProperty('--paper-zoom', String(Math.max(0.3, k)));
  }
  window.addEventListener('resize', fitPaper);

  async function exportWord(btn) {
    btn.disabled = true; const old = btn.textContent; btn.textContent = '만드는 중…';
    try {
      const m = App.Model.build(App.S);
      const blob = await App.Docx.build(m);
      const name = `${m.typeName}등사고상황보고서_${U.safeName(m.subject) || '제목없음'}_${U.stampName()}.docx`;
      U.downloadBlob(blob, name); U.toast('Word 파일을 저장했습니다: ' + name);
    } catch (e) { console.error(e); U.toast('Word 파일을 만들지 못했습니다: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  /* 한글(.hwpx): 서식(template/서식.hwpx)을 채워 저장 */
  async function exportHwpx(btn) {
    btn.disabled = true; const old = btn.textContent; btn.textContent = '만드는 중…';
    try {
      const m = App.Model.build(App.S);
      const blob = await App.Hwpx.build(m);
      const name = `${m.typeName}등사고상황보고서_${U.safeName(m.subject) || '제목없음'}_${U.stampName()}.hwpx`;
      U.downloadBlob(blob, name); U.toast('한글 파일을 저장했습니다: ' + name);
    } catch (e) { console.error(e); U.toast('한글 파일을 만들지 못했습니다: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  function build(root) {
    paperBox = h('div', { class: 'paper-wrap', 'aria-label': '보고서 미리보기 영역' });
    checkBox = h('section', { class: 'card checks' });
    const wordBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', text: 'Word로 저장 (.docx)' });
    wordBtn.addEventListener('click', () => exportWord(wordBtn));
    const hwpBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', text: '한글로 저장 (.hwpx)', disabled: !(App.Hwpx && App.Hwpx.available()), title: '한글 2018 이상에서 열 수 있습니다' });
    hwpBtn.addEventListener('click', () => exportHwpx(hwpBtn));
    root.replaceChildren(
      h('div', { class: 'preview-layout' },
        paperBox,
        h('aside', { class: 'side no-print' },
          h('section', { class: 'card' }, h('h3', { text: '내보내기' }),
            hwpBtn,
            wordBtn,
            h('button', { type: 'button', class: 'btn btn-block', onclick: () => { render(); window.print(); }, text: '인쇄 / PDF' }),
            h('button', { type: 'button', class: 'btn btn-block', onclick: async () => { (await copyText(summaryText(App.Model.build(App.S)))) ? U.toast('문자 요약을 복사했습니다.') : U.toast('복사하지 못했습니다.', 'err'); }, text: '문자 요약 복사' }),
            h('p', { class: 'hint', text: '인쇄 창에서 대상을 "PDF로 저장"으로 고르면 PDF 파일이 됩니다. 한글 파일(.hwpx)은 한글 2018 이상에서 열리며, .hwp가 필요하면 한글에서 [다른 이름으로 저장]하세요.' })),
          checkBox,
          UI.navButtons('actions', null))));
    render();
  }
  App.on('change', schedule);
  App.on('tab', () => { if (visible()) { render(); setTimeout(fitPaper, 0); } });
  App.Preview = { build, render };
})();
