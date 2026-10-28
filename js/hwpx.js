/* 한글(.hwpx) 저장: 서식(template/서식.hwpx → js/hwpx_template.js)의 자리표시를 채우고 견본을 복제한다
   - 인터넷·외부 부품 불필요. 서식을 바꾸려면 한글에서 서식.hwpx 를 고친 뒤 build.py 를 다시 실행한다
   - 자리표시 규칙은 template/서식_작성규칙.md 참조 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const NS_HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
  const PH = /\{\{\s*([^{}]+?)\s*\}\}/g;

  /* ── 바이트 도구 ── */
  const enc = new TextEncoder();
  const b64bytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  let CRC = null;
  function crc32(u) {
    if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ZIP(무압축) 묶기: mimetype 이 맨 앞에 무압축으로 들어가야 한글이 HWPX로 인식한다 */
  function zipStore(entries) {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = []; let offset = 0;
    entries.forEach(([name, data]) => {
      const nm = enc.encode(name), crc = crc32(data), size = data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nm);
      offset += 30 + nm.length + size;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/hwp+zip' });
  }

  /* ── XML 도구 ── */
  const kids = (el, local) => Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.namespaceURI === NS_HP && n.localName === local);
  const all = (el, local) => Array.from(el.getElementsByTagNameNS(NS_HP, local));
  const newId = () => String(1000000000 + Math.floor(Math.random() * 1000000000));
  /* 문단 자신의 글자(<hp:t>)만: 표 안 문단은 제외 */
  const ownTexts = (p) => kids(p, 'run').flatMap((r) => kids(r, 't'));
  const tText = (t) => Array.from(t.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('');
  const pText = (p) => ownTexts(p).map(tText).join('');

  /* <hp:t> 내용을 글로 바꾼다. 줄바꿈은 <hp:lineBreak/> */
  function setT(t, text) {
    while (t.firstChild) t.removeChild(t.firstChild);
    String(text).replace(/\t/g, ' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').split(/\r?\n/).forEach((line, i) => {
      if (i) t.appendChild(t.ownerDocument.createElementNS(NS_HP, 'hp:lineBreak'));
      if (line) t.appendChild(t.ownerDocument.createTextNode(line));
    });
  }

  /* 글자모양 경계로 나뉜 자리표시를 첫 조각이 있는 <hp:t>로 합친다 */
  function mergeSplit(p) {
    const ts = ownTexts(p).filter((t) => !t.getElementsByTagNameNS(NS_HP, '*').length);
    for (let guard = 0; guard < 50; guard++) {
      const texts = ts.map(tText), joined = texts.join('');
      let fixed = false;
      for (const m of joined.matchAll(PH)) {
        let pos = 0, si = -1, ei = -1;
        texts.forEach((tx, i) => { if (si < 0 && m.index < pos + tx.length) si = i; if (ei < 0 && m.index + m[0].length <= pos + tx.length) ei = i; pos += tx.length; });
        if (si < 0 || ei < 0 || si === ei) continue;
        let start = 0; for (let i = 0; i < si; i++) start += texts[i].length;
        const a = m.index - start, end = m.index + m[0].length;
        let cut = start; const out = texts.slice();
        for (let i = si; i <= ei; i++) {
          const s0 = cut, e0 = cut + texts[i].length;
          if (i === si) out[i] = texts[i].slice(0, a) + m[0] + (ei === si ? texts[i].slice(end - s0) : '');
          else if (i === ei) out[i] = texts[i].slice(end - s0);
          else out[i] = '';
          cut = e0;
        }
        out.forEach((tx, i) => { if (tx !== texts[i]) setT(ts[i], tx); });
        fixed = true; break;
      }
      if (!fixed) return;
    }
  }

  /* 문단 안 자리표시를 값으로 바꾼다. get(name) 이 undefined 면 손대지 않는다 */
  function fillParagraph(p, get) {
    ownTexts(p).forEach((t) => {
      if (t.getElementsByTagNameNS(NS_HP, '*').length) return;
      const s = tText(t);
      if (!s.includes('{{')) return;
      let changed = false;
      const out = s.replace(PH, (whole, name) => { const v = get(name.trim()); if (v === undefined) return whole; changed = true; return v; });
      if (changed) setT(t, out);
    });
  }
  const markerOf = (p) => { const m = pText(p).match(/\{\{\s*#([^{}]+?)\s*\}\}/); return m ? m[1].trim() : ''; };
  const isRepeat = (p) => { const k = markerOf(p); return !!k && k !== '첨부시작'; };

  /* 그림(<hp:pic>) 이미지와 크기 바꾸기: 견본 상자 안에 비율을 지켜 넣는다 */
  function setPicture(pic, binId, w, h) {
    const box = pic.getElementsByTagNameNS(NS_HP, 'sz')[0] || pic.getElementsByTagNameNS(NS_HP, 'curSz')[0];
    const BW = +box.getAttribute('width'), BH = +box.getAttribute('height');
    const k = Math.min(BW / w, BH / h), W = Math.round(w * k), H = Math.round(h * k);
    const set = (local, attrs) => all(pic, local).forEach((e) => Object.keys(attrs).forEach((a) => { if (e.hasAttribute(a)) e.setAttribute(a, attrs[a]); }));
    set('orgSz', { width: W, height: H }); set('curSz', { width: W, height: H }); set('sz', { width: W, height: H });
    set('imgClip', { right: W, bottom: H }); set('imgDim', { dimwidth: W, dimheight: H });
    set('rotationInfo', { centerX: Math.round(W / 2), centerY: Math.round(H / 2) });
    const r = all(pic, 'imgRect')[0];
    if (r) Array.from(r.childNodes).filter((n) => n.nodeType === 1).forEach((pt) => {
      if (pt.localName === 'pt1' || pt.localName === 'pt2') pt.setAttribute('x', W);
      if (pt.localName === 'pt2' || pt.localName === 'pt3') pt.setAttribute('y', H);
    });
    pic.getElementsByTagNameNS('*', 'img')[0].setAttribute('binaryItemIDRef', binId);
    pic.setAttribute('id', newId()); if (pic.hasAttribute('instid')) pic.setAttribute('instid', pic.getAttribute('id'));
  }

  /* 표 행 정리: 행 번호(rowAddr)와 행 수(rowCnt) */
  function renumberRows(tbl) {
    const rows = kids(tbl, 'tr');
    rows.forEach((tr, r) => kids(tr, 'tc').forEach((tc) => { const a = kids(tc, 'cellAddr')[0]; if (a) a.setAttribute('rowAddr', r); }));
    tbl.setAttribute('rowCnt', rows.length);
  }
  /* 표를 품은 바깥 문단 */
  const hostParagraph = (el) => { let n = el.parentNode; while (n && !(n.localName === 'p' && n.namespaceURI === NS_HP)) n = n.parentNode; return n; };

  /* ── 보고서 모델 → 채울 값 ── */
  function dataFrom(m) {
    const H = m.head;
    const scalar = {
      보안표시: ' ' + m.secret + ' ', 보고서제목: m.title, 수신: H.to, 참조: H.ref, 발신: H.from, 발신지: H.origin, 보고일자: H.reportAt,
      작성자: H.writer, 보고책임자: H.manager, 관할: H.jurisdiction, 접수시간: H.receiveAt, 제목: m.subject,
      사고내용제목: m.contentLabel, 인명피해: m.casualty.line, 재산피해: m.property.line, 인원: m.mobil.people, 장비: m.mobil.equip, 보험: m.others.insurance,
    };
    const seq = [];
    m.overview.forEach((o) => { seq.push(['개요', `${o.label} : ${o.value}`]); o.notes.forEach((n) => seq.push(['개요비고', n])); });
    m.content.forEach((c) => seq.push(['사고내용', c]));
    m.property.notes.forEach((n) => seq.push(['재산비고', `${n.label} : ${n.text}`]));
    if (!m.actions.length) seq.push(['조치없음', '(조치사항 없음)']);
    m.actions.forEach((a) => seq.push([a.bold ? '조치굵게' : '조치', App.Model.actionText(a)]));
    m.others.notes.forEach((t) => seq.push(['기타', t]));
    const rows = {
      사상자: m.casualty.rows.map((r) => ({ 연번: String(r.no), 성명: r.name, 나이성별: r.ageSex, 부상정도: r.injury, 이송병원: r.hospital, 구급대: r.unit, 비고: r.remark })),
    };
    return { scalar, seq, rows };
  }

  /* 첨부 그림: 위치도·건물전경(같은 크기로 맞춤) 한 묶음, 현장사진 한 묶음 */
  async function imageGroups(m) {
    const get = (k) => (m.images.find((x) => x.key === k) || { list: [] }).list;
    const frame = App.Docx && App.Docx.frameImage ? App.Docx.frameImage : async (im) => im;
    const first = await Promise.all([].concat(get('map').map((im) => ({ im, name: '위치도' })), get('building').map((im) => ({ im, name: '건물전경' })))
      .map(async (x) => ({ name: x.name, im: await frame(x.im, 1200, 900) })));
    const photos = get('photos').map((im, i) => ({ name: '현장사진 ' + (i + 1), im }));
    return [first, photos].filter((g) => g.length);
  }

  async function build(m) {
    const T = App.HWPX_TEMPLATE;
    if (!T || !Array.isArray(T.files)) throw new Error('한글 서식이 없습니다(js/hwpx_template.js). build.py 를 실행해 주세요.');
    const files = new Map(T.files.map(([n, kind, data]) => [n, { kind, data }]));
    const SEC = 'Contents/section0.xml';
    const doc = new DOMParser().parseFromString(files.get(SEC).data, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('한글 서식(section0.xml)을 읽지 못했습니다.');
    const D = dataFrom(m);
    const paras = () => all(doc, 'p');
    paras().forEach(mergeSplit);

    /* ① 반복 문단: 이어진 {{#…}} 견본 문단 묶음마다 seq 순서대로 복제 */
    const done = new Set();
    paras().forEach((p) => {
      if (done.has(p) || !isRepeat(p)) return;
      const group = []; let n = p;
      while (n && n.nodeType === 1 && n.localName === 'p' && isRepeat(n)) { group.push(n); done.add(n); n = n.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; }
      const protos = new Map(group.map((g) => [markerOf(g), g]));
      const parent = p.parentNode, anchor = group[group.length - 1].nextSibling;
      D.seq.filter(([k]) => protos.has(k)).forEach(([k, v]) => {
        const c = protos.get(k).cloneNode(true);
        c.setAttribute('id', newId());
        fillParagraph(c, (name) => (name === '#' + k ? v : undefined));
        parent.insertBefore(c, anchor);
      });
      group.forEach((g) => parent.removeChild(g));
    });

    /* ② 반복 표 행: {{사상자.○○}}가 든 행을 자료 수만큼 복제, 자료가 없으면 표째 뺀다 */
    all(doc, 'tr').forEach((tr) => {
      const m2 = (tr.textContent || '').match(/\{\{\s*([^{}.#]+)\.[^{}]+\}\}/);
      if (!m2 || m2[1].trim() === '그림') return;
      const key = m2[1].trim(), list = D.rows[key] || [], tbl = tr.parentNode;
      if (!list.length) { const host = hostParagraph(tbl); if (host) host.parentNode.removeChild(host); return; }
      list.forEach((row) => {
        const c = tr.cloneNode(true);
        all(c, 'p').forEach((p) => { mergeSplit(p); p.setAttribute('id', newId()); fillParagraph(p, (name) => (name.startsWith(key + '.') ? String(row[name.slice(key.length + 1)] || '') : undefined)); });
        tbl.insertBefore(c, tr);
      });
      tbl.removeChild(tr); renumberRows(tbl);
    });

    /* ③ 첨부 그림: {{#첨부시작}} 문단(새 쪽) + {{그림.이름}} 표 */
    const groups = await imageGroups(m);
    const bin = []; /* [경로, 바이트] */
    const startP = paras().find((p) => markerOf(p) === '첨부시작');
    const picTr = all(doc, 'tr').find((tr) => /\{\{\s*그림\./.test(tr.textContent || ''));
    if (!groups.length) {
      if (picTr) { const host = hostParagraph(picTr.parentNode); if (host) host.parentNode.removeChild(host); }
      if (startP) startP.parentNode.removeChild(startP);
    } else {
      if (startP) fillParagraph(startP, () => '');
      if (picTr) {
        const tbl = picTr.parentNode, perRow = kids(picTr, 'tc').length;
        let seqNo = 0;
        groups.forEach((g) => {
          for (let i = 0; i < g.length; i += perRow) {
            const row = picTr.cloneNode(true);
            kids(row, 'tc').forEach((tc, ci) => {
              const item = g[i + ci];
              all(tc, 'p').forEach((p) => { mergeSplit(p); p.setAttribute('id', newId()); fillParagraph(p, (name) => (name === '그림.이름' ? (item ? item.name : '') : undefined)); });
              all(tc, 'pic').forEach((pic) => {
                if (!item) { pic.parentNode.removeChild(pic); return; }
                const id = 'image' + (++seqNo);
                bin.push([`BinData/${id}.jpg`, b64bytes(item.im.dataUrl.split(',')[1])]);
                setPicture(pic, id, item.im.w, item.im.h);
              });
            });
            tbl.insertBefore(row, picTr);
          }
        });
        tbl.removeChild(picTr); renumberRows(tbl);
      }
    }

    /* ④ 나머지 자리표시 채우기, 남은 것은 빈칸 */
    paras().forEach((p) => fillParagraph(p, (name) => (Object.prototype.hasOwnProperty.call(D.scalar, name) ? String(D.scalar[name] == null ? '' : D.scalar[name]) : '')));
    /* ⑤ 줄 배치 정보는 지운다(한글이 열 때 다시 계산) */
    all(doc, 'linesegarray').forEach((e) => e.parentNode.removeChild(e));

    /* ⑥ 파일 목록 정리: 새 이미지 등록, 쓰지 않는 견본 이미지 제거, 문서 제목 */
    const xml = new XMLSerializer().serializeToString(doc);
    files.set(SEC, { kind: 't', data: xml.startsWith('<?xml') ? xml : '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + xml });
    const HPF = 'Contents/content.hpf';
    if (files.has(HPF)) {
      const pd = new DOMParser().parseFromString(files.get(HPF).data, 'application/xml');
      const OPF = pd.documentElement.namespaceURI;
      const manifest = pd.getElementsByTagNameNS(OPF, 'manifest')[0];
      Array.from(pd.getElementsByTagNameNS(OPF, 'item')).forEach((it) => {
        const href = it.getAttribute('href') || '', id = it.getAttribute('id');
        if (/^BinData\//.test(href) && !xml.includes(`binaryItemIDRef="${id}"`)) { manifest.removeChild(it); files.delete(href); }
      });
      bin.forEach(([path]) => {
        const it = pd.createElementNS(OPF, manifest.prefix ? manifest.prefix + ':item' : 'item');
        it.setAttribute('id', path.replace(/^BinData\/|\.jpg$/g, '')); it.setAttribute('href', path); it.setAttribute('media-type', 'image/jpeg'); it.setAttribute('isEmbeded', '1');
        manifest.appendChild(it);
      });
      const title = pd.getElementsByTagNameNS(OPF, 'title')[0];
      if (title) title.textContent = m.subject || m.title.replace(/ /g, '');
      const out = new XMLSerializer().serializeToString(pd);
      files.set(HPF, { kind: 't', data: out.startsWith('<?xml') ? out : '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + out });
    }
    if (files.has('Preview/PrvText.txt')) files.set('Preview/PrvText.txt', { kind: 't', data: [m.title.replace(/ /g, ''), m.subject].concat(m.overview.map((o) => `${o.label} : ${o.value}`)).join('\r\n').slice(0, 1000) });
    bin.forEach(([path, bytes]) => files.set(path, { kind: 'u', data: bytes }));

    const order = ['mimetype'].concat(Array.from(files.keys()).filter((n) => n !== 'mimetype'));
    return zipStore(order.filter((n) => files.has(n)).map((n) => {
      const f = files.get(n);
      return [n, f.kind === 't' ? enc.encode(f.data) : f.kind === 'b' ? b64bytes(f.data) : f.data];
    }));
  }

  App.Hwpx = { build, available: () => !!(App.HWPX_TEMPLATE && App.HWPX_TEMPLATE.files) };
})();
