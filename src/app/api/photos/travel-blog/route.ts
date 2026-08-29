import { NextRequest, NextResponse } from 'next/server';
import { generateTravelBlogDraft } from '@/lib/photoPipeline/generateTravelBlog';
import { enrichPhotoAnalyses, type TripBlogContext } from '@/lib/blog/photoFacts';
import type { PhotoAnalysis } from '@/types/blog';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parsePhotos(value: unknown): PhotoAnalysis[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item, index) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const objects = Array.isArray(record.objects)
      ? record.objects.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const keywords = Array.isArray(record.keywords)
      ? record.keywords.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const visualTags = Array.isArray(record.visualTags)
      ? record.visualTags.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const status = record.status === 'failed' ? 'failed' : 'analyzed';
    return {
      driveFileId: typeof record.driveFileId === 'string' ? record.driveFileId : `photo-${index + 1}`,
      fileName: typeof record.fileName === 'string' ? record.fileName : `사진${index + 1}`,
      place: typeof record.place === 'string' ? record.place : '',
      address: typeof record.address === 'string' ? record.address : '',
      description: typeof record.description === 'string' ? record.description : '',
      objects,
      mood: typeof record.mood === 'string' ? record.mood : '',
      keywords,
      status,
      error: typeof record.error === 'string' ? record.error : undefined,
      order: typeof record.order === 'number' ? record.order : index + 1,
      scene: typeof record.scene === 'string' ? record.scene : '',
      landmark: typeof record.landmark === 'string' ? record.landmark : '',
      visualTags,
    };
  });
}

function parseTrip(value: unknown): TripBlogContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const places = Array.isArray(record.places)
    ? record.places
        .map((item) => {
          const place = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          return {
            name: typeof place.name === 'string' ? place.name : '',
            address: typeof place.address === 'string' ? place.address : '',
            memo: typeof place.memo === 'string' ? place.memo : undefined,
            types: Array.isArray(place.types)
              ? place.types.filter((entry): entry is string => typeof entry === 'string')
              : undefined,
          };
        })
        .filter((place) => place.name)
    : [];
  return {
    title: typeof record.title === 'string' ? record.title : '',
    query: typeof record.query === 'string' ? record.query : undefined,
    memo: typeof record.memo === 'string' ? record.memo : undefined,
    places,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { photos?: unknown; trip?: unknown };
    const photos = enrichPhotoAnalyses(parsePhotos(body.photos)).filter(
      (photo) => photo.description || photo.objects.length || photo.place
    );
    if (photos.length === 0) {
      return NextResponse.json(
        { error: '사진 분석 결과가 없어 블로그를 만들 수 없습니다. 사진을 먼저 올려 주세요.' },
        { status: 400 }
      );
    }
    const trip = parseTrip(body.trip);
    const result = await generateTravelBlogDraft(photos, { trip });
    return NextResponse.json({
      story: result.story,
      draft: result.draft,
      fromGemini: result.fromGemini,
      usedPhotos: photos.map((photo) => ({
        order: photo.order,
        place: photo.place,
        caption: photo.description,
        objects: photo.objects,
        visualTags: photo.visualTags,
        scene: photo.scene,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '블로그를 만들지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
