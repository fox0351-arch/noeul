import { PlaceItem, PhotoAiAnalysis } from '@/types/place';
import { GENERIC_FLUFF } from '@/lib/travelBlogEssay';

type PendingPhoto = {
  id: string;
  dataUrl: string;
  placeName: string;
  placeMemo?: string;
};

export type PhotoAnalyzeStatus = {
  id: string;
  label: string;
  success: boolean;
  status: number | null;
  error: string;
  cause: string;
  keyPresent?: boolean;
  keySource?: string;
};

function stashStatuses(items: PhotoAnalyzeStatus[]) {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __NOEUL_PHOTO_STATUS?: PhotoAnalyzeStatus[] };
  w.__NOEUL_PHOTO_STATUS = [...(w.__NOEUL_PHOTO_STATUS || []), ...items];
}

async function requestAnalysis(photos: PendingPhoto[]): Promise<{
  byId: Map<string, PhotoAiAnalysis>;
  outcomes: PhotoAnalyzeStatus[];
}> {
  const byId = new Map<string, PhotoAiAnalysis>();
  photos.forEach((photo) => {
    const comma = photo.dataUrl.indexOf(',');
    const mimeMatch = photo.dataUrl.slice(0, Math.max(comma, 0)).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64$/);
    const data = comma >= 0 ? photo.dataUrl.slice(comma + 1) : photo.dataUrl;
    console.log(
      `[base64-trace] photoAiClient.requestAnalysis id=${photo.id} mimeType=${mimeMatch?.[1] || 'unknown'} dataLength=${data.length} head50=${data.slice(0, 50)} tail50=${data.slice(-50)}`
    );
  });
  const response = await fetch('/api/photos/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos }),
  });
  const responseText = await response.text();
  console.log('[gemini] analyzePlacePhotos 내부 /api/photos/analyze 호출 직후', {
    httpStatus: response.status,
    ok: response.ok,
    body: responseText.slice(0, 800),
  });
  if (!response.ok) {
    const outcomes = photos.map((photo, index) => ({
      id: photo.id,
      label: `photo${index + 1}`,
      success: false,
      status: response.status,
      error: responseText.slice(0, 240),
      cause: `HTTP ${response.status}`,
    }));
    stashStatuses(outcomes);
    return { byId, outcomes };
  }
  const payload = JSON.parse(responseText) as {
    results?: {
      id?: string;
      analysis?: PhotoAiAnalysis | null;
      success?: boolean;
      status?: number | null;
      error?: string;
      cause?: string;
      keyPresent?: boolean;
      keySource?: string;
    }[];
  };
  const outcomes: PhotoAnalyzeStatus[] = [];
  payload.results?.forEach((item, index) => {
    if (item.id && item.analysis) byId.set(item.id, item.analysis);
    if (!item.id) return;
    const success = Boolean(item.success && item.analysis);
    const status = item.status ?? (success ? 200 : null);
    const cause = item.cause || (success ? 'success' : 'empty analysis');
    const line = `${photos.findIndex((p) => p.id === item.id) >= 0 ? `photo${index + 1}` : item.id} -> ${success ? 'success' : cause}${status && !success ? ` (${status})` : ''}`;
    console.log('[gemini-photo]', line, {
      id: item.id,
      success,
      status,
      error: (item.error || '').slice(0, 240),
      keyPresent: item.keyPresent,
      keySource: item.keySource,
    });
    outcomes.push({
      id: item.id,
      label: `photo${index + 1}`,
      success,
      status,
      error: item.error || '',
      cause,
      keyPresent: item.keyPresent,
      keySource: item.keySource,
    });
  });
  stashStatuses(outcomes);
  return { byId, outcomes };
}

export async function analyzePlacePhotos(
  places: PlaceItem[],
  options?: { force?: boolean }
): Promise<PlaceItem[]> {
  const pending = places.flatMap((place) =>
    (place.photos ?? [])
      .filter((photo) => {
        if (options?.force) return true;
        const scene = photo.analysis?.sceneDescription || photo.analysis?.caption || '';
        if (!scene || GENERIC_FLUFF.test(scene)) return true;
        return false;
      })
      .map((photo) => ({
        id: photo.id,
        dataUrl: photo.dataUrl,
        placeName: '',
        placeMemo: undefined,
      }))
  );

  if (pending.length === 0) return places;
  console.log('[노을] photoAi 분석 요청', { force: Boolean(options?.force), count: pending.length });
  if (typeof window !== 'undefined') {
    (window as Window & { __NOEUL_PHOTO_STATUS?: PhotoAnalyzeStatus[] }).__NOEUL_PHOTO_STATUS = [];
  }

  const byId = new Map<string, PhotoAiAnalysis>();
  const allOutcomes: PhotoAnalyzeStatus[] = [];

  for (let index = 0; index < pending.length; index += 2) {
    const chunk = pending.slice(index, index + 2);
    try {
      const got = await requestAnalysis(chunk);
      got.byId.forEach((analysis, id) => byId.set(id, analysis));
      allOutcomes.push(...got.outcomes);
      const missing = chunk.filter((photo) => !byId.has(photo.id));
      for (const photo of missing) {
        const single = await requestAnalysis([photo]);
        single.byId.forEach((analysis, id) => byId.set(id, analysis));
        allOutcomes.push(...single.outcomes);
      }
    } catch (error) {
      console.log('[gemini] chunk fetch 실패, 단장 재시도', error);
      for (const photo of chunk) {
        try {
          const single = await requestAnalysis([photo]);
          single.byId.forEach((analysis, id) => byId.set(id, analysis));
          allOutcomes.push(...single.outcomes);
        } catch {
          continue;
        }
      }
    }
  }

  pending.forEach((photo, index) => {
    const hit = allOutcomes.filter((item) => item.id === photo.id).at(-1);
    const ok = byId.has(photo.id);
    const cause = hit?.cause || (ok ? 'success' : 'empty analysis');
    console.log(`photo${index + 1} -> ${ok ? 'success' : cause}`);
  });

  console.log('[gemini] byId.size', byId.size, 'pending', pending.length);
  if (byId.size === 0) {
    console.log('[gemini] photoResults.length=0 이유: byId.size===0 이라 analysis를 붙이지 않고 원본 places를 반환');
    return places;
  }

  return places.map((place) => ({
    ...place,
    photos: place.photos?.map((photo) =>
      byId.has(photo.id) ? { ...photo, analysis: byId.get(photo.id) } : photo
    ),
  }));
}
