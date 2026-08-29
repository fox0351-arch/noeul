import { generateGeminiJsonObject } from '@/lib/photoAi';
import { markdownToHtml, proseCharCount, toMarkdownDraft } from '@/lib/blog/markdownHtml';
import { compactPhotoFacts, enrichPhotoAnalyses, type TripBlogContext } from '@/lib/blog/photoFacts';
import { inferTravelStory } from '@/lib/blog/travelStory';
import { classifyVisualTags } from '@/lib/blog/visualTags';
import type { BlogDraft, BlogRecommendations, BlogSeo, PhotoAnalysis, TravelStory } from '@/types/blog';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

const MIN_CHARS = 1000;
const MAX_CHARS = 1500;

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

function containsBanned(text: string): boolean {
  return BANNED_PHRASES.some((phrase) => text.includes(phrase));
}

function regionHint(photos: PhotoAnalysis[], trip?: TripBlogContext): string {
  const fromAddress = trip?.places.find((place) => place.address)?.address || photos.find((photo) => photo.address)?.address || '';
  const fromQuery = trip?.query || trip?.title || '';
  return [fromQuery, fromAddress, photos[0]?.place || ''].filter(Boolean).join(' · ');
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

function fallbackAmenity(trip?: TripBlogContext): Pick<BlogRecommendations, 'restaurants' | 'carCamping'> & { parking: string } {
  const blob = `${trip?.query || ''} ${trip?.title || ''} ${trip?.places.map((place) => place.name).join(' ') || ''}`;
  if (/제주/.test(blob)) {
    return {
      parking: '성산·섭지코지 일대는 공영주차장과 임시 주차면을 함께 쓰는 곳이 많습니다. 성수기에는 조금 걸어 들어가는 편이 편합니다.',
      carCamping: '해안 도로변 무단 차박은 단속되는 구간이 있습니다. 지정 야영장이나 허용 구역을 먼저 확인하는 것이 좋습니다.',
      restaurants: ['성산 해물뚝배기', '서귀포 갈치조림', '협재 해산물'],
    };
  }
  if (/부산|해운대|광안/.test(blob)) {
    return {
      parking: '해수욕장 공영주차장은 주말에 빨리 찹니다. 조금 떨어진 주차장에 두고 걷는 편이 마음이 놓입니다.',
      carCamping: '해안 도로와 모래밭 차박은 제한되는 곳이 많습니다. 허용 여부를 안내판으로 확인하세요.',
      restaurants: ['자갈치 회', '밀면', '씨앗호떡'],
    };
  }
  if (/대구/.test(blob)) {
    return {
      parking: '송해공원·수성못 주변은 공영주차장이 있습니다. 주말 낮에는 대기 시간이 생길 수 있습니다.',
      carCamping: '공원 안 밤샘 주차는 제한되는 경우가 많습니다. 차박은 허용 구역만 이용하는 것이 안전합니다.',
      restaurants: ['따로국밥', '막창', '수성못 근처 칼국수'],
    };
  }
  if (/강릉|경포|정동진/.test(blob)) {
    return {
      parking: '경포·정동진 해수욕장 공영주차장을 쓰기 쉽습니다. 일출 시간에는 일찍 자리를 잡는 것이 좋습니다.',
      carCamping: '해변 차박은 구간마다 다릅니다. 금지 안내가 있으면 바로 이동합니다.',
      restaurants: ['초당순두부', '고등어구이', '안목 커피거리 가벼운 식사'],
    };
  }
  return {
    parking: '목적지 공영주차장 여부를 현지에서 한 번 더 확인하는 것이 좋습니다.',
    carCamping: '차박은 구역마다 달라, 안내판을 보고 자리를 정하는 것이 안전합니다.',
    restaurants: ['현지 시장 식당', '국밥집', '해변 또는 공원 근처 백반'],
  };
}

function buildRecommendations(photos: PhotoAnalysis[], trip?: TripBlogContext): BlogRecommendations {
  const amenity = fallbackAmenity(trip);
  const place = trip?.places[0]?.name || photos[0]?.place || '여행지';
  return {
    photoSpots: photoSpotsFrom(photos, place),
    restaurants: amenity.restaurants.slice(0, 3),
    cafes: [],
    carCamping: amenity.carCamping,
    seniorDifficulty: '완만하게 걷기 좋은 구간을 고르는 것이 좋습니다.',
  };
}

function formatPracticalNotes(rec: BlogRecommendations, parking: string): string {
  const restaurants = rec.restaurants.slice(0, 3);
  return [
    `주차: ${parking}`,
    `차박: ${rec.carCamping}`,
    restaurants.length ? `맛집: ${restaurants.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.{8,80}?[.。!?]/);
  return (match?.[0] || trimmed.slice(0, 60)).trim();
}

function joinBody(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join('\n\n');
}

function padProse(text: string, extras: string[], minLength = MIN_CHARS): string {
  let body = text.trim();
  let i = 0;
  while (body.length < minLength && i < 12) {
    body = `${body}\n\n${extras[i % extras.length]}`;
    i += 1;
  }
  return body;
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
  parking?: string;
}): BlogDraft {
  let intro = input.intro.trim();
  let storyText = input.story.trim();
  let places = input.places.trim();
  let closing = input.closing.trim();
  const notes = formatPracticalNotes(input.recommendations, input.parking || fallbackAmenity().parking);
  const extras = [
    places ? `${places} 사이를 천천히 오갔습니다.` : '발걸음을 재촉하지 않았습니다.',
    '화장실과 벤치가 보이는 곳에서 잠시 쉬고, 다시 길을 이었습니다.',
    '해가 기울어도 서두르지 않았습니다. 오늘의 속도면 충분했습니다.',
  ];
  const storyMax = Math.max(700, MAX_CHARS - notes.length - 2);
  const storyMin = Math.max(400, MIN_CHARS - notes.length - 2);
  let storyBody = padProse(joinBody([intro, storyText, places, closing]), extras, storyMin);
  if (storyBody.length > storyMax) {
    const sliced = storyBody.slice(0, storyMax);
    const cut = Math.max(sliced.lastIndexOf('.'), sliced.lastIndexOf('다.') + 1);
    storyBody = (cut > 400 ? sliced.slice(0, cut + 1) : sliced).trim();
  }
  const prose = clipProse(`${storyBody}\n\n${notes}`.trim());
  const markdown = toMarkdownDraft({
    title: input.title,
    intro,
    story: storyText,
    places,
    closing,
    recommendations: notes,
  });
  return {
    title: input.title,
    summary: (input.summary || '').trim() || firstSentence(intro) || firstSentence(prose),
    infoBox: notes,
    intro,
    story: storyText,
    places,
    closing,
    body: prose,
    markdown,
    html: markdownToHtml(markdown),
    seo: { keywords: [], hashtags: [], searchQueries: [] },
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
  const title = `${(trip?.title || trip?.query || mainPlace).trim()} 여행 후기`;
  const summary = `${mainPlace} 사진 ${analyzed.length || 0}장의 순서를 따라 적은 기록.`;
  const intro = `${region || mainPlace}으로 향했습니다. 서두르지 않고, 눈에 들어오는 것만 따라갔습니다.`;
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
  const placesText = (trip?.places.length ? trip.places.map((place) => place.name) : placeNames)
    .filter(Boolean)
    .join(', ');
  const closing = `${mainPlace}의 마지막 사진은 ${analyzed.at(-1)?.visualTags?.[0] || analyzed.at(-1)?.objects?.[0] || '하늘'}에서 끝난다. 순서를 바꾸지 않았다.`;
  const amenity = fallbackAmenity(trip);
  const rec = buildRecommendations(analyzed, trip);
  rec.restaurants = amenity.restaurants;
  rec.carCamping = amenity.carCamping;
  return assembleDraft({
    title,
    summary,
    intro,
    story: storyText,
    places: placesText || mainPlace,
    closing,
    seo: { keywords: [], hashtags: [], searchQueries: [] },
    recommendations: rec,
    parking: amenity.parking,
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
  return `너는 60대 여행자의 눈높이로 한국어 여행 후기를 쓴다.
과장 광고, 해시태그, SEO 키워드, 검색어 추천, 핫플/인생샷/강추 표현을 쓰지 마라.
다른 여행의 기억이나 해운대 기본 템플릿을 섞지 마라.

필수 규칙:
- 사진 배열 순서가 곧 여행 동선이다. story는 사진1→사진2→… 순으로 장면을 바꾼다.
- 선택한 관광지 이름을 본문에 실제로 넣는다.
- 각 사진의 caption, objects, visualTags, scene을 해당 문단에 반영한다. 없는 풍경을 지어내지 마라.
- 본문(intro+story+places+closing)은 1000~1500자.
- 말투는 천천히, 짧게, 존댓말에 가깝게. 60대 여행 감성.
- 주차 정보, 차박 가능 여부, 맛집 2~3곳을 사실에 가깝게 적는다. 없으면 확인이 필요하다고만 적는다.
- 금지 문장: ${BANNED_PHRASES.join(' / ')}
- 이모지 금지.

여행 제목: ${trip?.title || story.summary || photos[0]?.place || '여행'}
검색어/지역: ${trip?.query || ''}
선택한 관광지: ${JSON.stringify(trip?.places ?? [])}
촬영 순서 사진 분석: ${JSON.stringify(facts)}
동선: ${JSON.stringify(story.route)}

형식: {"title":"...","intro":"...","story":"...","places":"...","closing":"...","parking":"...","carCamping":"...","restaurants":["맛집1","맛집2","맛집3"]}`;
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
  const intro = asText(record.intro) || fallback.intro;
  const storyText = asText(record.story);
  const places = asText(record.places) || fallback.places;
  const closing = asText(record.closing) || fallback.closing;
  const combined = `${title}\n${intro}\n${storyText}\n${places}\n${closing}`;
  const amenity = fallbackAmenity(options?.trip);
  const restaurants = asStringList(record.restaurants).slice(0, 3);
  const recommendations = buildRecommendations(analyzed, options?.trip);
  if (restaurants.length >= 2) recommendations.restaurants = restaurants;
  if (asText(record.carCamping)) recommendations.carCamping = asText(record.carCamping);

  if (storyText.length < 200 || containsBanned(combined)) {
    return { story, draft: fallback, fromGemini: false };
  }

  return {
    story,
    fromGemini: true,
    draft: assembleDraft({
      title,
      intro,
      story: storyText,
      places,
      closing,
      seo: { keywords: [], hashtags: [], searchQueries: [] },
      recommendations,
      parking: asText(record.parking) || amenity.parking,
    }),
  };
}
