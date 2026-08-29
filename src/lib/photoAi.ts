import { classifyVisualTags } from '@/lib/blog/visualTags';
import { parseGeminiAnalysisResult } from '@/lib/geminiAnalysis';
import { PhotoAiAnalysis, PhotoAiScene } from '@/types/place';
import type { GeminiAnalysisResult } from '@/types/geminiAnalysis';

const SCENES: PhotoAiScene[] = [
  'landscape',
  'place',
  'food',
  'sunrise',
  'sunset',
  'camping',
  'other',
];

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function asScene(value: unknown): PhotoAiScene {
  return typeof value === 'string' && SCENES.includes(value as PhotoAiScene)
    ? (value as PhotoAiScene)
    : 'other';
}

function cleanCaption(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[`"*]/g, '')
    .replace(/추천|강추|필수|최고|핫플|인생샷|꼭 가/g, '')
    .trim()
    .slice(0, 200);
}

function asKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function asConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function normalizeAnalysis(value: unknown): PhotoAiAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    scene?: unknown;
    caption?: unknown;
    subjects?: unknown;
    keywords?: unknown;
    confidence?: unknown;
    landmark?: unknown;
    visualTags?: unknown;
    mood?: unknown;
    weather?: unknown;
    timeOfDay?: unknown;
    colorTone?: unknown;
    peopleCount?: unknown;
  };
  const caption = cleanCaption(record.caption);
  if (!caption) return null;
  const subjects = Array.isArray(record.subjects)
    ? record.subjects.filter((item): item is string => typeof item === 'string').slice(0, 6)
    : [];
  const extras = [record.mood, record.weather, record.timeOfDay, record.colorTone]
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 20))
    .filter(Boolean);
  if (typeof record.peopleCount === 'number') {
    extras.push(record.peopleCount > 0 ? '사람있음' : '사람없음');
  }
  const keywords = Array.from(new Set([...asKeywords(record.keywords), ...extras])).slice(0, 8);
  const landmark = typeof record.landmark === 'string' ? record.landmark.trim().slice(0, 40) : '';
  const visualTags = classifyVisualTags({
    scene: asScene(record.scene),
    caption,
    subjects,
    keywords,
    landmark,
  });
  const extraTags = Array.isArray(record.visualTags)
    ? record.visualTags.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    scene: asScene(record.scene),
    caption,
    subjects,
    keywords: keywords.length ? keywords : subjects.slice(0, 4),
    confidence: asConfidence(record.confidence),
    visualTags: Array.from(new Set([...visualTags, ...extraTags])).slice(0, 6),
    ...(landmark ? { landmark } : {}),
  };
}

export function analysisFromVisionLabels(
  labels: string[],
  placeName: string
): PhotoAiAnalysis | null {
  const hay = `${labels.join(' ')} ${placeName}`.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(hay);

  if (has(/sunrise|dawn|아침|일출/)) {
    return { scene: 'sunrise', caption: '빛이 천천히 올라오는 동안 우리는 말없이 서 있었다.', subjects: labels.slice(0, 4), keywords: labels.slice(0, 4), confidence: 0.45 };
  }
  if (has(/sunset|dusk|evening sky|일몰|노을/)) {
    return { scene: 'sunset', caption: '하늘이 붉게 잦아드는 것을 그냥 바라보았다.', subjects: labels.slice(0, 4), keywords: labels.slice(0, 4), confidence: 0.45 };
  }
  if (has(/lighthouse|등대/)) {
    return { scene: 'place', caption: '붉은 등대가 바다 끝에 서 있었다.', subjects: labels.slice(0, 4), keywords: labels.slice(0, 4), confidence: 0.5 };
  }
  if (has(/clam|shellfish|barbecue|grill|seafood|조개|구이|food|dish|meal|cuisine|restaurant/)) {
    return { scene: 'food', caption: '저녁은 식탁 앞에서 하루를 천천히 접었다.', subjects: labels.slice(0, 4), keywords: labels.slice(0, 4), confidence: 0.45 };
  }
  if (has(/van|camper|caravan|carnival|starex|캠핑카|차박|minivan/)) {
    return { scene: 'camping', caption: '밤은 차 안에서 하늘을 가깝게 두고 보냈다.', subjects: labels.slice(0, 4), keywords: labels.slice(0, 4), confidence: 0.5 };
  }
  if (has(/beach|sea|ocean|coast|mountain|sky|landscape|바다|산|풍경/)) {
    return { scene: 'landscape', caption: '바람이 스치는 풍경 앞에 잠시 걸음을 멈추었다.', subjects: labels.slice(0, 4), keywords: labels.slice(0, 4), confidence: 0.4 };
  }
  if (labels[0]) {
    return {
      scene: 'place',
      caption: `${placeName || '그 자리'}의 모습이 사진 한 장에 남아 있었다.`,
      subjects: labels.slice(0, 4),
      keywords: labels.slice(0, 4),
      confidence: 0.35,
    };
  }
  return null;
}

export async function analyzePhotoWithAi(input: {
  dataUrl: string;
  placeName: string;
  placeMemo?: string;
}): Promise<{ analysis: PhotoAiAnalysis | null; notes: string[] }> {
  const parsed = parseDataUrl(input.dataUrl);
  const notes: string[] = [];
  if (!parsed) return { analysis: null, notes: ['invalid-data-url'] };

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const fromGemini = await analyzeWithGemini(geminiKey, parsed, input.placeName, input.placeMemo, notes);
    if (fromGemini.analysis) return { analysis: fromGemini.analysis, notes };
    return { analysis: null, notes };
  }

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return { analysis: null, notes: ['missing-api-key'] };

  const fromGemini = await analyzeWithGemini(placesKey, parsed, input.placeName, input.placeMemo, notes);
  if (fromGemini.analysis) return { analysis: fromGemini.analysis, notes };

  const fromVision = await analyzeWithVision(placesKey, parsed.data, input.placeName, notes);
  return { analysis: fromVision, notes };
}

async function analyzeWithGemini(
  apiKey: string,
  parsed: { mimeType: string; data: string },
  placeName: string,
  placeMemo: string | undefined,
  notes: string[]
): Promise<{ analysis: PhotoAiAnalysis | null; raw: unknown }> {
  const prompt = `너는 여행 사진 분석기다. 사진에서 보이는 것만 추정해 JSON만 출력하라.
광고, 추천, 과장 문구 금지.
caption은 한국어 한 문장, 과거형 나레이션. 이 사진에만 있는 풍경·장소 특징·날씨·시간대·분위기·색감·사람 유무를 구체적으로 넣는다.
예: "나무 사이로 푸른 빛이 들어왔고, 흐린 바람이 등을 스쳤다."
scene은 landscape, place, food, sunrise, sunset, camping, other 중 하나.
visualTags는 해당하는 것만: 풍경, 인물, 바다, 산, 꽃, 건물, 길.
peopleCount는 보이는 사람 수(숫자). 없으면 0.
weather는 맑음/흐림/비/눈 중 보이는 것만.
timeOfDay는 새벽/아침/낮/오후/해질녘/밤 중 보이는 것만.
colorTone은 짧은 색감(예: 푸른빛, 노란 모래).
mood는 짧은 분위기.
keywords에 weather, timeOfDay, colorTone, 사람있음/사람없음을 함께 넣는다.
장소 힌트: ${placeName}
메모 힌트: ${placeMemo || '없음'}
형식: {"scene":"place","caption":"...","subjects":["태극기"],"keywords":["흐림","오후","푸른빛","사람없음"],"confidence":0.7,"landmark":"국회의사당","visualTags":["건물","인물"],"placeName":"국회의사당","peopleCount":2,"mood":"차분함","weather":"맑음","timeOfDay":"오후","colorTone":"흰 돌","estimatedLocation":"서울 여의도","objects":["국회의사당"],"tags":["#국회의사당"],"blogKeywords":["국회의사당"]}`;

  const models = await listGeminiModels(apiKey, notes);
  const versions = ['v1beta', 'v1'] as const;

  for (const model of models) {
    for (const version of versions) {
      const first = await requestGeminiAnalysis({
        apiKey,
        model,
        version,
        asJson: false,
        prompt,
        parsed,
      });
      if (first.ok === false) {
        notes.push(`${version}/${model}:${first.status}`);
        logGeminiFailure(first.status, first.error || `HTTP ${first.status}`);
        if (first.status === 404 || first.status === 408) continue;
        break;
      }
      if (first.analysis || first.raw) return { analysis: first.analysis, raw: first.raw ?? null };
      notes.push(`${version}/${model}:${first.note}`);

      const second = await requestGeminiAnalysis({
        apiKey,
        model,
        version,
        asJson: true,
        prompt,
        parsed,
      });
      if (second.ok === false) {
        notes.push(`${version}/${model}:json:${second.status}`);
        logGeminiFailure(second.status, second.error || `HTTP ${second.status}`);
        break;
      }
      if (second.analysis || second.raw) return { analysis: second.analysis, raw: second.raw ?? null };
      notes.push(`${version}/${model}:json:${second.note}`);
      break;
    }
  }

  return { analysis: null, raw: null };
}

async function fetchGemini(url: string, init?: RequestInit, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function logGeminiResponse(httpStatus: number, responseText: string) {
  console.log('Gemini Response:', responseText.slice(0, 400));
  if (httpStatus !== 403) return;
  try {
    const json = JSON.parse(responseText) as {
      error?: { status?: unknown; message?: unknown; details?: unknown };
    };
    const error = json.error ?? {};
    console.log('error.status:', error.status);
    console.log('error.message:', error.message);
    console.log('error.details:', error.details);
  } catch {
    console.log('error.status:', httpStatus);
    console.log('error.message:', responseText);
    console.log('error.details:', undefined);
  }
}

function logGeminiFailure(httpStatus: number | null, raw: string) {
  if (httpStatus != null) logGeminiResponse(httpStatus, raw);
  console.log('[노을-gemini] GEMINI_API_KEY present:', Boolean(process.env.GEMINI_API_KEY?.trim()));
}

export async function analyzeDriveImageWithGemini(parsed: {
  mimeType: string;
  data: string;
}): Promise<{ analysis: PhotoAiAnalysis; display: GeminiAnalysisResult; raw: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('[노을-gemini] GEMINI_API_KEY present:', Boolean(apiKey?.trim()));
  console.log(
    '[노을-gemini] GEMINI_API_KEY same as GOOGLE_PLACES_API_KEY:',
    Boolean(apiKey) && apiKey === process.env.GOOGLE_PLACES_API_KEY
  );
  if (!apiKey?.trim()) {
    logGeminiFailure(null, 'GEMINI_API_KEY is missing');
    throw new Error('GEMINI_API_KEY가 없어 사진을 분석할 수 없습니다.');
  }
  const notes: string[] = [];
  const result = await analyzeWithGemini(apiKey, parsed, '', undefined, notes);
  const display = parseGeminiAnalysisResult(result.raw);
  const analysis = result.analysis;
  if (!analysis?.caption && !display.caption) {
    throw new Error(
      `Gemini가 사진 분석 JSON을 반환하지 않았습니다. ${notes.slice(-6).join(' / ') || '응답 없음'}`
    );
  }
  const keywords =
    (analysis?.keywords?.length ? analysis.keywords : display.blogKeywords)?.length
      ? (analysis?.keywords?.length ? analysis.keywords : display.blogKeywords) ?? []
      : display.tags.map((tag) => tag.replace(/^#/, '')).filter(Boolean).slice(0, 8);
  const safeKeywords = keywords.length ? keywords : display.objects.slice(0, 4);
  const merged = analysis ?? {
    scene: 'other' as const,
    caption: display.caption,
    subjects: display.objects,
    keywords: [] as string[],
    confidence: 0.5,
    landmark: display.placeName || undefined,
  };
  return {
    analysis: {
      ...merged,
      caption: merged.caption || display.caption,
      keywords: merged.keywords?.length ? merged.keywords : safeKeywords,
    },
    display,
    raw: result.raw,
  };
}

let cachedGeminiModels: { at: number; names: string[] } | null = null;

async function listGeminiModels(apiKey: string, notes: string[]): Promise<string[]> {
  const fallback = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-pro-latest'];
  if (cachedGeminiModels && Date.now() - cachedGeminiModels.at < 10 * 60 * 1000) {
    notes.push(`models:cache:${cachedGeminiModels.names[0]}`);
    return cachedGeminiModels.names;
  }

  try {
    const response = await fetchGemini(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' },
      12000
    );
    const responseText = await response.text();
    logGeminiResponse(response.status, responseText);
    if (!response.ok) {
      notes.push(`models:${response.status}`);
      return fallback;
    }
    const payload = JSON.parse(responseText) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const names = (payload.models ?? [])
      .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((model) => (model.name || '').replace(/^models\//, ''))
      .filter((name) => name && !/tts|image|embed|imagen|veo|audio/i.test(name))
      .filter((name) => !/gemini-2\.0|gemini-1\.5|gemini-2\.5-flash(?!-lite)/i.test(name));
    const ranked = names.sort((a, b) => scoreModel(a) - scoreModel(b));
    if (ranked.length === 0) {
      notes.push('models:empty');
      return fallback;
    }
    const picked = ranked.slice(0, 2);
    cachedGeminiModels = { at: Date.now(), names: picked };
    notes.push(`models:${picked[0]}`);
    return picked;
  } catch {
    notes.push('models:error');
    return fallback;
  }
}

function scoreModel(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('3.6') && lower.includes('flash')) return -4;
  if (lower.includes('flash-latest')) return -3;
  if (lower.includes('3.') && lower.includes('flash') && !lower.includes('lite')) return -2;
  if (lower.includes('flash') && lower.includes('preview') && !lower.includes('image')) return 0;
  if (lower.includes('flash') && !lower.includes('lite')) return 1;
  if (lower.includes('flash')) return 2;
  if (lower.includes('pro')) return 3;
  return 4;
}

export async function generateGeminiJsonObject(input: {
  prompt: string;
  parsed?: { mimeType: string; data: string };
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<unknown | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  const notes: string[] = [];
  const models = await listGeminiModels(apiKey, notes);
  const parsed = input.parsed;
  const parts = parsed
    ? [{ text: input.prompt }, { inlineData: { mimeType: parsed.mimeType, data: parsed.data } }]
    : [{ text: input.prompt }];

  for (const model of models) {
    try {
      const response = await fetchGemini(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: input.temperature ?? 0.5,
              maxOutputTokens: input.maxOutputTokens ?? 4096,
              responseMimeType: 'application/json',
            },
          }),
        },
        25000
      );
        const responseText = await response.text();
        logGeminiResponse(response.status, responseText);
        if (!response.ok) continue;
        const payload = JSON.parse(responseText) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text =
          payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        return JSON.parse(jsonMatch[0]) as unknown;
      } catch {
        continue;
      }
  }
  return null;
}

type GeminiRequestResult =
  | { ok: false; status: number; error?: string }
  | { ok: true; analysis: PhotoAiAnalysis | null; raw?: unknown; note: string };

async function requestGeminiAnalysis(input: {
  apiKey: string;
  model: string;
  version: 'v1beta' | 'v1';
  asJson: boolean;
  prompt: string;
  parsed: { mimeType: string; data: string };
}): Promise<GeminiRequestResult> {
  try {
    const generationConfig: Record<string, unknown> = {
      temperature: 0.3,
      maxOutputTokens: 2048,
    };
    if (input.asJson) generationConfig.responseMimeType = 'application/json';

    const response = await fetchGemini(
      `https://generativelanguage.googleapis.com/${input.version}/models/${input.model}:generateContent?key=${input.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: input.prompt },
                { inlineData: { mimeType: input.parsed.mimeType, data: input.parsed.data } },
              ],
            },
          ],
          generationConfig,
        }),
      },
      45000
    );
    const responseText = await response.text();
    logGeminiResponse(response.status, responseText);
    if (!response.ok) {
      return { ok: false, status: response.status, error: responseText };
    }

    const payload = JSON.parse(responseText) as {
      promptFeedback?: { blockReason?: string };
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string }[] };
      }[];
    };
    const block = payload.promptFeedback?.blockReason;
    const finish = payload.candidates?.[0]?.finishReason || 'none';
    const text =
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        ok: true,
        analysis: null,
        note: `empty:${block || finish}:len${text.length}`,
      };
    }
    try {
      const raw = JSON.parse(jsonMatch[0]) as unknown;
      const analysis = normalizeAnalysis(raw);
      if (analysis || raw) return { ok: true, analysis, raw, note: analysis ? 'ok' : 'parse' };
      return { ok: true, analysis: null, raw, note: 'parse' };
    } catch {
      return { ok: true, analysis: null, note: 'json' };
    }
  } catch (error) {
    const aborted = error instanceof Error && /abort/i.test(error.message);
    return { ok: false, status: aborted ? 408 : 0, error: error instanceof Error ? error.message : 'fetch error' };
  }
}

async function analyzeWithVision(
  apiKey: string,
  data: string,
  placeName: string,
  notes: string[]
): Promise<PhotoAiAnalysis | null> {
  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: data },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 8 },
              { type: 'LANDMARK_DETECTION', maxResults: 3 },
              { type: 'WEB_DETECTION', maxResults: 5 },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      notes.push(`vision:${response.status}`);
      return null;
    }
    const payload = (await response.json()) as {
      responses?: {
        labelAnnotations?: { description?: string }[];
        landmarkAnnotations?: { description?: string }[];
        webDetection?: { webEntities?: { description?: string }[] };
      }[];
    };
    const first = payload.responses?.[0];
    const labels = [
      ...(first?.landmarkAnnotations ?? []).map((item) => item.description || ''),
      ...(first?.labelAnnotations ?? []).map((item) => item.description || ''),
      ...(first?.webDetection?.webEntities ?? []).map((item) => item.description || ''),
    ].filter(Boolean);
    return analysisFromVisionLabels(labels, placeName);
  } catch {
    notes.push('vision:error');
    return null;
  }
}
