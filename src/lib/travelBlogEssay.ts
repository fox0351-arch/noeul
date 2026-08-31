import { PlaceItem } from '@/types/place';
import { TravelMapChecklistItem } from '@/types/travelMap';
import {
  compactPhotoFacts,
  photoFactsFromPlaces,
  type OrderedPhotoFact,
} from '@/lib/blog/photoFacts';

export type ReviewParagraph = {
  photoLabel: string;
  order: number;
  text: string;
  usedTags: string[];
  fromScene: boolean;
  sceneDescription: string;
  analysis: {
    caption: string;
    sceneDescription: string;
    ocrText: string[];
    objects: string[];
    landmark: string;
    hasPeople: boolean;
    peopleCount: number;
    action: string;
    expression: string;
    weather: string;
    landscapeType: string;
  };
};

export interface TravelBlogDraft {
  title: string;
  body: string;
  hashtags: string[];
  seoKeywords: string[];
  markdown: string;
  charCount: number;
  photoCount: number;
  usedPhotoFacts: number;
  usedPhotoOrders: number[];
  usedPlaces: string[];
  paragraphs: ReviewParagraph[];
  usedPhotoTags: string[];
  prompt: string;
  analysisJson: ReturnType<typeof compactPhotoFacts>;
}

export const GENERIC_FLUFF =
  /그늘이 보이면 잠시 앉았다|물소리가 들리면 걸음을 늦추|표지 하나, 물소리 하나|표지판을 따라 걸었다|풍경이 오래 남았다|침묵이 길었다|색이 바뀌는 자리|같은 장소를 두고도 빛은 매번 달랐다|사진 사이의 빈 칸은 걸음으로 메웠다|그늘과 양지가 번갈아|하루의 순서는 발이 아니라 셔터가|기억은 이름이 아니라 각도에 남았다|셔터와 셔터 사이|주차는 목적지 앞에서 자리를 살핀|차박은 안내판을 보고 나서야|글자가 사진에 보였다|이 사진에 보였다|숫자가 눈에 들어왔다/;

const GUIDEBOOK =
  /방문했습니다|좋았습니다|추천합니다|유명합니다|있습니다|관광지입니다|아름다운 관광지/;

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function logReviewTrace(tag: string, payload: unknown): void {
  const text = JSON.stringify(payload, null, 2);
  console.log(tag);
  console.log(text);
  if (typeof window === 'undefined') return;
  const w = window as Window & { __NOEUL_REVIEW_TRACE?: Record<string, unknown> };
  w.__NOEUL_REVIEW_TRACE = { ...(w.__NOEUL_REVIEW_TRACE || {}), [tag]: payload };
}

function joinBody(paragraphs: string[]): string {
  return paragraphs.filter((p) => p.trim()).join('\n\n');
}

function endsSentence(text: string): boolean {
  return /[.다요]$/.test(text.trim());
}

function toSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return endsSentence(trimmed) ? trimmed : `${trimmed}.`;
}

const REVIEW_MIN_CHARS = 500;
const REVIEW_MAX_CHARS = 800;

export function reviewMeetsRules(body: string): boolean {
  const n = body.trim().length;
  const haess = (body.match(/했습니다/g) || []).length;
  const listed = /오늘 고른 곳은|에 갔습니다\./.test(body);
  const longParagraph = body.split(/\n\n+/).some((part) => {
    const sentences = part.match(/다\.|요\./g) || [];
    return sentences.length > 3;
  });
  return (
    n >= REVIEW_MIN_CHARS &&
    n <= REVIEW_MAX_CHARS &&
    haess <= 2 &&
    !listed &&
    !longParagraph &&
    !/\[사진\d+\]/.test(body) &&
    !/웅장한|장엄한|신비로운/.test(body) &&
    !GUIDEBOOK.test(body) &&
    !GENERIC_FLUFF.test(body)
  );
}

export function photoTags(fact: OrderedPhotoFact): string[] {
  return unique(
    [
      fact.sceneDescription,
      fact.action,
      fact.expression,
      fact.weather,
      fact.landscapeType,
      fact.ageEstimate,
    ].filter(Boolean)
  );
}

function isSceneText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  if (GENERIC_FLUFF.test(trimmed)) return false;
  return /다\.|있다|찍|걷|서 |앉아|웃|입|바라|들고|빛|눈|흐리|맑|부부|사람/.test(trimmed);
}

