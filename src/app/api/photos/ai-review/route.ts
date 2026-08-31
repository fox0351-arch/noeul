import { NextRequest, NextResponse } from 'next/server';
import { generateAiTravelReview, type AiReviewFact, type AiReviewPlace } from '@/lib/aiTravelReview';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parsePlaces(value: unknown): AiReviewPlace[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        name: typeof record.name === 'string' ? record.name : '',
        address: typeof record.address === 'string' ? record.address : '',
      };
    })
    .filter((place) => place.name);
}

function parsePhotoFacts(value: unknown): AiReviewFact[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item, index) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const strings = (field: unknown) =>
      Array.isArray(field) ? field.filter((entry): entry is string => typeof entry === 'string') : [];
    return {
      order: typeof record.order === 'number' ? record.order : index + 1,
      fileName: typeof record.fileName === 'string' ? record.fileName : `사진${index + 1}`,
      place: typeof record.place === 'string' ? record.place : '',
      address: typeof record.address === 'string' ? record.address : '',
      scene: typeof record.scene === 'string' ? record.scene : '',
      caption: typeof record.caption === 'string' ? record.caption : '',
      sceneDescription: typeof record.sceneDescription === 'string' ? record.sceneDescription : '',
      objects: strings(record.objects).slice(0, 8),
      keywords: strings(record.keywords).slice(0, 8),
      mood: typeof record.mood === 'string' ? record.mood : '',
      landmark: typeof record.landmark === 'string' ? record.landmark : '',
      visualTags: strings(record.visualTags),
      ocrText: strings(record.ocrText).slice(0, 12),
      takenAt: typeof record.takenAt === 'string' ? record.takenAt : undefined,
      hasPeople: Boolean(record.hasPeople),
      peopleCount: typeof record.peopleCount === 'number' ? record.peopleCount : 0,
      ageEstimate: typeof record.ageEstimate === 'string' ? record.ageEstimate : '',
      action: typeof record.action === 'string' ? record.action : '',
      expression: typeof record.expression === 'string' ? record.expression : '',
      weather: typeof record.weather === 'string' ? record.weather : '',
      timeOfDay: typeof record.timeOfDay === 'string' ? record.timeOfDay : '',
      landscapeType: typeof record.landscapeType === 'string' ? record.landscapeType : '',
      colorTone: typeof record.colorTone === 'string' ? record.colorTone : '',
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      photoFacts?: unknown;
      selectedPlaces?: unknown;
      titleSeed?: unknown;
    };
    const photoFacts = parsePhotoFacts(body.photoFacts);
    if (photoFacts.length === 0) {
      return NextResponse.json({ error: '사진 분석이 없습니다.' }, { status: 400 });
    }
    const selectedPlaces = parsePlaces(body.selectedPlaces);
    const titleSeed = typeof body.titleSeed === 'string' && body.titleSeed.trim() ? body.titleSeed.trim() : '여행';
    const result = await generateAiTravelReview({ photoFacts, selectedPlaces, titleSeed });
    if (!result) {
      return NextResponse.json({ error: 'AI 후기를 만들지 못했습니다.' }, { status: 502 });
    }
    console.log('[REVIEW-TRACE] ai-review-result', {
      title: result.title,
      contentLength: result.content.length,
    });
    return NextResponse.json({
      engine: 'ai',
      title: result.title,
      content: result.content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 후기를 만들지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
