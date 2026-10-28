/* Word(.docx) 저장: 문서 모델 → docx 파일 (lib/docx.umd.js 사용, 인터넷 불필요) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const FONT = 'Malgun Gothic';
  const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134, BODY_W = PAGE_W - MARGIN * 2; /* 9638 */

  /* 위치도·건물전경을 같은 크기(4:3)로 맞춘다: 비율이 다른 사진은 늘리지 않고 가운데를 기준으로 잘라 낸다(미리보기와 동일) */
  function frameImage(im, W, H) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(im), 5000); /* 이미지를 읽지 못해도 저장이 멈추지 않게 */
      img.onload = () => {
        clearTimeout(timer);
        try {
          const c = document.createElement('canvas'); c.width = W; c.height = H;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
          const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), sw = W / k, sh = H / k;
          g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
          resolve({ dataUrl: c.toDataURL('image/jpeg', 0.92), w: W, h: H });
        } catch (_) { resolve(im); }
      };
      img.onerror = () => { clearTimeout(timer); resolve(im); };
      img.src = im.dataUrl;
    });
  }

  async function build(m) {
    const D = window.docx;
    if (!D) throw new Error('Word 저장 부품이 없습니다(lib/docx.umd.js).');
    const getImgs = (k) => m.images.find((x) => x.key === k).list;
    const pair = await Promise.all([].concat(getImgs('map').map((im) => ({ im, label: '위치도' })), getImgs('building').map((im) => ({ im, label: '건물전경' })))
      .map(async (x) => ({ label: x.label, im: await frameImage(x.im, 1200, 900) })));

    const run = (text, o = {}) => new D.TextRun({ text: String(text == null ? '' : text), font: FONT, size: o.size || 21, bold: !!o.bold, color: o.color });
    const para = (kids, o = {}) => new D.Paragraph({ children: [].concat(kids), alignment: o.align, spacing: { before: o.before || 0, after: o.after == null ? 60 : o.after, line: o.line || 300, lineRule: D.LineRuleType.AUTO }, indent: o.indent, keepNext: !!o.keepNext, keepLines: true });
    const line = { style: D.BorderStyle.SINGLE, size: 4, color: '808080' };
    const borders = { top: line, bottom: line, left: line, right: line };
    const cell = (kids, w, o = {}) => new D.TableCell({
      children: [].concat(kids), width: { size: w, type: D.WidthType.DXA }, borders, verticalAlign: D.VerticalAlign.CENTER, columnSpan: o.span,
      shading: o.fill ? { type: D.ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    });
    const cp = (text, o = {}) => para(run(text, o), { align: o.align, after: 0, line: 276 });
    const table = (rows, widths) => new D.Table({ rows, width: { size: widths.reduce((a, b) => a + b, 0), type: D.WidthType.DXA }, columnWidths: widths, layout: D.TableLayoutType.FIXED });

    const H = m.head;
    const kids = [];

    /* 제목 */
    kids.push(para(run(m.title, { size: 36, bold: true }), { align: D.AlignmentType.CENTER, before: 120, after: 200, line: 360 }));

    /* 머리말 표 */
    const cw6 = [964, 1735, 2120, 2699, 964, BODY_W - 8482]; /* 10·18·22·28·10·12% */
    const half = cw6[0] + cw6[1] + cw6[2];
    const kvCell = (k, v, w, span) => cell(para([run(k + ' : ', { bold: true }), run(v)], { after: 0, line: 276 }), w, { span });
    /* 머리글 칸: "\n"이 있으면 그 자리에서 줄을 바꾼다(예: 관할소방서 / (관할센터)) */
    const th = (t, w) => cell(String(t).split('\n').map((x) => cp(x, { bold: true, align: D.AlignmentType.CENTER, size: 19 })), w, { fill: 'EDEDED' });
    const rowKV = (a, b) => new D.TableRow({ children: [kvCell(a[0], a[1], half, 3), kvCell(b[0], b[1], BODY_W - half, 3)] });
    kids.push(new D.Table({
      width: { size: BODY_W, type: D.WidthType.DXA }, columnWidths: cw6, layout: D.TableLayoutType.FIXED,
      rows: [
        rowKV(['수신', H.to], ['보고일자', H.reportAt]),
        rowKV(['참조', H.ref], ['작성자', H.writer]),
        rowKV(['발신', H.from], ['보고책임자', H.manager]),
        new D.TableRow({ children: [th('발신지', cw6[0]), cell(cp(H.origin, { size: 19 }), cw6[1]), th('관할소방서\n(관할센터)', cw6[2]), cell(String(H.jurisdiction).split('\n').map((x) => cp(x, { size: 19 })), cw6[3]), th('접수시간', cw6[4]), cell(cp(H.receiveAt, { align: D.AlignmentType.CENTER }), cw6[5])] }),
        new D.TableRow({ children: [th('제목', cw6[0]), cell(cp(m.subject, { bold: true, size: 23 }), BODY_W - cw6[0], { span: 5 })] }),
      ],
    }));

    /* 1. 발생개요 */
    /* 서식의 들여쓰기: 가·나·다 줄은 2타, ○·※ 줄은 4타. 줄이 바뀌면 글자 시작 위치에 맞춘다 */
    const SP2 = '  ', SP4 = '    ', HANG2 = { indent: { left: 504, hanging: 504 } }, HANG4 = { indent: { left: 546, hanging: 546 }, after: 40 };
    const sec = (t) => para(run(t, { bold: true, size: 23 }), { before: 200, after: 80, keepNext: true });
    kids.push(sec('1. 발생개요'));
    m.overview.forEach((o) => {
      kids.push(para(run(`${SP2}${o.label} : ${o.value}`), HANG2));
      o.notes.forEach((n) => kids.push(para(run(SP4 + '※ ' + n, { size: 19 }), HANG4)));
    });
    kids.push(para(run(SP2 + m.contentLabel + ' :'), Object.assign({ keepNext: true }, HANG2)));
    m.content.forEach((c) => kids.push(para(run(SP4 + '○ ' + c), HANG4)));

    /* 2. 인명피해 */
    kids.push(sec('2. 피해상황'));
    kids.push(para(run(SP2 + '가. 인명피해 : ' + m.casualty.line), Object.assign({ keepNext: m.casualty.rows.length > 0 }, HANG2)));
    if (m.casualty.rows.length) {
      const cw = [600, 1300, 1400, 2200, 1700, 1300, BODY_W - 8500];
      const head = new D.TableRow({ tableHeader: true, children: ['연번', '성 명', '나이/성별', '부상정도', '이송병원', '구급대', '비고'].map((t, i) => cell(cp(t, { bold: true, align: D.AlignmentType.CENTER, size: 19 }), cw[i], { fill: 'EDEDED' })) });
      const body = m.casualty.rows.map((r) => new D.TableRow({ cantSplit: true, children: [String(r.no), r.name, r.ageSex, r.injury, r.hospital, r.unit, r.remark].map((v, i) => cell(cp(v, { align: D.AlignmentType.CENTER, size: 19 }), cw[i])) }));
      kids.push(table([head].concat(body), cw));
    }

    kids.push(para(run(SP2 + '나. 재산피해 : ' + m.property.line), Object.assign({ before: 100 }, HANG2)));
    m.property.notes.forEach((n) => kids.push(para(run(SP4 + '※ ' + n.label + ' : ' + n.text, { size: 19 }), HANG4)));

    /* 3. 동원현황 */
    kids.push(sec('3. 동원현황'));
    kids.push(para(run(SP2 + '가. 인  원 : ' + m.mobil.people), HANG2));
    kids.push(para(run(SP2 + '나. 장  비 : ' + m.mobil.equip), HANG2));

    /* 4. 조치사항 (주요사건은 굵게) */
    kids.push(sec('4. 조치사항 (관제진행상황)'));
    if (!m.actions.length) kids.push(para(run(SP4 + '(조치사항 없음)', { color: '808080' }), HANG4));
    m.actions.forEach((a) => kids.push(para(run(SP4 + '○ ' + App.Model.actionText(a), { bold: a.bold }), HANG4)));

    /* 5. 그 밖의 사항 */
    kids.push(sec('5. 그 밖의 사항 (보험가입 및 언론보도내용 등)'));
    kids.push(para(run(SP4 + '○ 보험가입내역 : ' + m.others.insurance), HANG4));
    m.others.notes.forEach((t) => kids.push(para(run(SP4 + '○ ' + t), HANG4)));

    /* 첨부 이미지(위치도·건물전경·현장사진) */
    if (m.hasImages) {
      kids.push(new D.Paragraph({ children: [new D.PageBreak()] }));
      const bytes = (url) => { const b = atob(url.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
      const fit = (im, maxW, maxH) => { const k = Math.min(maxW / im.w, maxH / im.h, 1); return { width: Math.round(im.w * k), height: Math.round(im.h * k) }; };
      const imgCell = (im, label, w, maxW, maxH) => cell([
        para(new D.ImageRun({ data: bytes(im.dataUrl), transformation: fit(im, maxW, maxH) }), { align: D.AlignmentType.CENTER, after: 40 }),
        cp(label, { align: D.AlignmentType.CENTER, size: 19, bold: true })], w);
      const get = (k) => m.images.find((x) => x.key === k).list;
      const halfW = BODY_W / 2;
      for (let i = 0; i < pair.length; i += 2) {
        const a = pair[i], b = pair[i + 1];
        kids.push(table([new D.TableRow({ children: [imgCell(a.im, a.label, halfW, 300, 260), b ? imgCell(b.im, b.label, halfW, 300, 260) : cell(cp(''), halfW)] })], [halfW, halfW]));
      }
      const ph = get('photos');
      for (let i = 0; i < ph.length; i += 2) {
        kids.push(table([new D.TableRow({ cantSplit: true, children: [imgCell(ph[i], '현장사진 ' + (i + 1), halfW, 300, 240), ph[i + 1] ? imgCell(ph[i + 1], '현장사진 ' + (i + 2), halfW, 300, 240) : cell(cp(''), halfW)] })], [halfW, halfW]));
      }
    }

    /* 모든 쪽 위에 "대외유출주의" */
    const bd = { style: D.BorderStyle.SINGLE, size: 8, color: 'C00000', space: 2 };
    const header = new D.Header({ children: [new D.Paragraph({ children: [new D.TextRun({ text: ' ' + m.secret + ' ', font: FONT, size: 20, bold: true, color: 'C00000' })], border: { top: bd, bottom: bd, left: bd, right: bd }, spacing: { after: 0 }, indent: { right: BODY_W - 1900 } })] });

    const doc = new D.Document({
      creator: '재난 올인원', title: m.subject || `${m.typeName} 등 사고상황보고서`,
      styles: { default: { document: { run: { font: FONT, size: 21 } } } },
      sections: [{ properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1134, bottom: 1134, left: MARGIN, right: MARGIN, header: 567 } } }, headers: { default: header }, children: kids }],
    });
    return D.Packer.toBlob(doc);
  }
  App.Docx = { build, frameImage };
})();
