import type { PhotoAnalysis, TravelStory } from '@/types/blog';

export function inferTravelStory(photos: PhotoAnalysis[] | null | undefined): TravelStory {
  const route: string[] = [];
  for (const photo of photos ?? []) {
    if (photo?.status === 'failed') continue;
    const place = photo?.place?.trim();
    if (!place) continue;
    if (route[route.length - 1] !== place) route.push(place);
  }
  return {
    route,
    summary: route.length ? route.join(' → ') : '',
  };
}

export function compactPhotoAnalyses(photos: PhotoAnalysis[] | null | undefined) {
  return (photos ?? [])
    .filter((photo) => photo?.status === 'analyzed')
    .slice(0, 50)
    .map((photo) => ({
      fileName: (photo.fileName || '').slice(0, 80),
      place: (photo.place || '').slice(0, 80),
      description: (photo.description || '').slice(0, 280),
      objects: (photo.objects ?? []).slice(0, 8),
      mood: (photo.mood || '').slice(0, 80),
      keywords: (photo.keywords ?? []).slice(0, 8),
    }));
}
