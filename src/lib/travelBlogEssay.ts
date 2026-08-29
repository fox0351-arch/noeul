import { PlaceItem } from '@/types/place';
import { TravelMapChecklistItem } from '@/types/travelMap';
import { photoFactsFromPlaces } from '@/lib/blog/photoFacts';
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

function joinBody(paragraphs: string[]): string {
  return paragraphs.filter((p) => p.trim()).join('\n\n');
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
  const haess = (body.match(/했습니다/g) || []).length;
  const listed = /오늘 고른 곳은|에 갔습니다\.|을 걸었습니다\./.test(body);
  return (
    n >= 1000 &&
    n <= 1500 &&
    /주차/.test(body) &&
    /차박/.test(body) &&
    /맛집|식당|국밥|순두부|회|밀면/.test(body) &&
    haess <= 1 &&
    !listed
  );
}

function openingLine(region: string, firstPlace: string): string {
  if (/제주/.test(region) || /제주|성산|섭지|한라/.test(firstPlace)) {
    return `제주의 아침은 ${firstPlace}에서 시작된다. 바다 위로 번지는 햇살과 함께 능선이 천천히 모습을 드러낸다.`;
  }
  if (/대구|송해/.test(region) || /송해/.test(firstPlace)) {
    return `${region}의 하루는 ${firstPlace}에서 열린다. 강바람이 먼저 옷깃을 스치고, 넓은 공원이 발밑에서 숨을 고른다.`;
  }
  if (/부산|해운대|광안/.test(region)) {
    return `${region}의 공기는 ${firstPlace} 앞에서 먼저 달라진다. 파도 소리가 멀리서 가까워지고, 도시와 바다가 한 화면에 겹친다.`;
  }
  if (/강릉|경포|정동진/.test(region)) {
    return `동해의 바람은 ${firstPlace}에서 하루를 연다. 솔향과 파도가 번갈아 길을 안내한다.`;
  }
  return `${region}의 여행은 ${firstPlace}에서 첫 장면을 고른다. 서두르지 않아도 풍경은 제자리에 있다.`;
}

function placeNarration(name: string, index: number, query: string, caption?: string, tags?: string[]): string {
  if (caption && caption.length > 8) {
    return caption.endsWith('.') || caption.endsWith('다') ? caption : `${caption}.`;
  }
  const amenity = placeAmenity({ name }, query);
  const tag = (tags || []).join(' ');
  if (/바다|해변|해수욕/.test(`${name} ${tag}`)) {
    const sea = [
      `${name}에서는 물빛이 발끝 가까이까지 밀려온다. ${amenity.oneLiner}.`,
      `${name} 앞바다는 얕고 맑다. 멀리 섬 그림자가 한 점으로 남는다.`,
      `${name}${eunNeun(name)} 모래보다 바람이 먼저 말을 건넨다.`,
    ];
    return sea[index % sea.length];
  }
  if (/산|오름|국립공원/.test(`${name} ${tag}`)) {
    const mountain = [
      `${name}의 능선이 하늘과 맞닿아 천천히 기울어진다. 발걸음보다 바람이 먼저 올라간다.`,
      `${name}으로 오르는 길은 가파르기보다 길다. 구름이 어깨 높이에서 머문다.`,
      `${name} 아래 숲그늘이 먼저 서늘하다.`,
    ];
    return mountain[index % mountain.length];
  }
  if (/굴|동굴/.test(name)) {
    return `${name} 안은 서늘하다. 돌 벽이 옛 물길을 기억하듯 길게 이어진다.`;
  }
  if (/공원|습지|휴양림/.test(name)) {
    const park = [
      `${name}${eunNeun(name)} 그늘과 벤치가 먼저 편하다. ${amenity.oneLiner}.`,
      `${name}을 한 바퀴 돌면 발밑이 평탄하고, 시선은 멀리 열린다.`,
    ];
    return park[index % park.length];
  }
  if (/섬|우도/.test(name)) {
    return `${name}${eunNeun(name)} 배 시간에 맞춰 들어간다. 작은 섬의 길은 짧고, 바다는 넓다.`;
  }
  const variants = [
    `${name}으로 이어지는 길에서 ${amenity.oneLiner}이 눈에 담긴다.`,
    `${name}에 닿자 풍경의 결이 바뀐다. ${amenity.oneLiner}.`,
    `${name}${eunNeun(name)} 오래 머물지 않아도 장면이 남는다.`,
  ];
  return variants[index % variants.length];
}

