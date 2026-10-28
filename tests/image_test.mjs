// 개발용 시험: 큰 이미지를 올리면 자동으로 줄어드는지, 저장공간이 모자랄 때 다시 줄이는지
// 사용: PW_BASE=$(npm root -g)/ node tests/image_test.mjs dist/재난올인원.html <큰이미지...>
import { createRequire } from 'module'; const require = createRequire(process.env.PW_BASE || import.meta.url); const { chromium } = require('playwright');
import url from 'url'; import path from 'path';
const [html, ...imgs] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url.pathToFileURL(path.resolve(html)).href);
await p.evaluate(() => { localStorage.clear(); App.State.reset(); App.S.mapAuto = false; App.emit('rebuild'); App.UI.showTab('meta'); });
const toast = async () => p.evaluate(() => document.querySelector('#toast').textContent);
const sizes = () => p.evaluate(() => Object.fromEntries(Object.entries(App.S.images).map(([k, l]) => [k, l.map((im) => `${im.w}x${im.h} ${Math.round(App.U.dataUrlBytes(im.dataUrl) / 1024)}KB`)])));
const total = () => p.evaluate(() => Math.round(Object.values(App.S.images).flat().reduce((a, im) => a + App.U.dataUrlBytes(im.dataUrl), 0) / 1024));
await p.setInputFiles('#f-img-map', imgs[0]); await p.waitForFunction(() => App.S.images.map.length === 1);
console.log('위치도 1장:', await sizes(), '| 알림:', await toast());
await p.setInputFiles('#f-img-building', imgs[1]); await p.waitForFunction(() => App.S.images.building.length === 1);
await p.setInputFiles('#f-img-photos', imgs.slice(2, 6)); await p.waitForFunction(() => App.S.images.photos.length === 4, null, { timeout: 30000 });
await p.waitForTimeout(300);
console.log('6장:', await sizes(), '| 전체', await total(), 'KB | 알림:', await toast());
console.log('저장 결과:', await p.evaluate(() => { App.State.saveNow(); return (localStorage.getItem('disaster-all-in-one:v1') || '').length; }), '글자');
/* 저장공간 부족 흉내: 1.2MB 넘는 저장은 실패시킨다 → 이미지 자동 축소 후 재저장 */
await p.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(v).length > 1200000) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; App.State.saveNow(); });
await p.waitForFunction(() => !App.State.shrinking, null, { timeout: 30000 }); await p.waitForTimeout(500);
console.log('부족 시:', await p.evaluate(() => document.querySelector('#save-status').textContent), '| 전체', await total(), 'KB | 알림:', await toast());
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no page errors');
await b.close();