function stripExaggeration(text: string): string {
  return text
    .replace(/자라나 멋진 절경을 만들어내고 있다/g, '자라고 있었다')
    .replace(/부딪히며 (?:장엄한 )?풍경을 만들고 있다/g, '부딪히고 있었다')
    .replace(/시간의 흐름과 자연의 신비를 담은\s*/g, '')
    .replace(/웅장하고\s+/g, '')
    .replace(/장엄하고\s+/g, '')
    .replace(/경이로운\s*/g, '')
    .replace(/이국적인\s*/g, '')
    .replace(/신비로운\s*/g, '')
    .replace(/웅장하게\s*/g, '')
    .replace(/웅장한\s*/g, '')
    .replace(/장엄한\s*/g, '')
    .replace(/신비롭게\s*/g, '')
    .replace(/자아내고 있다/g, '보였다')
    .replace(/만들고 있다/g, '보였다')
    .replace(/보여준다/g, '보였다')
    .replace(/가득 담겨 있다/g, '가까이 보였다')
    .replace(/자리 잡고 있다/g, '놓여 있었다')
    .replace(/거칠고\s+/g, '거친 ')
    .replace(/ 및 /g, '와 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toSpokenPast(text: string): string {
  let next = stripExaggeration(text);
  next = next.replace(/늘어서 있다\.?$/, '늘어서 있었다.');
  next = next.replace(/펼쳐져 있다\.?$/, '펼쳐져 있었다.');
  next = next.replace(/세워져 있다\.?$/, '세워져 있었다.');
  next = next.replace(/솟아 있다\.?$/, '솟아 있었다.');
  next = next.replace(/자라고 있었다\.?$/, '자라고 있었다.');
  next = next.replace(/자라나 /g, '자라고 ');
  if (/있다\.?$/.test(next) && !/있었다\.?$/.test(next)) {
    next = next.replace(/있다\.?$/, '있었다.');
  }
  return toSentence(next);
}

function sentenceCount(text: string): number {
  return (text.replace(/\[사진\d+\]/g, ' ').match(/다\.|요\./g) || []).length;
}

function usableOcr(item: string, scene: string): boolean {
  const trimmed = item.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 40) return false;
  if (scene.includes(trimmed)) return false;
  if (/[가-힣]/.test(trimmed)) return true;
  if (/\d/.test(trimmed)) return true;
  if (/\s/.test(trimmed) && /[A-Za-z]{3,}/.test(trimmed)) return true;
  return false;
}

function sentenceFromPhoto(fact: OrderedPhotoFact): { text: string; usedTags: string[]; fromScene: boolean } {
  const scene = (fact.sceneDescription || fact.caption).trim();
  const used: string[] = [];
  const parts: string[] = [];
  const fromScene = isSceneText(scene);

  if (fromScene) {
    parts.push(toSpokenPast(scene));
    used.push('sceneDescription');
    if (fact.action) used.push(fact.action);
    if (fact.expression) used.push(fact.expression);
    if (fact.weather) used.push(fact.weather);
  } else {
    parts.push('이 사진의 장면을 충분히 읽지 못했다.');
  }

  const extraOcr = fact.ocrText.filter((item) => usableOcr(item, scene) && /\d/.test(item)).slice(0, 1);
  if (fromScene && extraOcr.length && sentenceCount(parts.join(' ')) < 3) {
    parts.push(`표지에 ${extraOcr[0]}이 적혀 있었다.`);
    used.push(extraOcr[0]);
  }

  const landmarkOcr = fact.ocrText.filter((item) => usableOcr(item, scene) && /Candle Rock/i.test(item)).slice(0, 1);
  if (fromScene && landmarkOcr.length && sentenceCount(parts.join(' ')) < 3) {
    parts.push(`안내에는 ${landmarkOcr[0]}이라고 적혀 있었다.`);
    used.push(landmarkOcr[0]);
  }

  return { text: parts.slice(0, 3).join(' ').trim(), usedTags: unique(used), fromScene };
}

export function buildTracedParagraphs(facts: OrderedPhotoFact[]): ReviewParagraph[] {
  return facts.map((fact) => {
    const { text, usedTags, fromScene } = sentenceFromPhoto(fact);
    return {
      photoLabel: fact.fileName || `사진${fact.order}`,
      order: fact.order,
      text,
      usedTags,
      fromScene,
      sceneDescription: fact.sceneDescription || fact.caption,
      analysis: {
        caption: fact.caption,
        sceneDescription: fact.sceneDescription || fact.caption,
        ocrText: fact.ocrText,
        objects: fact.objects,
        landmark: fact.landmark,
        hasPeople: fact.hasPeople,
        peopleCount: fact.peopleCount,
        action: fact.action,
        expression: fact.expression,
        weather: fact.weather,
        landscapeType: fact.landscapeType,
      },
    };
  });
}

export function formatTracedBody(paragraphs: ReviewParagraph[]): string {
  return joinBody(paragraphs.map((item) => item.text).filter(Boolean));
}

function photoBlob(fact: OrderedPhotoFact): string {
  return `${fact.sceneDescription} ${fact.caption} ${fact.ocrText.join(' ')} ${fact.objects.join(' ')}`;
}

function allBlob(facts: OrderedPhotoFact[]): string {
  return facts.map(photoBlob).join(' ');
}

type SceneBeat = {
  order: number;
  key: string;
  sentence: string;
  source: 'sceneDescription' | 'BEAT_RULES';
  sceneDescription: string;
};

