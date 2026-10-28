/* 상태 관리: 자동기입 항목(Fields), 저장(localStorage), 차수, 백업 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, D = App.DATA;
  const KEY = 'disaster-all-in-one:v1';
  const REVKEY = 'disaster-all-in-one:rev:v1';

  /* ── 자동기입 항목: 자동값 함수 + 사용자가 고친 값(locked) ── */
  const AUTO = {
    to: { label: '수신', auto: () => D.DEFAULTS.to },
    from: { label: '발신', auto: () => D.DEFAULTS.from },
    origin: { label: '발신지', auto: () => D.DEFAULTS.origin },
    reportAt: { label: '보고일자', auto: (s) => U.fmtDateTime(s.stamp) },
    receiveAt: { label: '접수시간', auto: (s) => s.log.receiveTime || '' },
    date: { label: '가. 일시', auto: (s) => (s.log.receiveMs ? U.fmtDateTimeSec(s.log.receiveMs) : '') },
    title: { label: '제목', auto: (s) => s.log.auto.title },
    place: { label: '나. 장소', auto: (s) => s.log.auto.place },
    target: { label: '다. 대상', auto: (s) => s.log.auto.target },
    cause: { label: '마. 원인', auto: (s) => (s.log.auto && s.log.auto.cause) || D.DEFAULTS.pending },
    content: { label: '바. 사고내용', auto: (s) => App.Auto.contentText(s) },
    casualtyLine: { label: '가. 인명피해', auto: (s) => App.Calc.casualtyLine(s) },
    propertyLine: { label: '나. 재산피해', auto: (s) => App.Calc.propertyLine(s) },
    peopleLine: { label: '가. 인원', auto: (s) => App.Calc.peopleLine(s) },
    equipLine: { label: '나. 장비', auto: (s) => App.Calc.equipLine(s) },
  };
  const Fields = {
    isAuto: (k) => k in AUTO,
    auto: (s, k) => (AUTO[k] ? AUTO[k].auto(s) : ''),
    isLocked: (k) => !!App.S && Object.prototype.hasOwnProperty.call(App.S.locked, k),
    get(s, k) {
      if (AUTO[k]) return Object.prototype.hasOwnProperty.call(s.locked, k) ? s.locked[k] : AUTO[k].auto(s);
      return s.values[k] == null ? '' : s.values[k];
    },
    set(s, k, v) { if (AUTO[k]) s.locked[k] = v; else s.values[k] = v; },
    reset(s, k) { delete s.locked[k]; if (k === 'reportAt') s.stamp = Date.now(); },
  };

  /* 관제일지 분석 결과(자동 기입값) 기본 형태 */
  const str0 = (v, max) => (typeof v === 'string' ? v.slice(0, max || 5000) : '');
  const fin0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  function blankAuto() { return { reportType: '', city: '', station: '', center: '', title: '', place: '', target: '', scene: '', cause: '', evac: 0, inj: {}, people: {}, equip: {}, notes: { people: [], equip: [] } }; }
  function normAuto(a) {
    const o = blankAuto();
    if (!a || typeof a !== 'object') return o;
    ['city', 'station', 'center', 'title', 'place', 'target', 'scene', 'cause'].forEach((k) => { o[k] = str0(a[k], 300); });
    o.reportType = App.DATA.REPORT_TYPES[a.reportType] ? a.reportType : '';
    o.evac = fin0(a.evac);
    D.LEVELS.forEach((l) => { if (a.inj && fin0(a.inj[l]) > 0) o.inj[l] = fin0(a.inj[l]); });
    D.PEOPLE.forEach((k) => { if (a.people && fin0(a.people[k]) > 0) o.people[k] = fin0(a.people[k]); });
    D.EQUIP.forEach((k) => { if (a.equip && fin0(a.equip[k]) > 0) o.equip[k] = fin0(a.equip[k]); });
    ['people', 'equip'].forEach((g) => { if (a.notes && Array.isArray(a.notes[g])) o.notes[g] = a.notes[g].slice(0, 12).map((x) => str0(x, 260)); });
    return o;
  }

  /* ── 빈 보고서 ── */
  function blank() {
    return {
      v: 1, stamp: Date.now(), locked: {}, autoSel: { station: false }, mobEdit: { people: {}, equip: {} },
      values: { reportType: '', ref: '', station: '', center: '', writer: '', manager: '', title: '', date: '', place: '', target: '', targetNote: '', structure: '', structKind: '', structFloors: '', areaTotal: '', areaFloor: '', cause: '', content: '', propMovable: '', propImmovable: '', propMovableNote: '', propImmovableNote: '', etcNote: '' },
      floors: {}, floorRange: { below: D.FLOORS.belowMin, above: D.FLOORS.aboveMin }, mapAuto: true,
      casualties: [], insurance: [], maskNames: false, people: {}, equip: {},
      log: { fileName: '', baseMs: 0, receiveTime: '', receiveMs: 0, count: 0, auto: blankAuto() },
      lines: [], images: { map: [], building: [], photos: [] },
    };
  }

  /* 불러온 데이터를 검사해서 안전한 형태로 맞춘다(백업 파일 등) */
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max || 5000) : '');
  /* v1.5 이전 저장본은 나이/성별이 한 칸(ageSex)이었다. "/"로 나뉜 글은 나이·성별 두 칸으로 나누고, 그 밖의 글은 보고서 결과가 바뀌지 않도록 통째로 나이 칸에 둔다 */
  function legacySplit(c) { return App.Calc.splitAgeSex(str(c && c.ageSex, 40)); }
  const hasNew = (c) => c && (typeof c.age === 'string' || typeof c.sex === 'string');
  const ageOf = (c) => (hasNew(c) ? str(c.age, 20) : legacySplit(c).age);
  const sexOf = (c) => (hasNew(c) ? str(c.sex, 20) : legacySplit(c).sex);
  const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  function normalize(o) {
    const b = blank();
    if (!o || typeof o !== 'object') return b;
    b.stamp = fin(o.stamp) || b.stamp;
    if (o.locked && typeof o.locked === 'object') Object.keys(AUTO).forEach((k) => { if (typeof o.locked[k] === 'string') b.locked[k] = str(o.locked[k]); });
    if (o.values && typeof o.values === 'object') Object.keys(b.values).forEach((k) => { b.values[k] = str(o.values[k], 8000); });
    if (Array.isArray(o.casualties)) b.casualties = o.casualties.slice(0, 500).map((c) => ({ name: str(c && c.name, 40), age: ageOf(c), sex: sexOf(c), injury: str(c && c.injury, 300), hospital: str(c && c.hospital, 60), unit: str(c && c.unit, 40), remark: str(c && c.remark, 100), level: D.LEVELS.includes(c && c.level) ? c.level : '경상' }));
    if (Array.isArray(o.insurance)) b.insurance = o.insurance.slice(0, 30).map((r) => ({ company: str(r && r.company, 40), amount: str(r && r.amount, 40) }));
    /* v1.0 저장본: 직접 입력해 둔 일시·제목·장소·대상·사고내용은 '수정됨'으로 그대로 유지 */
    ['date', 'title', 'place', 'target', 'content'].forEach((k) => { if (b.values[k] && !Object.prototype.hasOwnProperty.call(b.locked, k)) b.locked[k] = b.values[k]; });
    b.autoSel = { station: !!(o.autoSel && o.autoSel.station) };
    /* 직접 고친 숫자 칸 표시(v1.0 저장본에는 없으므로, 값이 들어 있는 칸은 직접 입력한 것으로 본다) */
    ['people', 'equip'].forEach((g) => { (g === 'people' ? D.PEOPLE : D.EQUIP).forEach((k) => {
      const legacy = !(o.mobEdit && typeof o.mobEdit === 'object') && o[g] && String(o[g][k] || '').trim() !== '';
      if (legacy || (o.mobEdit && o.mobEdit[g] && o.mobEdit[g][k] === true)) b.mobEdit[g][k] = true;
    }); });
    /* v1.0~1.3 저장본의 한 줄 건물구조("철근콘크리트조, 4/1층, 연면적 892.92㎡")는 새 칸으로 나눠 옮긴다 */
    if (b.values.structure && !(b.values.structKind || b.values.structFloors || b.values.areaTotal || b.values.areaFloor)) {
      const rest = [];
      b.values.structure.split(/\s*,\s*/).forEach((p) => {
        const t = p.trim(); let m;
        if (!t) return;
        if ((m = t.match(/^(.+?)조$/))) b.values.structKind = m[1];
        else if ((m = t.match(/^연면적\s*([\d.,]+)\s*㎡?$/))) b.values.areaTotal = m[1];
        else if ((m = t.match(/^(?:바닥면적|건축면적)\s*([\d.,]+)\s*㎡?$/))) b.values.areaFloor = m[1];
        else if ((m = t.match(/^(.+?)층$/))) b.values.structFloors = m[1];
        else rest.push(t);
      });
      b.values.structure = rest.join(', ');
    }
    /* 대상 비고: 층별 내용 */
    if (o.floors && typeof o.floors === 'object') Object.keys(o.floors).forEach((k) => { if (D.isFloorKey(k)) b.floors[k] = str(o.floors[k], 300); });
    const rg = (o.floorRange && typeof o.floorRange === 'object') ? o.floorRange : {};
    b.floorRange = { below: Math.min(D.FLOORS.belowMax, Math.max(D.FLOORS.belowMin, fin(rg.below) || D.FLOORS.belowMin)), above: Math.min(D.FLOORS.aboveMax, Math.max(D.FLOORS.aboveMin, fin(rg.above) || D.FLOORS.aboveMin)) };
    Object.keys(b.floors).forEach((k) => {
      if (!b.floors[k].trim()) return;
      const mb = k.match(/^B(\d+)$/), ma = k.match(/^(\d+)F$/);
      if (mb) b.floorRange.below = Math.max(b.floorRange.below, +mb[1]);
      if (ma) b.floorRange.above = Math.max(b.floorRange.above, +ma[1]);
    });
    b.mapAuto = o.mapAuto !== false;
    b.maskNames = !!o.maskNames;
    ['people', 'equip'].forEach((g) => { const list = g === 'people' ? D.PEOPLE : D.EQUIP; if (o[g] && typeof o[g] === 'object') list.forEach((k) => { b[g][k] = str(o[g][k], 8); }); });
    if (o.log && typeof o.log === 'object') b.log = { fileName: str(o.log.fileName, 200), baseMs: fin(o.log.baseMs), receiveTime: str(o.log.receiveTime, 10), receiveMs: fin(o.log.receiveMs), count: fin(o.log.count), auto: normAuto(o.log.auto) };
    if (Array.isArray(o.lines)) b.lines = o.lines.slice(0, 20000).map((l, i) => ({
      id: str(l && l.id, 30) || 'x' + i, manual: !!(l && l.manual), t: fin(l && l.t), timeLabel: str(l && l.timeLabel, 30), kind: str(l && l.kind, 30), cat: str(l && l.cat, 30),
      actor: str(l && l.actor, 60), text: str(l && l.text, 3000), raw: str(l && l.raw, 3000), bold: !!(l && l.bold), selected: !!(l && l.selected), ord: fin(l && l.ord) || fin(l && l.t),
    }));
    if (o.images && typeof o.images === 'object') D.ATTACH.forEach((a) => {
      const arr = Array.isArray(o.images[a.key]) ? o.images[a.key] : [];
      b.images[a.key] = arr.filter((im) => im && typeof im.dataUrl === 'string' && /^data:image\/(jpeg|png|gif|webp);base64,/.test(im.dataUrl) && fin(im.w) > 0 && fin(im.h) > 0)
        .slice(0, a.max).map((im) => ({ name: str(im.name, 100), dataUrl: im.dataUrl, w: fin(im.w), h: fin(im.h) }));
    });
    return b;
  }

  /* ── 저장/불러오기 ── */
  let timer = 0;
  const State = {
    tab: 'meta',
    load() {
      let s = null;
      try { const raw = localStorage.getItem(KEY); if (raw) s = normalize(JSON.parse(raw)); } catch (e) { console.warn('저장된 데이터를 읽지 못했습니다.', e); }
      App.S = s || blank();
      return !!s;
    },
    saveNow() {
      try {
        localStorage.setItem(KEY, JSON.stringify(App.S));
        this.status('저장됨 ' + U.fmtHM(Date.now()) + ':' + U.pad(new Date().getSeconds()));
      } catch (e) {
        /* 저장공간이 모자라면 첨부 이미지를 한 번 더 줄여서 다시 저장해 본다 */
        const hasImg = Object.values(App.S.images).some((l) => l.length);
        if (hasImg && !this.shrinking) {
          this.shrinking = true; this.status('저장공간 부족: 이미지 용량을 줄이는 중…');
          const total = Object.values(App.S.images).flat().reduce((a, im) => a + U.dataUrlBytes(im.dataUrl), 0);
          U.fitImagesTotal(App.S.images, Math.floor(total / 2)).then((saved) => {
            this.shrinking = false; App.emit('images');
            if (saved > 0) { U.toast('저장공간이 부족해 첨부 이미지 용량을 자동으로 줄였습니다.'); this.saveNow(); return; }
            this.status('저장 실패(브라우저 저장공간 부족)');
            U.toast('자동 저장에 실패했습니다. 이미지를 지우거나 [백업 내보내기]로 파일을 보관해 주세요.', 'err');
          }, () => { this.shrinking = false; });
          return;
        }
        this.status('저장 실패(브라우저 저장공간 부족)');
        U.toast('자동 저장에 실패했습니다. 이미지를 지우거나 [백업 내보내기]로 파일을 보관해 주세요.', 'err');
      }
    },
    changed(src) {
      App.emit('change', src);
      this.status('저장 중…');
      clearTimeout(timer); timer = setTimeout(() => this.saveNow(), 400);
    },
    status(t) { const e = U.$('#save-status'); if (e) e.textContent = t; },
    reset() { App.S = blank(); try { localStorage.removeItem(REVKEY); } catch (_) { /* 무시 */ } },
    replace(obj) { App.S = normalize(obj); },
    blank, normalize,

    /* 차수(1보·2보…) */
    revisions() { try { const r = JSON.parse(localStorage.getItem(REVKEY) || '[]'); return Array.isArray(r) ? r : []; } catch (_) { return []; } },
    saveRevision(label) {
      const list = this.revisions();
      const copy = JSON.parse(JSON.stringify(App.S)); copy.images = { map: [], building: [], photos: [] };
      list.push({ id: 'r' + Date.now(), label: str(label, 20) || (list.length + 1) + '보', savedAt: Date.now(), data: copy });
      while (list.length > 10) list.shift();
      try { localStorage.setItem(REVKEY, JSON.stringify(list)); return true; } catch (_) { U.toast('차수를 저장하지 못했습니다(저장공간 부족).', 'err'); return false; }
    },
    loadRevision(id) {
      const r = this.revisions().find((x) => x.id === id);
      if (!r) return false;
      const keep = App.S.images; App.S = normalize(r.data); App.S.images = keep; return true;
    },
    allForBackup() { return { app: 'disaster-all-in-one', version: 1, savedAt: Date.now(), state: App.S, revisions: this.revisions() }; },
  };

  App.Fields = Fields;
  App.State = State;
})();
