import { PlaceItem, PlaceLocation, PlacesSearchResponse } from '@/types/place';

const MIN_REGION_PLACES = 10;
const MAX_PLACES = 20;

const ADMIN_TYPES = new Set([
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'locality',
  'sublocality',
  'sublocality_level_1',
  'country',
  'colloquial_area',
  'political',
]);

const ATTRACTION_TYPES = new Set([
  'tourist_attraction',
  'park',
  'beach',
  'natural_feature',
  'museum',
  'art_gallery',
  'zoo',
  'aquarium',
  'amusement_park',
  'campground',
  'hiking_area',
  'historical_landmark',
  'cultural_landmark',
  'national_park',
  'botanical_garden',
  'church',
  'hindu_temple',
  'place_of_worship',
  'stadium',
  'marina',
  'visitor_center',
]);

const REGION_ALIASES = new Set([
  '제주',
  '제주도',
  '제주시',
  '서귀포',
  '서귀포시',
  '제주특별자치도',
  '부산',
  '부산시',
  '부산광역시',
  '대구',
  '대구시',
  '대구광역시',
  '경주',
  '경주시',
  '강릉',
  '강릉시',
  '서울',
  '서울시',
  '서울특별시',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '여수',
  '전주',
  '속초',
  '춘천',
  '포항',
  '통영',
  '거제',
  '남해',
  '안동',
  '군산',
  '목포',
  '순천',
  '양양',
  '동해',
  '삼척',
  '평창',
  '가평',
  '해운대',
  '광안리',
  '중문',
  '성산',
]);

const REGION_HINTS: Record<string, string[]> = {
  제주: ['성산일출봉', '섭지코지', '우도', '협재해수욕장', '만장굴', '한라산', '함덕해수욕장', '중문색달해수욕장'],
  부산: ['해운대해수욕장', '광안리해수욕장', '감천문화마을', '태종대', '자갈치시장', '송도해상케이블카'],
  대구: ['송해공원', '앞산전망대', '수성못', '동화사', '83타워', '서문시장'],
  경주: ['불국사', '석굴암', '동궁과월지', '첨성대', '대릉원', '문무대왕릉'],
  강릉: ['경포대해수욕장', '정동진', '오죽헌', '안목해변', '선교장', '정동진해변'],
};

type SearchOptions = {
  textQuery: string;
  includedType?: string;
  maxResultCount?: number;
  locationBias?: PlaceLocation;
};

function compact(query: string): string {
  return query.replace(/\s+/g, '').toLowerCase();
}

export function regionKey(query: string): string {
  return query
    .trim()
    .replace(/특별자치도|특별자치시|광역시|특별시/g, '')
    .replace(/자치시$/g, '')
    .replace(/(도|시|군)$/g, '')
    .trim();
}

export function looksLikeRegionQuery(query: string): boolean {
  const trimmed = query.trim();
  const packed = compact(trimmed);
  if (!packed) return false;
  if (REGION_ALIASES.has(trimmed) || REGION_ALIASES.has(packed) || REGION_ALIASES.has(regionKey(trimmed))) {
    return true;
  }
  return /특별자치도|광역시|특별시|(도|시|군|구)$/.test(packed) && packed.length <= 10;
}

export function looksLikeSpecificPlace(query: string): boolean {
  const trimmed = query.trim();
  if (looksLikeRegionQuery(trimmed)) return false;
  return /(공원|해수욕장|해변|전망대|박물관|미술관|사찰|수목원|식물원|온천|폭포|올레|둘레길|타워|시장|유원지|케이블카|테마파크|아쿠아리움|랜드|궁|성곽|코스)$/.test(
    trimmed.replace(/\s+/g, '')
  );
}

export function isAdministrativePlace(place: Pick<PlaceItem, 'name' | 'types'>): boolean {
  const types = place.types ?? [];
  const isNamedRegion =
    /특별자치도|광역시|특별시|자치시|도청|시청/.test(place.name) || /island/i.test(place.name);
  const hasConcreteAttraction = types.some(
    (type) => type !== 'natural_feature' && ATTRACTION_TYPES.has(type)
  );
  if (isNamedRegion && !hasConcreteAttraction) return true;
  if (types.some((type) => ATTRACTION_TYPES.has(type))) return false;
  if (types.some((type) => ADMIN_TYPES.has(type))) return true;
  return false;
}

