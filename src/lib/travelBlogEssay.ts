import { PlaceItem } from '@/types/place';
import { TravelMapChecklistItem } from '@/types/travelMap';

export interface TravelBlogDraft {
  title: string;
  body: string;
  hashtags: string[];
  markdown: string;
  charCount: number;
}

const MIN_CHARS = 1500;
const MAX_CHARS = 2500;

function slugTag(value: string): string {
  const cleaned = value.replace(/[^\w가-힣]/g, '');
  return cleaned.slice(0, 12);
}

function joinBody(paragraphs: string[]): string {
  return paragraphs.filter((p) => p.trim()).join('\n\n');
}

function trimToMax(body: string): string {
  if (body.length <= MAX_CHARS) return body;
  let cut = body.slice(0, MAX_CHARS);
  const lastStop = Math.max(cut.lastIndexOf('다.'), cut.lastIndexOf('요.'), cut.lastIndexOf('다 '));
  if (lastStop > MIN_CHARS) {
    cut = cut.slice(0, lastStop + 2);
  }
  return cut.trim();
}

function extraReflections(input: {
  title: string;
  places: PlaceItem[];
  memo: string;
  checklist: TravelMapChecklistItem[];
}): string[] {
  const names = input.places.map((place) => place.name);
  const first = names[0];
  const last = names[names.length - 1];
  const photoTotal = input.places.reduce((sum, place) => sum + (place.photos?.length ?? 0), 0);
  const done = input.checklist.filter((item) => item.completed).map((item) => item.text);
  const pending = input.checklist.filter((item) => !item.completed).map((item) => item.text);
  const memoBits = input.memo.trim();

  return [
    `우리는 더 이상 많이 보는 여행을 하지 않는다. ${input.title}에서도 욕심을 부리지 않고, 발걸음이 가는 곳에만 머물렀다. 같은 풍경을 두 번 바라보는 시간이 오히려 기억에 더 오래 남았다.`,
    first && last && first !== last
      ? `${first}에서 시작된 하루가 ${last}에 닿을 무렵, 아내는 물병을 흔들어 보이며 웃었다. 멀리 가지 않아도 충분한 날이었다.`
      : `천천히 걷다 보니 시계를 보지 않아도 마음이 먼저 저녁을 알고 있었다.`,
    photoTotal > 0
      ? `숙소에 돌아와 오늘 남긴 사진 ${photoTotal}장을 함께 넘겼다. 잘 나온 장면보다, 우리가 그 자리에 있었다는 사실이 더 소중했다.`
      : `사진을 많이 남기지 못한 날도 있다. 그래도 둘이 나눈 말들이 곧 앨범이 되었다.`,
    memoBits
      ? `수첩에 적어 둔 말을 다시 읽으니 그때의 바람과 발자국이 선명하다. "${memoBits.slice(0, 80)}${memoBits.length > 80 ? '…' : ''}" 이 한 줄이 오늘의 중심이었다.`
      : `특별한 계획을 세우지 않아도, 둘이 보조를 맞추는 일 자체가 여행이었다.`,
    done.length
      ? `미리 ${done.slice(0, 3).join(', ')}을(를) 해 둔 덕분에 길을 헤매지 않았다. 나이를 먹을수록 준비는 낭만을 해치지 않고, 오히려 여유를 만든다.`
      : `즉흥으로 나선 길이었지만, 서로를 챙기는 습관만큼은 예전과 같았다.`,
    pending.length
      ? `미처 다하지 못한 ${pending.slice(0, 2).join(', ')}은(는) 아쉬움으로 남긴다. 다음에 오면 그때의 숙제가 또 다른 핑계가 되리라.`
      : `오늘은 챙긴 것들을 대부분 해냈다. 그 사실이 발끝을 가볍게 했다.`,
    `60대를 지나며 우리는 풍경보다 속도를 먼저 고르게 되었다. 누군가에게는 평범한 코스일지 몰라도, 우리 부부에게는 오래 간직할 하루의 문장이다.`,
    `돌아가는 차 안에서 아내는 창밖을 보다가 짧게 말했다. 내일은 더 천천히 걷자고. 나는 대답 대신 손을 잡아 드렸다.`,
    names.length >= 3
      ? `${names.slice(0, 3).join(', ')}을(를) 이어서 걸으니 지도 위의 점들이 하나의 이야기로 붙었다. 순서를 바꿔 보지 않은 것이 오히려 잘한 일이었다.`
      : `짧은 동선이었기에 숨이 차지 않았고, 그만큼 서로를 더 자주 바라볼 수 있었다.`,
  ].filter((line): line is string => Boolean(line));
}

