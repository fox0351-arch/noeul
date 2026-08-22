import { PlaceItem, PlacePhoto } from '@/types/place';
import { TravelMapChecklistItem } from '@/types/travelMap';

export type PhotoScene = 'lodging' | 'carcamping' | 'food' | 'cafe' | 'sunrise' | 'sunset' | 'general';

export interface TravelBlogDraft {
  title: string;
  body: string;
  hashtags: string[];
  markdown: string;
  charCount: number;
  photoCount: number;
}

const MIN_CHARS = 1500;
const MAX_CHARS = 2500;

type RouteStop =
  | {
      kind: 'photo';
      marker: string;
      place: PlaceItem;
      photo: PlacePhoto;
      scene: PhotoScene;
      isFirstAtPlace: boolean;
    }
  | {
      kind: 'place';
      place: PlaceItem;
    };

function slugTag(value: string): string {
  return value.replace(/[^\w가-힣]/g, '').slice(0, 12);
}

function joinBody(paragraphs: string[]): string {
  return paragraphs.filter((p) => p.trim()).join('\n\n');
}

function haystack(place: PlaceItem): string {
  return [place.name, place.memo ?? '', ...(place.types ?? [])].join(' ');
}

function classifyScene(place: PlaceItem, checklist: TravelMapChecklistItem[]): PhotoScene {
  const text = haystack(place);
  const checks = checklist.map((item) => `${item.id} ${item.text}`).join(' ');
  const combined = `${text} ${checks}`;

  if (/일출|sunrise/i.test(text)) return 'sunrise';
  if (/일몰|노을|sunset/i.test(text) && !/노을앱/.test(text)) return 'sunset';
  if (/차박|캠핑|오토캠핑|campground|rv_park/i.test(combined)) return 'carcamping';
  if (/숙박|숙소|호텔|펜션|모텔|게스트하우스|\blodging\b|\bhotel\b/i.test(combined)) return 'lodging';
  if (/카페|\bcafe\b|coffee/i.test(text)) return 'cafe';
  if (/맛집|식당|\brestaurant\b|\bfood\b/i.test(text)) return 'food';
  return 'general';
}

function buildRoute(places: PlaceItem[], checklist: TravelMapChecklistItem[]): RouteStop[] {
  const stops: RouteStop[] = [];
  let photoNumber = 0;

  for (const place of places) {
    const photos = place.photos ?? [];
    if (photos.length === 0) {
      stops.push({ kind: 'place', place });
      continue;
    }
    photos.forEach((photo, index) => {
      photoNumber += 1;
      stops.push({
        kind: 'photo',
        marker: `[사진${photoNumber}]`,
        place,
        photo,
        scene: classifyScene(place, checklist),
        isFirstAtPlace: index === 0,
      });
    });
  }

  return stops;
}

function quoteMemo(memo: string): string {
  const trimmed = memo.trim();
  if (!trimmed) return '';
  const clipped = trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed;
  return `수첩에는 이렇게 남아 있다. "${clipped}"`;
}

function sceneParagraph(scene: PhotoScene, placeName: string): string {
  switch (scene) {
    case 'lodging':
      return `숙소에 가방을 내려놓았다. ${placeName}의 밤은 설명이 필요 없었다. 불을 끄면 하루가 잠시 멈출 뿐이었다.`;
    case 'carcamping':
      return `차 문을 닫고 자리를 잡았다. 차박은 편리해서가 아니라, 하늘이 가까워서 오래 기억에 남을 밤이었다.`;
    case 'food':
      return `식탁 앞에 앉았다. 간판의 이름보다, 천천히 나눠 먹은 시간이 남았다.`;
    case 'cafe':
      return `창가에 잔을 내려놓았다. 말은 줄고, 창밖의 움직임만 천천히 지나갔다.`;
    case 'sunrise':
      return `일출을 기다렸다. 서둘러 담으려 하지 않고, 빛이 발끝까지 내려올 때까지 서 있었다.`;
    case 'sunset':
      return `일몰 앞에 우리는 말이 없었다. 하늘이 바뀌는 동안, 서로의 옆모습만 분명했다.`;
    default:
      return '';
  }
}

function stopParagraphs(stop: RouteStop, compact: boolean): string[] {
  if (stop.kind === 'place') {
    const memo = quoteMemo(stop.place.memo ?? '');
    return [
      compact
        ? `${stop.place.name}을(를) 지나쳤다. 사진은 남기지 않았다. ${memo}`.trim()
        : `${stop.place.name}을(를) 걸었다. 셔터를 누르지 않은 자리도 동선의 일부였다. 천천히 걸어도 괜찮은 길이었다. ${memo}`.trim(),
    ];
  }

  const arrival = stop.isFirstAtPlace
    ? `${stop.place.name}에 닿았다. ${quoteMemo(stop.place.memo ?? '')}`.trim()
    : `${stop.place.name}에서 다음 장면을 남겼다.`;
  const beat = compact
    ? `${stop.marker}\n${arrival}`
    : `${stop.marker}\n${arrival} 그 순간의 공기는 설명이 짧아도 충분했다.`;
  const emphasis = sceneParagraph(stop.scene, stop.place.name);
  return emphasis ? [beat, emphasis] : [beat];
}

function checklistParagraph(checklist: TravelMapChecklistItem[]): string {
  if (checklist.length === 0) return '';
  const done = checklist.filter((item) => item.completed).map((item) => item.text);
  const pending = checklist.filter((item) => !item.completed).map((item) => item.text);
  const doneLine = done.length ? `미리 적어 둔 ${done.join(', ')}을(를) 지나왔다.` : '';
  const pendingLine = pending.length
    ? `아직 남은 ${pending.join(', ')}은(는) 숙제처럼 가방에 두었다.`
    : '';
  return `우리는 서두르지 않았다. ${doneLine} ${pendingLine}`.trim();
}

