# 기본 서식(서식.hwpx) 만들기 — 개발 PC에서만 실행 (pip install python-hwpx)
# 본부 실제 서식을 쓸 때는 이 스크립트 대신 한글에서 만든 서식.hwpx 를 이 폴더에 두면 된다.
# 자리표시 규칙은 template/서식_작성규칙.md 참조
import pathlib, sys
from hwpx import HwpxDocument

OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent / '서식.hwpx'
MM = 283.465
FONT = '맑은 고딕'
PAGE_W, PAGE_H = 59528, 84186
MARGIN = round(20 * MM)
BODY_W = PAGE_W - MARGIN * 2

doc = HwpxDocument.new()
doc.set_page_size(width=PAGE_W, height=PAGE_H)
doc.set_page_margins(left=MARGIN, right=MARGIN, top=round(15 * MM), bottom=round(15 * MM), header=round(10 * MM), footer=round(10 * MM))

# ── 글자모양 ──
cs = lambda **k: doc.ensure_run_style(font=FONT, **k)
C_BODY = cs(size=10.5)
C_BOLD = cs(size=10.5, bold=True)
C_TITLE = cs(size=18, bold=True)
C_SEC = cs(size=11.5, bold=True)
C_SMALL = cs(size=9.5)
C_TH = cs(size=9.5, bold=True)
C_SUBJ = cs(size=11.5, bold=True)
C_GRAY = cs(size=10.5, color='#808080')
C_SECRET = cs(size=10, bold=True, color='#C00000')

# ── 테두리/칸 채우기 ──
B_CELL = doc.ensure_border_fill(border_color='#808080', border_width='0.12 mm')
B_HEAD = doc.ensure_border_fill(border_color='#808080', border_width='0.12 mm', fill_color='#EDEDED')
B_SECRET = doc.ensure_border_fill(border_color='#C00000', border_width='0.25 mm')

paras = []


def para(text='', char=C_BODY, **fmt):
    """문단을 추가하고 문단모양을 적용한다."""
    if not paras:
        p = doc.paragraphs[0]
        p.text = ''
    else:
        p = doc.add_paragraph('', char_pr_id_ref=char, inherit_style=False)
    if text:
        p.add_run(text, char_pr_id_ref=char)
    paras.append(p)
    idx = len(doc.paragraphs) - 1
    fmt.setdefault('line_spacing_percent', 160)
    doc.set_paragraph_format(paragraph_index=idx, **fmt)
    return p


# 내어쓰기: 첫 줄은 왼쪽 끝, 둘째 줄부터 글자 시작 위치에 맞춘다(한글의 '내어쓰기' = 음수 들여쓰기)
L2 = dict(indent_left_mm=0, first_line_indent_mm=-8.9, spacing_after_pt=2)
L4 = dict(indent_left_mm=0, first_line_indent_mm=-9.6, spacing_after_pt=2)
SEC = dict(spacing_before_pt=8, spacing_after_pt=3, keep_with_next=True)

# 제목
para('{{보고서제목}}', C_TITLE, alignment='CENTER', spacing_before_pt=4, spacing_after_pt=8)

# 표 머리칸·가운데 정렬용 문단모양(견본 문단을 만들어 번호만 얻고 지운다)
_tmp = para('', C_BODY, alignment='CENTER', line_spacing_percent=130)
P_CENTER = _tmp.para_pr_id_ref
_tmp2 = para('', C_BODY, line_spacing_percent=130)
P_CELL = _tmp2.para_pr_id_ref
_tmp.remove(); _tmp2.remove(); paras.pop(); paras.pop()


# ── 머리말 표 (5행 6열) ──
p = doc.add_table(5, 6, width=BODY_W, border_fill_id_ref=B_CELL)
t = p if hasattr(p, 'cell') else p.tables[0]
t.set_column_widths([10, 17, 20, 29, 11, 13])
for r in range(3):
    t.merge_cells(r, 0, r, 2)
    t.merge_cells(r, 3, r, 5)
t.merge_cells(4, 1, 4, 5)


def cell_runs(r, c, parts, center=False):
    cell = t.cell(r, c)
    cp = cell.paragraphs[0]
    cp.text = ''
    cp.para_pr_id_ref = P_CENTER if center else P_CELL
    for txt, ch in parts:
        cp.add_run(txt, char_pr_id_ref=ch)
    return cell


kv = [('수신', '수신'), ('보고일자', '보고일자'), ('참조', '참조'), ('작성자', '작성자'), ('발신', '발신'), ('보고책임자', '보고책임자')]
for i in range(3):
    a, b = kv[i * 2], kv[i * 2 + 1]
    cell_runs(i, 0, [(a[0] + ' : ', C_BOLD), ('{{' + a[1] + '}}', C_BODY)])
    cell_runs(i, 3, [(b[0] + ' : ', C_BOLD), ('{{' + b[1] + '}}', C_BODY)])
cell_runs(3, 0, [('발신지', C_TH)], True)
cell_runs(3, 1, [('{{발신지}}', C_SMALL)])
cell_runs(3, 2, [('관할소방서', C_TH)], True)
t.cell(3, 2).add_paragraph('(관할센터)', para_pr_id_ref=P_CENTER, char_pr_id_ref=C_TH)
cell_runs(3, 3, [('{{관할}}', C_SMALL)])
cell_runs(3, 4, [('접수시간', C_TH)], True)
cell_runs(3, 5, [('{{접수시간}}', C_BODY)], True)
cell_runs(4, 0, [('제목', C_TH)], True)
cell_runs(4, 1, [('{{제목}}', C_SUBJ)])
for rc in [(3, 0), (3, 2), (3, 4), (4, 0)]:
    t.set_cell_border_fill(*rc, B_HEAD)
paras.append(p)

