import { PlaceItem } from '@/types/place';
import { TravelMapChecklistItem } from '@/types/travelMap';
import { photoFactsFromPlaces } from '@/lib/blog/photoFacts';

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

function joinBody(paragraphs: string[]): string {
  return paragraphs.filter((p) => p.trim()).join('\n\n');
}

function practicalNotes(query: string, placeNames: string[]): string {
  const blob = `${query} ${placeNames.join(' ')}`;
  if (/제주/.test(blob)) {
    return [
      '주차: 성산·섭지코지 일대는 공영주차장과 임시 주차면을 함께 쓰는 곳이 많습니다.',
      '차박: 해안 도로변 무단 차박은 단속되는 구간이 있어, 지정 구역을 확인하는 것이 좋습니다.',
      '맛집: 성산 해물뚝배기, 서귀포 갈치조림, 협재 해산물.',
    ].join('\n');
  }
  if (/부산|해운대|광안/.test(blob)) {
    return [
      '주차: 해수욕장 공영주차장은 주말에 빨리 찹니다. 조금 떨어진 자리에 두고 걷는 편이 편합니다.',
      '차박: 해안 도로와 모래밭 차박은 제한되는 곳이 많습니다.',
      '맛집: 자갈치 회, 밀면, 씨앗호떡.',
    ].join('\n');
  }
  if (/대구/.test(blob)) {
    return [
      '주차: 송해공원·수성못 주변은 공영주차장이 있습니다. 주말 낮에는 대기가 생길 수 있습니다.',
      '차박: 공원 안 밤샘 주차는 제한되는 경우가 많습니다.',
      '맛집: 따로국밥, 막창, 수성못 근처 칼국수.',
    ].join('\n');
  }
  if (/강릉|경포|정동진/.test(blob)) {
    return [
      '주차: 경포·정동진 해수욕장 공영주차장을 쓰기 쉽습니다.',
      '차박: 해변 차박은 구간마다 다르니 안내판을 먼저 봅니다.',
      '맛집: 초당순두부, 고등어구이, 안목 커피거리의 가벼운 식사.',
    ].join('\n');
  }
  return [
    '주차: 목적지 공영주차장 여부를 현지에서 한 번 더 확인하는 것이 좋습니다.',
    '차박: 차박은 구역마다 달라, 안내판을 보고 자리를 정하는 것이 안전합니다.',
    '맛집: 현지 시장 식당, 국밥집, 공원 근처 백반.',
  ].join('\n');
}

function clipTo(text: string, max: number, minKeep = 400): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const sliced = trimmed.slice(0, max);
  const cut = Math.max(sliced.lastIndexOf('다.'), sliced.lastIndexOf('.'));
  return (cut > minKeep ? sliced.slice(0, cut + 1) : sliced).trim();
}

export function reviewMeetsRules(body: string): boolean {
  const n = body.trim().length;
  return n >= 1000 && n <= 1500 && /주차/.test(body) && /차박/.test(body) && /맛집/.test(body);
}

function padBody(text: string, placeNames: string[], query: string, minLength: number): string {
  let body = text.trim();
  const extras = [
    `${query || placeNames[0] || '그 길'}을 천천히 걸었습니다. 발걸음을 재촉하지 않아도 풍경은 제자리에 있었습니다.`,
    `${placeNames.slice(0, 5).join(', ') || query} 사이를 오가며 그늘과 바람만 골랐습니다.`,
    '화장실과 벤치가 보이는 곳에서 잠시 쉬고, 다시 길을 이었습니다.',
    '해가 기울어도 서두르지 않았습니다. 오늘의 속도면 충분했습니다.',
  ];
  let i = 0;
  while (body.length < minLength && i < 12) {
    body = `${body}\n\n${extras[i % extras.length]}`;
    i += 1;
  }
  return body;
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
  const region = input.query?.trim() || tripName;
  const title = `${tripName} 여행 후기`;
  const placeNames = input.places.map((place) => place.name);

  const opening = /제주/.test(region)
    ? `${region}으로 내려갔습니다. 바닷바람부터 먼저 맞았습니다.`
    : /대구/.test(region)
      ? `${region}으로 갔습니다. 강바람이 공원 입구에서 먼저 맞았습니다.`
      : /부산/.test(region)
        ? `${region}으로 갔습니다. 바닷가 공기가 먼저 달랐습니다.`
        : /강릉|경포|정동진/.test(region)
          ? `${region}으로 갔습니다. 동해 바람이 차창을 스쳤습니다.`
          : `${region}으로 향했습니다. 서두르지 않고, 눈에 들어오는 것만 따라갔습니다.`;
  const selected = placeNames.length
    ? `오늘 고른 곳은 ${placeNames.join(', ')}입니다.`
    : '';
  const photoParagraphs = facts.map((fact) => {
    const tags = fact.visualTags.join(' · ') || fact.scene;
    const seen = fact.caption || `${fact.place}의 장면이 남아 있습니다.`;
    return `${fact.order}번째 사진. ${fact.place}. ${tags}. ${seen}`;
  });
  const walk =
    photoParagraphs.length > 0
      ? photoParagraphs
      : placeNames.slice(0, 3).map((name, index) =>
          index === 0
            ? `${name}에 먼저 닿았습니다. 그늘이 있어 잠시 머물렀습니다.`
            : index === 1
              ? `${name}으로 이어졌습니다. 바람이 등 뒤에서 밀어 주었습니다.`
              : `${name}에서 발걸음을 늦췄습니다. 멀리 보이는 풍경만 담았습니다.`
        );
  const closing = `마지막은 ${facts.at(-1)?.place || placeNames.at(-1) || tripName}에서 멈췄습니다. 사진이 있으면 올린 순서를 그대로 두었습니다.`;
  const notes = practicalNotes(region, placeNames);
  const storyMax = Math.max(700, 1500 - notes.length - 2);
  const storyMin = Math.max(400, 1000 - notes.length - 2);
  const story = clipTo(
    padBody(joinBody([opening, selected, ...walk, closing]), placeNames, region, storyMin),
    storyMax
  );
  const body = clipTo(`${story}\n\n${notes}`, 1500);

  return {
    title,
    body,
    hashtags: [],
    markdown: [`# ${title}`, '', body].join('\n'),
    charCount: body.length,
    photoCount: facts.length,
    usedPhotoFacts: facts.filter((fact) => fact.caption || fact.objects.length || fact.visualTags.length).length,
    usedPlaces: placeNames,
  };
}

export function essaySimilarity(a: string, b: string): number {
  const tokens = (text: string) =>
    text
      .replace(/\[사진\d+\]/g, ' ')
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && !['사진', '기록', '있었습니다', '남아', '주차', '차박', '맛집', '화장실', '벤치', '공영주차장', '안내판'].includes(item));
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}
