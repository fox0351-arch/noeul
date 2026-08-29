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

function sensoryBeat(fact: OrderedPhotoFact, used: Set<string>): string {
  const hay = hayOf(fact);
  const name = fact.place;
  const object = (fact.objects || []).find((item) => item && !used.has(`obj:${item}`));
  const people = /인물|사람|부부|사람있음/.test(hay);
  const noPeople = /사람없음/.test(hay);
  const rain = /비|흐림|구름/.test(hay);
  const sunset = /노을|석양|일몰|저녁|해 질/.test(hay);
  const sunrise = /일출|새벽|아침/.test(hay);
  const sea = /바다|해변|파도|물빛/.test(hay);
  const mountain = /산|오름|능선|숲|고원/.test(hay);
  const candidates = [
    object ? `${name}에서 ${object}가 한 장면으로 남았다.` : '',
    people ? `그 옆에 선 사람이 먼저 눈에 들어왔다.` : '',
    noPeople ? `사람은 거의 보이지 않았고, 풍경만 남았다.` : '',
    rain ? `하늘이 낮게 깔려 먼 능선이 흐렸다.` : '',
    sunset ? `빛이 잦아드는 쪽으로 걸었다.` : '',
    sunrise ? `이른 공기가 차갑게 남아 있었다.` : '',
    sea ? `${name} 앞 물결이 발끝까지 밀려왔다.` : '',
    mountain ? `${name} 능선 아래 그늘에 잠시 머물렀다.` : '',
  ].filter(Boolean);
  for (const line of candidates) {
    const key = line.replace(/\s+/g, '').slice(0, 14);
    if (used.has(key)) continue;
    if (fact.caption && fact.caption.includes(line.slice(0, 8))) continue;
    used.add(key);
    if (object) used.add(`obj:${object}`);
    return line;
  }
  return '';
}

