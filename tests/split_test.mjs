// 개발용 시험: 한글이 자리표시를 여러 글자 묶음으로 나눠 저장한 경우에도 채워지는지
import { createRequire } from 'module'; const require = createRequire(process.env.PW_BASE || import.meta.url); const { chromium } = require('playwright');
import url from 'url'; import path from 'path';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(url.pathToFileURL(path.resolve(process.argv[2])).href);
const r = await p.evaluate(async () => {
  const f = App.HWPX_TEMPLATE.files.find((x) => x[0] === 'Contents/section0.xml');
  const orig = f[2];
  /* {{제목}} → {{제 | 목}} 두 묶음, {{#조치}} → {{# | 조 | 치}} 세 묶음으로 나눈다 */
  f[2] = orig.replace('<hp:t>{{제목}}</hp:t></hp:run>', '<hp:t>{{제</hp:t></hp:run><hp:run charPrIDRef="7"><hp:t>목}}</hp:t></hp:run>')
             .replace('<hp:t>    ○ {{#조치}}</hp:t></hp:run>', '<hp:t>    ○ {{#</hp:t></hp:run><hp:run charPrIDRef="8"><hp:t>조</hp:t></hp:run><hp:run charPrIDRef="7"><hp:t>치}}</hp:t></hp:run>');
  const changed = f[2] !== orig;
  App.S.values.title = '분할 시험 제목'; App.S.locked.title = '분할 시험 제목';
  App.S.lines = [{ id: 'a', manual: true, t: 1, timeLabel: '10:00', actor: '상황실', text: '일반 조치 문장', bold: false, selected: true, ord: 1, kind: '', cat: '', raw: '' }];
  const blob = await App.Hwpx.build(App.Model.build(App.S));
  f[2] = orig;
  const u = new Uint8Array(await blob.arrayBuffer());
  const txt = new TextDecoder().decode(u);
  return { changed, title: txt.includes('분할 시험 제목'), action: txt.includes('일반 조치 문장'), leftover: (txt.match(/\{\{[^}]*\}\}|\{\{|\}\}/g) || []).length };
});
console.log(r); await b.close();
process.exit(r.changed && r.title && r.action && !r.leftover ? 0 : 1);
