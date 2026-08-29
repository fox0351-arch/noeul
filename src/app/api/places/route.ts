import { NextRequest, NextResponse } from 'next/server';
import { PlaceItem, PlacesSearchResponse } from '@/types/place';

function scorePlaceName(name: string, query: string): number {
  const n = name.replace(/\s+/g, '').toLowerCase();
  const q = query.replace(/\s+/g, '').toLowerCase();
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

async function searchPlaces(apiKey: string, textQuery: string): Promise<PlaceItem[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types',
    },
    body: JSON.stringify({
      textQuery,
      languageCode: 'ko',
      maxResultCount: 10,
    }),
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

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const trimmed = query.trim();
    let places = await searchPlaces(apiKey, trimmed);
    if (places.length === 0) {
      places = await searchPlaces(apiKey, `${trimmed} 관광지`);
    }

    if (places.length === 0) {
      return NextResponse.json({ error: '검색된 관광지가 없습니다.' }, { status: 404 });
    }

    places.sort((a, b) => scorePlaceName(b.name, trimmed) - scorePlaceName(a.name, trimmed));

    const result: PlacesSearchResponse = {
      query: trimmed,
      center: places[0].location,
      places,
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
