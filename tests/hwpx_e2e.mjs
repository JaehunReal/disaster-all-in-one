// 개발용 종단 시험: 빌드된 HTML에서 가상 관제일지를 올리고 한글(.hwpx)로 저장해 검사한다
// 사용: PW_BASE=$(npm root -g)/ node tests/hwpx_e2e.mjs <dist.html> <관제일지.xlsx> <출력.hwpx> [빈보고서]
import { createRequire } from 'module';
const require = createRequire(process.env.PW_BASE || import.meta.url);
const { chromium } = require('playwright');
import fs from 'fs'; import path from 'path'; import url from 'url';

const [html, log, out, mode] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url.pathToFileURL(path.resolve(html)).href);
await page.evaluate(() => { localStorage.clear(); App.State.reset(); App.S.mapAuto = false; App.emit('rebuild'); });

if (mode !== 'empty') {
  await page.setInputFiles('#f-logfile', log);
  await page.waitForFunction(() => App.S.log.count > 0, null, { timeout: 10000 });
  await page.evaluate(() => {
    const S = App.S;
    S.values.writer = '소방교 홍길동'; S.values.manager = '소방령 김철수(상황1팀)'; S.values.ref = '북부소방서';
    S.values.structKind = '철근콘크리트'; S.values.structFloors = '5/1'; S.values.areaTotal = '1,234.5';
    S.floors['B1'] = '주차장'; S.floors['1F'] = '편의점'; S.floors['3F'] = '음식점(발화층)';
    S.values.propMovable = '300'; S.values.propImmovable = '12000';
    S.values.propImmovableNote = '3층 주방 15㎡ 소손, 복도 20㎡ 그을음';
    S.values.etcNote = '언론보도: ○○일보 인터넷판 보도(15:10)\n특수문자 시험 <태그> & "따옴표" \'작은\'\t탭';
    S.casualties = [
      { name: '홍길순', age: '45세', sex: '여', injury: '연기흡입, 어지러움 호소로 병원 이송 후 경과 관찰 중이며 보호자에게 연락 완료', hospital: '가나병원', unit: '침산구급', remark: '', level: '경상' },
      { name: '이몽룡', age: '52세', sex: '남', injury: '우측 손등 1도 화상', hospital: '', unit: '자차', remark: '현장 응급처치', level: '경상' },
    ];
    S.insurance = [{ company: '○○화재', amount: '3억원' }];
    /* 긴 조치사항 문장(줄바꿈 확인) */
    S.lines.push({ id: 'mx', manual: true, t: S.log.baseMs + 40 * 60000, timeLabel: '14:43', kind: '', cat: '', actor: '상황실', text: '현장 잔불 정리 및 재발화 감시를 위하여 펌프차 1대 잔류 배치, 관계자에게 화재 현장 보존 및 출입 통제 협조 요청 완료', raw: '', bold: false, selected: true, ord: 999 });
    /* 첨부 이미지 3장(가로 사진, 세로 사진) */
    const mk = (w, h, color, label) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText(label, 20, 60); return { name: label + '.jpg', dataUrl: c.toDataURL('image/jpeg', 0.8), w, h }; };
    S.images.map = [mk(800, 560, '#4a7bb7', '위치도')];
    S.images.building = [mk(600, 800, '#6b8e4e', '건물')];
    S.images.photos = [mk(1000, 600, '#b75a4a', '사진1'), mk(600, 900, '#8a6bb7', '사진2'), mk(900, 600, '#b79a4a', '사진3')];
    App.State.changed('test');
  });
}

const b64 = await page.evaluate(async () => {
  const blob = await App.Hwpx.build(App.Model.build(App.S));
  const u = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
});
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
/* 화면의 [한글로 저장] 버튼도 눌러 내려받기가 되는지 확인 */
await page.evaluate(() => App.UI.showTab('preview'));
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('text=한글로 저장 (.hwpx)')]);
console.log('download name:', dl.suggestedFilename());
console.log('saved', out, fs.statSync(out).size, 'bytes');
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