function placeNarration(place: PlaceItem, index: number, total: number): string {
  const order =
    index === 0 ? '첫 발걸음은' : index === total - 1 ? '마지막 장소는' : `${index + 1}번째로 향한 곳은`;
  const rating =
    typeof place.rating === 'number'
      ? `사람들이 남긴 별점은 ${place.rating}점이었지만, 숫자보다 눈앞의 공기가 먼저 말을 걸었다.`
      : `유명한 점수표보다, 우리 둘이 느낀 온도가 더 정확했다.`;
  const memo = place.memo?.trim();
  const memoLine = memo
    ? `수첩에는 이렇게 적어 두었다. "${memo}" 나중에 읽어도 그 순간의 숨결이 남아 있을 문장이다.`
    : `따로 적을 말은 짧았지만, 어깨를 나란히 하고 선 시간이 곧 기록이었다.`;
  const photoCount = place.photos?.length ?? 0;
  const photoLine =
    photoCount > 0
      ? `이곳에 남긴 사진이 ${photoCount}장이다. 아내의 뒷모습, 발밑의 그림자, 바람에 흔들린 가장자리까지 허투루 버리지 않았다.`
      : `셔터를 많이 누르지 않았다. 눈으로 오래 담아 두는 쪽을 택했다.`;
  const address = place.address?.trim()
    ? `${place.address} 근처를 천천히 걸으며, 이정표보다 발바닥의 감촉을 믿었다.`
    : `주소보다 풍경이 먼저 우리를 안내했다.`;

  return `${order} ${place.name}였다. ${address} ${rating} ${memoLine} ${photoLine}`;
}

export function generateTravelBlogEssay(input: {
  title: string;
  memo: string;
  checklist: TravelMapChecklistItem[];
  places: PlaceItem[];
}): TravelBlogDraft {
  const tripName = input.title.trim() || '우리들의 여행';
  const places = input.places;
  const title = `${tripName}, 둘이서 천천히 걸은 하루`;

  const opening = [
    `우리는 서두르지 않기로 했다. ${tripName}이라는 이름만 가방에 넣고, 아침 공기를 먼저 마셨다.`,
    `60대를 지나온 부부에게 여행은 더 이상 정복이 아니다. 서로의 걸음 속도를 맞추는 일이고, 같은 풍경을 다른 마음으로 바라보는 일이다.`,
    input.memo.trim()
      ? `떠나기 전 적어 둔 여행 메모가 오늘의 나침반이 되었다. ${input.memo.trim()}`
      : `거창한 일정표 대신, 발길이 머무는 곳을 차례로 이으며 하루를 쌓아 올렸다.`,
  ];

  const checklistIntro = (() => {
    if (input.checklist.length === 0) return '';
    const done = input.checklist.filter((item) => item.completed).map((item) => item.text);
    const pending = input.checklist.filter((item) => !item.completed).map((item) => item.text);
    const doneLine = done.length ? `이미 표시해 둔 일은 ${done.join(', ')}이다.` : '아직 완료 표시는 많지 않았다.';
    const pendingLine = pending.length
      ? `남은 ${pending.join(', ')}은(는) 길 위에서 천천히 채우기로 했다.`
      : '준비 목록은 거의 비어 마음까지 가벼웠다.';
    return `여행 전에 적어 둔 작은 숙제들이 있었다. ${doneLine} ${pendingLine} 그런 사소한 확인이 있어야 풍경을 더 오래 바라볼 수 있다.`;
  })();

  const placeParagraphs = places.map((place, index) => placeNarration(place, index, places.length));

  const closing = `하루를 접으며 나는 아내에게 물었다. 내일도 이렇게 걸어 볼까. 대답은 짧았고, 미소는 길었다. ${tripName}의 기억은 명소의 목록이 아니라, 둘이 나란히 선 시간의 결이다.`;

  let paragraphs = [...opening, checklistIntro, ...placeParagraphs, closing];
  let body = joinBody(paragraphs);

  const extras = extraReflections({
    title: tripName,
    places,
    memo: input.memo,
    checklist: input.checklist,
  });
  let extraIndex = 0;
  while (body.length < MIN_CHARS && extraIndex < extras.length) {
    paragraphs = [...paragraphs.slice(0, -1), extras[extraIndex], closing];
    body = joinBody(paragraphs);
    extraIndex += 1;
  }

  while (body.length < MIN_CHARS) {
    paragraphs = [
      ...paragraphs.slice(0, -1),
      `같은 길을 되짚으며 우리는 말이 줄었다. 침묵 속에서도 발소리가 대화를 대신했고, ${tripName}의 하루는 그렇게 천천히 깊어졌다.`,
      closing,
    ];
    body = joinBody(paragraphs);
    if (body.length > MAX_CHARS) break;
  }

  body = trimToMax(body);
  if (body.length < MIN_CHARS) {
    body = `${body}\n\n우리는 오늘을 자랑하지 않기로 했다. 다만 오래 기억하기로 했다.`.slice(0, MAX_CHARS);
  }

  const tags = new Set<string>(['부부여행', '60대여행', '여행에세이', '노을여행', slugTag(tripName)].filter(Boolean));
  places.forEach((place) => {
    const tag = slugTag(place.name);
    if (tag) tags.add(tag);
  });
  const hashtags = [...tags].slice(0, 10).map((tag) => `#${tag}`);

  const markdownSections = [
    `# ${title}`,
    '',
    body,
    '',
    ...places.flatMap((place, index) => {
      const photos = place.photos ?? [];
      if (photos.length === 0) return [] as string[];
      return [
        `## ${index + 1}. ${place.name} 사진`,
        ...photos.map((photo, photoIndex) => `![${place.name} ${photoIndex + 1}](${photo.dataUrl})`),
        '',
      ];
    }),
    '## 해시태그',
    hashtags.join(' '),
  ];

  return {
    title,
    body,
    hashtags,
    markdown: markdownSections.join('\n'),
    charCount: body.length,
  };
}
