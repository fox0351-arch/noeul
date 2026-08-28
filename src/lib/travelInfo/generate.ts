import { generateGeminiJsonObject } from '@/lib/photoAi';
import { catalogTravelInfo, matchGalmaetgilByPlaceName, travelInfoFromAmenity } from '@/lib/travelInfo/catalogMatch';
import type { TravelPlaceInfo } from '@/types/travelInfo';

function asText(value: unknown, fallback = '확인 불가'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function uniquePlaces(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result.slice(0, 12);
}

function fallbackInfo(placeName: string): TravelPlaceInfo {
  return (
    catalogTravelInfo(placeName) ?? {
      placeName,
      parking: '확인 불가',
      toilet: '확인 불가',
      carCamping: '확인 불가',
      difficulty: '확인 불가',
      seniorRecommend: '확인 불가',
      restaurants: [],
      cafes: [],
    }
  );
}

function mergeInfo(placeName: string, raw: Record<string, unknown> | undefined): TravelPlaceInfo {
  const catalog = catalogTravelInfo(placeName);
  const restaurants = asList(raw?.restaurants);
  const cafes = asList(raw?.cafes);
  return {
    placeName,
    parking: asText(raw?.parking, catalog?.parking || '확인 불가'),
    toilet: asText(raw?.toilet, catalog?.toilet || '확인 불가'),
    carCamping: asText(raw?.carCamping, catalog?.carCamping || '확인 불가'),
    difficulty: asText(raw?.difficulty, catalog?.difficulty || '확인 불가'),
    seniorRecommend: asText(raw?.seniorRecommend, catalog?.seniorRecommend || '확인 불가'),
    restaurants: restaurants.length ? restaurants : catalog?.restaurants ?? [],
    cafes: cafes.length ? cafes : catalog?.cafes ?? [],
  };
}

export async function generateTravelPlaceInfos(placeNames: string[]): Promise<TravelPlaceInfo[]> {
  const places = uniquePlaces(placeNames);
  const catalogHints = places.map((placeName) => {
    const section = matchGalmaetgilByPlaceName(placeName);
    return {
      placeName,
      catalog: section
        ? {
            course: section.courseName,
            section: section.sectionName,
            amenity: travelInfoFromAmenity(placeName, section.amenity),
          }
        : null,
    };
  });

  const json = await generateGeminiJsonObject({
    prompt: `너는 시니어 부부 여행 안내자다. 장소별 실용 정보를 JSON만 출력하라.
광고·과장 금지. 확실하지 않으면 문장에 '추정'을 넣고, 없는 가게 상호를 지어내지 마라.
각 장소에 주차, 화장실, 차박, 걷기 난이도(쉬움/보통/어려움), 시니어 추천도(추천/보통/비추천), 추천 맛집, 추천 카페를 적어라.
장소와 카탈로그 힌트: ${JSON.stringify(catalogHints)}
형식: {"places":[{"placeName":"해운대해수욕장","parking":"공영주차장 이용 가능","toilet":"해수욕장 화장실 있음","carCamping":"해안 야간 차박은 제한","difficulty":"쉬움","seniorRecommend":"추천","restaurants":["해운대 해산물"],"cafes":["해운대 카페거리"]}]}`,
    maxOutputTokens: 4096,
  });

  const fromModel = new Map<string, Record<string, unknown>>();
  if (json && typeof json === 'object') {
    const list = (json as { places?: unknown }).places;
    if (Array.isArray(list)) {
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const name = asText(record.placeName, '');
        if (name) fromModel.set(name, record);
      }
    }
  }

  return places.map((placeName) => {
    const raw =
      fromModel.get(placeName) ||
      [...fromModel.entries()].find(([key]) => key.includes(placeName) || placeName.includes(key))?.[1];
    return raw ? mergeInfo(placeName, raw) : fallbackInfo(placeName);
  });
}