# ── 1. 발생개요 ──
para('1. 발생개요', C_SEC, **SEC)
para('  {{#개요}}', C_BODY, **L2)            # 반복: 가. 일  시 : …
para('    ※ {{#개요비고}}', C_SMALL, **L4)   # 반복: ※ 용도 : …
para('  {{사고내용제목}} :', C_BODY, keep_with_next=True, **L2)
para('    ○ {{#사고내용}}', C_BODY, **L4)     # 반복: ○ …

# ── 2. 피해상황 ──
para('2. 피해상황', C_SEC, **SEC)
para('  가. 인명피해 : {{인명피해}}', C_BODY, keep_with_next=True, **L2)
p = doc.add_table(2, 7, width=BODY_W, border_fill_id_ref=B_CELL)
t = p if hasattr(p, 'cell') else p.tables[0]
t.set_column_widths([7, 12, 14, 23, 17, 13, 14])
for i, h in enumerate(['연번', '성 명', '나이/성별', '부상정도', '이송병원', '구급대', '비고']):
    cell_runs(0, i, [(h, C_TH)], True)
    t.set_cell_border_fill(0, i, B_HEAD)
for i, k in enumerate(['연번', '성명', '나이성별', '부상정도', '이송병원', '구급대', '비고']):
    cell_runs(1, i, [('{{사상자.' + k + '}}', C_SMALL)], True)
paras.append(p)
para('  나. 재산피해 : {{재산피해}}', C_BODY, spacing_before_pt=4, **L2)
para('    ※ {{#재산비고}}', C_SMALL, **L4)

# ── 3. 동원현황 ──
para('3. 동원현황', C_SEC, **SEC)
para('  가. 인  원 : {{인원}}', C_BODY, **L2)
para('  나. 장  비 : {{장비}}', C_BODY, **L2)

# ── 4. 조치사항 ──
para('4. 조치사항 (관제진행상황)', C_SEC, **SEC)
para('    ○ {{#조치}}', C_BODY, **L4)
para('    ○ {{#조치굵게}}', C_BOLD, **L4)
para('    {{#조치없음}}', C_GRAY, **L4)

# ── 5. 그 밖의 사항 ──
para('5. 그 밖의 사항 (보험가입 및 언론보도내용 등)', C_SEC, **SEC)
para('    ○ 보험가입내역 : {{보험}}', C_BODY, **L4)
para('    ○ {{#기타}}', C_BODY, **L4)

# ── 첨부(새 쪽): 위치도·건물전경·현장사진. 2칸 표 1행이 견본이며, 그림 2장마다 행을 복제한다 ──
para('{{#첨부시작}}', C_SMALL, page_break_before=True)
import io
from PIL import Image
buf = io.BytesIO(); Image.new('RGB', (400, 300), (210, 214, 220)).save(buf, 'JPEG', quality=80)
img_id = doc.add_image(buf.getvalue(), 'jpg')
p = doc.add_table(1, 2, width=BODY_W, border_fill_id_ref=B_CELL)
t = p if hasattr(p, 'cell') else p.tables[0]
PIC_W = round(BODY_W / 2 - 1500); PIC_H = round(PIC_W * 3 / 4)
for c in range(2):
    cell = t.cell(0, c)
    cp = cell.paragraphs[0]; cp.text = ''; cp.para_pr_id_ref = P_CENTER
    cp.add_picture(img_id, width=PIC_W, height=PIC_H)
    cell.add_paragraph('{{그림.이름}}', para_pr_id_ref=P_CENTER, char_pr_id_ref=C_TH)
paras.append(p)

# ── 머리글: 대외유출주의 ──
doc.set_header_text('{{보안표시}}')

doc.save_to_path(OUT)

# ── 저장 후 손질: 머리글 글자모양(빨간 굵은 글씨 + 글자 테두리), 빈 글자 묶음 정리 ──
import zipfile, re as _re
z = zipfile.ZipFile(OUT); files = {n: z.read(n) for n in z.namelist()}; order = z.namelist(); z.close()
sec = files['Contents/section0.xml'].decode('utf8')
sec = sec.replace('<hp:run charPrIDRef="0"><hp:t>{{보안표시}}</hp:t></hp:run>', '<hp:run charPrIDRef="%s"><hp:t>{{보안표시}}</hp:t></hp:run>' % C_SECRET)
sec = _re.sub(r'<hp:run charPrIDRef="\d+"><hp:t/></hp:run>', '', sec)
# secPr 안의 머리글 사본(OWPML 규격 밖, 한글은 hp:ctrl 쪽만 읽음)은 지운다
_i, _j = sec.find('<hp:secPr'), sec.find('</hp:secPr>')
_sp = _re.sub(r'<hp:header\b.*?</hp:header>|<hp:headerApply\b[^>]*/>', '', sec[_i:_j], flags=_re.S)
sec = sec[:_i] + _sp + sec[_j:]
files['Contents/section0.xml'] = sec.encode('utf8')
head = files['Contents/header.xml'].decode('utf8')
head = _re.sub(r'<hh:charPr\b[^>]*>', lambda m: _re.sub(r'borderFillIDRef="\d+"', 'borderFillIDRef="%s"' % B_SECRET, m.group(0)) if _re.search(r'\bid="%s"' % C_SECRET, m.group(0)) else m.group(0), head)
files['Contents/header.xml'] = head.encode('utf8')
with zipfile.ZipFile(OUT, 'w') as z:
    for n in order:
        z.writestr(n, files[n], zipfile.ZIP_STORED if n == 'mimetype' else zipfile.ZIP_DEFLATED)
print('saved', OUT, 'chars:', dict(BODY=C_BODY, BOLD=C_BOLD, SECRET=C_SECRET), 'borders:', B_CELL, B_HEAD, B_SECRET)