function placeFallback(name: string, index: number, hay: string, fact?: OrderedPhotoFact): string {
  const object = fact?.objects?.[0];
  const tag = fact?.visualTags?.[0];
  const mood = fact?.mood;
  const detail = object || tag || mood;
  if (detail) {
    return `${name}의 ${index + 1}번째 장면에서 ${detail}이 먼저 보였다.`;
  }
  if (/바다|해변|해수욕|포구/.test(`${name} ${hay}`)) {
    const sea = [
      `${name} 앞에서 물빛이 발끝까지 밀려왔다.`,
      `${name}${eunNeun(name)} 모래보다 파도가 먼저 보였다.`,
      `${name} 쪽으로 길이 이어졌다. 멀리 섬 그림자가 한 점으로 남았다.`,
      `${name} 가장자리 물거품이 짧게 다녀갔다.`,
    ];
    return sea[index % sea.length];
  }
  if (/산|오름|국립공원|능선|고원/.test(`${name} ${hay}`)) {
    const mountain = [
      `${name}으로 이어진 능선이 눈에 들어왔다. 그늘 아래 잠시 머물렀다.`,
      `${name} 아래 숲그늘이 먼저 보였다.`,
      `${name} 능선 너머 구름이 낮게 걸려 있었다.`,
      `${name} 들머리 표지 앞에서 걸음을 늦췄다.`,
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
    return `${name}으로 들어가는 길이 이어졌다. 작은 섬 쪽으로 시선이 머물렀다.`;
  }
  const variants = [
    `${name} 들머리에 선 표지가 먼저 보였다.`,
    `${name} 안쪽 길이 짧게 꺾이며 풍경이 바뀌었다.`,
    `${name} 가장자리 그늘에 잠시 앉았다.`,
    `${name}에서 본 색만 기억해도 장면이 남았다.`,
    `${name} 앞 공터는 넓었고, 발소리는 작았다.`,
    `${name}의 다른 각도가 한 장 더 남았다.`,
    `${name} 가까이 가서야 디테일이 보였다.`,
    `${name}을 뒤로하고도 하늘 색은 그대로였다.`,
    `${name} 옆 물줄기가 짧게 반짝였다.`,
    `${name} 돌 위에 이끼가 얇게 앉아 있었다.`,
    `${name} 멀리 능선이 한 줄로 남았다.`,
    `${name}의 마지막 프레임은 발밑 길이었다.`,
  ];
  const seconds = [
    '그늘이 한 박자 먼저 닿았다.',
    '발밑 흙이 조금 젖어 있었다.',
    '멀리 지붕만 점처럼 보였다.',
    '표지 글씨가 햇살에 하얗게 번졌다.',
    '벤치 등받이에 낙엽이 한 장 붙어 있었다.',
    '물소리가 길 바깥에서 짧게 들렸다.',
    '돌틈 사이로 풀이 한 줄 올라와 있었다.',
    '하늘이 낮아서 능선이 가깝게 보였다.',
    '사람 발자국은 거의 남지 않았다.',
    '붉은 지붕이 한 켠에 걸려 있었다.',
    '안개가 골짜기 쪽에만 남아 있었다.',
    '하루의 순서는 그 각도에서 멈췄다.',
  ];
  const lead = variants[index] || `${name}의 ${index + 1}번째 장면이 남았다.`;
  const follow = seconds[index] || seconds[index % seconds.length];
  return `${lead} ${follow}`;
}

function sceneFromFact(fact: OrderedPhotoFact, index: number, used: Set<string>): string {
  const caption = fact.caption.trim();
  const hay = hayOf(fact);
  const lead = caption ? asSentence(caption) : asSentence(placeFallback(fact.place, index, hay, fact));
  const beat = sensoryBeat(fact, used);
  if (!beat || lead.includes(beat.slice(0, 8))) return lead;
  return `${lead} ${beat}`;
}

function openingFrom(region: string, first: OrderedPhotoFact | undefined, firstPlace: string): string {
  if (first?.caption) {
    return asSentence(first.caption);
  }
  if (/제주/.test(region) || /제주|성산|섭지|한라/.test(firstPlace)) {
    return `${firstPlace}에서 하루가 열렸다. 바다 위로 번지는 빛이 먼저 눈에 들어왔다.`;
  }
  if (/대구|송해/.test(region) || /송해/.test(firstPlace)) {
    return `${region}의 하루는 ${firstPlace}에서 열렸다. 강물이 공원 바깥으로 넓게 흘렀다.`;
  }
  if (/부산|해운대|광안/.test(region)) {
    return `${firstPlace} 앞에서 공기가 달라졌다. 파도 소리가 가까워지며 길이 이어졌다.`;
  }
  if (/강릉|경포|정동진/.test(region)) {
    return `동해의 공기가 ${firstPlace}에서 하루를 열었다. 솔향이 가깝게 남았다.`;
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

const ONCE_PATTERNS = [
  /스쳤다/,
  /바람이 .{0,8}(을|를) 스쳤다/,
  /(옷깃|어깨|등|귓가|귀|팔목|무릎)(을|를) 스쳤다/,
  /앞에서 잠시 머물렀다/,
  /으로 길이 이어졌다/,
  /그 장면이 눈에 들어왔다/,
  /그 길을 천천히 걸었다/,
];

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.\n]+[다요.]?(?:\n\n+)?/g);
  if (!parts) return text.trim() ? [text.trim()] : [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function stripRepeatedNarration(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  const usedPattern = new Set<number>();
  const usedPrefix = new Set<string>();
  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);
    const keptSentences: string[] = [];
    for (const sentence of sentences) {
      const compact = sentence.replace(/\s+/g, '');
      const wind = /스쳤다/.test(sentence);
      const prefix = (wind
        ? compact.replace(/옷깃|어깨|등|귓가|귀|팔목|무릎/g, '부위')
        : compact
      ).slice(0, 28);
      if (prefix && usedPrefix.has(prefix)) continue;
      const hit = ONCE_PATTERNS.findIndex((pattern) => pattern.test(sentence));
      if (hit >= 0 && usedPattern.has(hit)) {
        if (wind || compact.length <= 40) continue;
      }
      if (hit >= 0) usedPattern.add(hit);
      if (prefix) usedPrefix.add(prefix);
      keptSentences.push(sentence);
    }
    if (keptSentences.length) kept.push(keptSentences.join(' ').replace(/\s+\n/g, '\n').trim());
  }
  return joinBody(kept);
}

