/* 관제일지 분석 → 사건정보·동원현황 자동 기입값 만들기 (모든 값은 화면에서 고칠 수 있다) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, D = App.DATA;
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

  /* ── 관할센터 → 소방서 ── */
  function pickJurisdiction(meta) {
    const name = clean(meta && meta.center).replace(/119.*$/, '').replace(/안전센터$/, '').trim();
    if (!name) return null;
    const st = D.STATIONS.find((s) => s.centers.includes(name));
    return st ? { station: st.name, center: name } : null;
  }

  /* ── 위치: "(지)대구광역시 북구 관음동 1284-2 K마트 건물" ── */
  function parseLoc(loc) {
    const t = clean(loc).replace(/^\((?:지|도)\)\s*/, '').split(' ');
    if (t.length < 3) return null;
    const rest = t.slice(3);
    const hasJibun = rest[0] && /^\d+(-\d+)?$/.test(rest[0]);
    return { city: t[0].replace(/(광역시|특별시|특별자치시|특별자치도)$/, ''), gu: t[1], dong: t[2], jibun: hasJibun ? rest[0] : '', building: rest.slice(hasJibun ? 1 : 0).join(' ') };
  }
  const ROAD = /([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/;
  const roadOf = (s) => { const m = clean(s).match(ROAD); return m ? m[1] + ' ' + m[2] : ''; };

  /* 도로명주소: 신고접수 (도) → [도로명주소] 변경 → (추가) 입력 순으로 가장 나중 값을 쓴다 */
  function pickRoad(events) {
    let road = '';
    events.forEach((e) => {
      const t = clean(e.text);
      if (e.kind === '신고접수') { const i = t.indexOf('(도)'); if (i >= 0) road = roadOf(t.slice(i + 3)) || road; }
      if (e.kind === '긴급구조정보수정') {
        const i = t.indexOf('[도로명주소]');
        if (i >= 0) { const part = t.slice(i + 7); road = roadOf(part.includes('->') ? part.split('->').pop() : part) || road; }
        const re = /\(추가\)\s*([^\[\]()]*)/g; let m;
        while ((m = re.exec(t))) road = roadOf(m[1]) || road;
      }
    });
    return road;
  }

  const SCENE = /(내려앉|붕괴|무너|도괴|화재|연기|불길|폭발|누출|추락|매몰|침수|전도)/;
  function pickFloor(events) {
    for (const e of events) {
      if (e.kind !== '긴급구조정보수정') continue;
      const m = clean(e.text).match(/\(추가\)[^()[\]]*?(\d{1,2})\s*층/);
      if (m) return m[1];
    }
    let arrived = false;
    for (const e of events) {
      if (e.kind === '현장도착보고') arrived = true;
      if (!arrived || e.kind === '긴급구조정보수정') continue;
      const t = clean(e.text);
      if (SCENE.test(t)) { const m = t.match(/(\d{1,2})\s*층/); if (m) return m[1]; }
    }
    return '';
  }

  /* ── 대상: 건물명 · 호수 · 상호를 관제일지에서 찾는다 (못 찾으면 비워 두며, 모두 화면에서 고칠 수 있다) ── */
  const TW = D.TARGET_WORDS;
  const escRe = (a) => a.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const BAN_END = '(?![가-힣A-Za-z0-9])';
  const NAME_BODY = '(?:[가-힣A-Za-z0-9&·]{2,12}?|[A-Za-z])(?:' + escRe(TW.shop) + ')';
  const BUILD_RE = new RegExp('(?:^|[^가-힣A-Za-z0-9])([가-힣A-Za-z0-9&·]{2,12}?(?:' + escRe(TW.building) + '))' + BAN_END);
  const TARGET_KINDS = ['신고접수', '긴급구조정보수정', '무전접보', '유무선전화'];
  const targetTexts = (events, untilArrival) => {
    const out = []; let arrived = false;
    for (const e of events) {
      if (e.kind === '현장도착보고') arrived = true;
      if (!TARGET_KINDS.includes(e.kind)) continue;
      if (untilArrival && arrived && e.kind !== '긴급구조정보수정' && e.kind !== '신고접수') continue;
      out.push(clean(e.text));
    }
    return out;
  };
  const skipName = (n) => TW.skip.some((w) => n.includes(w));

  /* 위치에 건물명이 없을 때: 신고·정보변경·도착 전 무전에서 "○○아파트" 같은 이름을 찾는다 */
  function pickBuildingName(events) {
    for (const t of targetTexts(events, true)) {
      const m = t.match(BUILD_RE);
      if (m && !skipName(m[1])) return m[1];
    }
    return '';
  }

  /* 호수: "101동 1203호" 또는 "302호" (2~4자리, "1호차"·"2호선"·전화번호는 제외) */
  const UNIT_DH = /(?<![\d-])(\d{1,3})\s*동\s*(\d{1,4})\s*호(?!차|선|기|점|패|령|칙|분|증)/;
  const UNIT_H = /(?<![\d-])([B지]?\d{2,4})\s*호(?!차|선|기|점|패|령|칙|분|증)/;
  function pickUnit(events) {
    for (const t of targetTexts(events, false)) { const m = t.match(UNIT_DH); if (m) return { dong: m[1], ho: m[2] }; }
    for (const t of targetTexts(events, false)) { const m = t.match(UNIT_H); if (m) return { dong: '', ho: m[1].replace(/^[B지]/, '') }; }
    return null;
  }

  /* 상호: "2층 오케이당구장"처럼 층 바로 뒤에 업소명이 나오는 경우. 건물명이 이미 있으면 "케이마트 2층" 꼴은 건물명일 수 있어 쓰지 않는다 */
  function pickShop(events, floor, hasBuilding) {
    if (!floor) return '';
    const texts = targetTexts(events, false);
    const after = new RegExp('(?<![0-9지하])' + floor + '\\s*층\\s*[,:]?\\s*(' + NAME_BODY + ')(?:은|는|이|가|을|를|에|의|도)?' + BAN_END);
    for (const t of texts) { const m = t.match(after); if (m && !skipName(m[1])) return m[1]; }
    if (hasBuilding) return '';
    const before = new RegExp('(?:^|[^가-힣A-Za-z0-9])(' + NAME_BODY + ')\\s*(?:건물\\s*)?' + floor + '\\s*층');
    for (const t of texts) { const m = t.match(before); if (m && !skipName(m[1])) return m[1]; }
    return '';
  }

  /* 대상 문구 만들기: ○건물 ○동 ○층 ○호(상호) */
  function buildTarget(events, loc) {
    let building = loc.building;
    if (!building) building = pickBuildingName(events);
    let floor = pickFloor(events);
    const unit = pickUnit(events);
    if (!floor && unit && unit.ho.length >= 3) floor = String(parseInt(unit.ho.slice(0, -2), 10) || '');
    const shop = pickShop(events, floor, !!loc.building);
    const dong = unit && unit.dong && !String(building).includes(unit.dong + '동') ? unit.dong + '동' : '';
    const base = [building, dong, floor ? floor + '층' : '', unit ? unit.ho + '호' : ''].filter(Boolean).join(' ');
    return shop && !base.includes(shop) ? base + '(' + shop + ')' : base;
  }

  /* 선착대 도착 후 처음 보고된 현장상황 한 문장 */
  function pickScene(events) {
    let arrived = false;
    for (const e of events) {
      if (e.kind === '현장도착보고') arrived = true;
      if (!arrived || e.kind !== '무전접보') continue;
      const body = clean(e.text).replace(/^-\s*/, '').replace(/^[^\s-]{1,12}(?: 및 [^\s-]{1,12})?\s*-\s*/, '');
      const seg = body.split('/')[0].trim();
      if (seg && SCENE.test(seg)) return seg;
    }
    for (const e of events) {
      if (e.kind !== '긴급구조정보수정') continue;
      const m = clean(e.text).match(/추가신고내용\]\s*:\s*(.+)/);
      if (!m) continue;
      const seg = m[1].split('/').map((x) => x.trim()).find((x) => SCENE.test(x));
      if (seg) return seg.replace(/\(추가\).*$/, '').trim();
    }
    return '';
  }

  /* 원인: 관제일지의 현장 보고 중 "원인 : ○○" 또는 "○○ 추정"이 들어 있는 문구(가장 나중에 보고된 것). 없으면 빈 값 */
  const CAUSE_WORDS = /(전기|누전|합선|배터리|과열|담배|꽁초|부주의|방화|가스|음식물|화기|불씨|기계|요인|노후|결함|하중|균열|철거|공사|리모델링|낙하|파손|미상)/;
  function pickCause(events) {
    let found = '';
    events.forEach((e) => {
      if (/^(신고접수|출동지령|추가출동지령|출동보고|협조요청)$/.test(e.kind || '')) return;
      let text = clean(e.text);
      const add = text.match(/추가신고내용\]\s*:\s*(.+)/); if (add) text = add[1];
      text.split(/\s*[/\n]\s*/).forEach((seg) => {
        seg = clean(seg).replace(/^-\s*/, '');
        const m = seg.match(/(?:발화|화재|사고|붕괴)?\s*원\s*인\s*(?:은|는|이)?\s*[:：]?\s*(.+)$/);
        if (m && m[1].trim().length >= 2 && !/^(조사|확인)\s*중?$/.test(m[1].trim())) { found = m[1].trim(); return; }
        if (/추정/.test(seg) && CAUSE_WORDS.test(seg)) found = seg;
      });
    });
    return cut(found, 80);
  }

  /* 대피자·인명피해 인원(가장 나중에 언급된 값) */
  function pickCounts(events) {
    let evac = 0; const inj = {};
    events.forEach((e) => {
      if (e.kind === '긴급구조정보수정') return;
      const t = clean(e.text);
      const m = t.match(/(\d+)\s*명[^/,]{0,15}대피|대피(?:자|인원|완료)?[^\d/,]{0,6}(\d+)\s*명/);
      if (m) evac = +(m[1] || m[2]);
      D.LEVELS.forEach((l) => {
        const re = new RegExp(l + '\\s*(?:자|환자)?\\s*(\\d+)\\s*명', 'g'); let mm;
        while ((mm = re.exec(t))) inj[l] = +mm[1];
      });
    });
    return { evac, inj };
  }

  /* ── 동원 장비·소방 인원: 상황실이 적는 "수정후지시사항 : 18대 55명 / 구급 8 - … 구조 3 - … 펌프 1 - …" ── */
  const ORDER_CAT = /(구급|구조|펌프|탱크|화학|사다리|굴절|지휘)\s*(\d+)\s*-/g;
  function fromOrders(events) {
    let best = null;
    events.forEach((e) => {
      if (e.kind !== '긴급구조정보수정') return;
      const t = clean(e.text), i = t.lastIndexOf('[수정후지시사항]');
      if (i < 0) return;
      const after = t.slice(i + '[수정후지시사항]'.length), cats = {}; let m;
      ORDER_CAT.lastIndex = 0;
      while ((m = ORDER_CAT.exec(after))) cats[m[1]] = +m[2];
      if (!Object.keys(cats).length) return;
      const tot = after.match(/(\d+)\s*대\s*(\d+)\s*명/);
      best = { t: e.t, cats, vehicles: tot ? +tot[1] : 0, people: tot ? +tot[2] : 0, text: cut(after, 120) };
    });
    return best;
  }

  /* 지휘대가 현장에 도착하면 지휘차 1대로 센다(같은 지휘대가 여러 번 보고해도 1대). 지휘권 선언·출동지령만으로는 세지 않는다 */
  const UNIT_BRACKET = /\[([^[\]-]+)-([^[\]]+)\]/g;
  function fromCommandArrival(events) {
    const seen = new Map();
    events.forEach((e) => {
      if (e.kind !== '현장도착보고') return;
      const t = clean(e.text); let m, any = false;
      UNIT_BRACKET.lastIndex = 0;
      while ((m = UNIT_BRACKET.exec(t))) {
        any = true;
        const unit = clean(m[1] + '-' + m[2]);
        if (/지휘/.test(unit) && !/(신속기동|구급지휘|드론)/.test(unit) && !seen.has(unit.replace(/\(.*$/, ''))) seen.set(unit.replace(/\(.*$/, ''), e.t);
      }
      if (!any && /지휘/.test(t) && !/(신속기동|구급지휘|드론)/.test(t) && !seen.has(t)) seen.set(t, e.t); /* 대괄호 표기가 없는 문장 */
    });
    return seen;
  }

  /* 지시사항이 없을 때: 출동지령에 나온 차량을 차종별로 센다 */
  const VEH = /\[([^[\]]+?)-([^[\]]*?)\(([^()[\]]+)\)\]/g;
  function fromVehicles(events) {
    const seen = new Map();
    events.forEach((e) => {
      if (e.kind !== '출동지령' && e.kind !== '추가출동지령') return;
      const t = clean(e.text); VEH.lastIndex = 0; let m;
      while ((m = VEH.exec(t))) { const key = m[1] + '-' + m[2]; if (!seen.has(key)) seen.set(key, { dept: m[1], type: m[3] }); }
    });
    if (!seen.size) return null;
    const eq = {}, rescue = new Set();
    seen.forEach((v) => {
      let k = '기타';
      if (/지휘/.test(v.type)) return; /* 지휘차는 현장도착 때 센다 */
      if (/펌프/.test(v.type)) k = '펌프'; else if (/탱크/.test(v.type)) k = '탱크'; else if (/화학/.test(v.type)) k = '화학';
      else if (/사다리|고가/.test(v.type)) k = '사다리'; else if (/굴절/.test(v.type)) k = '굴절'; else if (/구급/.test(v.type)) k = '구급';
      else if (/구조/.test(v.type)) { rescue.add(v.dept); return; }
      eq[k] = (eq[k] || 0) + 1;
    });
    if (rescue.size) eq['구조'] = rescue.size;
    return { eq, count: seen.size };
  }

  /* ── 유관기관 현장 인원: "구청 직원 인원 : 대략 15명", "북구청 - 3명 출동 중" 처럼 같은 문장에 기관명과 인원이 있는 경우만 ── */
  const AGENCY = [['경찰', /경찰|지구대|파출소/], ['시청', /시청|시\s*재난|대구시(?!장)/], ['구청', /구청/], ['한전', /한전|한국전력/]];
  const NOT_STAFF = /(대피|환자|경상|중상|부상|이송|내부|실내|사망|구조자|거주|신고|전화|번호|연락처)/;
  const STAFF = /(출동|현장\s*확인|도착|투입|동원|파견|지원|직원|인원)/;
  function fromAgencies(events) {
    const out = {}, notes = {};
    events.forEach((e) => {
      if (e.kind === '긴급구조정보수정') return;
      const segs = String(e.text == null ? '' : e.text).split(/\s*[/\n]\s*/).map(clean);
      segs.forEach((seg, i) => {
        const nm = seg.match(/(\d+)\s*명/);
        if (!nm || NOT_STAFF.test(seg) || !STAFF.test(seg)) return;
        let hit = AGENCY.find((a) => a[1].test(seg));
        if (!hit && /^\D{0,3}\d+\s*명/.test(seg) && i > 0) hit = AGENCY.find((a) => a[1].test(segs[i - 1]));
        if (!hit) return;
        out[hit[0]] = +nm[1];
        notes[hit[0]] = `${U.fmtHM(e.t)} ${hit[0]} ${nm[1]}명 ← "${cut(seg, 50)}"`;
      });
    });
    return { out, notes };
  }

  /* 화재/구조 구분: 관제일지 위쪽의 분류·종별에 "화재"가 있으면 화재, 그 칸이 비어 있으면 신고접수 내용으로 본다. 그 밖에는 구조 */
  function detectType(events, meta) {
    const head = clean((meta && meta.cls) || '') + ' ' + clean((meta && meta.kind) || '');
    if (head.trim()) return /화재/.test(head) ? 'fire' : 'rescue';
    const first = events.find((e) => e.kind === '신고접수');
    return first && /화재/.test(clean(first.text)) ? 'fire' : 'rescue';
  }

  /* ── 분석 전체 ── */
  function analyze(events, meta) {
    const A = { reportType: detectType(events, meta), city: '', station: '', center: '', title: '', place: '', target: '', scene: '', cause: '', evac: 0, inj: {}, people: {}, equip: {}, notes: { people: [], equip: [] } };
    const j = pickJurisdiction(meta);
    if (j) { A.station = j.station; A.center = j.center; }

    const loc = parseLoc(meta && meta.loc);
    if (loc) {
      A.city = loc.city;
      A.title = [loc.city, loc.gu, loc.dong, clean(meta.cls) || '사고'].join(' ');
      const road = pickRoad(events), dj = loc.dong + (loc.jibun ? ' ' + loc.jibun : '');
      A.place = road ? `${loc.gu} ${road}(${dj})` : `${loc.gu} ${dj}`;
      A.target = buildTarget(events, loc);
    }
    A.scene = cut(pickScene(events), 120);
    A.cause = pickCause(events);
    const c = pickCounts(events);
    A.evac = c.evac; A.inj = c.inj;

    /* 장비 · 소방 인원 */
    const ord = fromOrders(events);
    if (ord) {
      const direct = ['펌프', '탱크', '화학', '사다리', '굴절', '구조', '구급'];
      let sum = 0;
      direct.forEach((k) => { if (ord.cats[k] > 0) { A.equip[k] = ord.cats[k]; sum += ord.cats[k]; } });
      /* 지휘차는 따로 세므로(현장도착 시) 지시사항의 지휘 대수는 기타에서 뺀다 */
      const etc = ord.vehicles ? Math.max(0, ord.vehicles - sum - (ord.cats['지휘'] || 0)) : 0;
      if (etc > 0) A.equip['기타'] = etc;
      if (ord.people > 0) A.people['소방'] = ord.people;
      A.notes.equip.push(`${U.fmtHM(ord.t)} 지시사항: ${ord.vehicles ? ord.vehicles + '대 ' : ''}${ord.people ? ord.people + '명 / ' : ''}${direct.filter((k) => A.equip[k]).map((k) => k + ' ' + A.equip[k]).join(', ')}${A.equip['기타'] ? ' (그 밖의 차량 ' + A.equip['기타'] + '대는 기타로 계산)' : ''}`);
      if (ord.people) A.notes.people.push(`소방 ${ord.people}명 ← ${U.fmtHM(ord.t)} 지시사항의 "${ord.vehicles}대 ${ord.people}명"`);
    } else {
      const v = fromVehicles(events);
      if (v) {
        Object.keys(v.eq).forEach((k) => { A.equip[k] = v.eq[k]; });
        A.notes.equip.push(`출동지령에 나온 차량 ${v.count}대를 차종별로 센 값입니다(구조는 구조대 수). 지시사항 기록이 없어 소방 인원은 비워 둡니다.`);
      }
    }
    const cmd = fromCommandArrival(events);
    if (cmd.size) {
      A.equip['지휘차'] = cmd.size;
      A.notes.equip.push(`지휘차 ${cmd.size}대 ← 지휘대 현장도착 보고: ${Array.from(cmd).map(([k, t]) => `${U.fmtHM(t)} ${cut(k, 30)}`).join(', ')}`);
    }
    const ag = fromAgencies(events);
    Object.keys(ag.out).forEach((k) => { A.people[k] = ag.out[k]; A.notes.people.push(ag.notes[k]); });
    return A;
  }

  /* 분석값을 현재 보고서에 넣는다. 사용자가 직접 고친 칸은 건드리지 않는다 */
  function applyTo(s) {
    const A = s.log.auto;
    if (A.station && (s.autoSel.station || !s.values.station)) {
      s.values.station = A.station; s.values.center = A.center; s.autoSel.station = true;
    }
    [['people', D.PEOPLE], ['equip', D.EQUIP]].forEach(([g, list]) => {
      list.forEach((k) => { if (!s.mobEdit[g][k]) s[g][k] = A[g][k] > 0 ? String(A[g][k]) : ''; });
    });
  }
  /* 한 묶음(인원/장비)을 관제일지 기준으로 되돌린다 */
  function resetGroup(s, g) {
    s.mobEdit[g] = {};
    applyTo(s);
  }

  /* 사고내용 초안: 현장상황 + 대피자·인명피해 */
  function contentText(s) {
    const A = s.log && s.log.auto;
    if (!A) return '';
    const lines = [];
    if (A.scene) lines.push(A.scene);
    const parts = [];
    if (A.evac) parts.push('대피 ' + A.evac + '명');
    if (App.Calc.rows(s).length) parts.push(App.Fields.get(s, 'casualtyLine'));
    else {
      const inj = D.LEVELS.filter((l) => A.inj && A.inj[l]).map((l) => `${l} ${A.inj[l]}명`);
      if (inj.length) parts.push(inj.join(', '));
    }
    if (parts.length) lines.push(parts.join(', '));
    return lines.join('\n');
  }

  App.Auto = { analyze, applyTo, resetGroup, contentText };
})();
