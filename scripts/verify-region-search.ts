import fs from 'node:fs';
import path from 'node:path';
import {
  isAdministrativePlace,
  looksLikeRegionQuery,
  looksLikeSpecificPlace,
  matchesRegion,
  regionKey,
  searchTravelPlaces,
} from '../src/lib/places/collectAttractions';

function loadLocalEnv(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function unitChecks(): string[] {
  const failures: string[] = [];
  const cases: [string, boolean, boolean][] = [
    ['제주도', true, false],
    ['부산', true, false],
    ['대구', true, false],
    ['경주', true, false],
    ['강릉', true, false],
    ['송해공원', false, true],
    ['광안리해수욕장', false, true],
    ['앞산전망대', false, true],
  ];
  for (const [query, region, specific] of cases) {
    if (looksLikeRegionQuery(query) !== region) failures.push(`${query}: region 판별 실패`);
    if (looksLikeSpecificPlace(query) !== specific) failures.push(`${query}: 단일장소 판별 실패`);
  }
  assert(regionKey('제주특별자치도') === '제주', 'regionKey 제주');
  assert(regionKey('대구광역시') === '대구', 'regionKey 대구');
  assert(
    isAdministrativePlace({ name: '제주특별자치도', types: ['administrative_area_level_1', 'political'] }),
    '제주특별자치도 필터'
  );
  assert(
    isAdministrativePlace({ name: 'Jeju Island', types: ['natural_feature'] }),
    'Jeju Island 필터'
  );
  assert(
    !isAdministrativePlace({ name: '성산일출봉', types: ['tourist_attraction', 'park'] }),
    '성산일출봉은 관광지'
  );
  assert(
    !matchesRegion({ name: '해운대해수욕장', address: '대한민국 부산광역시 해운대구' }, '대구'),
    '해운대구를 대구로 오인하지 말 것'
  );
  assert(
    matchesRegion({ name: '수성못', address: '대한민국 대구광역시 수성구' }, '대구'),
    '수성못은 대구'
  );
  return failures;
}

async function liveSearch(apiKey: string, query: string) {
  const result = await searchTravelPlaces(apiKey, query, 'search');
  return {
    query,
    count: result.places.length,
    names: result.places.map((place) => place.name),
    admin: result.places.filter((place) => isAdministrativePlace(place)).map((place) => place.name),
  };
}

function containsAny(names: string[], needles: string[]): string[] {
  return needles.filter((needle) => !names.some((name) => name.includes(needle)));
}

async function main() {
  loadLocalEnv();
  const unitFailures = unitChecks();
  if (unitFailures.length) {
    console.error('[단위] FAIL');
    for (const failure of unitFailures) console.error(' -', failure);
    process.exit(1);
  }
  console.log('[단위] PASS  지역/단일장소/행정구역 필터');

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY가 없어 실검색을 건너뜁니다.');
    process.exit(1);
  }

  const jeju = await liveSearch(apiKey, '제주도');
  const daegu = await liveSearch(apiKey, '대구');
  const busan = await liveSearch(apiKey, '부산');
  const gyeongju = await liveSearch(apiKey, '경주');
  const gangneung = await liveSearch(apiKey, '강릉');
  const songhae = await liveSearch(apiKey, '송해공원');

  const jejuMissing = containsAny(jeju.names, ['성산일출봉', '섭지코지', '우도', '협재']);
  const daeguMissing = containsAny(daegu.names, ['송해공원', '앞산', '수성못']);
  const failures: string[] = [];

  if (jeju.count < 10) failures.push(`제주도 ${jeju.count}곳 (10곳 미만)`);
  if (busan.count < 10) failures.push(`부산 ${busan.count}곳 (10곳 미만)`);
  if (gyeongju.count < 10) failures.push(`경주 ${gyeongju.count}곳 (10곳 미만)`);
  if (gangneung.count < 10) failures.push(`강릉 ${gangneung.count}곳 (10곳 미만)`);
  if (busan.admin.length) failures.push(`부산 행정구역 포함: ${busan.admin.join(', ')}`);
  if (gyeongju.admin.length) failures.push(`경주 행정구역 포함: ${gyeongju.admin.join(', ')}`);
  if (gangneung.admin.length) failures.push(`강릉 행정구역 포함: ${gangneung.admin.join(', ')}`);
  if (jeju.admin.length) failures.push(`제주도 행정구역 포함: ${jeju.admin.join(', ')}`);
  if (daegu.admin.length) failures.push(`대구 행정구역 포함: ${daegu.admin.join(', ')}`);
  if (jejuMissing.length) failures.push(`제주도 대표 명소 누락: ${jejuMissing.join(', ')}`);
  if (daeguMissing.length) failures.push(`대구 대표 명소 누락: ${daeguMissing.join(', ')}`);
  if (daegu.names.some((name) => /부산|해운대|광안/.test(name))) {
    failures.push(`대구 결과에 부산 장소가 섞임: ${daegu.names.filter((name) => /부산|해운대|광안/.test(name)).join(', ')}`);
  }
  if (!songhae.names.some((name) => name.includes('송해공원'))) failures.push('송해공원 단일 검색 실패');
  if (songhae.count > 8) failures.push(`송해공원 결과가 지역 추천처럼 펼쳐짐 (${songhae.count})`);

  console.log(`[제주도] ${jeju.count}곳`, jeju.names.slice(0, 12).join(', '));
  console.log(`[대구] ${daegu.count}곳`, daegu.names.slice(0, 12).join(', '));
  console.log(`[부산] ${busan.count}곳`, busan.names.slice(0, 12).join(', '));
  console.log(`[경주] ${gyeongju.count}곳`, gyeongju.names.slice(0, 12).join(', '));
  console.log(`[강릉] ${gangneung.count}곳`, gangneung.names.slice(0, 12).join(', '));
  console.log(`[송해공원] ${songhae.count}곳`, songhae.names.slice(0, 5).join(', '));

  if (failures.length) {
    console.error('[실검색] FAIL');
    for (const failure of failures) console.error(' -', failure);
    process.exit(1);
  }
  console.log('[실검색] PASS');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