export function scorePlaceName(name: string, query: string): number {
  const n = compact(name);
  const q = compact(query);
  if (!n || !q) return 0;
  if (n === q) return 100;
  if (n.includes(q)) return 80;
  if (q.includes(n)) return 70;
  let hits = 0;
  for (const part of query.split(/\s+/).filter((item) => item.length >= 2)) {
    if (name.includes(part)) hits += 12;
  }
  return hits;
}

function attractionScore(place: PlaceItem, query: string): number {
  if (isAdministrativePlace(place)) return -1000;
  let score = (place.rating ?? 0) * 12;
  const types = place.types ?? [];
  if (types.includes('tourist_attraction')) score += 45;
  if (types.includes('park')) score += 28;
  if (types.includes('beach')) score += 32;
  if (types.includes('natural_feature')) score += 18;
  if (types.includes('historical_landmark') || types.includes('cultural_landmark')) score += 22;
  if (types.includes('hiking_area') || types.includes('national_park')) score += 20;
  if (types.includes('museum')) score += 12;
  if (/(해수욕장|해변|전망대|공원|봉$|폭포|올레|수목원)/.test(place.name)) score += 18;
  const hints = REGION_HINTS[regionKey(query)] ?? [];
  if (hints.some((hint) => place.name.includes(hint) || hint.includes(place.name))) score += 50;
  return score;
}

