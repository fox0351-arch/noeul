import { PhotoAiAnalysis, PhotoAiScene } from '@/types/place';

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
    .slice(0, 80);
}

export function normalizeAnalysis(value: unknown): PhotoAiAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { scene?: unknown; caption?: unknown; subjects?: unknown };
  const caption = cleanCaption(record.caption);
  if (!caption) return null;
  const subjects = Array.isArray(record.subjects)
    ? record.subjects.filter((item): item is string => typeof item === 'string').slice(0, 6)
    : [];
  return { scene: asScene(record.scene), caption, subjects };
}

export function analysisFromVisionLabels(
  labels: string[],
  placeName: string
): PhotoAiAnalysis | null {
  const hay = `${labels.join(' ')} ${placeName}`.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(hay);

  if (has(/sunrise|dawn|아침|일출/)) {
    return { scene: 'sunrise', caption: '빛이 천천히 올라오는 동안 우리는 말없이 서 있었다.', subjects: labels.slice(0, 4) };
  }
  if (has(/sunset|dusk|evening sky|일몰|노을/)) {
    return { scene: 'sunset', caption: '하늘이 붉게 잦아드는 것을 그냥 바라보았다.', subjects: labels.slice(0, 4) };
  }
  if (has(/lighthouse|등대/)) {
    return { scene: 'place', caption: '붉은 등대가 바다 끝에 서 있었다.', subjects: labels.slice(0, 4) };
  }
  if (has(/clam|shellfish|barbecue|grill|seafood|조개|구이|food|dish|meal|cuisine|restaurant/)) {
    return { scene: 'food', caption: '저녁은 식탁 앞에서 하루를 천천히 접었다.', subjects: labels.slice(0, 4) };
  }
  if (has(/van|camper|caravan|carnival|starex|캠핑카|차박|minivan/)) {
    return { scene: 'camping', caption: '밤은 차 안에서 하늘을 가깝게 두고 보냈다.', subjects: labels.slice(0, 4) };
  }
  if (has(/beach|sea|ocean|coast|mountain|sky|landscape|바다|산|풍경/)) {
    return { scene: 'landscape', caption: '바람이 스치는 풍경 앞에 잠시 걸음을 멈추었다.', subjects: labels.slice(0, 4) };
  }
  if (labels[0]) {
    return {
      scene: 'place',
      caption: `${placeName || '그 자리'}의 모습이 사진 한 장에 남아 있었다.`,
      subjects: labels.slice(0, 4),
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
    if (fromGemini) return { analysis: fromGemini, notes };
    return { analysis: null, notes };
  }

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return { analysis: null, notes: ['missing-api-key'] };

  const fromGemini = await analyzeWithGemini(placesKey, parsed, input.placeName, input.placeMemo, notes);
  if (fromGemini) return { analysis: fromGemini, notes };

  const fromVision = await analyzeWithVision(placesKey, parsed.data, input.placeName, notes);
  return { analysis: fromVision, notes };
}

async function analyzeWithGemini(
  apiKey: string,
  parsed: { mimeType: string; data: string },
  placeName: string,
  placeMemo: string | undefined,
  notes: string[]
): Promise<PhotoAiAnalysis | null> {
  const prompt = `너는 60대 부부 여행 에세이를 돕는 사진 분석기다.
사진에서 보이는 것을 추정해 JSON만 출력하라.
광고, 추천, 과장 문구 금지.
caption은 한국어 한 문장, 과거형 나레이션.
예: "붉은 등대가 바다 끝에 서 있었다." / "저녁은 조개구이로 하루를 마무리했다." / "밤은 카니발 스텔스 차박으로 보냈다."
scene은 landscape, place, food, sunrise, sunset, camping, other 중 하나.
장소 힌트: ${placeName}
메모 힌트: ${placeMemo || '없음'}
형식: {"scene":"place","caption":"...","subjects":["등대"]}`;

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
        if (first.status === 404) continue;
        break;
      }
      if (first.analysis) return first.analysis;
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
        break;
      }
      if (second.analysis) return second.analysis;
      notes.push(`${version}/${model}:json:${second.note}`);
      break;
    }
  }

  return null;
}

async function listGeminiModels(apiKey: string, notes: string[]): Promise<string[]> {
  const fallback = [
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-pro-latest',
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!response.ok) {
      notes.push(`models:${response.status}`);
      return fallback;
    }
    const payload = (await response.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const names = (payload.models ?? [])
      .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((model) => (model.name || '').replace(/^models\//, ''))
      .filter((name) => name && !/tts|image|embed|imagen|veo|audio/i.test(name));
    const ranked = names.sort((a, b) => scoreModel(a) - scoreModel(b));
    if (ranked.length === 0) {
      notes.push('models:empty');
      return fallback;
    }
    notes.push(`models:${ranked[0]}`);
    return ranked.slice(0, 4);
  } catch {
    notes.push('models:error');
    return fallback;
  }
}

function scoreModel(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('flash-latest')) return -1;
  if (lower.includes('flash') && lower.includes('preview') && !lower.includes('image')) return 0;
  if (lower.includes('flash') && !lower.includes('lite')) return 1;
  if (lower.includes('flash')) return 2;
  if (lower.includes('pro')) return 3;
  return 4;
}

type GeminiRequestResult =
  | { ok: false; status: number }
  | { ok: true; analysis: PhotoAiAnalysis | null; note: string };

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

    const response = await fetch(
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
      }
    );
    if (!response.ok) return { ok: false, status: response.status };

    const payload = (await response.json()) as {
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
      const analysis = normalizeAnalysis(JSON.parse(jsonMatch[0]));
      if (analysis) return { ok: true, analysis, note: 'ok' };
      return { ok: true, analysis: null, note: 'parse' };
    } catch {
      return { ok: true, analysis: null, note: 'json' };
    }
  } catch {
    return { ok: true, analysis: null, note: 'error' };
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