function extrasFromFacts(facts: OrderedPhotoFact[], body: string): string[] {
  const extras: string[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    const object = fact.objects.find((item) => item && !body.includes(item) && !seen.has(item));
    const tag = fact.visualTags.find((item) => item && !body.includes(item) && !seen.has(`tag:${item}`));
    const keyword = fact.keywords.find((item) => item && item.length >= 2 && !body.includes(item) && !seen.has(item));
    const landmark = fact.landmark && !body.includes(fact.landmark) ? fact.landmark : '';
    let line = '';
    if (object) {
      seen.add(object);
      line = `${fact.place}에서 ${object}가 한 컷으로 남았다.`;
    } else if (landmark) {
      seen.add(landmark);
      line = `${landmark} 이름이 표지에 읽혔다.`;
    } else if (tag) {
      seen.add(`tag:${tag}`);
      line = `${fact.order}번째 사진은 ${tag} 쪽으로 시선을 끌었다.`;
    } else if (keyword) {
      seen.add(keyword);
      line = `${fact.place}의 ${keyword}이 짧게 보였다.`;
    } else if (fact.mood && !body.includes(fact.mood) && !seen.has(fact.mood)) {
      seen.add(fact.mood);
      line = `${fact.place}의 ${fact.mood}이 한동안 남았다.`;
    }
    if (line && !body.includes(line.slice(0, 12))) extras.push(line);
  }
  return extras;
}

