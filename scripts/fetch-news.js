// scripts/fetch-news.js
// 구글 뉴스 RSS에서 우주산업/발사체 관련 최신 뉴스를 가져와 data/news.json 을 새로 만듭니다.
// GitHub Actions가 매일 아침(KST 06:00)에 이 스크립트를 자동 실행합니다.
// API 키가 필요 없는 방식이라 별도 설정 없이 바로 동작합니다.

import { writeFileSync } from 'fs';
import { XMLParser } from 'fast-xml-parser';

// 국내(kr) / 해외(gl) 각각 검색할 키워드
const QUERIES = {
  kr: ['한화에어로스페이스 우주', '누리호', '차세대발사체 KSLV', '한국 우주산업'],
  gl: ['space launch industry', 'rocket launch market', 'SpaceX Rocket Lab', 'satellite launch'],
};

// 카테고리 자동 분류용 키워드 (제목에 포함되면 해당 카테고리로 분류, 없으면 '시장')
const CAT_RULES = [
  { c: '경쟁', kws: ['스페이스X', 'SpaceX', '로켓랩', 'Rocket Lab', '경쟁사', 'Blue Origin', '블루오리진'] },
  { c: '기술', kws: ['엔진', '발사체 개발', '재사용', 'engine', 'reusable', '기술'] },
  { c: '정책', kws: ['정부', '우주항공청', '정책', '예산', 'policy', '규제'] },
];

function classify(title) {
  for (const rule of CAT_RULES) {
    if (rule.kws.some((k) => title.includes(k))) return rule.c;
  }
  return '시장';
}

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchOne(query, region) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=${region === 'kr' ? 'ko' : 'en'}&gl=${region === 'kr' ? 'KR' : 'US'}&ceid=${
    region === 'kr' ? 'KR:ko' : 'US:en'
  }`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`요청 실패 (${query}): ${res.status}`);
    return [];
  }
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.slice(0, 6).map((it) => ({
    r: region,
    d: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : '',
    c: classify(it.title || ''),
    t: (it.title || '').replace(/\s*-\s*[^-]+$/, ''), // 뒤에 붙는 "- 출처명" 제거
    s: it?.source?.['#text'] ?? it?.source ?? '',
    u: it.link || '',
    x: '', // 구글 뉴스 RSS는 요약을 제공하지 않아 비워둠 (제목/링크가 핵심 정보)
  }));
}

async function main() {
  const all = [];

  for (const [region, queries] of Object.entries(QUERIES)) {
    for (const q of queries) {
      const items = await fetchOne(q, region);
      all.push(...items);
    }
  }

  // 링크 기준 중복 제거 + 최신순 정렬 + 지역별 상한
  const seen = new Set();
  const unique = all.filter((n) => {
    if (!n.u || seen.has(n.u)) return false;
    seen.add(n.u);
    return true;
  });
  unique.sort((a, b) => b.d.localeCompare(a.d));

  const kr = unique.filter((n) => n.r === 'kr').slice(0, 12);
  const gl = unique.filter((n) => n.r === 'gl').slice(0, 12);
  const news = [...kr, ...gl];

  const output = { news, updatedAt: new Date().toISOString() };
  writeFileSync('data/news.json', JSON.stringify(output, null, 2), 'utf-8');
  console.log(`news.json 갱신 완료: 총 ${news.length}건 (KR ${kr.length} / GL ${gl.length})`);
}

main().catch((err) => {
  console.error('뉴스 수집 실패:', err);
  process.exit(1);
});
