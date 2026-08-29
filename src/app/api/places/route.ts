import { NextRequest, NextResponse } from 'next/server';
import { searchTravelPlaces } from '@/lib/places/collectAttractions';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { query?: unknown; intent?: unknown };
    const query = typeof body.query === 'string' ? body.query : '';
    const intent = body.intent === 'add' ? 'add' : 'search';

    if (!query.trim()) {
      return NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const result = await searchTravelPlaces(apiKey, query, intent);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    const status = message.includes('검색된 관광지가 없습니다') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