function uniquePlaces(places: PlaceItem[]): PlaceItem[] {
  const seen = new Set<string>();
  const result: PlaceItem[] = [];
  for (const place of places) {
    const key = place.id || `${compact(place.name)}:${place.location.latitude.toFixed(4)}:${place.location.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(place);
  }
  return result;
}

async function searchPlaces(apiKey: string, options: SearchOptions): Promise<PlaceItem[]> {
  const body: Record<string, unknown> = {
    textQuery: options.textQuery,
    languageCode: 'ko',
    regionCode: 'KR',
    maxResultCount: options.maxResultCount ?? 20,
    rankPreference: 'RELEVANCE',
  };
  if (options.includedType) {
    body.includedType = options.includedType;
    body.strictTypeFiltering = false;
  }
  if (options.locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: options.locationBias.latitude, longitude: options.locationBias.longitude },
        radius: 40000,
      },
    };
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`구글 오류: ${errorText}`);
  }

  const data = (await response.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      rating?: number;
      types?: string[];
    }[];
  };

  return (data.places || [])
    .map((place) => ({
      id: place.id || '',
      name: place.displayName?.text || '이름 없음',
      address: place.formattedAddress || '',
      location: {
        latitude: place.location?.latitude || 0,
        longitude: place.location?.longitude || 0,
      },
      rating: place.rating,
      types: place.types,
    }))
    .filter((place) => place.id && Number.isFinite(place.location.latitude) && Number.isFinite(place.location.longitude));
}

async function searchNearbyAttractions(
  apiKey: string,
  center: PlaceLocation,
  includedType: string
): Promise<PlaceItem[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types',
    },
    body: JSON.stringify({
      languageCode: 'ko',
      maxResultCount: 20,
      includedTypes: [includedType],
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: { center: { latitude: center.latitude, longitude: center.longitude }, radius: 50000 },
      },
    }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      rating?: number;
      types?: string[];
    }[];
  };
  return (data.places || [])
    .map((place) => ({
      id: place.id || '',
      name: place.displayName?.text || '이름 없음',
      address: place.formattedAddress || '',
      location: {
        latitude: place.location?.latitude || 0,
        longitude: place.location?.longitude || 0,
      },
      rating: place.rating,
      types: place.types,
    }))
    .filter((place) => place.id && Number.isFinite(place.location.latitude) && Number.isFinite(place.location.longitude));
}

export function matchesRegion(place: Pick<PlaceItem, 'name' | 'address'>, query: string): boolean {
  const key = regionKey(query);
  if (!key) return true;
  const tokens = `${place.name} ${place.address}`.split(/[\s,/]+/).filter(Boolean);
  return tokens.some((token) => {
    if (key === '제주') return /^(제주|서귀포)/.test(token);
    if (token === key || token === `${key}시` || token === `${key}도` || token === `${key}군`) return true;
    return token.startsWith(`${key}광역`) || token.startsWith(`${key}특별`);
  });
}

function filterAttractions(places: PlaceItem[], query: string): PlaceItem[] {
  const packedQuery = compact(query);
  return places.filter((place) => {
    if (isAdministrativePlace(place)) return false;
    if (!matchesRegion(place, query)) return false;
    const packedName = compact(place.name);
    if (packedName === packedQuery) return false;
    if (packedName === compact(query + '시') || packedName === compact(query + '도')) return false;
    return true;
  });
}

async function collectRegionPlaces(apiKey: string, query: string): Promise<PlaceItem[]> {
  const exact = await searchPlaces(apiKey, { textQuery: query, maxResultCount: 5 });
  const center = exact[0]?.location;
  const hintNames = REGION_HINTS[regionKey(query)] ?? [];

  const batches = await Promise.all([
    searchPlaces(apiKey, {
      textQuery: `${query} 관광지 명소`,
      includedType: 'tourist_attraction',
      maxResultCount: 20,
      locationBias: center,
    }).catch(() => []),
    searchPlaces(apiKey, {
      textQuery: `${query} 해수욕장 해변`,
      includedType: 'beach',
      maxResultCount: 10,
      locationBias: center,
    }).catch(() => []),
    searchPlaces(apiKey, {
      textQuery: `${query} 공원 전망대`,
      includedType: 'park',
      maxResultCount: 10,
      locationBias: center,
    }).catch(() => []),
    searchPlaces(apiKey, { textQuery: `${query} 대표 명소`, maxResultCount: 15, locationBias: center }).catch(
      () => []
    ),
    center ? searchNearbyAttractions(apiKey, center, 'tourist_attraction') : Promise.resolve([]),
    center ? searchNearbyAttractions(apiKey, center, 'park') : Promise.resolve([]),
    center ? searchNearbyAttractions(apiKey, center, 'beach') : Promise.resolve([]),
  ]);

  let places = uniquePlaces(filterAttractions(batches.flat(), query));
  if (places.length < MIN_REGION_PLACES) {
    const extra = await searchPlaces(apiKey, {
      textQuery: `${query} 가볼만한곳`,
      maxResultCount: 20,
      locationBias: center,
    }).catch(() => []);
    places = uniquePlaces([...places, ...filterAttractions(extra, query)]);
  }

  const missingHints = hintNames.filter(
    (hint) => !places.some((place) => place.name.includes(hint) || hint.includes(place.name))
  );
  if (missingHints.length > 0) {
    const hinted = await Promise.all(
      missingHints.map((hint) =>
        searchPlaces(apiKey, {
          textQuery: `${query} ${hint}`,
          maxResultCount: 3,
          locationBias: center,
        }).catch(() => [])
      )
    );
    places = uniquePlaces([...places, ...filterAttractions(hinted.flat(), query)]);
  }

  places.sort((a, b) => attractionScore(b, query) - attractionScore(a, query));
  return places.slice(0, MAX_PLACES);
}

async function collectExactPlace(apiKey: string, query: string): Promise<PlaceItem[]> {
  let places = await searchPlaces(apiKey, { textQuery: query, maxResultCount: 10 });
  if (places.length === 0) {
    places = await searchPlaces(apiKey, { textQuery: `${query} 관광지`, maxResultCount: 10 });
  }
  places.sort((a, b) => scorePlaceName(b.name, query) - scorePlaceName(a.name, query));
  return places;
}

export async function searchTravelPlaces(
  apiKey: string,
  query: string,
  intent: 'search' | 'add' = 'search'
): Promise<PlacesSearchResponse> {
  const trimmed = query.trim();
  const useExact = intent === 'add' || looksLikeSpecificPlace(trimmed);
  const places = useExact ? await collectExactPlace(apiKey, trimmed) : await collectRegionPlaces(apiKey, trimmed);

  if (places.length === 0) {
    throw new Error('검색된 관광지가 없습니다.');
  }

  return {
    query: trimmed,
    center: places[0].location,
    places,
  };
}
