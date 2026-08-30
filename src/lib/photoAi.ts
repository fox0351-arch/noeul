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

export function logBase64Payload(stage: string, mimeType: string, data: string) {
  console.log(
    `[base64-trace] ${stage} mimeType=${mimeType} dataLength=${data.length} head50=${data.slice(0, 50)} tail50=${data.slice(-50)}`
  );
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    console.log(
      `[base64-trace] parseDataUrl-fail dataUrlLength=${dataUrl.length} head50=${dataUrl.slice(0, 50)} tail50=${dataUrl.slice(-50)}`
    );
    return null;
  }
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
    .slice(0, 400);
}

function asKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function asTextList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 1)
      .slice(0, 12);
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function asConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function isNounDumpCaption(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/글자가 사진에 보였다|이 사진에 보였다|숫자가 눈에 들어왔다|이 눈에 들어왔다/.test(trimmed)) {
    return true;
  }
  if (/이 보였다\.?$/.test(trimmed) && trimmed.split(/[,,]/).length >= 2) return true;
  return false;
}

export function isSceneCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 16 || isNounDumpCaption(trimmed)) return false;
  return /다\.|있다|찍|걷|서 |앉아|웃|입|바라|들고|포옹|손|빛|눈 덮|흐리|맑/.test(trimmed);
}

function asPeopleCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === 'string') {
    const n = parseInt(value.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

function asShort(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return fallback;
}

export function composeSceneDescription(input: {
  hasPeople: boolean;
  peopleCount: number;
  ageEstimate: string;
  action: string;
  expression: string;
  weather: string;
  timeOfDay: string;
  landscapeType: string;
  colorTone: string;
  mood: string;
  objects: string[];
}): string {
  const count = input.peopleCount;
  const age = input.ageEstimate;
  const who = input.hasPeople
    ? count >= 2
      ? `${age || '중년'} 부부`
      : `${age || ''} 한 사람`.trim()
    : '';
  const action = input.action || (input.hasPeople ? '서 있다' : '');
  const face = input.expression;
  const place = input.objects.find((item) => /정상석|표지|바위|다리|바다|능선|해변|동상/.test(item)) || input.landscapeType;
  const weather = input.weather;
  const light = input.timeOfDay;
  if (who && action) {
    const smile = face ? `${face}며 ` : '';
    const at = place ? `${place} 앞에서 ` : '';
    return `${who}가 ${at}${smile}${action}`.replace(/\s+/g, ' ').trim() + '.';
  }
  const backdrop = [place, input.landscapeType, weather, light, input.mood, input.colorTone].filter(Boolean);
  if (backdrop.length) {
    return `${backdrop.slice(0, 4).join(', ')} 풍경이 한 장에 담겨 있다.`;
  }
  return '';
}

export function normalizeAnalysis(value: unknown): PhotoAiAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    scene?: unknown;
    caption?: unknown;
    sceneDescription?: unknown;
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
    hasPeople?: unknown;
    ageEstimate?: unknown;
    action?: unknown;
    expression?: unknown;
    landscapeType?: unknown;
    ocrText?: unknown;
    ocr?: unknown;
    objects?: unknown;
  };
  const ocrText = Array.from(new Set([...asTextList(record.ocrText), ...asTextList(record.ocr)])).slice(0, 12);
  const objectTags = asTextList(record.objects);
  const listedSubjects = Array.isArray(record.subjects)
    ? record.subjects.filter((item): item is string => typeof item === 'string')
    : [];
  const subjects = Array.from(new Set([...listedSubjects, ...objectTags])).slice(0, 12);
  const peopleCount = asPeopleCount(record.peopleCount);
  const hasPeople = asBool(record.hasPeople, peopleCount > 0);
  const ageEstimate = asShort(record.ageEstimate, 40);
  const action = asShort(record.action, 200);
  const expression = asShort(record.expression, 80);
  const weather = asShort(record.weather, 40);
  const timeOfDay = asShort(record.timeOfDay, 40);
  const landscapeType = asShort(record.landscapeType, 80);
  const colorTone = asShort(record.colorTone, 80);
  const mood = asShort(record.mood, 200);
  const landmark = asShort(record.landmark, 80);
  const sceneDescription = typeof record.sceneDescription === 'string' ? record.sceneDescription.trim() : '';
  const extras = [mood, weather, timeOfDay, colorTone, ageEstimate, action, expression].filter(Boolean);
  const keywords = Array.from(new Set([...asKeywords(record.keywords), ...extras])).slice(0, 12);
  const caption = sceneDescription || (typeof record.caption === 'string' ? record.caption.trim() : '');
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
    sceneDescription,
    subjects,
    keywords: keywords.length ? keywords : subjects.slice(0, 4),
    confidence: asConfidence(record.confidence),
    visualTags: Array.from(new Set([...visualTags, ...extraTags])).slice(0, 8),
    hasPeople,
    peopleCount,
    ...(ageEstimate ? { ageEstimate } : {}),
    ...(action ? { action } : {}),
    ...(expression ? { expression } : {}),
    ...(weather ? { weather } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(landscapeType ? { landscapeType } : {}),
    ...(colorTone ? { colorTone } : {}),
    ...(mood ? { mood } : {}),
    ...(landmark ? { landmark } : {}),
    ...(ocrText.length ? { ocrText } : {}),
  };
}

