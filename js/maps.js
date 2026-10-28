/* 주소 → 지도 이미지(위치도·확대지도) 자동 만들기
   - 주소 찾기: OpenStreetMap Nominatim, 지도 그림: OpenStreetMap 타일(실패 시 CARTO 타일)
   - 인터넷이 연결된 PC에서만 동작하며, 이때 주소 문구가 해당 서버로 전송된다. 실패하면 이미지를 직접 올리는 방법으로 대신한다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U, D = App.DATA;

  const TILE_SERVERS = [
    { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, credit: '© OpenStreetMap contributors' },
    { url: (z, x, y) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`, credit: '© OpenStreetMap contributors © CARTO' },
  ];
  /* 위치도(주변 도로가 보이는 정도)와 확대지도(건물이 보이는 정도) */
  const VIEWS = [
    { slot: 'map', zoom: 17, w: 800, h: 560, name: '위치도(지도).jpg' },
    { slot: 'building', zoom: 19, w: 800, h: 560, name: '확대지도(건물 주변).jpg' },
  ];
  const TIMEOUT = 9000;

  function withTimeout(promise, ms, ctl) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { if (ctl) ctl.abort(); reject(new Error('시간 초과')); }, ms);
      promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  /* ── 주소 → 좌표 ── */
  /* "북구 관음중앙로28길 5(관음동 1284-2)" → 시도하기 좋은 검색어 목록 */
  function queriesFor(place) {
    const city = (App.S.log.auto && App.S.log.auto.city) || D.DEFAULTS.city;
    const p = String(place || '').trim();
    const m = p.match(/^(\S+[구군시])\s+(.+?)\s*\((\S+)\s+([\d-]+)\)\s*$/);
    const list = [];
    if (m) {
      const [, gu, road, dong, jibun] = m;
      list.push(`${city} ${gu} ${road}`, `${city} ${gu} ${dong} ${jibun}`, `${city} ${gu} ${road.replace(/\s*\d+(?:-\d+)?$/, '')}`, `${city} ${gu} ${dong}`);
    } else if (p) {
      list.push(/대구|서울|부산|인천|광주|대전|울산|세종/.test(p) ? p : `${city} ${p}`);
    }
    return list;
  }
  async function geocode(place) {
    const qs = queriesFor(place);
    if (!qs.length) throw new Error('장소(주소)가 비어 있습니다. 먼저 "나. 장소"를 입력하거나 관제일지를 올려 주세요.');
    let lastErr = null;
    for (let i = 0; i < qs.length; i++) {
      const ctl = new AbortController();
      try {
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=kr&accept-language=ko&q=' + encodeURIComponent(qs[i]);
        const res = await withTimeout(fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } }), TIMEOUT, ctl);
        if (!res.ok) throw new Error('주소 검색 서버 응답 오류(' + res.status + ')');
        const arr = await res.json();
        if (Array.isArray(arr) && arr[0] && Number.isFinite(+arr[0].lat) && Number.isFinite(+arr[0].lon)) {
          const a = arr[0];
          /* 번지·건물까지 찾았으면 정확, 도로·동 중심이면 대략 위치 */
          const exact = i <= 1 && !!(a.address && (a.address.house_number || a.type === 'house' || a.category === 'building'));
          return { lat: +a.lat, lon: +a.lon, exact, query: qs[i], found: String(a.display_name || '').slice(0, 120) };
        }
      } catch (e) { lastErr = e; }
    }
    throw new Error(lastErr ? '주소 검색에 실패했습니다(' + lastErr.message + ')' : '주소로 위치를 찾지 못했습니다.');
  }

  /* ── 지도 그림 ── */
  function toPx(lat, lon, z) {
    const n = 256 * Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
    return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
  }
  function loadTile(url) {
    return new Promise((resolve) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const t = setTimeout(() => { img.src = ''; resolve(null); }, TIMEOUT);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = url;
    });
  }
  async function drawMap(lat, lon, view, label) {
    const { zoom: z, w, h } = view, p = toPx(lat, lon, z), x0 = p.x - w / 2, y0 = p.y - h / 2, n = Math.pow(2, z);
    const tiles = [];
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + h) / 256); ty++) {
      for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w) / 256); tx++) { if (ty >= 0 && ty < n) tiles.push({ tx, ty, wx: ((tx % n) + n) % n }); }
    }
    for (const sv of TILE_SERVERS) {
      const imgs = await Promise.all(tiles.map((t) => loadTile(sv.url(z, t.wx, t.ty))));
      if (imgs.some((i) => !i)) continue; /* 하나라도 못 받으면 다음 서버로 */
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#eef1f5'; g.fillRect(0, 0, w, h);
      tiles.forEach((t, i) => g.drawImage(imgs[i], Math.round(t.tx * 256 - x0), Math.round(t.ty * 256 - y0)));
      /* 사고 위치 표시 */
      const cx = w / 2, cy = h / 2;
      g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fillStyle = 'rgba(200,30,30,.18)'; g.fill();
      g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fillStyle = '#C81E1E'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
      /* 출처 표시(지도 사용 조건) */
      g.font = '12px sans-serif'; const tw = g.measureText(sv.credit).width + 10;
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(w - tw, h - 18, tw, 18); g.fillStyle = '#333'; g.fillText(sv.credit, w - tw + 5, h - 5);
      if (label) { g.font = 'bold 14px sans-serif'; const lw = g.measureText(label).width + 12; g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(0, 0, lw, 24); g.fillStyle = '#C81E1E'; g.fillText(label, 6, 17); }
      return { name: view.name, dataUrl: c.toDataURL('image/jpeg', 0.86), w, h };
    }
    throw new Error('지도 그림을 받지 못했습니다(인터넷 연결 또는 사내 보안 설정 확인)');
  }

  /* 비어 있는 위치도·건물전경 칸에 지도를 채운다(이미 올린 이미지는 건드리지 않는다) */
  async function autoFill(opt) {
    const o = opt || {}, S = App.S, place = App.Fields.get(S, 'place');
    const todo = VIEWS.filter((v) => !S.images[v.slot].length);
    if (!todo.length) { if (!o.silent) U.toast('위치도와 건물전경에 이미 이미지가 있습니다. 바꾸려면 먼저 [삭제]하세요.', 'err'); return { ok: false, reason: 'filled' }; }
    if (!String(place || '').trim()) { if (!o.silent) U.toast('"나. 장소"가 비어 있어 지도를 찾을 수 없습니다.', 'err'); return { ok: false, reason: 'noplace' }; }
    if (o.onStatus) o.onStatus('주소로 위치를 찾는 중…');
    try {
      const g = await geocode(place);
      let n = 0;
      for (const v of todo) {
        if (o.onStatus) o.onStatus(`지도 그림 받는 중… (${n + 1}/${todo.length})`);
        const img = await U.shrinkImage(await drawMap(g.lat, g.lon, v, v.zoom >= 19 ? '확대지도' : '위치도'), D.IMAGE.maxKB * 1024);
        if (!S.images[v.slot].length) S.images[v.slot].push(img); /* 기다리는 사이 직접 올렸다면 유지 */
        n++;
      }
      await U.fitImagesTotal(S.images);
      App.State.changed('img'); App.emit('images');
      const msg = g.exact ? '지도를 가져왔습니다. 표시된 위치가 맞는지 확인해 주세요.' : '지도를 가져왔지만 정확한 건물이 아니라 도로·동 중심일 수 있습니다. 위치를 꼭 확인하고, 다르면 지도 캡처를 붙여넣어 바꾸세요.';
      if (o.onStatus) o.onStatus(msg);
      if (!o.silent || !g.exact) U.toast(msg, g.exact ? '' : 'err');
      return { ok: true, exact: g.exact };
    } catch (e) {
      const msg = '지도를 자동으로 가져오지 못했습니다: ' + e.message + ' → 아래 [카카오맵/네이버지도 열기] 후 캡처(Win+Shift+S)해서 칸을 클릭하고 Ctrl+V로 붙여넣으세요.';
      if (o.onStatus) o.onStatus(msg);
      U.toast('지도를 자동으로 가져오지 못했습니다. 안내 문구를 확인해 주세요.', 'err');
      return { ok: false, reason: 'error', error: e.message };
    }
  }

  App.Maps = { autoFill, geocode, queriesFor, toPx };
})();
