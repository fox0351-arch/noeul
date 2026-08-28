import type { GeminiAnalysisResult } from '@/types/geminiAnalysis';

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

function asHashtags(values: string[]): string[] {
  return values.map((item) => (item.startsWith('#') ? item : `#${item.replace(/^#+/, '')}`));
}

function moodFromScene(scene: string): string {
  if (scene === 'landscape') return '풍경 / 자연';
  if (scene === 'place') return '여행 / 관광 / 기념사진';
  if (scene === 'food') return '식사 / 맛집';
  if (scene === 'sunrise') return '일출 / 고요';
  if (scene === 'sunset') return '일몰 / 노을';
  if (scene === 'camping') return '차박 / 캠핑';
  return '';
}

function peopleCountFromUnknown(value: unknown, subjects: string[]): string {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return `${Math.round(value)}명`;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  const joined = subjects.join(' ');
  if (/부부/.test(joined)) return '2명';
  const hits = joined.match(/남성|여성|사람|관광객|아이|어린이/g);
  if (hits?.length) return `${hits.length}명`;
  return '';
}

export function parseGeminiAnalysisResult(value: unknown): GeminiAnalysisResult {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const caption = asText(record.caption);
  const landmark = asText(record.landmark);
  const placeName = asText(record.placeName) || landmark;
  const subjects = asStringList(record.subjects);
  const objects = asStringList(record.objects).length ? asStringList(record.objects) : subjects;
  const keywords = asStringList(record.keywords);
  const blogKeywords = asStringList(record.blogKeywords).length
    ? asStringList(record.blogKeywords)
    : keywords;
  const tags = asStringList(record.tags).length
    ? asHashtags(asStringList(record.tags))
    : asHashtags(blogKeywords);
  const scene = asText(record.scene);

  return {
    placeName,
    caption,
    peopleCount: peopleCountFromUnknown(record.peopleCount, subjects),
    mood: asText(record.mood) || moodFromScene(scene),
    estimatedLocation: asText(record.estimatedLocation) || landmark || placeName,
    objects,
    tags,
    blogKeywords,
    cardNewsCopy: asText(record.cardNewsCopy) || caption,
  };
}

export function displayGeminiField(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n') || '확인 불가';
  return value?.trim() ? value : '확인 불가';
}