export function analysisFromVisionLabels(
  labels: string[],
  ocrText: string[] = [],
  faces: { joy?: string }[] = []
): PhotoAiAnalysis | null {
  const ocr = ocrText.map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const hay = labels.join(' ').toLowerCase();
  const has = (pattern: RegExp) => pattern.test(hay);
  const personLabels = labels.filter((item) => /person|people|human|man|woman|couple|사람|부부/i.test(item));
  const peopleCount = Math.max(faces.length, personLabels.length ? 1 : 0);
  const hasPeople = peopleCount > 0;
  const subjects = labels.filter((item) => !/^text$/i.test(item)).slice(0, 8);
  const landscapeType = has(/mountain|snow|산|설|능선/)
    ? '설산'
    : has(/beach|sea|ocean|바다/)
      ? '바다'
      : has(/sky|cloud|하늘/)
        ? '하늘'
        : subjects[0] || '';
  const weather = has(/snow|눈|설/) ? '눈' : has(/rain|비/) ? '비' : has(/cloud|흐림/) ? '흐림' : '';
  if (!subjects.length && !ocr.length && !faces.length) return null;

  const scene: PhotoAiScene = has(/sunrise|dawn|아침|일출/)
    ? 'sunrise'
    : has(/sunset|dusk|일몰|노을/)
      ? 'sunset'
      : has(/food|dish|meal|조개|구이|restaurant/)
        ? 'food'
        : has(/van|camper|차박/)
          ? 'camping'
          : has(/beach|sea|ocean|mountain|landscape|바다|산|눈|설/)
            ? 'landscape'
            : 'place';

  return {
    scene,
    caption: '',
    sceneDescription: '',
    subjects,
    keywords: [weather, landscapeType].filter(Boolean).slice(0, 8),
    confidence: hasPeople ? 0.55 : 0.4,
    visualTags: [],
    hasPeople,
    peopleCount,
    ...(weather ? { weather } : {}),
    ...(landscapeType ? { landscapeType } : {}),
    ...(ocr.length ? { ocrText: ocr } : {}),
  };
}

export type PhotoAiOutcome = {
  analysis: PhotoAiAnalysis | null;
  notes: string[];
  success: boolean;
  status: number | null;
  error: string;
  cause: string;
  keyPresent: boolean;
  keySource: 'GEMINI_API_KEY' | 'GOOGLE_PLACES_API_KEY' | 'none';
};

export function classifyGeminiCause(status: number | null, body: string): string {
  const text = (body || '').toLowerCase();
  if (!status && /missing|없/.test(text)) return 'missing key';
  if (status === 429 || /quota|resource_exhausted/.test(text)) return '429 quota exceeded';
  if (status === 400 && /api[_ ]?key|invalid|api_key_invalid/.test(text)) return 'invalid key';
  if (status === 403 && /location|region|failed_precondition|not supported/.test(text)) return 'region restriction';
  if (status === 403) return '403 forbidden';
  if (status === 404) return '404 model not found';
  if (status === 408 || /abort/.test(text)) return 'timeout/aborted';
  if (status && status >= 500) return `HTTP ${status}`;
  if (status && status >= 400) return `HTTP ${status}`;
  return 'success';
}

