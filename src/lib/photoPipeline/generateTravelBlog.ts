import { markdownToHtml } from '@/lib/blog/markdownHtml';
import { enrichPhotoAnalyses, photoFactsFromAnalyses, type TripBlogContext } from '@/lib/blog/photoFacts';
import { inferTravelStory } from '@/lib/blog/travelStory';
import { generateTravelBlogFromFacts, reviewJson } from '@/lib/travelBlogEssay';
import type { BlogDraft, BlogRecommendations, PhotoAnalysis, TravelStory } from '@/types/blog';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

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
      parking: '공영 자리에 차를 두고 조금 걸었다.',
      carCamping: '해안 도로에서 하지 않았다.',
      restaurants: ['성산 해물뚝배기', '서귀포 갈치조림', '협재 해산물'],
    };
  }
  if (/부산|해운대|광안/.test(blob)) {
    return {
      parking: '해변에서 한 블록 떨어진 자리에 두고 걸었다.',
      carCamping: '모래밭에서 하지 않았다.',
      restaurants: ['자갈치 회', '밀면', '씨앗호떡'],
    };
  }
  if (/대구/.test(blob)) {
    return {
      parking: '공원 공영 자리에 차를 두었다.',
      carCamping: '공원 안에서 하지 않았다.',
      restaurants: ['따로국밥', '막창', '수성못 근처 칼국수'],
    };
  }
  if (/강릉|경포|정동진/.test(blob)) {
    return {
      parking: '해수욕장 공영 자리에 두고 걸었다.',
      carCamping: '안내가 없는 해변에서 하지 않았다.',
      restaurants: ['초당순두부', '고등어구이', '안목 커피거리 가벼운 식사'],
    };
  }
  return {
    parking: '목적지 앞에서 자리를 살핀 뒤 걸었다.',
    carCamping: '안내판을 보고 나서야 자리를 정했다.',
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

export function fallbackTravelBlog(
  photos: PhotoAnalysis[],
  story: TravelStory,
  trip?: TripBlogContext
): BlogDraft {
  const analyzed = enrichPhotoAnalyses(photos);
  const facts = photoFactsFromAnalyses(analyzed);
  const titleSeed = (trip?.title || trip?.query || facts[0]?.place || story.summary || '여행').trim();
  const essay = generateTravelBlogFromFacts(facts, titleSeed);
  const rec = buildRecommendations(analyzed, trip);
  const published = reviewJson(essay);
  const paras = essay.body.split(/\n\n+/);
  return {
    title: essay.title,
    summary: paras[0] || '',
    infoBox: '',
    intro: paras[0] || '',
    story: paras.slice(1, -1).join('\n\n'),
    places: essay.usedPlaces.join(', '),
    closing: paras.length > 1 ? paras[paras.length - 1] : '',
    body: published.content,
    markdown: essay.markdown,
    html: markdownToHtml(essay.markdown),
    seo: { keywords: published.keywords, hashtags: essay.hashtags ?? [], searchQueries: [] },
    recommendations: rec,
    charCount: essay.charCount,
  };
}

export async function generateTravelBlogDraft(
  photos: PhotoAnalysis[],
  options?: { improve?: string; galmaetgil?: GalmaetgilPlaceMatch[]; trip?: TripBlogContext }
): Promise<{
  story: TravelStory;
  draft: BlogDraft;
  fromGemini: boolean;
  prompt: string;
}> {
  const analyzed = enrichPhotoAnalyses(photos).slice(0, 50);
  const localStory = inferTravelStory(analyzed);
  const facts = photoFactsFromAnalyses(analyzed);
  const titleSeed = (options?.trip?.title || options?.trip?.query || facts[0]?.place || '여행').trim();
  const essay = generateTravelBlogFromFacts(facts, titleSeed);
  const rec = buildRecommendations(analyzed, options?.trip);
  const published = reviewJson(essay);
  const paras = essay.body.split(/\n\n+/);
  const draft: BlogDraft = {
    title: essay.title,
    summary: paras[0] || '',
    infoBox: '',
    intro: paras[0] || '',
    story: paras.slice(1, -1).join('\n\n'),
    places: essay.usedPlaces.join(', '),
    closing: paras.length > 1 ? paras[paras.length - 1] : '',
    body: published.content,
    markdown: essay.markdown,
    html: markdownToHtml(essay.markdown),
    seo: { keywords: published.keywords, hashtags: published.hashtags, searchQueries: [] },
    recommendations: rec,
    charCount: essay.charCount,
  };
  return { story: localStory, draft, fromGemini: false, prompt: essay.prompt };
}
