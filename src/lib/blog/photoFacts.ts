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
  sceneDescription: string;
  objects: string[];
  mood: string;
  keywords: string[];
  landmark: string;
  visualTags: string[];
  ocrText: string[];
  takenAt?: string;
  hasPeople: boolean;
  peopleCount: number;
  ageEstimate: string;
  action: string;
  expression: string;
  weather: string;
  timeOfDay: string;
  landscapeType: string;
  colorTone: string;
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

export function matchPlaceName(
  hay: string,
  places: { name: string; address?: string }[]
): string {
  const blob = hay.replace(/\s+/g, '');
  let best = '';
  let bestLen = 0;
  for (const place of places) {
    const name = place.name.trim();
    if (name.length < 2) continue;
    if (hay.includes(name) || blob.includes(name.replace(/\s+/g, ''))) return name;
    const core = name.replace(/국립공원|해수욕장|해변|공원|마을$/g, '').trim();
    if (core.length >= 2 && (hay.includes(core) || blob.includes(core))) {
      if (core.length > bestLen) {
        best = name;
        bestLen = core.length;
      }
    }
  }
  return best;
}

function sortPhotos<T extends { takenAt?: string; index: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.takenAt && b.takenAt && a.takenAt !== b.takenAt) return a.takenAt.localeCompare(b.takenAt);
    if (a.takenAt && !b.takenAt) return -1;
    if (!a.takenAt && b.takenAt) return 1;
    return a.index - b.index;
  });
}

export function photoFactsFromPlaces(places: PlaceItem[]): OrderedPhotoFact[] {
  const catalog = places.map((place) => ({ name: place.name, address: place.address }));
  const stacked: {
    index: number;
    takenAt?: string;
    defaultPlace: PlaceItem;
    photo: NonNullable<PlaceItem['photos']>[number];
  }[] = [];
  let index = 0;
  for (const place of places) {
    for (const photo of place.photos ?? []) {
      stacked.push({ index, takenAt: photo.takenAt, defaultPlace: place, photo });
      index += 1;
    }
  }
  const facts: OrderedPhotoFact[] = [];
  sortPhotos(stacked).forEach((entry, order) => {
    const analysis = entry.photo.analysis;
    const keywords = analysis?.keywords ?? [];
    const visualTags = analysisVisualTags(analysis);
    const caption = analysis?.sceneDescription || analysis?.caption || '';
    const ocrText = analysis?.ocrText ?? [];
    const hay = [caption, analysis?.action, analysis?.mood, analysis?.landscapeType, analysis?.landmark, ...(analysis?.subjects ?? []), ...keywords].join(' ');
    const matched = matchPlaceName(hay, catalog);
    const matchedPlace = places.find((item) => item.name === matched);
    facts.push({
      order: order + 1,
      fileName: `사진${order + 1}`,
      place: matched || analysis?.landmark || '',
      address: matchedPlace?.address || '',
      scene: analysis?.scene || 'other',
      caption,
      sceneDescription: caption,
      objects: analysis?.subjects ?? [],
      mood: analysis?.mood || moodFromAnalysis(caption, keywords, visualTags),
      keywords,
      landmark: analysis?.landmark || '',
      visualTags,
      ocrText,
      takenAt: entry.photo.takenAt,
      hasPeople: Boolean(analysis?.hasPeople || (analysis?.peopleCount ?? 0) > 0),
      peopleCount: analysis?.peopleCount ?? 0,
      ageEstimate: analysis?.ageEstimate || '',
      action: analysis?.action || '',
      expression: analysis?.expression || '',
      weather: analysis?.weather || '',
      timeOfDay: analysis?.timeOfDay || '',
      landscapeType: analysis?.landscapeType || '',
      colorTone: analysis?.colorTone || '',
    });
  });
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
    status: fact.sceneDescription || fact.caption ? 'analyzed' : 'failed',
    order: fact.order,
    scene: fact.scene,
    landmark: fact.landmark,
    visualTags: fact.visualTags,
    ocrText: fact.ocrText,
    sceneDescription: fact.sceneDescription,
    hasPeople: fact.hasPeople,
    peopleCount: fact.peopleCount,
    ageEstimate: fact.ageEstimate,
    action: fact.action,
    expression: fact.expression,
    weather: fact.weather,
    timeOfDay: fact.timeOfDay,
    landscapeType: fact.landscapeType,
    colorTone: fact.colorTone,
    capturedAt: fact.takenAt,
  }));
}

