/* 점검 결과: 비어 있는 필수 칸, 수동 수정으로 표와 달라진 값 등 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const F = App.Fields;

  function run(s) {
    const out = [], V = s.values, blank = (x) => !String(x || '').trim();
    const need = [['title', '제목', 'meta'], ['date', '발생개요 일시', 'meta'], ['place', '발생개요 장소', 'meta'], ['target', '발생개요 대상', 'meta'], ['content', '발생개요 사고내용', 'meta']];
    need.forEach(([k, name, tab]) => { if (blank(F.get(s, k))) out.push({ level: 'warn', text: `${name}이(가) 비어 있습니다.`, tab, id: 'f-' + k }); });
    if (blank(V.writer)) out.push({ level: 'info', text: '작성자가 비어 있습니다.', tab: 'meta', id: 'f-writer' });
    if (blank(V.manager)) out.push({ level: 'info', text: '보고책임자가 비어 있습니다.', tab: 'meta', id: 'f-manager' });
    if (!V.station || !V.center) out.push({ level: 'warn', text: '관할소방서(관할센터)가 선택되지 않아 ○○로 표시됩니다.', tab: 'meta', id: 'f-station' });
    if (blank(F.get(s, 'receiveAt'))) out.push({ level: 'warn', text: '접수시간이 비어 있습니다. (관제일지를 올리면 자동 입력)', tab: 'meta', id: 'f-receiveAt' });
    if (F.isLocked('casualtyLine') && F.get(s, 'casualtyLine') !== F.auto(s, 'casualtyLine')) out.push({ level: 'warn', text: `인명피해 요약이 표 집계("${F.auto(s, 'casualtyLine')}")와 다르게 직접 수정되어 있습니다.`, tab: 'status', id: 'f-casualtyLine' });
    if (!App.Calc.rows(s).length) out.push({ level: 'info', text: '인명피해 표가 비어 있습니다. (인명피해 없음이면 그대로 두세요)', tab: 'status' });
    if (!F.get(s, 'peopleLine')) out.push({ level: 'warn', text: '동원 인원이 입력되지 않았습니다.', tab: 'status', id: 'f-peopleLine' });
    if (!F.get(s, 'equipLine')) out.push({ level: 'warn', text: '동원 장비가 입력되지 않았습니다.', tab: 'status', id: 'f-equipLine' });
    const sel = s.lines.filter((l) => l.selected);
    if (!sel.length) out.push({ level: 'warn', text: '조치사항이 없습니다.', tab: 'actions', id: 'f-logfile' });
    else if (sel.some((l) => !String(l.text || '').trim())) out.push({ level: 'warn', text: '내용이 비어 있는 조치사항 줄이 있습니다.', tab: 'actions' });
    return out;
  }
  App.Checks = { run };
})();
