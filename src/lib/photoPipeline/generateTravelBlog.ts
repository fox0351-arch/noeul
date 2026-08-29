import { generateGeminiJsonObject } from '@/lib/photoAi';
import { markdownToHtml, proseCharCount, toMarkdownDraft } from '@/lib/blog/markdownHtml';
import { compactPhotoFacts, enrichPhotoAnalyses, type TripBlogContext } from '@/lib/blog/photoFacts';
import { inferTravelStory } from '@/lib/blog/travelStory';
import { classifyVisualTags } from '@/lib/blog/visualTags';
import type { BlogDraft, BlogRecommendations, BlogSeo, PhotoAnalysis, TravelStory } from '@/types/blog';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

const MIN_CHARS = 1200;
const MAX_CHARS = 2200;

const BANNED_PHRASES = [
  '우리는 서두르지 않았다',
  '천천히 걸어도 괜찮은 길이었다',
  '파도는 같은 자리를 밀려오지만',
  '오늘의 동선이었다',
  '풍경보다 사람이 더 기억에 남았다',
];

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function clipProse(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHARS) return trimmed;
  const sliced = trimmed.slice(0, MAX_CHARS);
  const period = sliced.lastIndexOf('.');
  const korean = sliced.lastIndexOf('다.');
  const cut = Math.max(period, korean + 1);
  return (cut > MIN_CHARS - 80 ? sliced.slice(0, cut + 1) : sliced).trim();
}

