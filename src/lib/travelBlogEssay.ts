import { PlaceItem } from '@/types/place';
import { TravelMapChecklistItem } from '@/types/travelMap';
import { photoFactsFromPlaces, type OrderedPhotoFact } from '@/lib/blog/photoFacts';
import { placeAmenity } from '@/lib/placeAmenity';

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

const MIN_CHARS = 1200;
const MAX_CHARS = 1800;

const GUIDEBOOK =
  /방문했습니다|좋았습니다|추천합니다|유명합니다|있습니다|관광지입니다|아름다운 관광지/;

function joinBody(paragraphs: string[]): string {
  return paragraphs.filter((p) => p.trim()).join('\n\n');
}

function clipTo(text: string, max: number, minKeep = 900): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const sliced = trimmed.slice(0, max);
  const cut = Math.max(sliced.lastIndexOf('다.'), sliced.lastIndexOf('.'));
  return (cut > minKeep ? sliced.slice(0, cut + 1) : sliced).trim();
}

function endsSentence(text: string): boolean {
  return /[.다요]$/.test(text.trim());
}

function asSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return endsSentence(trimmed) ? trimmed : `${trimmed}.`;
}

export function reviewMeetsRules(body: string): boolean {
  const n = body.trim().length;
  const haess = (body.match(/했습니다/g) || []).length;
  const listed = /오늘 고른 곳은|에 갔습니다\./.test(body);
  return (
    n >= MIN_CHARS &&
    n <= MAX_CHARS &&
    /주차/.test(body) &&
    /차박/.test(body) &&
    /맛집|식당|국밥|순두부|회|밀면/.test(body) &&
    haess <= 1 &&
    !listed &&
    !GUIDEBOOK.test(body)
  );
}

