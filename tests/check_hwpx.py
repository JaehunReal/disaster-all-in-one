# 개발용 검사: 저장된 .hwpx 의 구조 확인 (ZIP 순서, XML 문법, 남은 자리표시, 이미지 등록)
import re, sys, zipfile, xml.etree.ElementTree as ET
f = sys.argv[1]; z = zipfile.ZipFile(f); bad = []
infos = z.infolist()
if infos[0].filename != 'mimetype' or infos[0].compress_type != 0: bad.append('mimetype 가 맨 앞 무압축이 아님')
if z.read('mimetype') != b'application/hwp+zip': bad.append('mimetype 내용 오류')
if z.testzip(): bad.append('CRC 오류')
for n in z.namelist():
    if n.endswith(('.xml', '.hpf', '.rdf')):
        try: ET.fromstring(z.read(n))
        except ET.ParseError as e: bad.append(f'{n} XML 오류: {e}')
sec = z.read('Contents/section0.xml').decode('utf8')
left = re.findall(r'\{\{[^}]*\}\}', sec)
if left: bad.append('남은 자리표시: ' + ', '.join(sorted(set(left))))
hpf = z.read('Contents/content.hpf').decode('utf8')
for i, href in re.findall(r'<opf:item id="([^"]+)" href="(BinData/[^"]+)"', hpf):
    if href not in z.namelist(): bad.append('이미지 파일 없음: ' + href)
    if f'binaryItemIDRef="{i}"' not in sec: bad.append('쓰지 않는 이미지 등록: ' + i)
for i in set(re.findall(r'binaryItemIDRef="([^"]+)"', sec)):
    if f'id="{i}"' not in hpf: bad.append('등록되지 않은 이미지 참조: ' + i)
ids = re.findall(r'<hp:p [^>]*\bid="(\d+)"', sec)
dup = len(ids) - len(set(ids))
print('파일:', len(infos), '개 / 문단:', len(ids), '/ 중복 문단 id:', dup, '/ 이미지:', len(re.findall(r'<hp:pic ', sec)))
print('검사 결과:', '정상' if not bad else '문제 있음'); [print(' -', b) for b in bad]
sys.exit(1 if bad else 0)
