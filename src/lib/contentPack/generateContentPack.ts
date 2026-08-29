import { generateGeminiJsonObject } from '@/lib/photoAi';
import { compactPhotoAnalyses, inferTravelStory } from '@/lib/blog/travelStory';
import { fallbackTravelBlog, generateTravelBlogDraft } from '@/lib/photoPipeline/generateTravelBlog';
import { QUALITY_PASS_SCORE, scoreBlogQuality } from '@/lib/contentPack/scoreBlogQuality';
import type { PhotoAnalysis } from '@/types/blog';
import type { CardNewsSlide, ContentPack, ShortsBeat, ShortsScript, YoutubeCopy } from '@/types/contentPack';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

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

function withHashtag(value: string): string {
  const clean = value.replace(/^#+/, '').replace(/\s+/g, '');
  return clean ? `#${clean}` : '';
}

function padHashtags(tags: string[], extras: string[]): string[] {
  const pool = [
    ...tags,
    ...extras,
    '#갈맷길',
    '#부산여행',
    '#시니어여행',
    '#부부여행',
    '#감성여행',
    '#산책코스',
    '#힐링여행',
    '#국내여행',
    '#바다여행',
    '#노을',
    '#여행브이로그',
    '#숏츠',
    '#여행스타그램',
    '#주말여행',
    '#천천히걷기',
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of pool) {
    const next = withHashtag(tag);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    if (result.length >= 30) break;
  }
  let n = 1;
  while (result.length < 30) {
    const extra = `#여행기록${n}`;
    if (!seen.has(extra)) {
      seen.add(extra);
      result.push(extra);
    }
    n += 1;
  }
  return result;
}

function fallbackCardNews(places: string[], photos: PhotoAnalysis[]): CardNewsSlide[] {
  const titles = [
    '표지',
    '오늘의 길',
    '첫 장면',
    '걸음의 속도',
    '풍경',
    '사람과 빛',
    '쉬어가는 자리',
    '작은 발견',
    '가는 길 안내',
    '마무리',
  ];
  return titles.map((title, index) => {
    const place = places[index % Math.max(places.length, 1)] || photos[index]?.place || '그 길';
    const caption = photos[index]?.description || photos[0]?.description || `${place}를 천천히 걸었다.`;
    const bodies = [
      `${place}, 사진으로 남은 하루`,
      places.join(' → ') || place,
      caption,
      '서두르지 않아도 길은 스스로 이어졌다.',
      photos[1]?.description || caption,
      photos[2]?.mood ? `분위기는 ${photos[2].mood}` : '말보다 바람이 먼저였다.',
      '그늘과 벤치가 있어 오래 머물 수 있었다.',
      photos[0]?.objects?.[0] ? `${photos[0].objects[0]}이 눈에 남았다.` : '작은 장면이 하루를 붙잡았다.',
      '주차와 화장실을 먼저 확인하고 걸음을 시작했다.',
      '같은 하늘을 본 것으로 충분했다.',
    ];
    return { index: index + 1, title, body: bodies[index] || caption };
  });
}

function fallbackShorts(places: string[]): ShortsScript {
  const beats: ShortsBeat[] = [
    { startSec: 0, endSec: 5, line: `${places[0] || '그 길'}에서 하루가 시작됐습니다.` },
    { startSec: 5, endSec: 15, line: '우리는 나침반보다 발끝을 믿었습니다.' },
    { startSec: 15, endSec: 30, line: (places.slice(0, 3).join(', ') || '풍경') + '을 천천히 지나갔습니다.' },
    { startSec: 30, endSec: 45, line: '말은 줄고, 빛과 바람만 남았습니다.' },
    { startSec: 45, endSec: 55, line: '60초로는 모자란 하루였습니다.' },
    { startSec: 55, endSec: 60, line: '노을에서 이 길을 다시 열어 보세요.' },
  ];
  return {
    durationSec: 60,
    hook: beats[0].line,
    beats,
    fullScript: beats.map((beat) => `${beat.startSec}~${beat.endSec}초 ${beat.line}`).join('\n'),
  };
}

function fallbackYoutube(title: string, places: string[], blogSummary: string): YoutubeCopy {
  const route = places.join(' → ');
  return {
    title: title || `${places[0] || '여행'} 산책`,
    description: [
      blogSummary,
      route ? `동선: ${route}` : '',
      '시니어 부부 시점으로 천천히 걸은 기록입니다.',
      '주차·화장실·난이도는 영상과 고정댓글을 참고해 주세요.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

function normalizeSlides(value: unknown, fallback: CardNewsSlide[]): CardNewsSlide[] {
  if (!Array.isArray(value)) return fallback;
  const slides = value
    .map((item, index) => {
      const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        index: index + 1,
        title: asText(record.title) || fallback[index]?.title || `${index + 1}장`,
        body: asText(record.body) || fallback[index]?.body || '',
      };
    })
    .filter((slide) => slide.body);
  if (slides.length >= 10) return slides.slice(0, 10);
  return [...slides, ...fallback.slice(slides.length)].slice(0, 10);
}

function normalizeBeats(value: unknown, fallback: ShortsBeat[]): ShortsBeat[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.slice(0, 8).map((item, index) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const startSec = typeof record.startSec === 'number' ? record.startSec : fallback[index]?.startSec ?? index * 10;
    const endSec = typeof record.endSec === 'number' ? record.endSec : fallback[index]?.endSec ?? startSec + 10;
    return {
      startSec,
      endSec: Math.min(60, endSec),
      line: asText(record.line) || fallback[index]?.line || '',
    };
  });
}

export async function generateContentPack(input: {
  photos: PhotoAnalysis[];
  galmaetgil?: GalmaetgilPlaceMatch[];
}): Promise<ContentPack> {
  const photos = (input.photos ?? []).filter((photo) => photo?.status === 'analyzed').slice(0, 50);
  const matchedTrail = (input.galmaetgil ?? []).filter((item) => item?.matched);
  try {
    let blogResult = await generateTravelBlogDraft(photos, { galmaetgil: input.galmaetgil });
    let quality = scoreBlogQuality({
      draft: blogResult.draft,
      photos,
      galmaetgil: input.galmaetgil,
    });
    let rewriteCount = 0;
    if (
      quality.overall < QUALITY_PASS_SCORE &&
      blogResult.fromGemini &&
      photos.length <= 8
    ) {
      rewriteCount = 1;
      blogResult = await generateTravelBlogDraft(photos, {
        improve: `${quality.reasons.join('\n')}\n갈맷길 확정 정보: ${JSON.stringify(matchedTrail)}`,
        galmaetgil: input.galmaetgil,
      });
      quality = scoreBlogQuality({
        draft: blogResult.draft,
        photos,
        galmaetgil: input.galmaetgil,
        rewritten: true,
        rewriteCount,
      });
    }
    const story = blogResult.story;
    const places = story.route.length ? story.route : photos.map((photo) => photo.place).filter(Boolean);
    const cardFallback = fallbackCardNews(places, photos);
    const shortsFallback = fallbackShorts(places);
    const youtubeFallback = fallbackYoutube(blogResult.draft.title, places, blogResult.draft.summary);
    const seoFallback = Array.from(
      new Set([...(blogResult.draft.seo?.keywords ?? []), ...places, ...matchedTrail.map((item) => item.courseName)])
    ).filter(Boolean);

    const json =
      blogResult.fromGemini && photos.length <= 8
        ? await generateGeminiJsonObject({
            prompt: `너는 같은 여행 기록을 채널별로 나누는 한국어 콘텐츠 작가다.
아래 장소·갈맷길·사진 분석·블로그 요약을 반드시 공유해서 JSON만 출력하라.
광고·과장·이모지 금지. 시니어 부부 시점.
인스타 카드뉴스는 정확히 10장. 쇼츠는 60초(0~60). 해시태그는 # 포함 30개. SEO 키워드는 12개 내외.
사진 분석: ${JSON.stringify(compactPhotoAnalyses(photos))}
동선: ${JSON.stringify(places)}
갈맷길: ${JSON.stringify(matchedTrail)}
블로그 제목: ${blogResult.draft.title}
블로그 요약: ${blogResult.draft.summary}
형식: {"cardNews":[{"title":"표지","body":"..."}],"shorts":{"hook":"...","beats":[{"startSec":0,"endSec":5,"line":"..."}]},"youtubeTitle":"...","youtubeDescription":"...","seoKeywords":["갈맷길"],"hashtags":["#갈맷길"]}`,
            maxOutputTokens: 4096,
          })
        : null;

    const record = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
    const cardNews = normalizeSlides(record.cardNews, cardFallback);
    const beats = normalizeBeats(
      record.shorts && typeof record.shorts === 'object'
        ? (record.shorts as { beats?: unknown }).beats
        : undefined,
      shortsFallback.beats
    );
    const shorts: ShortsScript = {
      durationSec: 60,
      hook:
        asText(
          record.shorts && typeof record.shorts === 'object' ? (record.shorts as { hook?: unknown }).hook : undefined
        ) || shortsFallback.hook,
      beats,
      fullScript: beats.map((beat) => `${beat.startSec}~${beat.endSec}초 ${beat.line}`).join('\n'),
    };
    const youtube: YoutubeCopy = {
      title: asText(record.youtubeTitle) || youtubeFallback.title,
      description: asText(record.youtubeDescription) || youtubeFallback.description,
    };
    const seoKeywords = asStringList(record.seoKeywords).length
      ? asStringList(record.seoKeywords).slice(0, 16)
      : seoFallback.slice(0, 16);
    const hashtags = padHashtags(asStringList(record.hashtags), [
      ...places,
      ...matchedTrail.map((item) => item.sectionName),
      ...(blogResult.draft.seo?.hashtags ?? []),
    ]);

    return {
      story,
      blog: blogResult.draft,
      cardNews,
      shorts,
      youtube,
      seoKeywords,
      hashtags,
      quality,
    };
  } catch {
    const story = inferTravelStory(photos);
    const draft = fallbackTravelBlog(photos, story);
    return {
      story,
      blog: draft,
      cardNews: fallbackCardNews(story.route, photos),
      shorts: fallbackShorts(story.route),
      youtube: fallbackYoutube(draft.title, story.route, draft.summary),
      seoKeywords: draft.seo?.keywords ?? [],
      hashtags: padHashtags(draft.seo?.hashtags ?? [], story.route),
      quality: scoreBlogQuality({ draft, photos, galmaetgil: input.galmaetgil }),
    };
  }
}
