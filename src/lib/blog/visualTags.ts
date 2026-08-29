import type { PhotoAiAnalysis } from '@/types/place';

export const VISUAL_TAG_ORDER = ['풍경', '인물', '바다', '산', '꽃', '건물', '길'] as const;
export type VisualTag = (typeof VISUAL_TAG_ORDER)[number];

const TAG_PATTERNS: { tag: VisualTag; pattern: RegExp }[] = [
  { tag: '인물', pattern: /인물|사람|부부|가족|얼굴|portrait|people|person|couple/i },
  { tag: '바다', pattern: /바다|해안|해변|파도|수평선|갯벌|항구|포구|sea|ocean|beach|coast|wave/i },
  { tag: '산', pattern: /산|봉|능선|계곡|숲|나무|forest|mountain|hill|peak/i },
  { tag: '꽃', pattern: /꽃|벚꽃|유채|정원|화원|flower|blossom|garden/i },
  { tag: '건물', pattern: /건물|집|사찰|절|교회|등대|카페|식당|호텔|building|temple|lighthouse/i },
  { tag: '길', pattern: /길|올레|산책로|코스|탐방로|계단|trail|path|road|walkway/i },
  { tag: '풍경', pattern: /풍경|하늘|노을|일출|일몰|들판|호수|landscape|sky|sunset|sunrise/i },
];

export function classifyVisualTags(input: {
  scene?: string;
  caption?: string;
  subjects?: string[];
  keywords?: string[];
  landmark?: string;
}): VisualTag[] {
  const hay = [input.scene, input.caption, input.landmark, ...(input.subjects ?? []), ...(input.keywords ?? [])]
    .filter(Boolean)
    .join(' ');
  const tags: VisualTag[] = [];
  for (const { tag, pattern } of TAG_PATTERNS) {
    if (pattern.test(hay) && !tags.includes(tag)) tags.push(tag);
  }
  if (input.scene === 'landscape' && !tags.includes('풍경')) tags.unshift('풍경');
  if (input.scene === 'food' && !tags.includes('건물')) tags.push('건물');
  return tags.slice(0, 5);
}

export function analysisVisualTags(analysis?: PhotoAiAnalysis | null): VisualTag[] {
  if (!analysis) return [];
  if (analysis.visualTags?.length) {
    return analysis.visualTags.filter((tag): tag is VisualTag =>
      (VISUAL_TAG_ORDER as readonly string[]).includes(tag)
    );
  }
  return classifyVisualTags(analysis);
}
