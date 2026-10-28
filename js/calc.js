/* 자동 계산: 인명피해 요약, 재산피해·보험가입 문구, 동원 인원/장비 문구 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const D = App.DATA;
  const num = App.U.num;

  const filled = (c) => ['name', 'age', 'sex', 'injury', 'hospital', 'unit', 'remark'].some((k) => String(c[k] || '').trim());
  const rows = (s) => s.casualties.filter(filled);

  /* 나이·성별 두 칸 → 보고서 표의 "나이/성별" 한 칸 (예: 78세 / 여). 한쪽만 있으면 그것만 표시 */
  const ageSexText = (c) => [String(c.age || '').trim(), String(c.sex || '').trim()].filter(Boolean).join(' / ');
  /* "78세 / 여" 같은 한 칸 글을 나이·성별 두 칸으로 나눈다(엑셀 붙여넣기용). "/"가 없으면 통째로 나이 칸에 둔다 */
  function splitAgeSex(text) {
    const t = String(text || '').trim();
    const i = t.indexOf('/');
    if (i < 0) { const m = t.match(/^(.*?\d.*?)\s*(남자|여자|남성|여성|남|여)$/); return m ? { age: m[1].trim(), sex: m[2] } : { age: t, sex: '' }; }
    return { age: t.slice(0, i).trim(), sex: t.slice(i + 1).trim() };
  }

  /* 2. 인명피해 : 경상 17명(구급대 이송 9, 자차 이용 8) */
  function casualtyLine(s) {
    const r = rows(s);
    if (!r.length) return '없음';
    const lv = {}; let ship = 0, own = 0, unk = 0;
    r.forEach((c) => {
      const l = c.level || '경상'; lv[l] = (lv[l] || 0) + 1;
      const u = String(c.unit || '').trim();
      if (!u) unk++; else if (/자차/.test(u)) own++; else ship++;
    });
    const head = D.LEVELS.filter((l) => lv[l]).map((l) => `${l} ${lv[l]}명`).join(', ');
    const parts = [];
    if (ship) parts.push(`구급대 이송 ${ship}`);
    if (own) parts.push(`자차 이용 ${own}`);
    if (unk) parts.push(`이송수단 미기재 ${unk}`);
    return head + (parts.length ? `(${parts.join(', ')})` : '');
  }

  /* 숫자가 있는 항목만 표시: 121명(소방 54, 경찰 30 …) */
  function countLine(list, map, unit) {
    const parts = list.filter((k) => num(map[k]) > 0).map((k) => `${k} ${num(map[k])}`);
    const total = list.reduce((a, k) => a + num(map[k]), 0);
    return total > 0 ? `${total}${unit}(${parts.join(', ')})` : '';
  }
  const peopleLine = (s) => countLine(D.PEOPLE, s.people, '명');
  const equipLine = (s) => countLine(D.EQUIP, s.equip, '대');

  /* 재산피해: 금액은 만원 단위 숫자로 받는다. 10,000만원 이상은 "1억 2,000만원"처럼 쓴다 */
  const wonNum = (v) => { const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
  function manwon(n) {
    if (n <= 0) return '';
    const eok = Math.floor(n / 10000), rest = n % 10000;
    if (!eok) return n.toLocaleString('ko-KR') + '만원';
    return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
  }
  /* 나. 재산피해: 466만원(동산 300만원, 부동산 166만원) — 금액이 없으면 조사중 */
  function propertyLine(s) {
    const mv = wonNum(s.values.propMovable), im = wonNum(s.values.propImmovable), parts = [];
    if (mv > 0) parts.push(`동산 ${manwon(mv)}`);
    if (im > 0) parts.push(`부동산 ${manwon(im)}`);
    return parts.length ? `${manwon(mv + im)}(${parts.join(', ')})` : D.DEFAULTS.pending;
  }
  /* ○ 보험가입내역 : 보험사 금액, 보험사 금액 — 입력이 없으면 조사중 */
  const insuranceRows = (s) => (s.insurance || []).filter((r) => String(r.company || '').trim() || String(r.amount || '').trim());
  function insuranceLine(s) {
    const r = insuranceRows(s).map((x) => [String(x.company || '').trim(), String(x.amount || '').trim()].filter(Boolean).join(' '));
    return r.length ? r.join(', ') : D.DEFAULTS.pending;
  }

  function maskName(n) {
    const c = Array.from(String(n || '').trim());
    if (c.length >= 3) return c[0] + 'O'.repeat(c.length - 2) + c[c.length - 1];
    if (c.length === 2) return c[0] + 'O';
    return c.join('');
  }

  App.Calc = { filled, rows, ageSexText, splitAgeSex, casualtyLine, peopleLine, equipLine, maskName, wonNum, manwon, propertyLine, insuranceRows, insuranceLine };
})();