const BEAT_RULES: { key: string; test: RegExp; sentence: string }[] = [
  { key: 'deck', test: /데크/, sentence: '데크길을 천천히 걸었다. 아내가 손 잡으라 해서 손을 잡았다.' },
  { key: 'candle', test: /촛대/, sentence: '촛대바위 앞에서 한참 섰다. 아내가 사진보다 낫다 해서 더 봤다.' },
  { key: 'tsunami', test: /지진해일|대피/, sentence: '노란 안내판을 한번 읽고 지나갔다. 마음이 좀 무거워 말이 줄었다.' },
  { key: 'seongsan', test: /성산일출봉/, sentence: '성산일출봉 앞에서 사진을 한 장 남겼다. 아내가 생각보다 가깝다 해서 더 봤다.' },
  { key: 'sunrise', test: /(?<!성산)일출|주황빛 노을/, sentence: '해 뜰 때 바람이 더 찼다. 둘이 아무 말 없이 그 자리에 섰다.' },
  { key: 'arch', test: /해식 아치/, sentence: '멀리 아치 바위가 보여 발길을 돌리기 아쉬웠다. 아내도 한 번만 더 보자 했다.' },
  { key: 'canola', test: /유채/, sentence: '돌담 옆 유채를 보다가 걸음을 멈췄다. 노란 꽃이 눈에 편해 잠시 앉았다.' },
  { key: 'basalt', test: /현무암/, sentence: '현무암 돌담을 손으로 짚으며 걸었다. 돌이 따뜻해 마음이 놓였다.' },
  { key: 'olle', test: /올레/, sentence: '올레 이정표 앞에서 길을 찾았다. 아내가 화살표를 짚어 주더라.' },
  { key: 'gwangchigi', test: /광치기/, sentence: '광치기 모래를 걷다 파도에 신발이 젖었다. 아내가 웃어서 나도 웃었다.' },
  { key: 'walk-two', test: /나란히 걸음/, sentence: '둘이 보조를 맞춰 걸었다. 말은 적어도 발은 맞아서 편했다.' },
  { key: 'oreum', test: /오름/, sentence: '오름 쪽으로 걸음을 늦췄다. 해가 넘어가는 게 보여 잠시 섰다.' },
  { key: 'fish', test: /자리돔/, sentence: '구운 자리돔을 나눠 먹었다. 간이 세서 물을 더 찾았다.' },
  { key: 'harbor', test: /포구/, sentence: '포구 배를 잠깐 보다 지나갔다. 줄이 삐걱거려 걸음을 멈췄다.' },
  { key: 'silvergrass', test: /억새/, sentence: '억새 사이를 걸었다. 아내가 머리 붙잡으라 해서 모자를 눌러 썼다.' },
  { key: 'horizon', test: /수평선/, sentence: '수평선이 잦아들 때까지 서 있었다. 발이 저릴 때까지 그 자리에 있었다.' },
  { key: 'statue', test: /송해 선생님 동상|동상/, sentence: '송해 선생님 동상 앞에서 사진을 찍었다. 아내가 고개 숙여 인사하길래 나도 따라 했다.' },
  { key: 'nakdong', test: /낙동강/, sentence: '낙동강을 보며 벤치에 앉았다. 강바람이 시원해 한동안 일어서지 못했다.' },
  { key: 'ginkgo', test: /은행/, sentence: '벤치의 은행잎을 손으로 쓸어 보았다. 노란 잎이 손에 붙어 웃었다.' },
  { key: 'path', test: /산책로/, sentence: '산책로를 천천히 걸었다. 아내가 손 잡으라 해서 손을 잡았다.' },
  { key: 'reeds', test: /갈대/, sentence: '갈대 옆을 걸었다. 아내가 바스락 소리 난다 해서 귀를 기울였다.' },
  { key: 'playground', test: /놀이터|미끄럼/, sentence: '놀이터 앞에서 잠깐 섰다. 예전에 애들 생각이 나 마음이 뭉클했다.' },
  { key: 'cafe', test: /카페|커피/, sentence: '카페에 들러 커피를 마셨다. 창가 자리가 따뜻해 오래 앉았다.' },
  { key: 'river-wind', test: /강바람/, sentence: '다리 아래를 지나다 걸음을 늦췄다. 강바람이 시원해 숨을 골랐다.' },
  { key: 'songhae-gate', test: /송해공원/, sentence: '나오면서 표석에 송해공원이라 적힌 걸 다시 봤다. 편히 쉬다 온 기분이었다.' },
  { key: 'peak', test: /정상석/, sentence: '정상석 앞에 서서 숨을 골랐다. 다리가 후들거려 잠시 앉았다.' },
  { key: 'rime', test: /상고대/, sentence: '상고대 가지를 올려다보다 목이 아팠다. 아내가 하얀 꽃 같다 했다.' },
  { key: 'hamtaek', test: /함백산/, sentence: '함백산 쪽을 가리켰다. 아내가 눈이 부시다 해서 모자를 눌러 줬다.' },
  { key: 'germany', test: /독일마을/, sentence: '독일마을 아래를 내려다봤다. 아내가 여기서 밥 먹자 해서 고개를 끄덕였다.' },
  { key: 'skywalk', test: /설리스카이워크/, sentence: '설리스카이워크 난간을 잡고 걸었다. 아래가 보여 다리가 굳었다.' },
  { key: 'bridge', test: /출렁/, sentence: '출렁다리 위에서 손을 흔들었다. 아내가 천천히 가라 해서 발을 낮췄다.' },
  { key: 'yew', test: /주목/, sentence: '눈 덮인 나무 아래에서 목을 움츠렸다. 눈이 옷에 떨어져 털어 냈다.' },
  { key: 'rice', test: /다랑이논/, sentence: '돌담 옆 논을 가리켜 보았다. 아내가 층이 많다 해서 같이 세어 봤다.' },
  { key: 'hwangtae', test: /황태/, sentence: '구운 생선을 나눠 먹었다. 손이 기름져서 둘이 웃었다.' },
  { key: 'spring', test: /검룡소|샘물/, sentence: '샘물에 손을 담가 보았다. 차가워서 이내 빼고 웃었다.' },
  { key: 'walk-rocks', test: /절벽|암석|기암|물결무늬|회색 바위|바위 틈|늘어서|뾰족/, sentence: '바위 옆을 지나다 다리가 좀 아팠다. 아내가 천천히 가라 해서 보조를 맞췄다.' },
  { key: 'sand', test: /모래사장/, sentence: '모래 위를 걷다 신발을 벗고 싶어졌다. 파도 소리가 가까워 걸음을 늦췄다.' },
];