function withHashtag(value: string): string {
  const clean = value.replace(/^#+/, '').replace(/\s+/g, '');
  return clean ? `#${clean}` : '';
}

function containsBanned(text: string): boolean {
  return BANNED_PHRASES.some((phrase) => text.includes(phrase));
}

function regionHint(photos: PhotoAnalysis[], trip?: TripBlogContext): string {
  const fromAddress = trip?.places.find((place) => place.address)?.address || photos.find((photo) => photo.address)?.address || '';
  const fromQuery = trip?.query || trip?.title || '';
  return [fromQuery, fromAddress, photos[0]?.place || ''].filter(Boolean).join(' · ');
}

function fallbackSeo(photos: PhotoAnalysis[], story: TravelStory, trip?: TripBlogContext): BlogSeo {
  const place = trip?.places[0]?.name || photos[0]?.place || story.route[0] || '';
  const keywords = Array.from(
    new Set(
      [
        place,
        trip?.title,
        trip?.query,
        ...story.route,
        ...photos.flatMap((photo) => [...(photo.keywords ?? []), ...(photo.visualTags ?? [])]),
      ]
        .map((item) => (item || '').replace(/^#/, '').trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
  const hashtags = Array.from(
    new Set([...keywords.map(withHashtag), ...story.route.map(withHashtag)].filter(Boolean))
  ).slice(0, 16);
  const searchQueries = Array.from(
    new Set(
      [
        place ? `${place} 여행` : '',
        place ? `${place} 후기` : '',
        trip?.title ? `${trip.title} 기록` : '',
        ...story.route.map((name) => `${name} 산책`),
      ].filter(Boolean)
    )
  ).slice(0, 10);
  return { keywords, hashtags, searchQueries };
}

function sceneSentence(photo: PhotoAnalysis, place: string): string {
  const tags = photo.visualTags?.length
    ? photo.visualTags
    : classifyVisualTags({
        scene: photo.scene,
        caption: photo.description,
        subjects: photo.objects,
        keywords: photo.keywords,
        landmark: photo.landmark,
      });
  const object = photo.objects?.[0];
  const caption = photo.description?.trim();
  if (caption) return caption;
  if (tags.includes('인물') && object) return `${place}에서 ${object}와 함께 선 모습이 남아 있다.`;
  if (tags.includes('바다')) return `${place}의 물결이 발끝 가까이까지 밀려왔다.`;
  if (tags.includes('산')) return `${place}의 능선이 하늘과 맞닿아 있었다.`;
  if (tags.includes('꽃')) return `${place} 가장자리에 꽃이 한 줄로 피어 있었다.`;
  if (tags.includes('건물')) return `${place}의 건물이 낮게 자리를 지키고 있었다.`;
  if (tags.includes('길')) return `${place}로 이어진 길이 발밑에서 방향을 알려 주었다.`;
  return `${place}의 장면이 사진 한 장에 남아 있다.`;
}

function photoSpotsFrom(photos: PhotoAnalysis[], place: string): string[] {
  const spots: string[] = [];
  for (const photo of photos) {
    const name = photo.place?.trim() || place;
    const object = photo.objects?.[0] || photo.visualTags?.[0];
    const label = object ? `${name} · ${object}` : name;
    if (label && !spots.includes(label)) spots.push(label);
    if (spots.length >= 6) break;
  }
  return spots.length ? spots : [place];
}

function buildRecommendations(photos: PhotoAnalysis[], trip?: TripBlogContext): BlogRecommendations {
  const place = trip?.places[0]?.name || photos[0]?.place || '여행지';
  return {
    photoSpots: photoSpotsFrom(photos, place),
    restaurants: [],
    cafes: [],
    carCamping: '확인 불가',
    seniorDifficulty: '확인 불가',
  };
}

function formatRecommendations(rec: BlogRecommendations): string {
  return [
    '## 추천 포토존',
    rec.photoSpots.map((item) => `- ${item}`).join('\n') || '- 확인 불가',
    '',
    '## 추천 맛집',
    rec.restaurants.map((item) => `- ${item}`).join('\n') || '- 확인 불가',
    '',
    '## 추천 카페',
    rec.cafes.map((item) => `- ${item}`).join('\n') || '- 확인 불가',
  ].join('\n');
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.{8,80}?[.。!?]/);
  return (match?.[0] || trimmed.slice(0, 60)).trim();
}

function joinBody(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join('\n\n');
}

function assembleDraft(input: {
  title: string;
  summary?: string;
  intro: string;
  story: string;
  places: string;
  closing: string;
  seo: BlogSeo;
  recommendations: BlogRecommendations;
}): BlogDraft {
  let intro = input.intro.trim();
  let storyText = clipProse(input.story.trim());
  let places = input.places.trim();
  let closing = input.closing.trim();
  const prose = joinBody([intro, storyText, places, closing]);
  const recBlock = formatRecommendations(input.recommendations);
  const markdown = toMarkdownDraft({
    title: input.title,
    intro,
    story: storyText,
    places,
    closing,
    recommendations: recBlock,
  });
  return {
    title: input.title,
    summary: (input.summary || '').trim() || firstSentence(intro) || firstSentence(prose),
    infoBox: '',
    intro,
    story: storyText,
    places,
    closing,
    body: joinBody([prose, recBlock]),
    markdown,
    html: markdownToHtml(markdown),
    seo: input.seo,
    recommendations: input.recommendations,
    charCount: proseCharCount([prose]),
  };
}

export function fallbackTravelBlog(
  photos: PhotoAnalysis[],
  story: TravelStory,
  trip?: TripBlogContext
): BlogDraft {
  const analyzed = enrichPhotoAnalyses(photos).filter((photo) => photo.status === 'analyzed' || photo.description);
  const placeNames = trip?.places.map((place) => place.name) ?? story.route;
  const mainPlace = placeNames[0] || analyzed[0]?.place || '여행지';
  const region = regionHint(analyzed, trip);
  const title = trip?.title?.trim() || `${mainPlace}에서 남긴 하루`;
  const summary = `${mainPlace} 사진 ${analyzed.length || 0}장의 순서를 따라 적은 기록.`;
  const intro = trip?.memo?.trim()
    ? `${region}으로 향했다. ${trip.memo.trim()}`
    : `${mainPlace}에 닿기 전, 주소만으로도 공기가 달랐다. ${region}`.trim();
  const walk = analyzed
    .map((photo, index) => {
      const name = photo.place || mainPlace;
      const tags = (photo.visualTags ?? []).join('·') || photo.scene || '장면';
      const seen = sceneSentence(photo, name);
      if (index === 0) {
        return `첫 장. ${name}. ${tags}이 먼저 눈에 들어왔다. ${seen}`;
      }
      return `${index + 1}번째 장. ${name}으로 이어진다. ${tags}. ${seen}`;
    })
    .join('\n\n');
  const storyText =
    walk ||
    `${mainPlace}를 걸으며 눈에 담긴 것만 남겼다. 같은 문장을 반복하지 않기 위해, 사진이 가리킨 대상만 적는다.`;
  const placesText = (trip?.places.length ? trip.places : placeNames.map((name) => ({ name, address: '' })))
    .map((place) => {
      const address = 'address' in place ? place.address : '';
      const memo = 'memo' in place ? place.memo : '';
      return [place.name, address, memo].filter(Boolean).join(' · ');
    })
    .join('\n');
  const closing = `${mainPlace}의 마지막 사진은 ${analyzed.at(-1)?.visualTags?.[0] || analyzed.at(-1)?.objects?.[0] || '하늘'}에서 끝난다. 순서를 바꾸지 않았다.`;
  return assembleDraft({
    title,
    summary,
    intro,
    story: storyText,
    places: placesText || mainPlace,
    closing,
    seo: fallbackSeo(analyzed, story, trip),
    recommendations: buildRecommendations(analyzed, trip),
  });
}

function buildPrompt(photos: PhotoAnalysis[], story: TravelStory, trip?: TripBlogContext): string {
  const facts = compactPhotoFacts(
    photos.map((photo, index) => ({
      order: photo.order ?? index + 1,
      fileName: photo.fileName || `사진${index + 1}`,
      place: photo.place,
      address: photo.address || '',
      scene: photo.scene || '',
      caption: photo.description,
      objects: photo.objects ?? [],
      mood: photo.mood || '',
      keywords: photo.keywords ?? [],
      landmark: photo.landmark || '',
      visualTags: photo.visualTags ?? [],
    }))
  );
  return `너는 한국어 여행 작가다. 아래 JSON 재료만 사용해 이번 여행의 에세이를 쓴다.
다른 여행의 기억, 학습된 상투 문장, 부산 해운대 기본 템플릿을 쓰지 마라.

필수 규칙:
- 사진 배열 순서가 곧 여행 동선이다. story는 사진1→사진2→… 순으로 장면을 바꿔 가며 쓴다.
- 각 사진의 caption, objects, visualTags, scene을 해당 문단에 실제로 반영한다. 없는 풍경을 지어내지 마라.
- 장소명, 주소, 지역 특징을 본문에 넣는다. 제주면 제주, 대구면 대구. 다른 지역을 섞지 마라.
- 사진마다 문장 구조와 첫 단어를 다르게 한다.
- 금지 문장: ${BANNED_PHRASES.join(' / ')}
- 1인칭(나/우리)은 전체 문장의 20% 이하.
- intro / story / places / closing. 본문 합계 1200~2000자.
- 이모지, 광고 과장, 카드뉴스/쇼츠 말투 금지.

여행 제목: ${trip?.title || story.summary || photos[0]?.place || '여행'}
검색어/지역: ${trip?.query || ''}
여행 메모: ${trip?.memo || '없음'}
장소 목록: ${JSON.stringify(trip?.places ?? [])}
촬영 순서 사진 분석: ${JSON.stringify(facts)}
동선: ${JSON.stringify(story.route)}

형식: {"route":["장소"],"title":"...","summary":"한 줄","intro":"...","story":"...","places":"...","closing":"...","photoSpots":["..."],"keywords":["..."],"hashtags":["#..."],"searchQueries":["..."]}`;
}

export async function generateTravelBlogDraft(
  photos: PhotoAnalysis[],
  options?: { improve?: string; galmaetgil?: GalmaetgilPlaceMatch[]; trip?: TripBlogContext }
): Promise<{
  story: TravelStory;
  draft: BlogDraft;
  fromGemini: boolean;
}> {
  const analyzed = enrichPhotoAnalyses(photos)
    .filter((photo) => photo.status !== 'failed')
    .slice(0, 50);
  const localStory = inferTravelStory(analyzed);
  const fallback = fallbackTravelBlog(analyzed, localStory, options?.trip);
  const improve = options?.improve?.trim()
    ? `이전 초안 개선 요청:\n${options.improve}\n상투 문장을 제거하고, 사진 분석 내용을 더 구체적으로 반영하라.`
    : '';
  const json = await generateGeminiJsonObject({
    prompt: `${buildPrompt(analyzed, localStory, options?.trip)}\n${improve}`,
    maxOutputTokens: 4096,
    temperature: 0.9,
  });

  if (!json || typeof json !== 'object') {
    return { story: localStory, draft: fallback, fromGemini: false };
  }

  const record = json as Record<string, unknown>;
  const routeFromModel = asStringList(record.route);
  const story: TravelStory =
    routeFromModel.length >= 1
      ? { route: routeFromModel, summary: routeFromModel.join(' → ') }
      : localStory;
  const title = asText(record.title) || fallback.title;
  const summary = asText(record.summary) || fallback.summary;
  const intro = asText(record.intro) || fallback.intro;
  const storyText = asText(record.story);
  const places = asText(record.places) || fallback.places;
  const closing = asText(record.closing) || fallback.closing;
  const combined = `${title}\n${intro}\n${storyText}\n${places}\n${closing}`;
  const seo: BlogSeo = {
    keywords: asStringList(record.keywords).length
      ? asStringList(record.keywords).slice(0, 12)
      : fallback.seo.keywords,
    hashtags: asStringList(record.hashtags).length
      ? asStringList(record.hashtags).map(withHashtag).filter(Boolean).slice(0, 16)
      : fallback.seo.hashtags,
    searchQueries: asStringList(record.searchQueries).length
      ? asStringList(record.searchQueries).slice(0, 10)
      : fallback.seo.searchQueries,
  };

  if (storyText.length < 200 || containsBanned(combined)) {
    return { story, draft: fallback, fromGemini: false };
  }

  const recommendations = buildRecommendations(analyzed, options?.trip);
  const photoSpots = asStringList(record.photoSpots);
  if (photoSpots.length) recommendations.photoSpots = photoSpots.slice(0, 6);

  return {
    story,
    fromGemini: true,
    draft: assembleDraft({
      title,
      summary,
      intro,
      story: storyText,
      places,
      closing,
      seo,
      recommendations,
    }),
  };
}
