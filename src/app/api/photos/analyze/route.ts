import { NextRequest, NextResponse } from 'next/server';
import { analyzePhotoWithAi } from '@/lib/photoAi';
import { PhotoAiAnalysis } from '@/types/place';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      photos?: { id?: unknown; dataUrl?: unknown; placeName?: unknown; placeMemo?: unknown }[];
    };

    if (!Array.isArray(body.photos) || body.photos.length === 0) {
      return NextResponse.json({ error: '분석할 사진이 없습니다.' }, { status: 400 });
    }

    const slice = body.photos.slice(0, 24);
    const results: { id: string; analysis: PhotoAiAnalysis | null; notes: string[] }[] = [];

    for (const photo of slice) {
      if (typeof photo.id !== 'string' || typeof photo.dataUrl !== 'string') {
        continue;
      }
      const outcome = await analyzePhotoWithAi({
        dataUrl: photo.dataUrl,
        placeName: typeof photo.placeName === 'string' ? photo.placeName : '',
        placeMemo: typeof photo.placeMemo === 'string' ? photo.placeMemo : undefined,
      });
      results.push({ id: photo.id, analysis: outcome.analysis, notes: outcome.notes });
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: '사진을 분석하지 못했습니다.' }, { status: 500 });
  }
}
