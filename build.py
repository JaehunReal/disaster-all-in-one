# index.html + css + js + lib 를 하나의 HTML 파일로 합친다 (더블클릭만으로 실행)
#   python build.py [출력경로]      → 서식 변환·검사 후 dist/재난올인원.html 생성
#   python build.py --check         → 서식(template/서식.hwpx) 검사만
import base64, datetime, json, re, sys, pathlib, zipfile
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).parent
TEMPLATE = root / 'template' / '서식.hwpx'
TEMPLATE_JS = root / 'js' / 'hwpx_template.js'
HP = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'

# 프로그램이 값을 채우는 자리표시 (template/서식_작성규칙.md 와 같아야 한다)
KNOWN = {
    '보안표시', '보고서제목', '수신', '참조', '발신', '발신지', '보고일자', '작성자', '보고책임자', '관할', '접수시간', '제목',
    '사고내용제목', '인명피해', '재산피해', '인원', '장비', '보험',
    '#개요', '#개요비고', '#사고내용', '#재산비고', '#조치', '#조치굵게', '#조치없음', '#기타', '#첨부시작',
    '사상자.연번', '사상자.성명', '사상자.나이성별', '사상자.부상정도', '사상자.이송병원', '사상자.구급대', '사상자.비고',
    '그림.이름',
}
TEXT_EXT = ('.xml', '.hpf', '.txt', '.rdf')


def check_template(files):
    """자리표시 검사: 오류(빌드 중단)와 알림을 돌려준다."""
    errors, notes = [], []
    sec = files.get('Contents/section0.xml')
    if sec is None:
        return ['Contents/section0.xml 이 없습니다. 한글에서 HWPX 형식으로 저장한 파일인지 확인하세요.'], notes
    try:
        tree = ET.fromstring(sec)
    except ET.ParseError as e:
        return [f'section0.xml 을 읽을 수 없습니다: {e}'], notes
    found = set()
    for p in tree.iter(HP + 'p'):
        ts = [t for run in p.findall(HP + 'run') for t in run.findall(HP + 't')]
        texts = [''.join(t.itertext()) for t in ts]
        joined = ''.join(texts)
        if joined.count('{{') != joined.count('}}'):
            errors.append(f'괄호 짝이 맞지 않는 자리표시가 있습니다: "{joined[:60]}"')
            continue
        for m in re.finditer(r'\{\{\s*([^{}]+?)\s*\}\}', joined):
            name = m.group(1)
            found.add(name)
            # 한 글자 묶음(<hp:t>) 안에 온전히 들어 있는지
            pos, whole = 0, False
            for tx in texts:
                if pos <= m.start() and m.end() <= pos + len(tx):
                    whole = True
                pos += len(tx)
            if not whole:
                notes.append(f'"{{{{{name}}}}}"가 글자모양 경계로 나뉘어 저장되어 있습니다(실행 시 자동으로 합쳐 처리합니다). 가능하면 한글에서 자리표시를 지우고 한 번에 다시 입력하세요.')
    for name in sorted(found - KNOWN):
        notes.append(f'알 수 없는 자리표시 "{{{{{name}}}}}" → 보고서에서는 빈칸으로 처리됩니다.')
    for name in sorted(KNOWN - found):
        notes.append(f'서식에 "{{{{{name}}}}}"가 없습니다 → 해당 항목은 한글 보고서에 나오지 않습니다.')
    return errors, notes


def build_template_js():
    if not TEMPLATE.exists():
        print('알림: template/서식.hwpx 가 없어 한글(HWPX) 저장 서식을 갱신하지 않았습니다.')
        return True
    z = zipfile.ZipFile(TEMPLATE)
    names = z.namelist()
    files = {n: z.read(n) for n in names}
    if files.get('mimetype', b'').strip() != b'application/hwp+zip':
        print('오류: template/서식.hwpx 가 HWPX 파일이 아닙니다(한글에서 "HWPX 문서"로 저장하세요).')
        return False
    errors, notes = check_template(files)
    for n in notes:
        print('  - ' + n)
    if errors:
        for e in errors:
            print('오류: ' + e)
        return False
    order = ['mimetype'] + [n for n in names if n != 'mimetype' and not n.endswith('/')]
    out = []
    for n in order:
        if n.lower().endswith(TEXT_EXT) or n == 'mimetype':
            out.append([n, 't', files[n].decode('utf8')])
        else:
            out.append([n, 'b', base64.b64encode(files[n]).decode('ascii')])
    meta = {'source': TEMPLATE.name, 'built': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'files': out}
    TEMPLATE_JS.write_text('/* 자동 생성 파일: template/서식.hwpx → build.py. 직접 고치지 마세요 */\n'
                           '(function () {\n  \'use strict\';\n  const App = (window.App = window.App || {});\n'
                           '  App.HWPX_TEMPLATE = ' + json.dumps(meta, ensure_ascii=False) + ';\n})();\n', encoding='utf8')
    print(f'서식 변환: {TEMPLATE.name} → {TEMPLATE_JS.relative_to(root)} ({round(TEMPLATE_JS.stat().st_size / 1024)} KB)')
    return True


def build_html(out):
    html = (root / 'index.html').read_text(encoding='utf8')
    def inline_css(m): return '<style>\n' + (root / m.group(1)).read_text(encoding='utf8') + '\n</style>'
    def inline_js(m):
        code = (root / m.group(1)).read_text(encoding='utf8').replace('</script', '<\\/script')
        return '<script>\n' + code + '\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
    csp = ("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob: https://tile.openstreetmap.org https://*.basemaps.cartocdn.com; style-src 'unsafe-inline'; "
           "script-src 'unsafe-inline'; connect-src https://nominatim.openstreetmap.org; form-action 'none'; base-uri 'none'\">")
    html = html.replace('<title>', csp + '\n<title>', 1)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf8')
    print('built', out, round(out.stat().st_size / 1024), 'KB')
    if (root / 'robots.txt').exists():  # 웹 배포 시 검색 노출 차단
        (out.parent / 'robots.txt').write_text((root / 'robots.txt').read_text(encoding='utf8'), encoding='utf8')


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--check' in args:
        if not TEMPLATE.exists():
            sys.exit('template/서식.hwpx 가 없습니다.')
        z = zipfile.ZipFile(TEMPLATE)
        errs, notes = check_template({n: z.read(n) for n in z.namelist()})
        for n in notes: print('  - ' + n)
        for e in errs: print('오류: ' + e)
        print('검사 결과: ' + ('오류 있음' if errs else '정상'))
        sys.exit(1 if errs else 0)
    if not build_template_js():
        sys.exit('빌드 중단: 서식 오류를 고친 뒤 다시 실행하세요.')
    build_html(pathlib.Path(args[0]) if args else root / 'dist' / '재난올인원.html')
