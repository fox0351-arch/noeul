import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { buildTravelCourse } from '@/lib/travelCourse/buildCourse';
import type { TravelCoursePhotoInput } from '@/types/travelCourse';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parsePhotos(value: unknown): TravelCoursePhotoInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      place: typeof record.place === 'string' ? record.place : '',
      fileName: typeof record.fileName === 'string' ? record.fileName : '',
      capturedAt: typeof record.capturedAt === 'string' ? record.capturedAt : undefined,
      lastModified: typeof record.lastModified === 'number' ? record.lastModified : undefined,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    await verifyRequestUser(request);
    const body = (await request.json()) as { photos?: unknown };
    const photos = parsePhotos(body.photos).filter((photo) => photo.place.trim());
    if (photos.length === 0) {
      return NextResponse.json({ error: '장소가 있는 사진이 없어 코스를 만들 수 없습니다.' }, { status: 400 });
    }
    const course = await buildTravelCourse(photos);
    return NextResponse.json(course);
  } catch (error) {
    const message = error instanceof Error ? error.message : '여행 코스를 만들지 못했습니다.';
    const status = message.includes('로그인') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
