import { PlaceItem } from '@/types/place';
import { TravelMapChecklistItem } from '@/types/travelMap';
import { photoFactsFromPlaces } from '@/lib/blog/photoFacts';
import { classifyVisualTags } from '@/lib/blog/visualTags';

export interface TravelBlogDraft {
  title: string;
  body: string;
  hashtags: string[];
  markdown: string;
  charCount: number;
  photoCount: number;
  usedPhotoFacts: number;
  usedPlaces: string[];
}

function slugTag(value: string): string {
  return value.replace(/[^\w가-힣]/g, '').slice(0, 12);
}

function joinBody(paragraphs: string[]): string {
  return paragraphs.filter((p) => p.trim()).join('\n\n');
}

function openingFor(placeName: string, region: string, visual: string): string {
  if (visual.includes('바다')) return `${placeName}에 서자 바람이 먼저 소금 냄새를 남겼다.`;
  if (visual.includes('산')) return `${placeName}은 하늘보다 능선이 가까웠다.`;
  if (visual.includes('꽃')) return `${placeName} 가장자리부터 색이 먼저 눈에 들어왔다.`;
  if (visual.includes('길')) return `${placeName}로 들어서는 길이 발밑에서 방향을 정해 주었다.`;
  if (visual.includes('건물')) return `${placeName}의 지붕과 벽이 낮게 자리를 지키고 있었다.`;
  return `${region || placeName}의 공기가 사진보다 먼저 남았다.`;
}

export function generateTravelBlogEssay(input: {
  title: string;
  memo: string;
  checklist: TravelMapChecklistItem[];
  places: PlaceItem[];
  query?: string;
}): TravelBlogDraft {
  const tripName = input.title.trim() || input.query?.trim() || input.places[0]?.name || '여행';
  const facts = photoFactsFromPlaces(input.places);
  const region = input.query?.trim() || input.places[0]?.address || tripName;
  const firstTags = facts[0]?.visualTags.join('·') || classifyVisualTags({ caption: tripName }).join('·');
  const title = `${tripName}, ${facts[0]?.visualTags[0] || '그날의'} 기록`;

  const opening = [
    openingFor(input.places[0]?.name || tripName, region, firstTags),
    input.memo.trim() ? `떠나기 전 적어 둔 메모가 있다. ${input.memo.trim()}` : `${region}을 주소 그대로 따라갔다.`,
  ];

  const routeParagraphs = facts.length
    ? facts.map((fact) => {
        const tags = fact.visualTags.join(' · ') || fact.scene;
        const seen = fact.caption || `${fact.place}의 ${tags || '장면'}이 남아 있다.`;
        const objects = fact.objects.length ? `눈에 담긴 것: ${fact.objects.slice(0, 4).join(', ')}.` : '';
        return `[사진${fact.order}] ${fact.place}\n${tags}. ${seen} ${objects}`.trim();
      })
    : input.places.map(
        (place, index) =>
          `${index + 1}. ${place.name}${place.address ? ` · ${place.address}` : ''}${
            place.memo?.trim() ? `\n${place.memo.trim()}` : ''
          }`
      );

  const closing = facts.length
    ? `마지막은 ${facts.at(-1)?.place || tripName}, ${facts.at(-1)?.visualTags[0] || facts.at(-1)?.objects[0] || '하늘'}에서 멈춘다. 사진 순서를 여행 동선으로 두었다.`
    : `${tripName}의 장소 순서를 그대로 남겼다.`;

  const body = joinBody([...opening, ...routeParagraphs, closing]);
  const hashtags = Array.from(
    new Set(
      [
        tripName,
        ...input.places.map((place) => place.name),
        ...facts.flatMap((fact) => fact.visualTags),
        '여행기록',
        '여행에세이',
      ]
        .map(slugTag)
        .filter(Boolean)
    )
  )
    .slice(0, 10)
    .map((tag) => `#${tag}`);

  const markdown = [`# ${title}`, '', body, '', '## SEO 태그', hashtags.join(' ')].join('\n');

  return {
    title,
    body,
    hashtags,
    markdown,
    charCount: body.length,
    photoCount: facts.length,
    usedPhotoFacts: facts.filter((fact) => fact.caption || fact.objects.length || fact.visualTags.length).length,
    usedPlaces: input.places.map((place) => place.name),
  };
}

export function essaySimilarity(a: string, b: string): number {
  const tokens = (text: string) =>
    text
      .replace(/\[사진\d+\]/g, ' ')
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && !['사진', '기록', '있었다', '남아'].includes(item));
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}