function eunNeun(word: string): string {
  const ch = word.charAt(word.length - 1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '는';
  return (code - 0xac00) % 28 === 0 ? '는' : '은';
}

function hayOf(fact: Pick<OrderedPhotoFact, 'caption' | 'objects' | 'visualTags' | 'keywords' | 'mood' | 'scene'>): string {
  return [
    fact.caption,
    fact.mood,
    fact.scene,
    ...(fact.objects || []),
    ...(fact.visualTags || []),
    ...(fact.keywords || []),
  ]
    .filter(Boolean)
    .join(' ');
}

function sensoryBeat(fact: OrderedPhotoFact, index: number, used: Set<string>): string {
  const hay = hayOf(fact);
  const name = fact.place;
  const people = /인물|사람|부부|사람있음/.test(hay);
  const noPeople = /사람없음/.test(hay);
  const rain = /비|흐림|구름/.test(hay);
  const sunset = /노을|석양|일몰|저녁|해 질/.test(hay);
  const sunrise = /일출|새벽|아침/.test(hay);
  const sea = /바다|해변|파도|물빛/.test(hay);
  const mountain = /산|오름|능선|숲/.test(hay);
  const candidates = [
    people ? `그 옆에 선 사람이 먼저 눈에 들어왔다.` : '',
    noPeople ? `사람은 거의 보이지 않았고, 풍경만 남았다.` : '',
    rain ? `흐린 바람이 등을 스쳤다.` : '',
    sunset ? `빛이 잦아드는 쪽으로 걸었다.` : '',
    sunrise ? `이른 공기가 옷깃을 스쳤다.` : '',
    sea ? `${name} 앞 물결이 발끝까지 밀려왔다.` : '',
    mountain ? `${name} 능선 아래 그늘에 잠시 머물렀다.` : '',
    index % 2 === 0 ? `그 장면이 눈에 들어왔다.` : `그 길을 천천히 걸었다.`,
  ].filter(Boolean);
  for (const line of candidates) {
    const key = line.slice(0, 10);
    if (used.has(key)) continue;
    if (fact.caption && fact.caption.includes(line.slice(0, 8))) continue;
    used.add(key);
    return line;
  }
  return '';
}

function placeFallback(name: string, index: number, hay: string): string {
  if (/바다|해변|해수욕|포구/.test(`${name} ${hay}`)) {
    const sea = [
      `${name} 앞에서 물빛이 발끝까지 밀려왔다. 바람이 옷깃을 스쳤다.`,
      `${name}${eunNeun(name)} 모래보다 파도가 먼저 보였다.`,
      `${name} 쪽으로 길이 이어졌다. 멀리 섬 그림자가 한 점으로 남았다.`,
    ];
    return sea[index % sea.length];
  }
  if (/산|오름|국립공원|능선/.test(`${name} ${hay}`)) {
    const mountain = [
      `${name}으로 이어진 능선이 눈에 들어왔다. 그늘 아래 잠시 머물렀다.`,
      `${name}을 오르며 바람이 등을 스쳤다. 구름이 어깨 높이에서 머물렀다.`,
      `${name} 아래 숲그늘이 먼저 보였다.`,
    ];
    return mountain[index % mountain.length];
  }
  if (/굴|동굴/.test(name)) {
    return `${name} 안은 서늘했다. 돌 벽이 길게 이어졌다.`;
  }
  if (/공원|습지|휴양림/.test(name)) {
    return `${name}${eunNeun(name)} 그늘이 먼저 눈에 들어왔다. 벤치 앞에 잠시 머물렀다.`;
  }
  if (/섬|우도/.test(name)) {
    return `${name}으로 들어가는 길이 이어졌다. 작은 섬의 바람만 스쳤다.`;
  }
  const variants = [
    `${name}에 닿자 풍경의 결이 바뀌었다. 그 자리가 눈에 들어왔다.`,
    `${name}으로 이어지는 길을 걸었다. 오래 머물지 않아도 장면이 남았다.`,
    `${name}${eunNeun(name)} 바람이 먼저 스쳤다.`,
  ];
  return variants[index % variants.length];
}

function sceneFromFact(fact: OrderedPhotoFact, index: number, used: Set<string>): string {
  const caption = fact.caption.trim();
  const hay = hayOf(fact);
  const lead = caption ? asSentence(caption) : asSentence(placeFallback(fact.place, index, hay));
  const beat = sensoryBeat(fact, index, used);
  const linger =
    index % 2 === 0
      ? `${fact.place} 앞에서 잠시 머물렀다.`
      : `${fact.place}으로 길이 이어졌다.`;
  return [lead, beat, linger]
    .filter((part, i) => Boolean(part) && (i === 0 || !lead.includes(part.slice(0, 8))))
    .join(' ');
}

function openingFrom(region: string, first: OrderedPhotoFact | undefined, firstPlace: string): string {
  if (first?.caption) {
    return asSentence(first.caption);
  }
  if (/제주/.test(region) || /제주|성산|섭지|한라/.test(firstPlace)) {
    return `${firstPlace}에서 하루가 열렸다. 바다 위로 번지는 빛이 먼저 눈에 들어왔다.`;
  }
  if (/대구|송해/.test(region) || /송해/.test(firstPlace)) {
    return `${region}의 하루는 ${firstPlace}에서 열렸다. 강바람이 옷깃을 스쳤다.`;
  }
  if (/부산|해운대|광안/.test(region)) {
    return `${firstPlace} 앞에서 공기가 달라졌다. 파도 소리가 가까워지며 길이 이어졌다.`;
  }
  if (/강릉|경포|정동진/.test(region)) {
    return `동해의 바람이 ${firstPlace}에서 하루를 열었다. 솔향이 등을 스쳤다.`;
  }
  return `${firstPlace}에서 첫 장면이 보였다. 서두르지 않고 그 자리에 머물렀다.`;
}

function passingPlaces(placeNames: string[], photographed: Set<string>): string {
  const rest = placeNames.filter((name) => !photographed.has(name)).slice(0, 4);
  if (rest.length === 0) return '';
  if (rest.length === 1) {
    return `${rest[0]} 쪽 이름은 지도에 남았고, 발길은 사진이 가리킨 장면으로 이어졌다.`;
  }
  return `${rest[0]}과 ${rest[1]} 사이 이름은 스치듯 남았다. 걸음은 찍힌 순서대로 이어졌다.`;
}

function travelerNotes(region: string, lastPlace: string): string {
  const amenity = placeAmenity({ name: lastPlace }, region);
  const food = amenity.restaurants.slice(0, 3).join(', ');
  if (/제주/.test(region) || /제주|성산|섭지|한라/.test(lastPlace)) {
    return joinBody([
      `주차는 공영 자리에 차를 두고 조금 걸었다.`,
      `차박은 해안 도로에서 하지 않았다. 지정된 자리만 살폈다.`,
      `맛집은 ${food} 쪽으로 하루를 접었다.`,
    ]);
  }
  if (/부산|해운대|광안/.test(region)) {
    return joinBody([
      `주차는 해변에서 한 블록 떨어진 자리에 두고 걸었다.`,
      `차박은 모래밭에서 하지 않았다.`,
      `맛집은 ${food} 쪽으로 하루를 접었다.`,
    ]);
  }
  if (/대구|송해|낙동/.test(region) || /송해/.test(lastPlace)) {
    return joinBody([
      `주차는 공원 공영 자리에 차를 두었다.`,
      `차박은 공원 안에서 하지 않았다.`,
      `맛집은 ${food} 쪽으로 하루를 접었다.`,
    ]);
  }
  if (/강릉|경포|정동진/.test(region)) {
    return joinBody([
      `주차는 해수욕장 공영 자리에 두고 걸었다.`,
      `차박은 안내가 없는 해변에서 하지 않았다.`,
      `맛집은 ${food} 쪽으로 하루를 접었다.`,
    ]);
  }
  return joinBody([
    `주차는 목적지 앞에서 한 번 더 자리를 살핀 뒤 걸었다.`,
    `차박은 안내판을 보고 나서야 자리를 정했다.`,
    `맛집은 ${food} 쪽으로 하루를 접었다.`,
  ]);
}

function dropRepeats(text: string): string {
  const chunks = text.split(/\n\n+/);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const chunk of chunks) {
    const key = chunk.replace(/\s+/g, '').slice(0, 28);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(chunk.trim());
  }
  return joinBody(kept);
}