function buildSeoTags(tripName: string, places: PlaceItem[], scenes: PhotoScene[]): string[] {
  const tags: string[] = [];
  const push = (value: string) => {
    const tag = slugTag(value);
    if (tag && !tags.includes(tag)) tags.push(tag);
  };

  push('부부여행');
  push('60대여행');
  push('여행에세이');
  push('느린여행');
  push(tripName);
  if (scenes.includes('sunset')) push('일몰여행');
  if (scenes.includes('sunrise')) push('일출여행');
  if (scenes.includes('lodging')) push('숙소기록');
  if (scenes.includes('carcamping')) push('차박여행');
  if (scenes.includes('cafe')) push('카페산책');
  if (scenes.includes('food')) push('식탁기록');
  places.forEach((place) => push(place.name));
  ['국내여행', '기록여행', '둘이서여행', '손잡고여행', '산책여행', '노을여행', '여행일기'].forEach(push);

  return tags.slice(0, 10).map((tag) => `#${tag}`);
}

function extraReflections(tripName: string, places: PlaceItem[], memo: string): string[] {
  const first = places[0]?.name;
  const last = places[places.length - 1]?.name;
  const extras = [
    '천천히 걸어도 괜찮은 길이었다. 속도를 줄이니 발밑의 작은 소리까지 들렸다.',
    '오늘은 풍경보다 사람이 더 기억에 남았다. 아내의 걸음이 내 걸음보다 반 박자 느렸고, 그 간격이 편했다.',
    memo.trim()
      ? `여행 전에 적어 둔 메모를 다시 읽었다. ${memo.trim().slice(0, 100)}${memo.trim().length > 100 ? '…' : ''}`
      : '적어 둔 문장이 많지 않아도, 둘이 나눈 침묵이 하루를 채워 주었다.',
    first && last && first !== last
      ? `${first}에서 시작한 발걸음이 ${last}에 닿을 때까지, 우리는 순서를 바꾸지 않았다. 찍힌 사진의 앞뒤가 곧 오늘의 지도였다.`
      : '같은 자리를 오래 바라보는 일이, 멀리 가는 일보다 먼저였다.',
    `${tripName}을(를) 크게 말하지 않기로 했다. 다만 손끝을 맞댄 채로, 하루를 접었다.`,
    '돌아가는 길에도 서두르지 않았다. 창밖의 빛이 줄어드는 것을 그냥 두었다.',
  ];
  return extras;
}

export function generateTravelBlogEssay(input: {
  title: string;
  memo: string;
  checklist: TravelMapChecklistItem[];
  places: PlaceItem[];
}): TravelBlogDraft {
  const tripName = input.title.trim() || '우리들의 여행';
  const places = input.places;
  const route = buildRoute(places, input.checklist);
  const photoStops = route.filter((stop): stop is Extract<RouteStop, { kind: 'photo' }> => stop.kind === 'photo');
  const scenes = photoStops.map((stop) => stop.scene);

  const title = `우리는 서두르지 않았다, ${tripName}`;

  const opening = [
    '우리는 서두르지 않았다.',
    `${tripName}이라는 이름만 가방에 넣고, 사진이 쌓인 순서대로 걸었다. 그 순서를 바꾸지 않는 일이 곧 오늘의 동선이었다.`,
    input.memo.trim()
      ? `떠나기 전 적어 둔 여행 메모가 옆자리에 있었다. ${input.memo.trim()}`
      : '거창한 말 대신, 발걸음이 남는 자리를 그대로 따라갔다.',
  ];

  const compact = photoStops.length >= 8;
  const routeParagraphs = route.flatMap((stop) => stopParagraphs(stop, compact));
  const closing = '오늘은 풍경보다 사람이 더 기억에 남았다. 내일은 더 천천히 걷자고, 아내는 짧게 말했다.';

  const extras = extraReflections(tripName, places, input.memo);
  const core = [...opening, checklistParagraph(input.checklist), ...routeParagraphs];

  let middle = [...core];
  let body = joinBody([...middle, closing]);

  for (const extra of extras) {
    if (body.length >= MIN_CHARS) break;
    const next = joinBody([...middle, extra, closing]);
    if (next.length > MAX_CHARS) break;
    middle = [...middle, extra];
    body = next;
  }

  if (body.length < MIN_CHARS) {
    const pad = '같은 길을 되짚으며 우리는 말이 줄었다. 침묵 속에서도 발소리가 남았고, 그 소리가 하루의 끝이 되었다.';
    const next = joinBody([...middle, pad, closing]);
    if (next.length <= MAX_CHARS) body = next;
  }

  if (body.length > MAX_CHARS) {
    const parts = body.split('\n\n');
    while (joinBody(parts).length > MAX_CHARS && parts.length > 3) {
      const removable = [...parts].reverse().findIndex((part) => !part.includes('[사진'));
      if (removable < 0) break;
      parts.splice(parts.length - 1 - removable, 1);
    }
    body = joinBody(parts).slice(0, MAX_CHARS).trim();
  }

  const hashtags = buildSeoTags(tripName, places, scenes);

  const markdown = [
    `# ${title}`,
    '',
    body,
    '',
    ...(photoStops.length
      ? [
          '## 사진 (첨부 순서)',
          ...photoStops.map(
            (stop) => `${stop.marker} ${stop.place.name}\n\n![${stop.marker}](${stop.photo.dataUrl})`
          ),
        ]
      : []),
    '',
    '## SEO 태그',
    hashtags.join(' '),
  ].join('\n');

  return {
    title,
    body,
    hashtags,
    markdown,
    charCount: body.length,
    photoCount: photoStops.length,
  };
}
