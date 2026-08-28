import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { matchPlacesToGalmaetgil } from '@/lib/galmaetgil/matchPlace';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await verifyRequestUser(request);
    const body = (await request.json()) as { places?: unknown };
    const places = Array.isArray(body.places)
      ? body.places.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : [];
    if (places.length === 0) {
      return NextResponse.json({ error: '장소명이 없어 갈맷길을 매칭할 수 없습니다.' }, { status: 400 });
    }
    const matches = await matchPlacesToGalmaetgil(places);
    return NextResponse.json({ matches });
  } catch (error) {
    const message = error instanceof Error ? error.message : '갈맷길 매칭에 실패했습니다.';
    const status = message.includes('로그인') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