function digitOcr(fact: OrderedPhotoFact): string {
  return fact.ocrText.find((item) => /\d/.test(item) && item.trim().length <= 12) || '';
}

function beatsFromFacts(facts: OrderedPhotoFact[]): SceneBeat[] {
  const used = new Set<string>();
  const beats: SceneBeat[] = [];
  for (const fact of facts) {
    const scene = (fact.sceneDescription || '').trim();
    if (scene) {
      beats.push({
        order: fact.order,
        key: `scene-${fact.order}`,
        sentence: toSpokenPast(scene),
        source: 'sceneDescription',
        sceneDescription: scene,
      });
      continue;
    }
    const blob = photoBlob(fact);
    if (!blob.replace(/\s+/g, '')) continue;
    let picked: SceneBeat | null = null;
    for (const rule of BEAT_RULES) {
      if (!rule.test.test(blob) || used.has(rule.key)) continue;
      used.add(rule.key);
      picked = {
        order: fact.order,
        key: rule.key,
        sentence: rule.sentence,
        source: 'BEAT_RULES',
        sceneDescription: '',
      };
      break;
    }
    const digit = digitOcr(fact);
    if (digit && !beats.some((beat) => beat.sentence.includes(digit))) {
      const extra = `표지에 ${digit}가 적혀 있더라.`;
      if (picked) picked = { ...picked, sentence: `${picked.sentence} ${extra}` };
      else if (!used.has(`digit-${digit}`)) {
        used.add(`digit-${digit}`);
        picked = {
          order: fact.order,
          key: `digit-${digit}`,
          sentence: extra,
          source: 'BEAT_RULES',
          sceneDescription: '',
        };
      }
    }
    if (picked) beats.push(picked);
  }
  return beats;
}

function firstSceneFact(facts: OrderedPhotoFact[]): OrderedPhotoFact | undefined {
  return facts.find((fact) => (fact.sceneDescription || '').trim());
}

function lastSceneFact(facts: OrderedPhotoFact[]): OrderedPhotoFact | undefined {
  return [...facts].reverse().find((fact) => (fact.sceneDescription || '').trim());
}

