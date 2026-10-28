/* 시스템에서 내려받은 관제일지 엑셀(.xlsx/.xls/.csv) 읽기 - 파일은 이 PC 안에서만 처리 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, '');
  function toMs(v) {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const o = window.XLSX.SSF.parse_date_code(v);
      if (o) return new Date(o.y, o.m - 1, o.d, o.H, o.M, Math.floor(o.S)).getTime();
    }
    if (typeof v === 'string') {
      const m = v.match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
    }
    return NaN;
  }

  const HEAD = { time: ['관제일시', '관제시각', '일시'], kind: ['상황구분', '구분'], text: ['진행상황', '내용', '진행내용'] };
  function findCol(row, names) {
    for (const n of names) { const i = row.findIndex((c) => norm(c) === n); if (i >= 0) return i; }
    for (const n of names) { const i = row.findIndex((c) => norm(c).includes(n)); if (i >= 0) return i; }
    return -1;
  }

  /* 표 위쪽의 사건 요약(접수일시, 분류, 긴급구조위치, 관할119안전센터) */
  const META_HEAD = { recv: ['접수일시'], cls: ['분류'], kind: ['종별'], loc: ['긴급구조위치'], center: ['관할119안전센터', '관할센터'] };
  function readMeta(rows) {
    for (let r = 0; r < Math.min(rows.length - 1, 40); r++) {
      const cols = {};
      Object.keys(META_HEAD).forEach((k) => { const i = rows[r].findIndex((c) => META_HEAD[k].includes(norm(c))); if (i >= 0) cols[k] = i; });
      if (cols.recv == null && cols.loc == null) continue;
      const nx = rows[r + 1] || [];
      const val = (k) => (cols[k] == null || nx[cols[k]] == null ? '' : String(nx[cols[k]]).replace(/\s+/g, ' ').trim());
      const ms = cols.recv == null ? NaN : toMs(nx[cols.recv]);
      return { receiveMs: Number.isFinite(ms) ? ms : 0, cls: val('cls'), kind: val('kind'), loc: val('loc'), center: val('center') };
    }
    return null;
  }

  function readSheet(rows) {
    let hr = -1, cols = null;
    for (let r = 0; r < Math.min(rows.length, 60); r++) {
      const t = findCol(rows[r], HEAD.time), x = findCol(rows[r], HEAD.text);
      if (t >= 0 && x >= 0) { hr = r; cols = { time: t, text: x, kind: findCol(rows[r], HEAD.kind) }; break; }
    }
    if (hr < 0) return null;
    const out = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r];
      const t = toMs(row[cols.time]);
      const text = String(row[cols.text] == null ? '' : row[cols.text]);
      const kind = cols.kind >= 0 ? String(row[cols.kind] == null ? '' : row[cols.kind]).trim() : '';
      if (!Number.isFinite(t)) {
        if (out.length && !kind && text.trim() && norm(row[cols.time]) === '') out[out.length - 1].text += ' ' + text; /* 이어지는 줄 */
        continue;
      }
      out.push({ t, kind, text });
    }
    return out;
  }

  async function parseFile(file) {
    if (!window.XLSX) throw new Error('엑셀 읽기 부품이 없습니다(lib/xlsx.full.min.js).');
    if (!file) throw new Error('파일이 선택되지 않았습니다.');
    if (file.size > 30 * 1024 * 1024) throw new Error('파일이 너무 큽니다(30MB 이하).');
    let wb;
    try { wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' }); } catch (e) { throw new Error('엑셀 파일을 열 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식입니다.'); }
    let events = [], meta = null;
    wb.SheetNames.forEach((n) => {
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      const got = readSheet(rows);
      if (got) { events = events.concat(got); if (!meta) meta = readMeta(rows); }
    });
    if (!events.length) throw new Error('관제일지를 찾지 못했습니다. "관제일시", "상황구분", "진행상황" 열 이름이 있는지 확인해 주세요.');
    events = events.map((e, i) => Object.assign(e, { i })).sort((a, b) => a.t - b.t || a.i - b.i);
    const rec = events.find((e) => e.kind === '신고접수') || events[0];
    return { events, receiveMs: rec.t, meta };
  }

  App.Excel = { parseFile };
})();