function eunNeun(word: string): string {
  const ch = word.charAt(word.length - 1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '는';
  return (code - 0xac00) % 28 === 0 ? '는' : '은';
}

function amenityLine(label: string, text: string): string {
  const stripped = text
    .trim()
    .replace(/^(주차는|차박은)\s*/, '')
    .replace(/해안 차박은/, '해안은')
    .replace(/주차장 밤샘은/, '밤샘은');
  return `${label} ${stripped}`;
}

function closingEssay(region: string, lastPlace: string): string {
  return joinBody([
    `하루의 끝은 ${lastPlace}에 머문다. 사진이 있다면 그 순서를 바꾸지 않는 편이 오늘의 호흡과 맞는다.`,
    `돌아보면 ${region}${eunNeun(region)} 빠르게 스친 곳이 아니라, 바람과 그늘을 고르며 걸은 길에 가깝다.`,
  ]);
}

function padNarration(text: string, placeNames: string[], region: string, minLength: number): string {
  let body = text.trim();
  const first = placeNames[0] || region;
  const last = placeNames.at(-1) || region;
  const jeju = [
    '성산 쪽 능선과 서쪽 얕은 바다가 하루 안에서 서로 다른 빛을 낸다.',
    '올레 이정표는 짧게 보이고, 바다는 그보다 오래 남는다.',
    '현무암 돌담 너머로 유채가 한 줄 남아 길을 부드럽게 만든다.',
    `${first}에서 받은 바람이 ${last}에 이를 때까지 끊기지 않는다.`,
    '배 시간과 해 질 무렵만 기억해도 제주의 하루는 충분하다.',
    '오름 아래 그늘에 앉으면 멀리 섬 그림자가 점처럼 남는다.',
    '광치기 검은 모래 위로 파도가 짧게 다녀간다.',
    '포구의 작은 배가 줄에 묶여 흔들릴 때, 하루가 천천히 접힌다.',
  ];
  const daegu = [
    '낙동강 바람이 공원 잔디를 한 겹 눕힌다.',
    '동상 앞 공터는 넓고, 강물은 그보다 더 넓다.',
    '은행잎이 쌓인 벤치에서 한숨 고르면 도시의 소음이 멀어진다.',
    `${first}의 평지가 ${last}까지 천천히 이어진다.`,
    '다리 아래를 지나는 강바람이 옷깃을 먼저 스친다.',
    '해 질 녘 강물이 은빛으로 잠시 멈춘 듯 보인다.',
    '놀이터 미끄럼틀이 오후 햇살을 받고, 그 옆 산책로는 한산하다.',
    '카페 창가의 커피잔이 식을 때까지 강은 같은 자리를 지킨다.',
  ];
  const generic = [
    `${region}의 바람은 같은 자리를 두 번 설명하지 않는다.`,
    `${first}에서 본 빛이 ${last}까지 옅게 이어진다.`,
    '길은 짧게 이어지고, 풍경은 그보다 길게 남는다.',
    '그늘 있는 자리에서 숨을 고르면 하루의 결이 분명해진다.',
    '가까운 물결과 먼 능선이 번갈아 시선을 끈다.',
    '서두르지 않아도 장면은 제 시간에 도착한다.',
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
  return body;
}

function regionFiller(region: string): string {
  if (/제주|올레|성산/.test(region)) {
    return joinBody([
      '제주의 하루는 능선과 바다를 한 호흡으로 잇는다. 사진 순서를 바꾸지 않은 채 바람과 그늘만 골라 걸으면, 해 질 무렵 발걸음이 느려질 때 오늘의 결이 가장 분명해진다.',
      '포구와 오름 사이, 같은 문장을 되풀이하지 않아도 장면은 남아 있다. 배 시간을 놓치지 않고 돌아 나오는 길에도 바다는 제자리에 있다.',
    ]);
  }
  if (/대구|송해|낙동/.test(region)) {
    return joinBody([
      '대구의 하루는 강바람과 공원의 그늘을 번갈아 고른다. 동상 앞을 지나 강둑에 서면 도시의 속도가 한 박자 늦춰지고, 남은 것은 넓은 물결과 천천히 식는 햇살이다.',
      '벤치에 앉으면 강은 같은 자리를 지킬 뿐이다. 산책로가 평탄해서, 멀리 보지 않아도 하루가 부드럽게 접힌다.',
      '놀이터와 카페 창가를 지나 다시 강으로 시선을 두면, 오늘의 기록이 사진 순서와 맞닿는다.',
    ]);
  }
  return joinBody([
    `${region}의 하루는 속도를 줄인 자리에 있다. 눈에 담긴 결만 남기고 같은 문장을 되풀이하지 않아도, 돌아보면 그늘과 바람이 오늘의 길을 설명한다.`,
    '마지막 장면은 서둘러 닫히지 않는다. 발밑의 길과 머리 위의 하늘이 번갈아 하루를 증언한다.',
  ]);
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

  const opening = openingLine(region, firstPlace);
  const scenes =
    facts.length > 0
      ? facts.map((fact, index) =>
          placeNarration(fact.place, index, region, fact.caption, fact.visualTags)
        )
      : placeNames.slice(0, 10).map((name, index) => placeNarration(name, index, region));

  const notesAmenity = placeAmenity({ name: lastPlace }, region);
  const notes = joinBody([
    amenityLine('주차는', notesAmenity.parking),
    amenityLine('차박은', notesAmenity.carCamping),
    `맛집은 ${notesAmenity.restaurants.slice(0, 3).join(', ')}가 하루를 닫기에 충분하다.`,
  ]);
  const closing = closingEssay(region, lastPlace);
  let core = padNarration(joinBody([opening, ...scenes, closing]), placeNames, region, 900);
  let body = `${core}\n\n${notes}`;
  if (body.length < 1020) {
    const filler = regionFiller(region);
    if (!core.includes(filler.slice(0, 20))) core = `${core}\n\n${filler}`;
    body = `${core}\n\n${notes}`;
  }
  if (body.length < 1000) {
    core = `${core}\n\n${region}의 마지막 숨은 풍경 쪽에 남아, 총평처럼 하루를 닫는다.`;
    body = `${core}\n\n${notes}`;
  }
  body = clipTo(body, 1500);

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
