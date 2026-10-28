/* 관제일지 사건 → 보고서 조치사항 문장으로 변환하고, 주요사건을 가려낸다 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U;

  /* 사용자가 정한 주요 조치사항 12가지 (label은 화면 표시용) */
  const CATS = {
    report: '신고접수 및 출동지령',
    relay: '유관기관 상황전파',
    scene: '선착대 현장도착 및 현장상황',
    command: '지휘단 현장도착 및 지휘권 선언',
    medical: '구급대 임시의료소 설치',
    rapid: '신속기동팀 출동 및 현장도착',
    judge: '상황판단회의',
    search: '인명검색 사항',
    dmat: 'DMAT 출동 여부',
    order: '지시사항',
    mayor: '대구시장 현장 도착',
    fire: '초진 및 완진',
  };

  /* 규칙은 위에서부터 먼저 맞는 것이 적용된다. mode: first=처음 1건만, all=모두 */
  const RULES = [
    { cat: 'order', mode: 'all', test: (e) => e.kind !== '긴급구조정보수정' && /(대통령|소방청|본부장|행정안전부|행안부)/.test(e.text) && /지시/.test(e.text) },
    { cat: 'mayor', mode: 'first', test: (e) => /시장/.test(e.text) && /도착/.test(e.text) && !/(예정|도착\s*시|도착하면)/.test(e.text) },
    { cat: 'dmat', mode: 'all', test: (e) => /DMAT/i.test(e.text) },
    { cat: 'judge', mode: 'first', test: (e) => /상황\s*판단\s*회의/.test(e.text) },
    { cat: 'search', mode: 'all', test: (e) => e.kind !== '긴급구조정보수정' && /인명\s*(검색|수색)/.test(e.text) },
    { cat: 'medical', mode: 'first', test: (e) => /임시\s*(응급)?\s*의료소/.test(e.text) },
    { cat: 'rapid', id: 'rapidGo', mode: 'first', test: (e) => /출동지령/.test(e.kind) && /신속기동/.test(e.text), body: '신속기동팀 출동', actor: '상황실' },
    { cat: 'rapid', id: 'rapidArrive', mode: 'first', test: (e) => e.kind === '현장도착보고' && /신속기동/.test(e.text), body: '신속기동팀 현장도착', actor: '신속기동팀' },
    { cat: 'command', id: 'cmdDeclare', mode: 'first', test: (e) => /지휘권\s*선언/.test(e.text) },
    { cat: 'command', id: 'cmdArrive', mode: 'first', test: (e) => e.kind === '현장도착보고' && /지휘/.test(e.text) && !/(신속기동|구급지휘|드론)/.test(e.text), body: '현장도착' },
    { cat: 'scene', id: 'sceneInfo', mode: 'first', test: (e, c) => c.arrived && e.kind !== '긴급구조정보수정' && /(내려앉|붕괴|무너|도괴)/.test(e.text) },
    { cat: 'scene', id: 'sceneArrive', mode: 'first', test: (e) => e.kind === '현장도착보고', body: '현장도착' },
    { cat: 'report', mode: 'first', test: (e) => e.kind === '신고접수', body: '신고접수 및 출동지령', actor: '상황실' },
    { cat: 'fire', mode: 'all', test: (e) => /(초진|완진)/.test(e.text) },
  ];
  const RELAY_KINDS = ['무전접보', '협조요청', '유무선전화'];
  const AGENCIES = [['경찰', /(경찰|공동대응)/], ['구청', /구청/], ['한전', /한전/], ['가스', /(가스|에너지)/]];
  const isRelay = (e) => RELAY_KINDS.includes(e.kind) && /(경찰|구청|한전|가스|에너지|공동대응)/.test(e.text) && /(통보|전파|요청)/.test(e.text);

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  /* 이벤트 → {actor, body} (예: "강북지휘 - 약 40평 …" → 강북지휘 / 약 40평 …) */
  const UNIT_KINDS = ['출동보고', '현장도착보고', '귀소보고', '귀소완료보고', '병원도착보고', '차량정체'];
  function compose(e) {
    const t = clean(e.text);
    if (UNIT_KINDS.includes(e.kind)) {
      const m = t.match(/\[([^\]\-]+)-([^\]]+)\]/);
      if (m) return { actor: m[2].replace(/\(.*$/, '').trim(), body: e.kind.replace(/보고$/, '').replace(/완료$/, ' 완료') };
    }
    if (!['신고접수', '출동지령', '추가출동지령', '협조요청', '긴급구조정보수정'].includes(e.kind)) {
      const m = t.match(/^([^\s\-]{1,12}(?: 및 [^\s\-]{1,12})?)\s*-\s*(.+)$/);
      if (m) return { actor: m[1], body: m[2] };
      return { actor: '상황실', body: t.replace(/^-\s*/, '') };
    }
    return { actor: '상황실', body: t };
  }

  function timeLabel(ms, baseMs) {
    return baseMs && !U.sameDay(ms, baseMs) ? `${U.fmtShortDate(ms)} ${U.fmtHM(ms)}` : U.fmtHM(ms);
  }

  /* 전체 이벤트 → 줄(line) 목록. 주요사건은 selected + bold 로 자동 반영 */
  function buildLines(events) {
    const baseMs = events.length ? events[0].t : 0;
    const used = {}; const ctx = { arrived: false };
    const lines = events.map((e, i) => {
      const c = compose(e);
      const line = { id: 'e' + i, manual: false, t: e.t, timeLabel: timeLabel(e.t, baseMs), kind: e.kind, cat: '', actor: c.actor, text: c.body, raw: clean(e.text), bold: false, selected: false };
      const hm = line.text.match(/^\(\s*(\d{1,2}):(\d{2})\s*\)\s*(.+)$/);
      if (hm) { line.timeLabel = U.pad(+hm[1]) + ':' + hm[2]; line.text = hm[3]; }
      if (e.kind === '현장도착보고') ctx.arrived = true;
      for (const r of RULES) {
        const key = r.id || r.cat;
        if (r.mode === 'first' && used[key]) continue;
        if (!r.test(e, ctx)) continue;
        used[key] = true;
        line.cat = r.cat; line.bold = true; line.selected = true;
        if (r.body) line.text = r.body;
        if (r.actor) line.actor = r.actor;
        break;
      }
      return line;
    });
    /* 유관기관 상황전파: 처음 해당 건 1줄로 묶어 표시 */
    const first = events.findIndex(isRelay);
    if (first >= 0 && !lines[first].cat) {
      const found = new Set();
      events.forEach((e) => { if (isRelay(e) && e.t <= events[first].t + 30 * 60000) AGENCIES.forEach(([n, re]) => { if (re.test(e.text)) found.add(n); }); });
      const names = AGENCIES.map((a) => a[0]).filter((n) => found.has(n));
      Object.assign(lines[first], { cat: 'relay', bold: true, selected: true, actor: '상황실', text: `유관기관(${names.join(', ')}) 상황전파` });
    }
    return { lines, baseMs };
  }

  App.Classify = { CATS, buildLines, timeLabel };
})();
