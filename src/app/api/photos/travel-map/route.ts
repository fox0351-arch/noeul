import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { buildTravelMap } from '@/lib/travelMap/buildTravelMap';

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
      return NextResponse.json({ error: '장소명이 없어 지도를 만들 수 없습니다.' }, { status: 400 });
    }
    const map = await buildTravelMap(places);
    return NextResponse.json(map);
  } catch (error) {
    const message = error instanceof Error ? error.message : '지도를 만들지 못했습니다.';
    const status = message.includes('로그인') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