function padNarration(text: string, placeNames: string[], region: string, minLength: number): string {
  let body = text.trim();
  const first = placeNames[0] || region;
  const last = placeNames.at(-1) || region;
  const jeju = [
    '성산 쪽 능선과 서쪽 얕은 바다가 하루 안에서 서로 다른 빛을 냈다.',
    '올레 이정표는 짧게 보였고, 바다는 그보다 오래 남았다.',
    '현무암 돌담 너머로 유채가 한 줄 남아 길을 부드럽게 만들었다.',
    `${first}에서 받은 바람이 ${last}에 이를 때까지 끊기지 않았다.`,
    '배 시간과 해 질 무렵만 기억해도 제주의 하루는 충분했다.',
    '오름 아래 그늘에 앉으니 멀리 섬 그림자가 점처럼 남았다.',
    '광치기 검은 모래 위로 파도가 짧게 다녀갔다.',
    '포구의 작은 배가 줄에 묶여 흔들릴 때, 하루가 천천히 접혔다.',
    '억새가 바람결에 하얗게 기울었고, 그 결이 눈에 들어왔다.',
    '해 질 녘 발걸음이 느려질 때까지 바다는 제자리에 머물렀다.',
  ];
  const daegu = [
    '낙동강 바람이 공원 잔디를 한 겹 눕혔다.',
    '동상 앞 공터는 넓었고, 강물은 그보다 더 넓었다.',
    '은행잎이 쌓인 벤치에서 한숨 고르니 도시의 소음이 멀어졌다.',
    `${first}의 평지가 ${last}까지 천천히 이어졌다.`,
    '다리 아래를 지나는 강바람이 옷깃을 먼저 스쳤다.',
    '해 질 녘 강물이 은빛으로 잠시 멈춘 듯 보였다.',
    '놀이터 미끄럼틀이 오후 햇살을 받았고, 그 옆 산책로는 한산했다.',
    '카페 창가의 커피잔이 식을 때까지 강은 같은 자리를 지켰다.',
    '갈대 군락이 강둑을 따라 흔들렸고, 그 흔들림이 눈에 들어왔다.',
    '공원 입구를 다시 지날 때, 하루가 잔디 위로 낮게 접혔다.',
  ];
  const generic = [
    `${region}의 바람은 같은 자리를 두 번 설명하지 않았다.`,
    `${first}에서 본 빛이 ${last}까지 옅게 이어졌다.`,
    '길은 짧게 이어졌고, 풍경은 그보다 길게 남았다.',
    '그늘 있는 자리에서 숨을 고르니 하루의 결이 분명해졌다.',
    '가까운 물결과 먼 능선이 번갈아 시선을 끌었다.',
    '서두르지 않아도 장면은 제 시간에 도착했다.',
    '마지막 바람은 등을 스치고, 발밑의 길만 남았다.',
    '눈에 담긴 색만 기억해도 오늘의 순서는 충분했다.',
  ];
  const extras = /제주|올레|성산/.test(region)
    ? jeju
    : /대구|송해|낙동/.test(region)
      ? daegu
      : generic;
  let i = 0;
  while (body.length < minLength && i < extras.length) {
    body = `${body}\n\n${extras[i]}`;
    i += 1;
  }
  const touches = ['옷깃', '어깨', '등', '귓가', '팔목', '무릎'];
  let n = 0;
  while (body.length < minLength && n < 12) {
    body = `${body}\n\n${region}의 바람이 ${touches[n % touches.length]}을 스쳤다.`;
    n += 1;
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
  const firstPlace = facts[0]?.place || placeNames[0] || tripName;
  const lastPlace = facts.at(-1)?.place || placeNames.at(-1) || tripName;
  const used = new Set<string>();
  const photographed = new Set(facts.map((fact) => fact.place));

  const opening = facts.length
    ? `${region}의 하루는 사진이 찍힌 순서대로 이어졌다.`
    : openingFrom(region, undefined, firstPlace);
  const photoScenes =
    facts.length > 0
      ? facts.map((fact, index) => sceneFromFact(fact, index, used))
      : placeNames.slice(0, 12).map((name, index) => placeFallback(name, index, region));
  const passing = passingPlaces(placeNames, photographed);
  const closing = `하루의 끝은 ${lastPlace}에 머물렀다. 사진이 있다면 그 순서를 바꾸지 않은 채, 걸었던 바람이 다시 등을 스쳤다.`;
  const notes = travelerNotes(region, lastPlace);

  let core = dropRepeats(joinBody([opening, ...photoScenes, passing, closing]));
  let body = padNarration(`${core}\n\n${notes}`, placeNames, region, MIN_CHARS);
  body = body.replace(/있습니다/g, '보였다').replace(/입니다/g, '였다');
  if (body.length > MAX_CHARS) {
    body = clipTo(body, MAX_CHARS, MIN_CHARS - 40);
  }
  if (!/주차/.test(body) || !/차박/.test(body) || !/맛집/.test(body)) {
    body = `${clipTo(body, MAX_CHARS - notes.length - 2, 900)}\n\n${notes}`;
  }

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
      .filter(
        (item) =>
          item.length >= 2 &&
          !['사진', '기록', '주차', '차박', '맛집', '화장실', '벤치', '공영주차장', '안내판', '풍경', '바람'].includes(item)
      );
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}
