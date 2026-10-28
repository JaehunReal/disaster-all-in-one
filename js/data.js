/* 중앙 데이터 정의: 항목을 늘리려면 이 파일의 목록만 고치면 된다 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  App.DATA = {
    SECRET: '대외유출주의',
    /* 보고서 종류: 화재면 "화재 등", 구조면 "구조 등" 사고상황보고서. 종류를 늘리려면 이 목록에 한 줄만 더하면 된다 */
    REPORT_TYPES: {
      rescue: { name: '구조', title: '구 조 등 사 고 상 황 보 고 서' },
      fire: { name: '화재', title: '화 재 등 사 고 상 황 보 고 서' },
    },
    DEFAULT_REPORT_TYPE: 'rescue',
    DEFAULTS: { to: '소방청119종합상황실', from: '대구소방안전본부', origin: '119종합상황실', city: '대구', pending: '조사중' },
    /* 대상 비고: 기본 지하2층~지상6층, 더 늘릴 수 있는 한계 */
    FLOORS: { belowMin: 2, belowMax: 10, aboveMin: 6, aboveMax: 60 },
    /* 대상(건물명·상호·호수) 자동 찾기용 낱말: 항목을 늘리려면 이 목록에 낱말만 더하면 된다 */
    TARGET_WORDS: {
      building: ['아파트', '빌라', '빌딩', '타워', '맨션', '오피스텔', '주공', '캐슬', '상가', '시장', '플라자', '프라자', '하이츠', '타운', '주택'],
      shop: ['어린이집', '스크린골프', '당구장', '편의점', '노래방', '목욕탕', '찜질방', '고시원', '유치원', '미용실', '세탁소', '정육점', '안경점', '인쇄소', '사무소', '사무실', '볼링장', '헬스장', '체육관', '골프장', '부동산', '대리점', '한의원', '식당', '카페', '커피', '학원', '의원', '약국', '주점', '교회', '공장', '창고', '모텔', '호텔', '사우나', '슈퍼', '수퍼', '마트', '치킨', '횟집', '분식', '반점', '상회', '서점', '은행', '피시방', 'PC방', '홍보관', '가게'],
      skip: ['소방', '119', '구조', '경찰', '응급', '구급', '상황실', '안전센터']
    },
    /* 관할소방서 → 119안전센터 */
    STATIONS: [
      { name: '중부', centers: ['남산', '서문로', '대신', '삼덕', '봉덕', '명덕', '성명'] },
      { name: '동부', centers: ['혁신', '신천', '안심', '동촌', '불로봉무', '공산', '불로', '율하'] },
      { name: '서부', centers: ['평리', '이현', '내당', '비산'] },
      { name: '북부', centers: ['칠성', '침산', '노원', '대현', '산격'] },
      { name: '수성', centers: ['범물', '만촌', '황금', '상동', '수성', '무열로', '고산', '가창'] },
      { name: '달서', centers: ['월성', '본리', '송현', '도원', '죽전'] },
      { name: '달성', centers: ['현풍', '논공', '화원', '구지', '옥포'] },
      { name: '강서', centers: ['다사', '성서', '대천', '매곡'] },
      { name: '강북', centers: ['구암', '읍내', '태전', '무태', '금호', '군위', '의흥'] },
    ],
    PEOPLE: ['소방', '경찰', '시청', '구청', '한전', '기타'],
    EQUIP: ['지휘차', '펌프', '탱크', '화학', '사다리', '굴절', '구조', '구급', '경찰', '기타'],
    LEVELS: ['사망', '중상', '경상'],
    /* 첨부 이미지 용량: 긴 변 최대 px, 더 줄이지 않는 긴 변 px, 장당 한도(KB), 전체 한도(KB, 브라우저 저장공간 약 5MB 중) */
    IMAGE: { maxSide: 1400, minSide: 640, maxKB: 300, totalKB: 2000 },
    ATTACH: [
      { key: 'map', label: '위치도', max: 1 },
      { key: 'building', label: '건물전경', max: 1 },
      { key: 'photos', label: '현장사진', max: 4 },
    ],
    TABS: [
      { id: 'meta', label: '1 사건정보' },
      { id: 'status', label: '2 현황' },
      { id: 'actions', label: '3 조치사항' },
      { id: 'preview', label: '4 미리보기·내보내기' },
    ],
  };
  /* 층 키: 'B2'(지하2층) ... 'B1' → '1F'(지상1층) ... '6F'. 아래층부터 위층 순서 */
  const FL = App.DATA.FLOORS;
  App.DATA.floorKeys = (r) => {
    const out = [];
    for (let i = r.below; i >= 1; i--) out.push('B' + i);
    for (let i = 1; i <= r.above; i++) out.push(i + 'F');
    return out;
  };
  App.DATA.isFloorKey = (k) => {
    const m = String(k).match(/^(?:B(\d{1,2})|(\d{1,3})F)$/);
    if (!m) return false;
    return m[1] ? +m[1] >= 1 && +m[1] <= FL.belowMax : +m[2] >= 1 && +m[2] <= FL.aboveMax;
  };
  App.DATA.floorLabel = (k) => (k[0] === 'B' ? `지하${k.slice(1)}층` : `지상${parseInt(k, 10)}층`);
  App.DATA.floorShort = (k) => (k[0] === 'B' ? `(지${k.slice(1)})` : `(${parseInt(k, 10)}층)`);
})();