export async function analyzePhotoWithAi(input: {
  dataUrl: string;
  placeName: string;
  placeMemo?: string;
}): Promise<PhotoAiOutcome> {
  const parsed = parseDataUrl(input.dataUrl);
  const notes: string[] = [];
  if (parsed) {
    logBase64Payload('analyzePhotoWithAi.parseDataUrl', parsed.mimeType, parsed.data);
  }
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || '';
  const placesKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || '';
  const keyPresent = Boolean(geminiKey);
  const keySource = geminiKey ? 'GEMINI_API_KEY' : placesKey ? 'GOOGLE_PLACES_API_KEY' : 'none';
  if (!parsed) {
    return {
      analysis: null,
      notes: ['invalid-data-url'],
      success: false,
      status: null,
      error: 'invalid-data-url',
      cause: 'invalid-data-url',
      keyPresent,
      keySource,
    };
  }

  const key = geminiKey || placesKey;
  if (!key) {
    console.log('[노을-photoAi.ts] analyzePhotoWithAi 실패', { notes: ['missing-api-key'] });
    return {
      analysis: null,
      notes: ['missing-api-key'],
      success: false,
      status: null,
      error: 'GEMINI_API_KEY missing',
      cause: 'missing key',
      keyPresent: false,
      keySource: 'none',
    };
  }

  const fromGemini = await analyzeWithGemini(key, parsed, input.placeName, input.placeMemo, notes);
  let analysis = fromGemini.analysis;
  if (!analysis && placesKey) {
    analysis = await analyzeWithVision(placesKey, parsed.data, notes);
    notes.push('vision-fallback');
  }
  const success = Boolean(analysis?.sceneDescription || analysis?.caption);
  const cause = success
    ? 'success'
    : classifyGeminiCause(fromGemini.status, fromGemini.error || notes.join(' '));
  console.log('[노을-photoAi.ts] 원본 분석', JSON.stringify(analysis));
  console.log('[TRACE-0b] src/lib/photoAi.ts:294 analyzePhotoWithAi.sceneDescription', analysis?.sceneDescription ?? null);
  console.log('[gemini-photo]', {
    success,
    status: fromGemini.status,
    cause,
    keyPresent,
    keySource,
    error: (fromGemini.error || '').slice(0, 240),
  });
  return {
    analysis: analysis ?? null,
    notes,
    success,
    status: fromGemini.status,
    error: fromGemini.error,
    cause,
    keyPresent,
    keySource,
  };
}

