import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { generateTravelPlaceInfos } from '@/lib/travelInfo/generate';

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
      return NextResponse.json({ error: '장소명이 없어 여행 정보를 만들 수 없습니다.' }, { status: 400 });
    }
    const infos = await generateTravelPlaceInfos(places);
    return NextResponse.json({ infos });
  } catch (error) {
    const message = error instanceof Error ? error.message : '여행 정보를 만들지 못했습니다.';
    const status = message.includes('로그인') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
