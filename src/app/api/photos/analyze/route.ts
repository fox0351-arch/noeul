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
    const results: {
      id: string;
      analysis: PhotoAiAnalysis | null;
      notes: string[];
      success: boolean;
      status: number | null;
      error: string;
      cause: string;
      keyPresent: boolean;
      keySource: string;
    }[] = [];

    for (const photo of slice) {
      if (typeof photo.id !== 'string' || typeof photo.dataUrl !== 'string') {
        continue;
      }
      const dataUrl = photo.dataUrl;
      const comma = dataUrl.indexOf(',');
      const mimeMatch = dataUrl.slice(0, Math.max(comma, 0)).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64$/);
      const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      console.log(
        `[base64-trace] analyze-route.received id=${photo.id} mimeType=${mimeMatch?.[1] || 'unknown'} dataLength=${data.length} head50=${data.slice(0, 50)} tail50=${data.slice(-50)}`
      );
      const outcome = await analyzePhotoWithAi({
        dataUrl: photo.dataUrl,
        placeName: typeof photo.placeName === 'string' ? photo.placeName : '',
        placeMemo: typeof photo.placeMemo === 'string' ? photo.placeMemo : undefined,
      });
      results.push({
        id: photo.id,
        analysis: outcome.analysis,
        notes: outcome.notes,
        success: outcome.success,
        status: outcome.status,
        error: outcome.error,
        cause: outcome.cause,
        keyPresent: outcome.keyPresent,
        keySource: outcome.keySource,
      });
      console.log('[노을-photoAi]', photo.id, JSON.stringify(outcome.analysis));
      console.log('[gemini-photo-result]', {
        id: photo.id,
        success: outcome.success,
        status: outcome.status,
        cause: outcome.cause,
        error: outcome.error.slice(0, 240),
      });
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: '사진을 분석하지 못했습니다.' }, { status: 500 });
  }
}
