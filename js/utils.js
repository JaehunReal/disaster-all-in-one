/* 공통 유틸: DOM 생성, 날짜 서식, 이벤트, 알림, 대화상자 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  /* ── 이벤트 ── */
  const handlers = {};
  App.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
  App.emit = (name, arg) => { (handlers[name] || []).forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } }); };

  /* ── DOM ── (사용자 입력은 항상 textContent로만 넣어 XSS를 막는다) */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k === 'list' || k === 'for' || k.indexOf('-') >= 0) e.setAttribute(k, v === true ? '' : v);
        else if (k in e) { try { e[k] = v; } catch (_) { e.setAttribute(k, v); } }
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }

  /* ── 날짜 ── */
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${WD[d.getDay()]})`; };
  const fmtHM = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtDateTime = (ms) => `${fmtDate(ms)} ${fmtHM(ms)}`;
  const fmtDateTimeSec = (ms) => `${fmtDateTime(ms)}:${pad(new Date(ms).getSeconds())}`;
  const fmtShortDate = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}. ${d.getDate()}.(${WD[d.getDay()]})`; };
  const sameDay = (a, b) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };

  /* "상황실" 같은 3글자 한글은 보고서 관례대로 "상 황 실"로 표기 */
  function spaced3(s) {
    const t = (s || '').trim();
    return /^[가-힣]{3}$/.test(t) ? t.split('').join(' ') : t;
  }
  const num = (v) => { const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

  /* ── 알림 ── */
  let toastTimer = 0;
  function toast(msg, kind) {
    const box = $('#toast');
    if (!box) return;
    box.textContent = msg;
    box.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.className = 'toast'; }, 3800);
  }

  /* ── 대화상자(<dialog>) ── */
  function dialog(opts) {
    return new Promise((resolve) => {
      const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title' });
      let result = null;
      const close = (v) => { result = v; dlg.close(); };
      dlg.append(
        h('h2', { id: 'dlg-title', text: opts.title || '확인' }),
        h('div', { class: 'dlg-body' }, opts.body || null),
        h('div', { class: 'dlg-actions' },
          (opts.buttons || [{ label: '확인', value: true, primary: true }]).map((b) =>
            h('button', { type: 'button', class: 'btn ' + (b.primary ? 'btn-primary' : ''), onclick: () => close(typeof b.value === 'function' ? b.value() : b.value), text: b.label })))
      );
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      document.body.append(dlg);
      dlg.showModal();
      const first = dlg.querySelector('textarea,input,.btn-primary,.btn');
      if (first) first.focus();
    });
  }
  const confirmDialog = (msg, okLabel) => dialog({ title: '확인', body: h('p', { text: msg }), buttons: [{ label: '취소', value: false }, { label: okLabel || '확인', value: true, primary: true }] }).then((v) => v === true);

  /* ── 파일 ── */
  function downloadBlob(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const stampName = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; };

  /* ── 이미지 용량 줄이기 ──
     브라우저 저장공간(약 5MB)에 걸리지 않도록 이미지는 장당 용량 한도(기본 약 300KB) 안으로 줄여 저장한다.
     1) 긴 변을 maxSide 이하로 → 2) JPEG 화질을 단계적으로 낮춤 → 3) 그래도 크면 크기를 80%씩 줄임(긴 변 minSide까지) */
  const IMG = () => Object.assign({ maxSide: 1400, minSide: 640, maxKB: 300, totalKB: 2000 }, (App.DATA && App.DATA.IMAGE) || {});
  const QUALITY = [0.85, 0.75, 0.65, 0.55, 0.45];
  /* data URL이 실제로 차지하는 바이트(base64 → 원래 크기) */
  const dataUrlBytes = (u) => { const i = String(u).indexOf(','); return i < 0 ? 0 : Math.floor((u.length - i - 1) * 3 / 4); };
  const fmtBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');

  function encodeFit(img, srcW, srcH, maxBytes, maxSide) {
    const C = IMG();
    let k = Math.min(1, (maxSide || C.maxSide) / Math.max(srcW, srcH));
    let best = null;
    for (let step = 0; step < 12; step++) {
      const w = Math.max(1, Math.round(srcW * k)), hh = Math.max(1, Math.round(srcH * k));
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.drawImage(img, 0, 0, w, hh);
      for (const q of QUALITY) {
        const dataUrl = c.toDataURL('image/jpeg', q);
        best = { dataUrl, w, h: hh };
        if (dataUrlBytes(dataUrl) <= maxBytes) return best;
      }
      if (Math.max(w, hh) <= C.minSide) return best; /* 더 줄이면 알아보기 어려우므로 여기서 멈춘다 */
      k *= 0.8;
      if (Math.max(srcW, srcH) * k < C.minSide) k = C.minSide / Math.max(srcW, srcH);
    }
    return best;
  }
  const openImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 열 수 없습니다.'));
    img.src = src;
  });

  /* 파일 → 줄인 이미지 {name, dataUrl, w, h, origBytes, bytes, reduced} */
  function loadImage(file, maxSide) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(file.type)) { reject(new Error('이미지 파일(png, jpg 등)만 올릴 수 있습니다.')); return; }
      if (file.size > 50 * 1024 * 1024) { reject(new Error('이미지 파일이 너무 큽니다(50MB 이하).')); return; }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      fr.onload = () => {
        openImage(fr.result).then((img) => {
          const out = encodeFit(img, img.width, img.height, IMG().maxKB * 1024, maxSide);
          const bytes = dataUrlBytes(out.dataUrl);
          resolve(Object.assign({ name: file.name }, out, { origBytes: file.size, bytes, reduced: file.size > bytes * 1.1 || img.width !== out.w }));
        }, reject);
      };
      fr.readAsDataURL(file);
    });
  }

  /* 이미 저장된 이미지를 maxBytes 이하로 다시 줄인다(바뀌지 않으면 그대로 돌려줌) */
  async function shrinkImage(im, maxBytes) {
    if (!im || dataUrlBytes(im.dataUrl) <= maxBytes) return im;
    const img = await openImage(im.dataUrl);
    const out = encodeFit(img, img.width, img.height, maxBytes);
    return dataUrlBytes(out.dataUrl) < dataUrlBytes(im.dataUrl) ? Object.assign({}, im, out) : im;
  }

  /* 첨부 이미지 전체 용량이 한도(totalKB)를 넘으면 장당 한도를 낮춰 모두 다시 줄인다. 줄인 바이트 수를 돌려준다 */
  async function fitImagesTotal(images, totalBytes) {
    const lists = Object.values(images || {}).filter(Array.isArray);
    const all = lists.flat();
    const total = all.reduce((a, im) => a + dataUrlBytes(im.dataUrl), 0);
    const limit = totalBytes || IMG().totalKB * 1024;
    if (!all.length || total <= limit) return 0;
    const per = Math.max(60 * 1024, Math.floor(limit / all.length));
    for (const list of lists) {
      for (let i = 0; i < list.length; i++) { try { list[i] = await shrinkImage(list[i], per); } catch (_) { /* 원본 유지 */ } }
    }
    return total - lists.flat().reduce((a, im) => a + dataUrlBytes(im.dataUrl), 0);
  }

  App.U = { $, $$, h, pad, fmtDate, fmtHM, fmtDateTime, fmtDateTimeSec, fmtShortDate, sameDay, spaced3, num, toast, dialog, confirmDialog, downloadBlob, safeName, stampName, loadImage, shrinkImage, fitImagesTotal, dataUrlBytes, fmtBytes };
})();