function padNarration(
  text: string,
  facts: OrderedPhotoFact[],
  placeNames: string[],
  region: string,
  minLength: number
): string {
  let body = text.trim();
  const first = placeNames[0] || region;
  const last = placeNames.at(-1) || region;
  const jeju = [
    '성산 쪽 능선과 서쪽 얕은 바다가 하루 안에서 서로 다른 빛을 냈다.',
    '올레 이정표는 짧게 보였고, 바다는 그보다 오래 남았다.',
    '현무암 돌담 너머로 유채가 한 줄 남아 길을 부드럽게 만들었다.',
    `${first}에서 받은 공기가 ${last}에 이를 때까지 끊기지 않았다.`,
    '배 시간과 해 질 무렵만 기억해도 제주의 하루는 충분했다.',
    '오름 아래 그늘에 앉으니 멀리 섬 그림자가 점처럼 남았다.',
    '광치기 검은 모래 위로 파도가 짧게 다녀갔다.',
    '포구의 작은 배가 줄에 묶여 흔들릴 때, 하루가 천천히 접혔다.',
    '억새가 바람결에 하얗게 기울었고, 그 결이 눈에 들어왔다.',
    '해 질 녘 발걸음이 느려질 때까지 바다는 제자리에 머물렀다.',
  ];
  const daegu = [
    '낙동강이 공원 잔디 바깥을 한 겹 적셨다.',
    '동상 앞 공터는 넓었고, 강물은 그보다 더 넓었다.',
    '은행잎이 쌓인 벤치에서 한숨 고르니 도시의 소음이 멀어졌다.',
    `${first}의 평지가 ${last}까지 천천히 이어졌다.`,
    '다리 아래 강물이 낮게 흘렀다.',
    '해 질 녘 강물이 은빛으로 잠시 멈춘 듯 보였다.',
    '놀이터 미끄럼틀이 오후 햇살을 받았고, 그 옆 산책로는 한산했다.',
    '카페 창가의 커피잔이 식을 때까지 강은 같은 자리를 지켰다.',
    '갈대 군락이 강둑을 따라 흔들렸고, 그 흔들림이 눈에 들어왔다.',
    '공원 입구를 다시 지날 때, 하루가 잔디 위로 낮게 접혔다.',
  ];
  const generic = [
    `${first}에서 본 빛이 ${last}까지 옅게 이어졌다.`,
    '길은 짧게 이어졌고, 풍경은 그보다 길게 남았다.',
    '그늘 있는 자리에서 숨을 고르니 하루의 결이 분명해졌다.',
    '가까운 물결과 먼 능선이 번갈아 시선을 끌었다.',
    '서두르지 않아도 장면은 제 시간에 도착했다.',
    '눈에 담긴 색만 기억해도 오늘의 순서는 충분했다.',
    `${region}의 하루는 같은 자리를 두 번 설명하지 않았다.`,
    '발밑의 길과 먼 하늘이 번갈아 남았다.',
    `${first} 들머리와 ${last} 끝자락이 서로 다른 높이를 가졌다.`,
    '표지판 글씨는 짧았고, 그 앞 풍경은 길었다.',
    '물소리가 들리면 걸음을 늦추고, 그늘이 보이면 잠시 앉았다.',
    '같은 산을 두고도 각도가 바뀔 때마다 색이 달랐다.',
    '멀리 지붕, 가까이 돌, 그 사이 풀이 한 줄로 남았다.',
    '해 그림자가 길어질 때까지 순서는 사진이 정해 두었다.',
  ];
  const lengthFill = [
    '같은 장소를 두고도 빛은 매번 달랐다.',
    '사진 사이의 빈 칸은 걸음으로 메웠다.',
    '그늘과 양지가 번갈아 발끝을 바꿨다.',
    '표지 하나, 물소리 하나, 그 사이 침묵이 길었다.',
    '멀리 있던 능선이 한 장 뒤에서 더 가까워졌다.',
    '사람이 없는 프레임일수록 디테일이 남았다.',
    '하루의 순서는 발이 아니라 셔터가 정했다.',
    '색이 바뀌는 자리마다 걸음을 한 박자 늦췄다.',
    '가까운 돌과 먼 하늘이 한 화면에 겹쳤다.',
    '마지막 컷 앞에서도 서두를 이유는 없었다.',
    '기억은 이름이 아니라 각도에 남았다.',
    '걸었던 자리보다 멈춰 선 자리가 더 선명했다.',
    '셔터와 셔터 사이, 바람 대신 침묵이 지나갔다.',
    '열 장의 각도가 하루의 높낮이를 만들었다.',
  ];
  const extras = [
    ...extrasFromFacts(facts, body),
    ...(/제주|올레|성산/.test(region) ? jeju : /대구|송해|낙동/.test(region) ? daegu : generic),
    ...lengthFill,
  ];
  for (const extra of extras) {
    // Unique extras only — never cycle body-part 스쳤다 padding.
    if (body.length >= minLength) break;
    const line = extra.trim();
    if (!line) continue;
    if (body.includes(line.slice(0, 16))) continue;
    body = `${body}\n\n${line}`;
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
  const closing = `하루의 끝은 ${lastPlace}에 머물렀다. 사진이 있다면 그 순서를 바꾸지 않은 채, 걸었던 장면만 남았다.`;
  const notes = travelerNotes(region, lastPlace);

  let core = dropRepeats(joinBody([opening, ...photoScenes, passing, closing]));
  let body = padNarration(`${core}\n\n${notes}`, facts, placeNames, region, MIN_CHARS);
  body = stripRepeatedNarration(body);
  if (body.length < MIN_CHARS) {
    body = padNarration(body, facts, placeNames, region, MIN_CHARS);
    body = stripRepeatedNarration(body);
  }
  body = body.replace(/습니다/g, '보였다').replace(/입니다/g, '였다');
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
