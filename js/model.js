/* 보고서 문서 모델: 화면 미리보기와 Word 저장이 같은 모델을 쓴다 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, D = App.DATA, F = App.Fields;

  function jurisdictionText(s) {
    const st = s.values.station, ce = s.values.center;
    /* 소방서와 (센터)는 이어 쓰지 않고 줄을 바꾼다 */
    return st ? `${st}소방서\n(${ce ? ce + '119안전센터' : '○○119안전센터'})` : '○○소방서\n(○○119안전센터)';
  }

  /* 라. 건물구조: ○조, ○층, 연면적○㎡, 바닥면적○㎡ (비운 칸은 빼고, 이전 한 줄 입력은 그대로 사용) */
  function structureText(V) {
    const t = (x) => String(x || '').trim(), parts = [];
    if (t(V.structKind)) parts.push(t(V.structKind).replace(/조$/, '') + '조');
    if (t(V.structFloors)) parts.push(t(V.structFloors).replace(/층$/, '') + '층');
    if (t(V.areaTotal)) parts.push('연면적 ' + t(V.areaTotal).replace(/\s*㎡$/, '') + '㎡');
    if (t(V.areaFloor)) parts.push('바닥면적 ' + t(V.areaFloor).replace(/\s*㎡$/, '') + '㎡');
    return parts.join(', ') || t(V.structure);
  }
  /* 대상 비고: 글자가 있는 층만 아래층부터 "※ 용도 : (지1) 창고, (1층) …" */
  function targetNotes(s) {
    const parts = D.floorKeys(s.floorRange).filter((k) => String(s.floors[k] || '').trim()).map((k) => `${D.floorShort(k)} ${String(s.floors[k]).trim()}`);
    const notes = [];
    if (parts.length) notes.push('용도 : ' + parts.join(', '));
    const free = String(s.values.targetNote || '').trim().replace(/^※\s*/, '');
    if (free) notes.push(free);
    return notes;
  }

  /* 보고서 종류: 직접 고른 값 > 관제일지 자동 판별 > 구조 */
  function reportType(s) {
    const T = D.REPORT_TYPES, pick = s.values.reportType;
    return T[pick] ? pick : (T[s.log.auto.reportType] ? s.log.auto.reportType : D.DEFAULT_REPORT_TYPE);
  }

  function build(s) {
    const V = s.values, g = (k) => F.get(s, k);
    const trim = (x) => String(x || '').trim();
    const letters = ['가', '나', '다', '라', '마', '바'];
    const ov = [['일  시', trim(g('date'))], ['장  소', trim(g('place'))], ['대  상', trim(g('target'))]];
    const noteAfter = 2; /* 대상 다음에 ※ 비고 */
    if (structureText(V)) ov.push(['건물구조', structureText(V)]);
    ov.push(['원  인', trim(g('cause')) || D.DEFAULTS.pending]);
    const overview = ov.map((o, i) => ({ label: `${letters[i]}. ${o[0]}`, value: o[1], notes: i === noteAfter ? targetNotes(s) : [] }));
    const nextLetter = letters[ov.length];
    const content = String(g('content') || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

    const rows = App.Calc.rows(s).map((c, i) => ({ no: i + 1, name: s.maskNames ? App.Calc.maskName(c.name) : trim(c.name), ageSex: App.Calc.ageSexText(c), injury: trim(c.injury), hospital: trim(c.hospital), unit: trim(c.unit), remark: trim(c.remark) }));
    const actions = s.lines.filter((l) => l.selected).slice().sort((a, b) => (a.ord - b.ord) || (a.t - b.t)).map((l) => ({ time: trim(l.timeLabel), actor: U.spaced3(l.actor), text: trim(l.text), bold: !!l.bold }));
    const images = D.ATTACH.map((a) => ({ key: a.key, label: a.label, list: s.images[a.key] || [] }));

    return {
      secret: D.SECRET, type: reportType(s), typeName: D.REPORT_TYPES[reportType(s)].name, title: D.REPORT_TYPES[reportType(s)].title,
      head: { to: trim(g('to')), ref: trim(V.ref), from: trim(g('from')), reportAt: trim(g('reportAt')), writer: trim(V.writer), manager: trim(V.manager), origin: trim(g('origin')), jurisdiction: jurisdictionText(s), receiveAt: trim(g('receiveAt')) },
      subject: trim(g('title')),
      overview, contentLabel: `${nextLetter}. 사고내용`, content,
      casualty: { line: trim(g('casualtyLine')), rows },
      property: { line: trim(g('propertyLine')) || D.DEFAULTS.pending, notes: [['부 동 산', trim(V.propImmovableNote)], ['동    산', trim(V.propMovableNote)]].filter((n) => n[1]).map((n) => ({ label: n[0], text: n[1] })) },
      others: { insurance: App.Calc.insuranceLine(s), notes: String(V.etcNote || '').split(/\r?\n/).map((x) => x.trim().replace(/^[○●·\-]\s*/, '')).filter(Boolean) },
      mobil: { people: trim(g('peopleLine')) || '-', equip: trim(g('equipLine')) || '-' },
      actions, images, hasImages: images.some((i) => i.list.length),
    };
  }
  const actionText = (a) => `${a.time}${a.actor ? ` (${a.actor})` : ''} ${a.text}`.trim();

  App.Model = { build, reportType, jurisdictionText, actionText, structureText, targetNotes };
})();
