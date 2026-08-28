import { NextRequest, NextResponse } from 'next/server';
import { generateTravelBlogDraft } from '@/lib/photoPipeline/generateTravelBlog';
import { scoreBlogQuality } from '@/lib/contentPack/scoreBlogQuality';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import type { PhotoAnalysis } from '@/types/blog';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parsePhotos(value: unknown): PhotoAnalysis[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const objects = Array.isArray(record.objects)
      ? record.objects.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const keywords = Array.isArray(record.keywords)
      ? record.keywords.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const status = record.status === 'analyzed' ? 'analyzed' : 'failed';
    return {
      driveFileId: typeof record.driveFileId === 'string' ? record.driveFileId : '',
      fileName: typeof record.fileName === 'string' ? record.fileName : '',
      place: typeof record.place === 'string' ? record.place : '',
      description: typeof record.description === 'string' ? record.description : '',
      objects,
      mood: typeof record.mood === 'string' ? record.mood : '',
      keywords,
      status,
      error: typeof record.error === 'string' ? record.error : undefined,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    await verifyRequestUser(request);
    const body = (await request.json()) as { photos?: unknown };
    const photos = parsePhotos(body.photos).filter((photo) => photo.status === 'analyzed');
    if (photos.length === 0) {
      return NextResponse.json(
        { error: '분석이 끝난 사진이 없어 블로그 초안을 만들 수 없습니다.' },
        { status: 400 }
      );
    }
    const result = await generateTravelBlogDraft(photos);
    const quality = scoreBlogQuality({ draft: result.draft, photos });
    return NextResponse.json({ story: result.story, draft: result.draft, quality });
  } catch (error) {
    const message = error instanceof Error ? error.message : '블로그 초안을 만들지 못했습니다.';
    const status = message.includes('로그인') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
