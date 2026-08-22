import { PlaceItem, PhotoAiAnalysis } from '@/types/place';

export async function analyzePlacePhotos(places: PlaceItem[]): Promise<PlaceItem[]> {
  const pending = places.flatMap((place) =>
    (place.photos ?? [])
      .filter((photo) => !photo.analysis?.caption)
      .map((photo) => ({
        id: photo.id,
        dataUrl: photo.dataUrl,
        placeName: place.name,
        placeMemo: place.memo,
      }))
  );

  if (pending.length === 0) return places;

  const byId = new Map<string, PhotoAiAnalysis>();

  for (let index = 0; index < pending.length; index += 4) {
    const chunk = pending.slice(index, index + 4);
    try {
      const response = await fetch('/api/photos/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: chunk }),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        results?: { id?: string; analysis?: PhotoAiAnalysis | null }[];
      };
      payload.results?.forEach((item) => {
        if (item.id && item.analysis?.caption) {
          byId.set(item.id, item.analysis);
        }
      });
    } catch {
      continue;
    }
  }

  if (byId.size === 0) return places;

  return places.map((place) => ({
    ...place,
    photos: place.photos?.map((photo) =>
      byId.has(photo.id) ? { ...photo, analysis: byId.get(photo.id) } : photo
    ),
  }));
}
