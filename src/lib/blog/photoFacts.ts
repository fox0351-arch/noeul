import type { PhotoAnalysis } from '@/types/blog';
import type { PlaceItem } from '@/types/place';
import { analysisVisualTags, classifyVisualTags } from '@/lib/blog/visualTags';

export type TripBlogContext = {
  title: string;
  query?: string;
  memo?: string;
  places: {
    name: string;
    address: string;
    memo?: string;
    types?: string[];
  }[];
};

export type OrderedPhotoFact = {
  order: number;
  fileName: string;
  place: string;
  address: string;
  scene: string;
  caption: string;
  objects: string[];
  mood: string;
  keywords: string[];
  landmark: string;
  visualTags: string[];
};

function moodFromAnalysis(caption: string, keywords: string[], tags: string[]): string {
  const hay = `${caption} ${keywords.join(' ')} ${tags.join(' ')}`;
  const parts: string[] = [];
  if (/비|흐림|구름|rain|cloud/i.test(hay)) parts.push('흐린 날');
  if (/맑|햇살|푸른|맑은/.test(hay)) parts.push('맑은 빛');
  if (/노을|석양|일몰|저녁/.test(hay)) parts.push('해 질 녘');
  if (/일출|새벽|아침/.test(hay)) parts.push('이른 아침');
  if (/인물|사람|부부|사람있음/.test(hay)) parts.push('사람 있음');
  if (/사람없음/.test(hay)) parts.push('사람 없음');
  return parts.slice(0, 3).join(' · ');
}

export function photoFactsFromPlaces(places: PlaceItem[]): OrderedPhotoFact[] {
  const facts: OrderedPhotoFact[] = [];
  let order = 0;
  for (const place of places) {
    for (const photo of place.photos ?? []) {
      order += 1;
      const analysis = photo.analysis;
      const keywords = analysis?.keywords ?? [];
      const visualTags = analysisVisualTags(analysis);
      const caption = analysis?.caption || '';
      facts.push({
        order,
        fileName: `사진${order}`,
        place: place.name,
        address: place.address,
        scene: analysis?.scene || 'other',
        caption,
        objects: analysis?.subjects ?? [],
        mood: moodFromAnalysis(caption, keywords, visualTags),
        keywords,
        landmark: analysis?.landmark || '',
        visualTags,
      });
    }
  }
  return facts;
}

export function photoAnalysesFromPlaces(places: PlaceItem[]): PhotoAnalysis[] {
  return photoFactsFromPlaces(places).map((fact) => ({
    driveFileId: `${fact.place}-${fact.order}`,
    fileName: fact.fileName,
    place: fact.place,
    address: fact.address,
    description: fact.caption,
    objects: fact.objects,
    mood: fact.mood,
    keywords: fact.keywords,
    status: fact.caption ? 'analyzed' : 'failed',
    order: fact.order,
    scene: fact.scene,
    landmark: fact.landmark,
    visualTags: fact.visualTags,
  }));
}

export function compactPhotoFacts(facts: OrderedPhotoFact[]) {
  return facts.map((fact) => ({
    order: fact.order,
    fileName: fact.fileName,
    place: fact.place,
    address: fact.address.slice(0, 80),
    scene: fact.scene,
    caption: fact.caption.slice(0, 280),
    objects: fact.objects.slice(0, 8),
    keywords: fact.keywords.slice(0, 8),
    mood: fact.mood.slice(0, 40),
    landmark: fact.landmark.slice(0, 40),
    visualTags: fact.visualTags,
  }));
}

export function enrichPhotoAnalyses(photos: PhotoAnalysis[]): PhotoAnalysis[] {
  return photos.map((photo, index) => {
    const visualTags =
      photo.visualTags?.length
        ? photo.visualTags
        : classifyVisualTags({
            scene: photo.scene,
            caption: photo.description,
            subjects: photo.objects,
            keywords: photo.keywords,
            landmark: photo.landmark,
          });
    return {
      ...photo,
      order: photo.order ?? index + 1,
      visualTags,
      status: photo.status === 'failed' ? 'failed' : 'analyzed',
    };
  });
}
