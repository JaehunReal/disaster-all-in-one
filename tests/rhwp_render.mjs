// 개발용 검증: HWPX 파일을 rhwp로 열어 쪽마다 SVG→PNG로 저장 (배포본에는 포함되지 않음)
// 사용: PW_BASE=$(npm root -g)/ node tests/rhwp_render.mjs <rhwp폴더(rhwp.js,rhwp_bg.wasm)> <파일.hwpx> <출력폴더>
import { createRequire } from 'module'; const require = createRequire(process.env.PW_BASE || import.meta.url); const { chromium } = require('playwright');
import fs from 'fs'; import path from 'path'; import http from 'http';
const [rhwpDir, file, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const srv = http.createServer((req, res) => {
  const p = path.join(rhwpDir, decodeURIComponent(req.url.split('?')[0]));
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><meta charset=utf-8><body>'); }
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', p.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(`http://127.0.0.1:${port}/`);
const b64 = fs.readFileSync(file).toString('base64');
const result = await page.evaluate(async (b64) => {
  const m = await import('/rhwp.js'); await m.default('/rhwp_bg.wasm');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = new m.HwpDocument(bytes);
  const n = doc.pageCount(); const svgs = [];
  for (let i = 0; i < n; i++) svgs.push(doc.renderPageSvg(i));
  let text = ''; try { text = doc.getFieldList ? '' : ''; } catch (_) {}
  return { n, svgs };
}, b64);
console.log('pages', result.n);
for (let i = 0; i < result.svgs.length; i++) {
  const p2 = await browser.newPage({ viewport: { width: 800, height: 1131 } });
  await p2.setContent(`<html><body style="margin:0;background:#fff">${result.svgs[i].replace('<svg', '<svg style="width:800px;height:auto"')}</body></html>`);
  await p2.screenshot({ path: path.join(outDir, `page${i + 1}.png`), fullPage: true });
}
await browser.close(); srv.close();
