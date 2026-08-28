import { generateGeminiJsonObject } from '@/lib/photoAi';
import { markdownToHtml, proseCharCount, toMarkdownDraft } from '@/lib/blog/markdownHtml';
import { compactPhotoAnalyses, inferTravelStory } from '@/lib/blog/travelStory';
import { formatTravelInfoBox, resolveBlogTravelFacts, type BlogTravelFacts } from '@/lib/blog/travelInfoBox';
import type { BlogDraft, BlogRecommendations, BlogSeo, PhotoAnalysis, TravelStory } from '@/types/blog';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

const MIN_CHARS = 1500;
const MAX_CHARS = 2000;

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

function fallbackSeo(photos: PhotoAnalysis[], story: TravelStory, facts: BlogTravelFacts): BlogSeo {
  const place = facts.placeName !== '확인 불가' ? facts.placeName : story.route[0] || '';
  const course = facts.courseName !== '확인 불가' ? facts.courseName : '';
  const keywords = Array.from(
    new Set(
      [
        place,
        course,
        '걷기 코스',
        '산책 코스',
        ...story.route,
        ...photos.flatMap((photo) => photo.keywords ?? []),
      ]
        .map((item) => item.replace(/^#/, '').trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
  const hashtags = Array.from(
    new Set(
      [
        '#부산여행',
        '#걷기여행',
        '#산책코스',
        ...story.route.map(withHashtag),
        ...keywords.map(withHashtag),
      ].filter(Boolean)
    )
  ).slice(0, 16);
  const searchQueries = Array.from(
    new Set(
      [
        place ? `${place} 걷기 코스` : '',
        place ? `${place} 여행` : '',
        course ? `${course} 후기` : '',
        ...story.route.map((name) => `${name} 산책`),
      ].filter(Boolean)
    )
  ).slice(0, 10);
  return { keywords, hashtags, searchQueries };
}

function cultureNote(place: string, course: string): string {
  if (/해운대/.test(place) || /해운대/.test(course)) {
    return '해운대라는 이름은 최치원이 이 바닷가에 머물며 글을 남겼다는 전설과 함께 읽히곤 한다. 오래된 지명이 오늘의 산책로 위에 겹쳐 있다.';
  }
  if (/광안/.test(place) || /광안/.test(course)) {
    return '광안대교가 놓이기 전에도 이 만은 어촌의 불빛으로 밤을 밝혔다. 다리는 풍경을 바꿨지만, 물결의 리듬은 그대로다.';
  }
  if (/갈맷길/.test(course) || /갈맷길/.test(place)) {
    return '갈맷길은 부산 바다와 강을 한 줄로 잇는 도보길이다. 이정표보다 먼저 바람의 온도가 구간을 알려 준다.';
  }
  if (/낙동|을숙/.test(place + course)) {
    return '낙동강 하구는 철새와 사람의 길이 겹치는 자리다. 물길이 도시를 비켜 가며 남긴 여백이 고스란히 남아 있다.';
  }
  return '길이 오래될수록 풍경은 익숙해 보이지만, 빛과 바람은 매번 다른 얼굴을 내민다.';
}

function photoSpotsFrom(photos: PhotoAnalysis[], place: string): string[] {
  const spots: string[] = [];
  for (const photo of photos) {
    const name = photo.place?.trim() || place;
    const object = photo.objects?.[0];
    const label = object ? `${name} · ${object}` : name;
    if (label && !spots.includes(label)) spots.push(label);
    if (spots.length >= 6) break;
  }
  return spots.length ? spots : [place];
}

function buildRecommendations(
  facts: BlogTravelFacts,
  photos: PhotoAnalysis[],
  record?: Record<string, unknown>
): BlogRecommendations {
  const photoSpots = asStringList(record?.photoSpots);
  const restaurants = asStringList(record?.restaurants);
  const cafes = asStringList(record?.cafes);
  return {
    photoSpots: photoSpots.length ? photoSpots.slice(0, 6) : photoSpotsFrom(photos, facts.placeName),
    restaurants: restaurants.length ? restaurants.slice(0, 4) : facts.restaurants,
    cafes: cafes.length ? cafes.slice(0, 4) : facts.cafes,
    carCamping: asText(record?.carCamping) || facts.carCamping,
    seniorDifficulty: asText(record?.seniorDifficulty) || facts.seniorWalk,
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
    '',
    '## 차박 정보',
    rec.carCamping,
    '',
    '## 시니어 걷기 난이도',
    rec.seniorDifficulty,
  ].join('\n');
}

function lengthFillers(facts: BlogTravelFacts, photos: PhotoAnalysis[]): string[] {
  const place = facts.placeName;
  const course = facts.courseName;
  const note = cultureNote(place, course);
  return [
    `파도는 같은 자리를 밀려오지만, 걷는 사람의 마음은 늘 조금씩 달라진다. ${place} 앞바다도 예외가 아니다.`,
    `${course}는 단순한 해안 산책길이 아니다. 부산 바다의 시간을 천천히 만날 수 있는 구간에 가깝다.`,
    note,
    photos[0]?.description
      ? `빛이 ${photos[0].place || place} 위로 낮게 깔리면, ${photos[0].description} 그 순간 발걸음은 자연히 느려진다.`
      : `${place}의 하늘은 높지 않아도 넓다. 바람이 옷깃을 스칠 때마다 거리가 숫자 밖으로 빠져나온다.`,
    photos[1]?.description
      ? `${photos[1].place || place}로 이어지는 굽이에서 ${photos[1].description} 그늘이 생기면 마음도 잠시 앉는다.`
      : `중반의 바람은 초반보다 솔직하다. 난간이 없는 자리일수록 풍경은 크고, 발밑은 조심스러워진다.`,
    `시니어 부부에게 ${facts.seniorWalk} 수준의 길이다. 벤치가 보이는 자리에서 숨을 고르면, 남은 거리가 부담으로 남지 않는다.`,
    `저녁이 가까워지면 ${place}의 색이 한 톤 깊어진다. 같은 코스라도 해 질 녘의 공기는 오전과 다르다.`,
  ];
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
  infoBox: string;
  intro: string;
  story: string;
  places: string;
  closing: string;
  seo: BlogSeo;
  fillers: string[];
  recommendations: BlogRecommendations;
}): BlogDraft {
  let intro = input.intro.trim();
  let storyText = input.story.trim();
  let places = input.places.trim();
  let closing = input.closing.trim();
  let count = proseCharCount([intro, storyText, places, closing]);
  for (const extra of input.fillers) {
    if (count >= MIN_CHARS) break;
    const nextStory = `${storyText}\n\n${extra}`.trim();
    const nextCount = proseCharCount([intro, nextStory, places, closing]);
    if (nextCount > MAX_CHARS) break;
    storyText = nextStory;
    count = nextCount;
  }
  if (count > MAX_CHARS) {
    storyText = clipProse(storyText);
  }
  const prose = joinBody([intro, storyText, places, closing]);
  const recBlock = formatRecommendations(input.recommendations);
  const body = joinBody([input.infoBox, prose, recBlock]);
  const markdown = toMarkdownDraft({
    title: input.title,
    infoBox: input.infoBox,
    intro,
    story: storyText,
    places,
    closing,
    recommendations: recBlock,
  });
  return {
    title: input.title,
    summary: (input.summary || '').trim() || firstSentence(intro) || firstSentence(prose),
    infoBox: input.infoBox,
    intro,
    story: storyText,
    places,
    closing,
    body,
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
  galmaetgil?: GalmaetgilPlaceMatch[]
): BlogDraft {
  const analyzed = (photos ?? []).filter((photo) => photo?.status === 'analyzed');
  const facts = resolveBlogTravelFacts(analyzed, galmaetgil);
  const route = story.route.length ? story.route : [facts.placeName];
  const place = facts.placeName;
  const course = facts.courseName;
  const title =
    course !== '확인 불가' ? `${place}, ${course}에서 만난 바다의 시간` : `${place}에서 만난 바다의 시간`;
  const summary = `${place} ${course !== '확인 불가' ? course : '걷기 코스'}를 천천히 따라가며 풍경과 숨결을 적어 둔 기록.`;
  const intro = `${course}는 숫자를 세며 걷는 길이 아니다. ${place}에 서면 파도가 같은 자리를 밀려오지만, 그 위의 빛은 매번 다르다. ${cultureNote(place, course)} 거리는 ${facts.distance}, 예상 소요시간은 ${facts.duration} 정도다. 난이도는 ${facts.difficulty}. 서두르지 않아도 풍경은 제자리에 남아 있다.`;
  const walk = analyzed
    .map((photo, index) => {
      const name = photo.place || place;
      const scene = photo.description || `${name} 위로 바람이 낮게 지난다.`;
      if (index === 0) {
        return `${name}에 들어서는 순간, ${scene} 발밑의 모래와 돌이 도시의 속도를 한 겹 벗겨 낸다. 초반은 풍경을 소유하려는 마음보다, 숨이 고르기를 기다리는 시간이 필요하다.`;
      }
      if (index === 1) {
        return `${name}으로 굽이치면 ${scene} 그늘이 생기는 자리마다 마음이 잠시 앉는다. ${course}의 중반은 풍경이 크고, 말은 줄어든다.`;
      }
      return `${name}을 지날 때 ${scene} 멀리 보이는 수평선이 일정을 재촉하지 않는다.`;
    })
    .join('\n\n');
  const storyText =
    walk ||
    `${place}를 따라가면 해안과 산책로가 숨을 나눠 쉰다. ${course}의 바람은 세지만, 걸음을 나누면 부담이 되지 않는다.`;
  const placesText = `${route.slice(0, 3).join(', ')} 언저리에 시선이 머문다. 맛은 ${facts.restaurant} 쪽에서, 쉼은 ${facts.cafe} 쪽에서 이어진다. 포토존은 풍경을 가두는 자리가 아니라, 잠시 서서 숨이 길어지는 자리다.`;
  const closing = `${place}를 한 바퀴 돌고 나면 남은 것은 인증보다 온도다. ${facts.seniorWalk} 수준의 길이라면, 둘이 속도를 맞추는 것만으로도 충분하다. 같은 코스를 다른 시간에 다시 걸으면, 바다는 또 다른 얼굴을 내민다.`;
  const recommendations = buildRecommendations(facts, analyzed);
  return assembleDraft({
    title,
    summary,
    intro,
    story: storyText,
    places: placesText,
    closing,
    infoBox: formatTravelInfoBox(facts),
    seo: fallbackSeo(analyzed, story, facts),
    fillers: lengthFillers(facts, analyzed),
    recommendations,
  });
}

export async function generateTravelBlogDraft(
  photos: PhotoAnalysis[],
  options?: { improve?: string; galmaetgil?: GalmaetgilPlaceMatch[] }
): Promise<{
  story: TravelStory;
  draft: BlogDraft;
  fromGemini: boolean;
}> {
  const analyzed = (photos ?? []).filter((photo) => photo?.status === 'analyzed').slice(0, 50);
  const localStory = inferTravelStory(analyzed);
  const facts = resolveBlogTravelFacts(analyzed, options?.galmaetgil);
  const fallback = fallbackTravelBlog(analyzed, localStory, options?.galmaetgil);
  const improve = options?.improve?.trim()
    ? `이전 초안 개선 요청:\n${options.improve}\n감성 에세이 문체를 유지하고, 1인칭은 20% 이하, 본문 1500~2000자를 지켜라.`
    : '';
  const json = await generateGeminiJsonObject({
    prompt: `너는 한국어 여행작가다. 감성 여행 에세이 나레이션으로 쓴다. 시니어 부부가 천천히 읽기 좋은 짧은 문장.
문체 예: "파도는 같은 자리를 밀려오지만, 걷는 사람의 마음은 늘 조금씩 달라진다." / "갈맷길 3-2코스는 단순한 해안 산책길이 아니다. 부산 바다의 시간을 가장 천천히 만날 수 있는 길이다."
1인칭(나/우리/나는)은 전체 문장의 20% 이하. 장소 설명+감성 묘사+역사·문화를 한 문단에 섞는다. 단순 나열 금지. 문단마다 풍경 또는 감정 묘사 최소 1회. 같은 문장 구조 반복, 이모지, 광고 과장 금지.
intro(도입) / story(걷는 과정) / places(머물 자리) / closing(마무리). 합계 1500~2000자. 여행 정보 박스는 쓰지 마라.
추천 항목은 별도 JSON 필드로만: photoSpots, restaurants, cafes, carCamping, seniorDifficulty.
확정 정보: ${JSON.stringify(facts)}
${improve}
사진 분석: ${JSON.stringify(compactPhotoAnalyses(analyzed))}
동선: ${JSON.stringify(localStory.route)}
형식: {"route":["해운대해수욕장"],"title":"...","summary":"한 줄","intro":"...","story":"...","places":"...","closing":"...","photoSpots":["해운대 방파제"],"restaurants":["민락 회센터"],"cafes":["해안 카페"],"carCamping":"...","seniorDifficulty":"...","keywords":["해운대","갈맷길"],"hashtags":["#해운대"],"searchQueries":["해운대 걷기"]}`,
    maxOutputTokens: 4096,
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

  if (storyText.length < 200) {
    return {
      story,
      draft: { ...fallback, title, summary, seo, infoBox: fallback.infoBox, recommendations: fallback.recommendations },
      fromGemini: true,
    };
  }

  return {
    story,
    fromGemini: true,
    draft: assembleDraft({
      title,
      summary,
      infoBox: formatTravelInfoBox(facts),
      intro,
      story: storyText,
      places,
      closing,
      seo,
      fillers: lengthFillers(facts, analyzed),
      recommendations: buildRecommendations(facts, analyzed, record),
    }),
  };
}
