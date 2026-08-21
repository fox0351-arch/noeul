import { NextRequest, NextResponse } from 'next/server';
import { PlaceItem, PlacesSearchResponse } from '@/types/place';

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

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types',
      },
      body: JSON.stringify({
        textQuery: `${query} 관광지 명소`,
        languageCode: 'ko',
        maxResultCount: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `구글 오류: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    const rawPlaces = data.places || [];

    if (rawPlaces.length === 0) {
      return NextResponse.json({ error: '검색된 관광지가 없습니다.' }, { status: 404 });
    }

    const places: PlaceItem[] = rawPlaces.map((p: any) => ({
      id: p.id,
      name: p.displayName?.text || '이름 없음',
      address: p.formattedAddress || '',
      location: {
        latitude: p.location?.latitude || 0,
        longitude: p.location?.longitude || 0,
      },
      rating: p.rating,
      types: p.types,
    }));

    const result: PlacesSearchResponse = {
      query,
      center: places[0].location,
      places,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 });
  }
}