async function analyzeWithGemini(
  apiKey: string,
  parsed: { mimeType: string; data: string },
  _placeName: string,
  _placeMemo: string | undefined,
  notes: string[]
): Promise<{ analysis: PhotoAiAnalysis | null; raw: unknown; status: number | null; error: string }> {
  const prompt = `너는 사진을 보고 장면을 설명하는 관찰자다. JSON만 출력하라. 검색 장소 이름은 무시하라.
1순위는 OCR이 아니라 눈에 보이는 장면이다.
반드시 적을 것: 사람 여부, 인원, 나이대, 옷/행동, 표정, 날씨, 시간대, 풍경 종류, 색감, 분위기.
sceneDescription은 사람이 후기에 쓸 문장이다. 명사를 나열하지 마라.

좋은 예: "등산복을 입은 중년 부부가 정상석 앞에서 웃으며 사진을 찍고 있다."
나쁜 예: "함백산 정상석이 보였다.", "표지판, 능선, 눈이 사진에 보였다."

ocrText는 읽힌 글자만 넣고, 장면 문장의 주인공으로 쓰지 마라. 숫자는 보조다.
형식: {"sceneDescription":"등산복을 입은 중년 부부가 정상석 앞에서 웃으며 사진을 찍고 있다.","hasPeople":true,"peopleCount":2,"ageEstimate":"중년","action":"사진을 찍고 있다","expression":"웃고","weather":"눈","timeOfDay":"낮","landscapeType":"설산","colorTone":"흰빛","mood":"함께한 겨울 산행","scene":"landscape","objects":["정상석","등산복"],"ocrText":["1572.9m"],"confidence":0.8}`;

  const models = await listGeminiModels(apiKey, notes);
  const versions = ['v1beta', 'v1'] as const;
  let lastStatus: number | null = null;
  let lastError = '';

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
        lastStatus = first.status;
        lastError = first.error || `HTTP ${first.status}`;
        notes.push(`${version}/${model}:${first.status}`);
        logGeminiFailure(first.status, first.error || `HTTP ${first.status}`);
        // 404/408만 다음 모델·버전으로 넘어감. 429는 같은 모델의 v1만 시도하지 않고 break (429 전용 backoff/retry 없음).
        if (first.status === 404 || first.status === 408) continue;
        break;
      }
      if (first.analysis || first.raw) {
        return { analysis: first.analysis, raw: first.raw ?? null, status: 200, error: '' };
      }
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
        lastStatus = second.status;
        lastError = second.error || `HTTP ${second.status}`;
        notes.push(`${version}/${model}:json:${second.status}`);
        logGeminiFailure(second.status, second.error || `HTTP ${second.status}`);
        break;
      }
      if (second.analysis || second.raw) {
        return { analysis: second.analysis, raw: second.raw ?? null, status: 200, error: '' };
      }
      notes.push(`${version}/${model}:json:${second.note}`);
      break;
    }
  }

  return { analysis: null, raw: null, status: lastStatus, error: lastError };
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
  const cause = classifyGeminiCause(httpStatus, responseText);
  console.log('[gemini] 호출 직후', {
    httpStatus,
    cause,
    body: responseText.slice(0, 800),
  });
  console.log('Gemini Response:', responseText.slice(0, 400));
  if (httpStatus !== 403 && httpStatus !== 429 && httpStatus !== 400) return;
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
    console.log('error.message:', responseText.slice(0, 400));
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
  logFullPrompt?: boolean;
}): Promise<unknown | null> {
  if (input.logFullPrompt) {
    console.log('[노을-review] LLM 호출 직전 프롬프트 전문\n' + input.prompt);
  }
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

    const inlineData = { mimeType: input.parsed.mimeType, data: input.parsed.data };
    logBase64Payload('generateContent.inline_data.data', inlineData.mimeType, inlineData.data);
    const requestBody = {
      contents: [
        {
          parts: [{ text: input.prompt }, { inlineData }],
        },
      ],
      generationConfig,
    };
    console.log(
      `[base64-trace] generateContent request body model=${input.model} version=${input.version} promptLength=${input.prompt.length} mimeType=${inlineData.mimeType} dataLength=${inlineData.data.length} head50=${inlineData.data.slice(0, 50)} tail50=${inlineData.data.slice(-50)}`
    );

    const response = await fetchGemini(
      `https://generativelanguage.googleapis.com/${input.version}/models/${input.model}:generateContent?key=${input.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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
      const rawScene =
        raw && typeof raw === 'object' && 'sceneDescription' in raw
          ? (raw as { sceneDescription?: unknown }).sceneDescription
          : undefined;
      console.log('[TRACE-0] src/lib/photoAi.ts:615 requestGeminiAnalysis', {
        rawSceneDescription: rawScene,
        normalizedSceneDescription: analysis?.sceneDescription ?? null,
        same: rawScene === (analysis?.sceneDescription ?? ''),
      });
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
              { type: 'LABEL_DETECTION', maxResults: 12 },
              { type: 'LANDMARK_DETECTION', maxResults: 3 },
              { type: 'FACE_DETECTION', maxResults: 8 },
              { type: 'TEXT_DETECTION', maxResults: 15 },
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
        faceAnnotations?: { joyLikelihood?: string }[];
        webDetection?: { webEntities?: { description?: string }[] };
        textAnnotations?: { description?: string }[];
        fullTextAnnotation?: { text?: string };
      }[];
    };
    const first = payload.responses?.[0];
    const labels = [
      ...(first?.landmarkAnnotations ?? []).map((item) => item.description || ''),
      ...(first?.labelAnnotations ?? []).map((item) => item.description || ''),
      ...(first?.webDetection?.webEntities ?? []).map((item) => item.description || ''),
    ].filter(Boolean);
    const faces = (first?.faceAnnotations ?? []).map((face) => ({ joy: face.joyLikelihood || '' }));
    const rawOcr = first?.fullTextAnnotation?.text || first?.textAnnotations?.[0]?.description || '';
    const ocrText = rawOcr
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 12);
    return analysisFromVisionLabels(labels, ocrText, faces);
  } catch {
    notes.push('vision:error');
    return null;
  }
}