function introFrom(facts: OrderedPhotoFact[]): {
  text: string;
  source: 'sceneDescription' | 'template';
  sceneDescription: string | null;
} {
  const first = firstSceneFact(facts);
  if (first) {
    const scene = first.sceneDescription.trim();
    return { text: toSpokenPast(scene), source: 'sceneDescription', sceneDescription: scene };
  }
  const head = facts[0] ? photoBlob(facts[0]) : '';
  const whole = allBlob(facts);
  if (/촛대|추암/.test(head) || (/촛대|추암/.test(whole) && !/정상석|올레|송해/.test(head))) {
    return {
      text: '아내랑 부산에서 일찍 차를 몰고 나왔다. 추암 해안을 한번 보자 했다. 차에서 내리니 바람이 차서 옷깃을 여몄다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/성산일출봉|올레/.test(head) || /성산일출봉|올레/.test(whole)) {
    return {
      text: '아내랑 부산에서 일찍 나왔다. 올레길을 한번 걸어 보자 했다. 차에서 내리니 바다가 먼저 보였다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/송해/.test(head) || /송해/.test(whole)) {
    return {
      text: '아내랑 둘이 나왔다. 송해공원에 잠깐 들르자 했다. 강바람이 낮아 걷기 좋았다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/정상석|태백산/.test(head)) {
    return {
      text: '아내랑 부산에서 일찍 나왔다. 산길을 한번 올라보자 했다. 숨이 차올랐다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/모래사장/.test(head)) {
    return {
      text: '아내랑 둘이 바닷가에 섰다. 파도 소리가 먼저 왔다. 걸음은 느렸다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  return {
    text: '아내랑 부산에서 일찍 나왔다. 그날 본 것만 적어 본다. 발걸음은 느렸다.',
    source: 'template',
    sceneDescription: null,
  };
}

function closeFrom(facts: OrderedPhotoFact[]): {
  text: string;
  source: 'sceneDescription' | 'template';
  sceneDescription: string | null;
} {
  const last = lastSceneFact(facts);
  if (last) {
    const scene = last.sceneDescription.trim();
    return { text: toSpokenPast(scene), source: 'sceneDescription', sceneDescription: scene };
  }
  const tail = facts.length ? photoBlob(facts[facts.length - 1]) : '';
  if (/촛대|출렁|해식 아치/.test(tail)) {
    return {
      text: '돌아가는 차 안에서 아내가 다음에 또 오재 하더라. 나도 그러자고 했다. 다리가 아팠지만 마음은 편했다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/모래사장/.test(tail)) {
    return {
      text: '신발에 모래가 남아 털었다. 아내가 다음에 또 걷자 했다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/수평선|노을|주황/.test(tail)) {
    return {
      text: '돌아가는 길에 아내가 다음에 또 걷자 했다. 발이 저렸지만 마음은 편했다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/송해공원|표석/.test(tail)) {
    return {
      text: '입구를 나오며 아내가 다음에 또 오재 하더라. 나도 고개를 끄덕였다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/샘물|검룡소|정상석/.test(tail)) {
    return {
      text: '내려오는 길에 아내가 다음에 또 오재 하더라. 다리가 후들거렸지만 마음은 편했다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  if (/파도|바다/.test(tail)) {
    return {
      text: '돌아가는 차 안에서 말이 적었다. 아내가 다음에 또 오재 하더라. 마음은 편했다.',
      source: 'template',
      sceneDescription: null,
    };
  }
  return {
    text: '돌아가는 차 안에서 아내가 다음에 또 오재 하더라. 나도 그러자고 했다. 마음은 편했다.',
    source: 'template',
    sceneDescription: null,
  };
}

function reviewTitle(facts: OrderedPhotoFact[], titleSeed: string): string {
  const blob = allBlob(facts);
  if (/촛대/.test(blob)) return '아내랑 다녀온 추암 촛대바위';
  if (/성산일출봉|올레/.test(blob)) return '아내랑 걸어 본 제주 올레';
  if (/송해/.test(blob)) return '아내랑 다녀온 송해공원';
  return `아내랑 다녀온 ${titleSeed.trim() || '하루'}`;
}

function packStory(beats: SceneBeat[]): string[] {
  const sentences: string[] = [];
  for (const beat of beats) {
    sentences.push(...splitSentences(beat.sentence));
  }
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paras.push(sentences.slice(i, i + 3).join(' '));
  }
  return paras;
}

function clipEssay(body: string, max: number): string {
  if (body.length <= max) return body;
  const parts = body.split(/\n\n+/);
  while (parts.length > 2 && parts.join('\n\n').length > max) {
    const mid = Math.max(1, parts.length - 2);
    parts.splice(mid, 1);
  }
  let text = parts.join('\n\n');
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const idx = Math.max(sliced.lastIndexOf('다.'), sliced.lastIndexOf('요.'));
  return (idx > 200 ? text.slice(0, idx + 2) : sliced).trim();
}

function growEssay(
  body: string,
  beats: SceneBeat[],
  min: number,
  max: number
): {
  body: string;
  extra: string;
  source: 'sceneDescription' | 'none';
  sceneDescriptions: string[];
} {
  const sceneDescriptions = unique(
    beats.filter((beat) => beat.source === 'sceneDescription' && beat.sceneDescription.trim()).map((beat) => beat.sceneDescription.trim())
  );
  if (body.length >= min) {
    return { body, extra: '', source: 'none', sceneDescriptions };
  }
  const extra = unique(sceneDescriptions.map((scene) => toSpokenPast(scene))).join(' ');
  if (!extra) {
    return { body, extra: '', source: 'none', sceneDescriptions };
  }
  const parts = body.split(/\n\n+/);
  const ending = parts.length > 1 ? (parts.pop() as string) : '';
  const next = joinBody(ending ? [...parts, extra, ending] : [body, extra]);
  if (next.length > max || body.includes(extra)) {
    return { body, extra, source: 'sceneDescription', sceneDescriptions };
  }
  return { body: next, extra, source: 'sceneDescription', sceneDescriptions };
}

function copiesScene(facts: OrderedPhotoFact[], body: string): boolean {
  return facts.some((fact) => {
    const scene = (fact.sceneDescription || fact.caption).trim();
    return scene.length >= 20 && body.includes(scene);
  });
}

function logSceneDescriptionUsed(facts: OrderedPhotoFact[], beats: SceneBeat[], body: string): void {
  const paragraphs = body.split(/\n\n+/).filter((part) => part.trim());
  const payload = {
    photos: facts.map((fact) => {
      const beat = beats.find((item) => item.order === fact.order);
      const scene = (fact.sceneDescription || '').trim();
      return {
        order: fact.order,
        sceneDescription: scene,
        used: beat?.source === 'sceneDescription',
        source: beat?.source ?? 'none',
        sentence: beat?.sentence ?? '',
      };
    }),
    paragraphs: paragraphs.map((text, index) => {
      const matched = beats.filter((beat) => {
        if (beat.source !== 'sceneDescription' || !beat.sceneDescription) return false;
        return text.includes(beat.sentence) || text.includes(beat.sceneDescription);
      });
      return {
        paragraphIndex: index + 1,
        text,
        sceneDescription: matched.map((beat) => beat.sceneDescription),
        source: matched.length ? 'sceneDescription' : 'not-sceneDescription',
        photoOrders: matched.map((beat) => beat.order),
      };
    }),
  };
  logReviewTrace('[REVIEW-TRACE] sceneDescription-used', payload);
}

/** legacy 템플릿 후기. A/B 비교용. 삭제하지 말 것. */
function composeCoupleEssay(facts: OrderedPhotoFact[]): { body: string; usedOrders: number[] } {
  const ok = facts.filter((fact) => (fact.sceneDescription || fact.caption || fact.ocrText.join('')).trim());
  if (ok.length === 0) {
    logSceneDescriptionUsed(facts, [], '사진에서 그날의 장면을 읽지 못했다. 글로 남기기엔 부족했다.');
    return { body: '사진에서 그날의 장면을 읽지 못했다. 글로 남기기엔 부족했다.', usedOrders: [] };
  }
  const beats = beatsFromFacts(facts);
  const intro = introFrom(facts);
  const close = closeFrom(facts);
  logReviewTrace('[REVIEW-TRACE] intro-source', {
    source: intro.source,
    sceneDescription: intro.sceneDescription,
    text: intro.text,
  });
  logReviewTrace('[REVIEW-TRACE] close-source', {
    source: close.source,
    sceneDescription: close.sceneDescription,
    text: close.text,
  });
  const middle = packStory(beats);
  let body = joinBody([intro.text, ...middle, close.text]);
  const beforeGrow = body.length;
  const grown = growEssay(body, beats, REVIEW_MIN_CHARS, REVIEW_MAX_CHARS);
  logReviewTrace('[REVIEW-TRACE] growEssay-source', {
    source: grown.source,
    sceneDescriptions: grown.sceneDescriptions,
    extra: grown.extra,
    added: grown.body !== body,
    beforeLength: beforeGrow,
    afterLength: grown.body.length,
  });
  body = grown.body;
  const afterGrow = body.length;
  body = clipEssay(body, REVIEW_MAX_CHARS);
  const afterClip = body.length;
  const trimmed = body.trim();
  logSceneDescriptionUsed(facts, beats, trimmed);
  console.log('[PROOF] composeCoupleEssay RAN', {
    file: 'src/lib/travelBlogEssay.ts',
    fn: 'composeCoupleEssay',
    REVIEW_MIN_CHARS,
    REVIEW_MAX_CHARS,
    beforeGrow,
    afterGrow,
    afterClip,
    beatCount: beats.length,
  });
  if (typeof window !== 'undefined') {
    (window as Window & { __NOEUL_LENGTH_TRACE?: unknown }).__NOEUL_LENGTH_TRACE = {
      file: 'src/lib/travelBlogEssay.ts',
      fn: 'composeCoupleEssay',
      REVIEW_MIN_CHARS,
      REVIEW_MAX_CHARS,
      beforeGrow,
      afterGrow,
      afterClip,
      beatCount: beats.length,
      body: trimmed,
    };
  }
  return { body: trimmed, usedOrders: unique(beats.map((beat) => String(beat.order))).map(Number) };
}

function blogSeo(
  facts: OrderedPhotoFact[],
  places: PlaceItem[],
  query = ''
): { keywords: string[]; hashtags: string[]; origin: { tag: string; from: 'selectedPlaces' | 'landmark' | 'course' | 'region'; value: string }[] } {
  const origin: { tag: string; from: 'selectedPlaces' | 'landmark' | 'course' | 'region'; value: string }[] = [];
  const push = (raw: string, from: (typeof origin)[number]['from'], value: string) => {
    const word = raw.replace(/^#/, '').replace(/\s+/g, '').trim();
    if (word.length < 2 || word.length > 12) return;
    const tag = `#${word}`;
    if (origin.some((item) => item.tag === tag)) return;
    origin.push({ tag, from, value });
  };

  for (const place of places) {
    push(place.name, 'selectedPlaces', place.name);
  }
  for (const fact of facts) {
    const landmark = (fact.landmark || '').trim();
    if (!landmark || /^(없음|해당 없음|알 수 없음)$/.test(landmark)) continue;
    push(landmark, 'landmark', landmark);
  }

  const courseHay = [query, ...places.map((place) => `${place.name} ${place.address}`)].join(' ');
  if (/갈맷길/.test(courseHay)) {
    push('갈맷길', 'course', courseHay);
    const courseMatch = courseHay.match(/갈맷길\s*(\d+)\s*(?:-\s*\d+)?\s*코스/) || courseHay.match(/(\d+)\s*-\s*\d+\s*코스/);
    if (courseMatch?.[1]) push(`갈맷길${courseMatch[1]}코스`, 'course', courseMatch[0]);
  }

  const regionHay = [query, ...places.map((place) => place.address || '')].join(' ');
  if (/기장/.test(regionHay)) push('기장여행', 'region', regionHay);
  if (/부산/.test(regionHay)) push('부산걷기여행', 'region', regionHay);
  if (/제주/.test(regionHay)) push('제주여행', 'region', regionHay);
  if (/강릉/.test(regionHay)) push('강릉여행', 'region', regionHay);
  if (/대구/.test(regionHay)) push('대구여행', 'region', regionHay);
  if (/해운대/.test(regionHay)) push('해운대', 'region', regionHay);

  const hashtags = origin.map((item) => item.tag).slice(0, 12);
  const keywords = hashtags.map((tag) => tag.replace(/^#/, ''));
  logReviewTrace('[REVIEW-TRACE] hashtag-source', { hashtags, origin, usedOcr: false });
  return { keywords, hashtags, origin };
}

export function reviewSeoFromFacts(
  facts: OrderedPhotoFact[],
  places: PlaceItem[],
  query = ''
): { keywords: string[]; hashtags: string[] } {
  const seo = blogSeo(facts, places, query);
  return { keywords: seo.keywords, hashtags: seo.hashtags };
}

function factsTableRows(facts: OrderedPhotoFact[]) {
  return facts.map((fact) => ({
    sceneDescription: fact.sceneDescription,
    mood: fact.mood,
    objects: (fact.objects ?? []).join(', '),
    ocrText: (fact.ocrText ?? []).join(', '),
  }));
}

function logFinalPromptBeforeReview(
  prompt: string,
  analysisJson: ReturnType<typeof compactPhotoFacts>,
  places: PlaceItem[]
): void {
  const prompt5000 = prompt.slice(0, 5000);
  const sceneDescription = analysisJson.map((item) => ({
    order: item.order,
    fileName: item.fileName,
    sceneDescription: item.sceneDescription,
    includedInPrompt: item.sceneDescription.length > 0 && prompt.includes(item.sceneDescription),
  }));
  const selectedPlaces = places.map((place) => ({
    id: place.id,
    name: place.name,
    address: place.address,
    photoCount: place.photos?.length ?? 0,
  }));
  const selectedPlaceNamesInPrompt = selectedPlaces.map((place) => ({
    name: place.name,
    includedInPrompt: place.name.length > 0 && prompt.includes(place.name),
  }));

  console.log('[REVIEW-TRACE] final-prompt');
  console.log(prompt5000);
  logReviewTrace('[REVIEW-TRACE] final-prompt-photoFacts', analysisJson);
  logReviewTrace('[REVIEW-TRACE] final-prompt-sceneDescription', sceneDescription);
  logReviewTrace('[REVIEW-TRACE] final-prompt-selectedPlaces', {
    selectedPlaces,
    selectedPlaceNamesInPrompt,
  });

  if (typeof window === 'undefined') return;
  const w = window as Window & { __NOEUL_REVIEW_TRACE?: Record<string, unknown> };
  w.__NOEUL_REVIEW_TRACE = {
    ...(w.__NOEUL_REVIEW_TRACE || {}),
    '[REVIEW-TRACE] final-prompt': prompt5000,
  };
}

export function generateTravelBlogFromFacts(
  facts: OrderedPhotoFact[],
  titleSeed: string,
  places: PlaceItem[] = [],
  query = ''
): TravelBlogDraft {
  const rows = factsTableRows(facts);
  const success = facts.filter((fact) => (fact.sceneDescription || fact.caption).trim()).length;
  console.log('[facts] generateTravelBlogFromFacts 진입 직후 facts.length=', facts.length, 'titleSeed=', titleSeed);
  console.log('[facts] generateTravelBlogFromFacts 성공 사진 수=', success, '실패 사진 수=', facts.length - success);
  console.table(rows);
  if (typeof window !== 'undefined') {
    const w = window as Window & {
      __NOEUL_FACTS?: Record<string, unknown>;
    };
    w.__NOEUL_FACTS = {
      ...(w.__NOEUL_FACTS || {}),
      'generateTravelBlogFromFacts 진입 직후': {
        'facts.length': facts.length,
        성공: success,
        실패: facts.length - success,
        rows,
      },
    };
  }
  const analysisJson = compactPhotoFacts(facts);
  const prompt = `후기는 60대 부산 부부가 실제 여행 후 네이버 블로그에 남긴 글이다.
풍경 설명보다 경험, 감정, 대화, 걷는 과정, 느낀 점을 중심으로 쓴다.
사진 설명을 나열하지 말고 하나의 자연스러운 이야기로 연결한다.
sceneDescription을 복사하거나 [사진N]으로 쓰지 마라.
짧은 문장. 웅장·장엄·신비 금지. 500~800자.
검색어는 무시하고 사진에서 읽힌 장소명만 자연스럽게 쓴다.

사진 분석 JSON(자료):
${JSON.stringify(analysisJson, null, 2)}`;
  logFinalPromptBeforeReview(prompt, analysisJson, places);

  const title = reviewTitle(facts, titleSeed);
  const paragraphs = buildTracedParagraphs(facts);
  const essay = composeCoupleEssay(facts);
  const body = essay.body;
  console.log('[TRACE-1] review.content 생성 직후', body);
  const usedPhotoTags = unique(paragraphs.flatMap((item) => item.usedTags));
  const seo = blogSeo(facts, places, query);
  const usedPhotoOrders = essay.usedOrders;

  if (typeof window !== 'undefined') {
    console.log('[REVIEW-TRACE] 4-final-prompt');
    console.log(prompt.slice(0, 5000));
    logReviewTrace('[REVIEW-TRACE] 4-final-prompt', prompt.slice(0, 5000));
    console.log('[노을-review] 후기 생성 입력 프롬프트 전문\n' + prompt);
    console.log('[노을-review] 사진 분석 JSON 전문\n' + JSON.stringify(analysisJson, null, 2));
    console.log('[노을-review] 문단별 사용 태그', paragraphs.map((item) => ({
      photo: item.photoLabel,
      usedTags: item.usedTags,
      text: item.text,
    })));
    console.log('[노을-review] 최종 JSON', JSON.stringify({
      title,
      content: body,
      keywords: seo.keywords,
      hashtags: seo.hashtags,
    }, null, 2));
  }

  return {
    title,
    body,
    hashtags: seo.hashtags,
    seoKeywords: seo.keywords,
    markdown: [`# ${title}`, '', body].join('\n'),
    charCount: body.length,
    photoCount: facts.length,
    usedPhotoFacts: usedPhotoOrders.length,
    usedPhotoOrders,
    usedPlaces: unique(facts.map((fact) => fact.place || fact.landmark).filter(Boolean)),
    paragraphs,
    usedPhotoTags,
    prompt,
    analysisJson,
  };
}

export function generateTravelBlogEssay(input: {
  title: string;
  memo: string;
  checklist: TravelMapChecklistItem[];
  places: PlaceItem[];
  query?: string;
}): TravelBlogDraft {
  const facts = photoFactsFromPlaces(input.places);
  const tripName = input.title.trim() || input.query?.trim() || input.places[0]?.name || '여행';
  console.log('[facts] generateTravelBlogEssay → photoFactsFromPlaces (photoFactsFromScenes 없음)');
  console.table(factsTableRows(facts));
  console.log('[REVIEW-TRACE] 3-vectorDB', { invoked: false });
  logReviewTrace(
    '[REVIEW-TRACE] 1-photo-facts',
    facts.map((fact) => ({
      order: fact.order,
      fileName: fact.fileName,
      ocrText: fact.ocrText ?? [],
      sceneDescription: fact.sceneDescription ?? '',
      caption: fact.caption ?? '',
      keywords: fact.keywords ?? [],
      landmark: fact.landmark ?? '',
      place: fact.place ?? '',
      objects: fact.objects ?? [],
    }))
  );
  return generateTravelBlogFromFacts(facts, tripName, input.places, input.query);
}

export function reviewJson(essay: TravelBlogDraft): {
  title: string;
  content: string;
  keywords: string[];
  hashtags: string[];
} {
  return {
    title: essay.title,
    content: essay.body,
    keywords: essay.seoKeywords ?? [],
    hashtags: essay.hashtags,
  };
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\[사진\d+\]/g, ' ')
    .split(/(?<=다\.|요\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function stripRepeatedNarration(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  const usedPrefix = new Set<string>();
  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    if (GENERIC_FLUFF.test(paragraph)) continue;
    const sentences = splitSentences(paragraph);
    const keptSentences: string[] = [];
    for (const sentence of sentences) {
      if (GENERIC_FLUFF.test(sentence)) continue;
      const prefix = sentence.replace(/\s+/g, '').slice(0, 28);
      if (prefix && usedPrefix.has(prefix)) continue;
      if (prefix) usedPrefix.add(prefix);
      keptSentences.push(sentence);
    }
    if (keptSentences.length) kept.push(keptSentences.join(' ').trim());
  }
  return joinBody(kept);
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
          !['사진', '기록', '주차', '차박', '맛집', '화장실', '벤치', '공영주차장', '안내판', '풍경', '바람', '글자가', '사진에', '보였다', '눈에', '들어왔다'].includes(item)
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

export function sentenceSimilarity(a: string, b: string): number {
  const normalize = (sentence: string) =>
    sentence.replace(/\[사진\d+\]/g, '').replace(/[^\w가-힣]/g, '').trim();
  const left = new Set(splitSentences(a).map(normalize).filter((item) => item.length >= 6));
  const right = new Set(splitSentences(b).map(normalize).filter((item) => item.length >= 6));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const sentence of left) {
    if (right.has(sentence)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

export function sceneDescriptionShare(paragraphs: ReviewParagraph[]): number {
  let sceneChars = 0;
  let total = 0;
  for (const item of paragraphs) {
    const body = item.text.replace(/\[사진\d+\]/g, '').trim();
    total += body.length;
    const scene = (item.sceneDescription || '').trim();
    if (item.fromScene && scene) {
      sceneChars += Math.min(scene.length, body.length);
    }
  }
  if (total === 0) return 0;
  return sceneChars / total;
}

export function templateResidueSimilarity(a: string, b: string, photoTokens: string[]): number {
  const strip = (text: string) => {
    let next = text.replace(/\[사진\d+\]/g, ' ');
    for (const token of photoTokens.sort((x, y) => y.length - x.length)) {
      if (token.length < 2) continue;
      next = next.split(token).join(' ');
    }
    return next;
  };
  return essaySimilarity(strip(a), strip(b));
}

