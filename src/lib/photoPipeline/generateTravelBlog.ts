import { generateGeminiJsonObject } from '@/lib/photoAi';
import { markdownToHtml, proseCharCount, toMarkdownDraft } from '@/lib/blog/markdownHtml';
import { compactPhotoAnalyses, inferTravelStory } from '@/lib/blog/travelStory';
import type { BlogDraft, BlogSeo, PhotoAnalysis, TravelStory } from '@/types/blog';

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

function fallbackSeo(photos: PhotoAnalysis[], story: TravelStory): BlogSeo {
  const keywords = Array.from(
    new Set(
      [
        ...story.route,
        ...photos.flatMap((photo) => photo.keywords ?? []),
        ...photos.flatMap((photo) => photo.objects ?? []),
      ]
        .map((item) => item.replace(/^#/, '').trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
  const hashtags = Array.from(
    new Set(['#여행에세이', '#감성여행', ...story.route.map(withHashtag), ...keywords.map(withHashtag)])
  )
    .filter(Boolean)
    .slice(0, 16);
  const searchQueries = Array.from(
    new Set([
      ...story.route.map((place) => `${place} 여행`),
      ...story.route.map((place) => `${place} 산책`),
      ...keywords.slice(0, 4).map((word) => `${word} 후기`),
    ])
  ).slice(0, 10);
  return { keywords, hashtags, searchQueries };
}

function extras(): string[] {
  return [
    '걸음은 빠르지 않았고, 그 느림이 오히려 풍경을 오래 붙잡아 주었다.',
    '바람은 사진을 흔들었지만 기억은 오히려 더 또렷해졌다.',
    '우리는 같은 자리를 두고도 서로 다른 하늘을 보았고, 그 차이가 하루를 부드럽게 만들었다.',
    '돌아오는 길에도 발끝에는 모래와 그늘의 온기가 조금 남아 있었다.',
    '카페의 창가에 앉아 사진을 다시 보니, 그때의 빛은 생각보다 더 낮고 따뜻했다.',
    '지도보다 발끝이 먼저 방향을 정했고, 우리는 그 결정을 굳이 고치지 않았다.',
    '사람이 많은 자리에서도 서로의 속도만 맞추면 길은 생각보다 한가했다.',
    '저녁이 가까워질수록 말은 줄고, 대신 발소리와 파도 소리가 남았다.',
    '그날의 기록은 완벽한 코스가 아니라, 둘이 같은 시간을 나눠 가진 흔적에 가깝다.',
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
  intro: string;
  story: string;
  places: string;
  closing: string;
  seo: BlogSeo;
}): BlogDraft {
  let intro = input.intro.trim();
  let storyText = input.story.trim();
  let places = input.places.trim();
  let closing = input.closing.trim();
  let count = proseCharCount([intro, storyText, places, closing]);
  for (const extra of extras()) {
    if (count >= MIN_CHARS) break;
    const nextStory = `${storyText}\n\n${extra}`.trim();
    const nextCount = proseCharCount([intro, nextStory, places, closing]);
    if (nextCount > MAX_CHARS) break;
    storyText = nextStory;
    count = nextCount;
  }
  let guard = 0;
  while (count < MIN_CHARS && guard < 24) {
    const extra = extras()[guard % extras().length];
    const nextStory = `${storyText}\n\n${extra}`.trim();
    storyText = nextStory;
    count = proseCharCount([intro, storyText, places, closing]);
    guard += 1;
  }
  if (count > MAX_CHARS) {
    storyText = clipProse(storyText);
  }
  const body = joinBody([intro, storyText, places, closing]);
  const markdown = toMarkdownDraft({
    title: input.title,
    intro,
    story: storyText,
    places,
    closing,
  });
  return {
    title: input.title,
    summary: (input.summary || '').trim() || firstSentence(intro) || firstSentence(body),
    intro,
    story: storyText,
    places,
    closing,
    body,
    markdown,
    html: markdownToHtml(markdown),
    seo: input.seo,
    charCount: proseCharCount([body]),
  };
}

export function fallbackTravelBlog(photos: PhotoAnalysis[], story: TravelStory): BlogDraft {
  const analyzed = (photos ?? []).filter((photo) => photo?.status === 'analyzed');
  const route = story.route.length ? story.route : ['그날의 길'];
  const title =
    route.length > 1 ? `${route[0]}에서 ${route[route.length - 1]}까지` : `${route[0]}, 천천히 걸은 하루`;
  const intro =
    '사진을 한 장씩 넘겨 보니, 말은 적어도 발자국은 분명한 하루가 남아 있었다. 우리는 서둘러 도착지를 정하지 않고, 눈에 닿는 자리를 따라 걸었다.';
  const storyText =
    analyzed
      .map((photo) => {
        const place = photo.place || '그 자리';
        const description = photo.description || `${place} 앞에서 잠시 머물렀다.`;
        const mood = photo.mood ? ` 분위기는 ${photo.mood}에 가까웠다.` : '';
        return `${place}에서. ${description}${mood}`;
      })
      .join('\n\n') || '풍경은 이름을 남기지 않아도, 걸음은 스스로 순서를 만들었다.';
  const placesText = route
    .map((place, index) =>
      index === 0 ? `${place}에서 하루를 열었다.` : `이어서 ${place}으로 발길을 옮겼다.`
    )
    .join('\n\n');
  const closing =
    '돌아보면 화려한 장면보다, 둘이서 같은 방향을 바라본 시간이 더 오래 남는다. 그 천천히 접힌 하루를 꾸미지 않고 솔직하게 적어 둔다.';
  return assembleDraft({
    title,
    intro,
    story: storyText,
    places: placesText,
    closing,
    seo: fallbackSeo(analyzed, story),
  });
}

export async function generateTravelBlogDraft(
  photos: PhotoAnalysis[],
  options?: { improve?: string }
): Promise<{
  story: TravelStory;
  draft: BlogDraft;
  fromGemini: boolean;
}> {
  const analyzed = (photos ?? []).filter((photo) => photo?.status === 'analyzed').slice(0, 50);
  const localStory = inferTravelStory(analyzed);
  const fallback = fallbackTravelBlog(analyzed, localStory);
  const improve = options?.improve?.trim()
    ? `이전 초안 개선 요청:\n${options.improve}\n주차·화장실·난이도·갈맷길 코스/구간명을 본문에 자연히 넣고, 1500~2000자를 지키며 짧은 문단으로 나눠라.`
    : '';
  const json = await generateGeminiJsonObject({
    prompt: `너는 네이버 블로그용 감성 여행 에세이를 쓰는 한국어 작가다.
여러 장의 사진 분석을 보고 여행 동선을 추론한 뒤 초안을 JSON만 출력하라.
광고, 과장, 이모지, 추천 강요 금지.
본문(intro+story+places+closing)은 공백 포함 1500~2000자.
문체는 담백한 1인칭 또는 부부 시점의 과거형 나레이션.
반드시 포함할 것: 제목, 한 줄 요약, 도입부, 여행 이야기, 장소 소개, 마무리 소감, 주차·화장실·걷기 난이도.
동선은 사진 순서와 장소명을 따르되 같은 장소는 잇지 말고 한 번만 적는다.
${improve}
사진 분석: ${JSON.stringify(compactPhotoAnalyses(analyzed))}
이미 추론한 동선: ${JSON.stringify(localStory.route)}
형식: {"route":["해운대해수욕장","동백섬"],"title":"...","summary":"...","intro":"...","story":"...","places":"...","closing":"...","keywords":["해운대"],"hashtags":["#해운대"],"searchQueries":["해운대 여행"]}`,
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
    return { story, draft: { ...fallback, title, summary, seo }, fromGemini: true };
  }

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
    }),
  };
}
