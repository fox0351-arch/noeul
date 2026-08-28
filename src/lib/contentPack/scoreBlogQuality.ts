import type { BlogDraft, PhotoAnalysis } from '@/types/blog';
import type { ContentQualityScore } from '@/types/contentQuality';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

const PASS = 80;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function blogText(draft: BlogDraft): string {
  return [draft.title, draft.summary, draft.infoBox, draft.body, draft.intro, draft.story, draft.places, draft.closing]
    .filter(Boolean)
    .join('\n');
}

function countHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
}

export function scoreBlogQuality(input: {
  draft: BlogDraft;
  photos?: PhotoAnalysis[];
  galmaetgil?: GalmaetgilPlaceMatch[];
  rewritten?: boolean;
  rewriteCount?: number;
}): ContentQualityScore {
  const draft = input.draft;
  const text = blogText(draft);
  const reasons: string[] = [];
  const places = (input.photos ?? []).map((photo) => photo.place).filter(Boolean);
  const keywords = draft.seo?.keywords ?? [];
  const hashtags = draft.seo?.hashtags ?? [];
  const chars = draft.charCount || text.replace(/\s/g, '').length;

  let seo = 40;
  if (places.some((place) => text.includes(place))) seo += 15;
  else reasons.push('제목·본문에 장소명이 잘 드러나지 않습니다.');
  if (keywords.length >= 5) seo += 15;
  else reasons.push('SEO 키워드가 부족합니다.');
  if (hashtags.length >= 8) seo += 10;
  else reasons.push('검색용 해시태그가 적습니다.');
  if (chars >= 1500 && chars <= 2000) seo += 20;
  else if (chars >= 1000) {
    seo += 8;
    reasons.push('본문 길이가 1500~2000자 범위를 벗어났습니다.');
  } else {
    reasons.push('본문이 너무 짧아 검색 노출에 불리합니다.');
  }

  const sentences = text.split(/[.。!?]/).map((item) => item.trim()).filter(Boolean);
  const avg = sentences.length ? sentences.reduce((sum, item) => sum + item.length, 0) / sentences.length : 0;
  const paragraphs = text.split(/\n{2,}/).filter(Boolean).length;
  let readability = 30;
  if (paragraphs >= 4) readability += 20;
  else reasons.push('문단을 나눠 읽기 쉽게 다듬을 필요가 있습니다.');
  if (avg >= 18 && avg <= 70) readability += 25;
  else reasons.push('문장 길이가 고르지 않아 가독성이 떨어집니다.');
  if (!sentences.some((item) => item.length > 180)) readability += 15;
  else reasons.push('너무 긴 문장이 있습니다.');
  if (/다\.|었다|았다/.test(text)) readability += 10;

  let emotion = 25;
  const moodHits = countHits(text, [/걸음/, /바람/, /빛/, /하늘/, /천천히/, /그늘/, /바다/, /노을/]);
  emotion += Math.min(40, moodHits * 8);
  if (moodHits < 3) reasons.push('감각적인 묘사(빛, 바람, 걸음)가 더 필요합니다.');
  if (/었다|았다|였다/.test(text)) emotion += 20;
  else reasons.push('과거형 나레이션이 약합니다.');
  if (!/추천|강추|핫플|인생샷/.test(text)) emotion += 15;
  else reasons.push('광고·과장 표현이 감성을 해칩니다.');

  let travelInfo = 10;
  const infoHits = [
    [/주차/, '주차 정보'],
    [/화장실/, '화장실 정보'],
    [/난이도|걷기|도보/, '걷기 난이도'],
    [/맛집|카페|식당/, '맛집·카페'],
    [/차박|캠핑/, '차박 정보'],
  ] as const;
  for (const [pattern, label] of infoHits) {
    if (pattern.test(text)) travelInfo += 18;
    else reasons.push(`${label}가 본문에 없습니다.`);
  }

  const matched = (input.galmaetgil ?? []).filter((item) => item?.matched);
  let galmaetgil = 50;
  if (matched.length === 0) {
    galmaetgil = /갈맷길/.test(text) ? 70 : 85;
    if (/갈맷길/.test(text)) reasons.push('갈맷길 구간이 아닌데 갈맷길을 언급했습니다.');
  } else {
    galmaetgil = 20;
    if (matched.some((item) => text.includes(item.courseName))) galmaetgil += 25;
    else reasons.push('갈맷길 코스명이 본문에 없습니다.');
    if (matched.some((item) => text.includes(item.sectionName))) galmaetgil += 25;
    else reasons.push('갈맷길 구간명이 본문에 없습니다.');
    if (/갈맷길/.test(text)) galmaetgil += 15;
    else reasons.push('갈맷길이라는 이름이 본문에 없습니다.');
    if (matched.some((item) => item.parking && text.includes('주차'))) galmaetgil += 15;
  }

  const scores = {
    seo: clamp(seo),
    readability: clamp(readability),
    emotion: clamp(emotion),
    travelInfo: clamp(travelInfo),
    galmaetgil: clamp(galmaetgil),
  };
  const overall = clamp(
    (scores.seo + scores.readability + scores.emotion + scores.travelInfo + scores.galmaetgil) / 5
  );
  if (overall >= PASS && reasons.length > 3) reasons.splice(3);
  if (overall < PASS && reasons.length === 0) reasons.push('종합 점수가 기준(80점)에 못 미칩니다.');

  return {
    ...scores,
    overall,
    rewritten: Boolean(input.rewritten),
    rewriteCount: input.rewriteCount ?? 0,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
  };
}

export const QUALITY_PASS_SCORE = PASS;
