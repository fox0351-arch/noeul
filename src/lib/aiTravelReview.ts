import { generateGeminiJsonObject } from '@/lib/photoAi';
import { compactPhotoFacts } from '@/lib/blog/photoFacts';

export type AiReviewFact = ReturnType<typeof compactPhotoFacts>[number];

export type AiReviewPlace = {
  name: string;
  address: string;
};

export function buildAiReviewPrompt(input: {
  photoFacts: AiReviewFact[];
  selectedPlaces: AiReviewPlace[];
  titleSeed: string;
}): string {
  return `너는 네이버 블로그용 한국어 여행 후기를 쓰는 작가다. JSON만 출력하라.
제목 씨앗: ${input.titleSeed}

규칙:
- 본문 500~1000자
- 60대 부산 부부가 다녀온 실제 여행처럼 쓴다
- 시니어가 읽기 편한 짧은 문장
- 감성 여행 에세이
- 과장 금지 (웅장, 장엄, 신비 금지)
- 사진 속 내용만 사용
- 없는 경험·대화·장소를 지어내지 마라
- 장소 설명을 나열하지 마라
- 자연스러운 이야기 흐름
- 서술형 약 80%, 대화체 약 20%
- sceneDescription을 그대로 복사하거나 [사진N]으로 쓰지 마라

사진 분석(photoFacts):
${JSON.stringify(input.photoFacts, null, 2)}

선택 장소(selectedPlaces). 본문에 쓸 때는 사진 분석과 맞는 이름만 써라:
${JSON.stringify(input.selectedPlaces, null, 2)}

형식: {"title":"...","content":"..."}`;
}

export async function generateAiTravelReview(input: {
  photoFacts: AiReviewFact[];
  selectedPlaces: AiReviewPlace[];
  titleSeed: string;
}): Promise<{ title: string; content: string; prompt: string } | null> {
  const prompt = buildAiReviewPrompt(input);
  console.log('[REVIEW-TRACE] ai-review-prompt');
  console.log(prompt.slice(0, 5000));
  const json = await generateGeminiJsonObject({
    prompt,
    maxOutputTokens: 4096,
    temperature: 0.6,
    logFullPrompt: true,
  });
  if (!json || typeof json !== 'object') return null;
  const record = json as { title?: unknown; content?: unknown };
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const content = typeof record.content === 'string' ? record.content.trim() : '';
  if (!title || !content) return null;
  return { title, content, prompt };
}
