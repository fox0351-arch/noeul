import { generateGeminiJsonObject } from '@/lib/photoAi';
import type { GalmaetgilSection } from '@/lib/galmaetgil/catalog';
import { generateTravelBlogEssay } from '@/lib/travelBlogEssay';
import type { PhotoAiAnalysis } from '@/types/place';
import type { PlaceEstimate, PhotoPipelineDraft, TrailMatch } from '@/types/photoPipeline';

const MIN_CHARS = 1500;
const MAX_CHARS = 2500;

function clip(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHARS) return trimmed;
  return trimmed.slice(0, MAX_CHARS).trim();
}

function padEssay(text: string, extras: string[]): string {
  let body = text.trim();
  for (const extra of extras) {
    if (body.length >= MIN_CHARS) break;
    const next = `${body}\n\n${extra}`;
    if (next.length > MAX_CHARS) break;
    body = next;
  }
  return clip(body);
}

function fallbackDraft(input: {
  analysis: PhotoAiAnalysis | null;
  place: PlaceEstimate | null;
  trail: TrailMatch | null;
  section?: GalmaetgilSection;
  memo?: string;
}): PhotoPipelineDraft {
  const placeName = input.place?.name || '바닷가';
  const trailName = input.trail
    ? `갈맷길 ${input.trail.courseId}코스 ${input.trail.sectionName}`
    : '갈맷길';
  const amenity = input.section?.amenity;
  const essay = generateTravelBlogEssay({
    title: trailName,
    memo: input.memo?.trim() || input.analysis?.caption || '',
    checklist: [],
    places: input.place
      ? [
          {
            id: 'estimated',
            name: placeName,
            address: input.place.address,
            location: { latitude: input.place.lat, longitude: input.place.lng },
            memo: input.memo,
            photos: input.analysis
              ? [{ id: 'photo', dataUrl: '', analysis: input.analysis }]
              : undefined,
          },
        ]
      : [],
  });
  const extras = [
    amenity ? `차박: ${amenity.carCamping}` : '',
    amenity ? `주차: ${amenity.parking}` : '',
    amenity ? `화장실: ${amenity.toilet}` : '',
    amenity ? `60대 이상 도보: ${amenity.walkDifficulty60}` : '',
    amenity ? `맛집·카페: ${amenity.food}` : '',
  ].filter(Boolean);
  const content = padEssay(essay.body, extras);
  return {
    id: '',
    title: essay.title,
    content,
    hashtags: Array.from(
      new Set([...essay.hashtags, '#갈맷길', '#부산여행', `#갈맷길${input.trail?.courseId || ''}코스`])
    ).filter((tag) => tag.length > 1),
  };
}

export async function generatePipelineBlogDraft(input: {
  analysis: PhotoAiAnalysis | null;
  place: PlaceEstimate | null;
  trail: TrailMatch | null;
  section?: GalmaetgilSection;
  memo?: string;
}): Promise<PhotoPipelineDraft> {
  const fallback = fallbackDraft(input);
  const amenity = input.section?.amenity;
  const json = await generateGeminiJsonObject({
    prompt: `너는 네이버 블로그용 감성 여행 에세이를 쓰는 작가다.
60대 부부 시점으로 한국어 초안을 JSON만 출력하라.
광고·과장·이모지 금지. 본문 1500~2500자.
반드시 포함할 것: 갈맷길 코스/구간, 차박 가능 여부, 주차, 화장실, 60대 이상 도보 난이도, 맛집과 카페.
사진 분석: ${JSON.stringify(input.analysis)}
장소: ${JSON.stringify(input.place)}
갈맷길: ${JSON.stringify(input.trail)}
코스 안내: ${JSON.stringify(amenity)}
사용자 메모: ${input.memo || '없음'}
형식: {"title":"...","content":"...","hashtags":["#갈맷길"]}`,
    maxOutputTokens: 4096,
  });

  if (!json || typeof json !== 'object') return fallback;
  const record = json as { title?: unknown; content?: unknown; hashtags?: unknown };
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : fallback.title;
  const rawContent = typeof record.content === 'string' ? record.content.trim() : '';
  const hashtags = Array.isArray(record.hashtags)
    ? record.hashtags.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : fallback.hashtags;
  if (rawContent.length < 400) return { ...fallback, title, hashtags: hashtags.length ? hashtags : fallback.hashtags };
  return {
    id: '',
    title,
    content: padEssay(rawContent, [
      amenity ? `차박: ${amenity.carCamping}` : '',
      amenity ? `주차: ${amenity.parking}` : '',
      amenity ? `화장실: ${amenity.toilet}` : '',
      amenity ? `60대 이상 도보: ${amenity.walkDifficulty60}` : '',
      amenity ? `맛집·카페: ${amenity.food}` : '',
    ].filter(Boolean)),
    hashtags: hashtags.length ? hashtags : fallback.hashtags,
  };
}