export function photoDebugFromPlaces(places: PlaceItem[]) {
  return photoFactsFromPlaces(places).map((fact) => {
    const tags = Array.from(
      new Set(
        [
          fact.sceneDescription,
          fact.action,
          fact.expression,
          fact.weather,
          fact.landscapeType,
          ...fact.ocrText,
        ].filter(Boolean)
      )
    );
    return {
      fileName: fact.fileName,
      tags,
      analysis: {
        caption: fact.caption,
        sceneDescription: fact.sceneDescription,
        ocrText: fact.ocrText,
        objects: fact.objects,
        landmark: fact.landmark,
        visualTags: fact.visualTags,
        keywords: fact.keywords,
        place: fact.place,
        scene: fact.scene,
        hasPeople: fact.hasPeople,
        peopleCount: fact.peopleCount,
        action: fact.action,
        expression: fact.expression,
        weather: fact.weather,
        timeOfDay: fact.timeOfDay,
        landscapeType: fact.landscapeType,
        mood: fact.mood,
      },
    };
  });
}

export function photoFactsFromAnalyses(photos: PhotoAnalysis[]): OrderedPhotoFact[] {
  return photos.map((photo, index) => ({
    order: photo.order ?? index + 1,
    fileName: photo.fileName || `사진${index + 1}`,
    place: photo.place || '',
    address: photo.address || '',
    scene: photo.scene || '',
    caption: photo.description || photo.sceneDescription || '',
    sceneDescription: photo.sceneDescription || photo.description || '',
    objects: photo.objects ?? [],
    mood: photo.mood || '',
    keywords: photo.keywords ?? [],
    landmark: photo.landmark || '',
    visualTags: photo.visualTags ?? [],
    ocrText: photo.ocrText ?? [],
    takenAt: photo.capturedAt,
    hasPeople: Boolean(photo.hasPeople || (photo.peopleCount ?? 0) > 0),
    peopleCount: photo.peopleCount ?? 0,
    ageEstimate: photo.ageEstimate || '',
    action: photo.action || '',
    expression: photo.expression || '',
    weather: photo.weather || '',
    timeOfDay: photo.timeOfDay || '',
    landscapeType: photo.landscapeType || '',
    colorTone: photo.colorTone || '',
  }));
}

export function compactPhotoFacts(facts: OrderedPhotoFact[]) {
  return facts.map((fact) => ({
    order: fact.order,
    fileName: fact.fileName,
    place: fact.place,
    address: (fact.address || '').slice(0, 80),
    scene: fact.scene,
    caption: fact.caption.slice(0, 280),
    sceneDescription: (fact.sceneDescription || fact.caption).slice(0, 280),
    objects: fact.objects.slice(0, 8),
    keywords: fact.keywords.slice(0, 8),
    mood: fact.mood.slice(0, 40),
    landmark: fact.landmark.slice(0, 40),
    visualTags: fact.visualTags,
    ocrText: fact.ocrText.slice(0, 12),
    takenAt: fact.takenAt,
    hasPeople: fact.hasPeople,
    peopleCount: fact.peopleCount,
    ageEstimate: fact.ageEstimate,
    action: fact.action,
    expression: fact.expression,
    weather: fact.weather,
    timeOfDay: fact.timeOfDay,
    landscapeType: fact.landscapeType,
    colorTone: fact.colorTone,
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
