import fs from 'node:fs';
import path from 'node:path';
import { matchGalmaetgilByPlaceName } from '../src/lib/travelInfo/catalogMatch';
import { matchGalmaetgilTrail } from '../src/lib/galmaetgil/matchTrail';
import { matchPlacesToGalmaetgil } from '../src/lib/galmaetgil/matchPlace';
import { scoreBlogQuality } from '../src/lib/contentPack/scoreBlogQuality';
import type { BlogDraft } from '../src/types/blog';

type StepResult = {
  step: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  fix?: string;
};

function loadEnvLocal(root: string) {
  const file = path.join(root, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.replace(/\\n/g, '').trim());
}

const results: StepResult[] = [];

function log(step: StepResult) {
  results.push(step);
  const tag = step.status === 'pass' ? 'PASS' : step.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${tag}] ${step.step}: ${step.detail}`);
  if (step.fix) console.log(`     수정: ${step.fix}`);
}

async function main() {
  const root = process.cwd();
  loadEnvLocal(root);

  log({
    step: '0. 환경변수',
    status:
      envPresent('GEMINI_API_KEY') &&
      envPresent('GOOGLE_PLACES_API_KEY') &&
      envPresent('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY') &&
      envPresent('GOOGLE_DRIVE_CLIENT_ID') &&
      envPresent('FIREBASE_ADMIN_PRIVATE_KEY')
        ? 'pass'
        : 'fail',
    detail: [
      `GEMINI_API_KEY=${envPresent('GEMINI_API_KEY')}`,
      `GOOGLE_PLACES_API_KEY=${envPresent('GOOGLE_PLACES_API_KEY')}`,
      `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${envPresent('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')}`,
      `GOOGLE_DRIVE_CLIENT_ID=${envPresent('GOOGLE_DRIVE_CLIENT_ID')}`,
      `FIREBASE_ADMIN=${envPresent('FIREBASE_ADMIN_PRIVATE_KEY')}`,
    ].join(', '),
    fix: '비어 있는 키를 .env.local에 채운 뒤 npm run dev를 재시작하세요.',
  });

  const panel = fs.readFileSync(
    path.join(root, 'src/app/admin/test/drive/DriveUploadTestPanel.tsx'),
    'utf8'
  );

  log({
    step: '1. 사진 업로드',
    status: panel.includes('uploadPhotoToDrive') && panel.includes('PhotoDropzone') ? 'pass' : 'fail',
    detail: 'DriveUploadTestPanel이 다중 업로드와 uploadPhotoToDrive를 호출합니다.',
    fix: 'DriveUploadTestPanel 업로드 루프와 PhotoDropzone 연결을 확인하세요.',
  });

  log({
    step: '2. Google Drive 저장',
    status:
      panel.includes("users', user.uid, 'media'") &&
      fs.existsSync(path.join(root, 'src/lib/googleDrive/client.ts'))
        ? 'pass'
        : 'fail',
    detail: '업로드 후 Firestore users/{uid}/media/{fileId}에 기록합니다. 실제 Drive 전송은 로그인 세션이 필요합니다.',
    fix: '/admin/test/drive에서 Google Drive 연결 후 폴더를 선택한 뒤 사진을 올리세요. OAuth 토큰이 만료되면 Drive 연결을 다시 하세요.',
  });

  const pipelineRoute = fs.existsSync(path.join(root, 'src/app/api/photos/pipeline/route.ts'));
  log({
    step: '3. Gemini 분석',
    status: pipelineRoute && panel.includes('requestPhotoPipeline') && envPresent('GEMINI_API_KEY') ? 'pass' : 'fail',
    detail: 'POST /api/photos/pipeline 연결됨. 로그인 없이 실호출은 401입니다.',
    fix: 'GEMINI_API_KEY가 Generative Language API를 허용하는지 확인하고, Drive 파일 다운로드 권한을 유지하세요.',
  });

  log({
    step: '4. 여행 정보 카드',
    status:
      panel.includes('requestTravelPlaceInfo') &&
      panel.includes('TravelInfoCard') &&
      fs.existsSync(path.join(root, 'src/app/api/photos/travel-info/route.ts'))
        ? 'pass'
        : 'fail',
    detail: '분석 후 requestTravelPlaceInfo → TravelInfoCard.',
    fix: 'Places/Gemini 키와 /api/photos/travel-info 라우트를 확인하세요.',
  });

  log({
    step: '5. 지도 생성',
    status:
      panel.includes('requestTravelMap') &&
      panel.includes('TravelPlaceMap') &&
      envPresent('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
        ? 'pass'
        : 'warn',
    detail: 'requestTravelMap + TravelPlaceMap. 지도 JS키와 Places 키가 모두 필요합니다.',
    fix: 'Maps JavaScript API와 Places API(New)를 키 제한에 포함하고, HTTP 리퍼러에 localhost를 넣으세요.',
  });

  log({
    step: '6. 여행 코스 생성',
    status:
      panel.includes('requestTravelCourse') &&
      panel.includes('TravelCourseCard') &&
      fs.existsSync(path.join(root, 'src/app/api/photos/travel-course/route.ts'))
        ? 'pass'
        : 'fail',
    detail: '촬영시각 정렬 + Directions(도보) + TravelCourseCard.',
    fix: 'Google 키에 Directions API를 켜세요. 없으면 직선거리 보정으로 떨어집니다.',
  });

  const haeundae = matchGalmaetgilByPlaceName('해운대해수욕장');
  const assembly = matchGalmaetgilByPlaceName('국회의사당');
  log({
    step: '7. 갈맷길 자동 매칭',
    status: haeundae && !assembly ? 'pass' : 'fail',
    detail: `해운대해수욕장 → ${haeundae ? `${haeundae.courseName} / ${haeundae.sectionName}` : '미매칭'}; 국회의사당 → ${assembly ? '오탐' : '갈맷길 구간 아님'}`,
    fix: 'catalogMatch 토큰 점수가 너무 느슨하면 오탐이 납니다. 부산 외 장소는 unmatched여야 합니다.',
  });

  log({
    step: '8. 콘텐츠 팩 생성',
    status:
      panel.includes('requestContentPack') &&
      panel.includes('ContentPackCards') &&
      fs.existsSync(path.join(root, 'src/app/api/photos/content-pack/route.ts'))
        ? 'pass'
        : 'fail',
    detail: '장소 확정 후 requestContentPack(블로그·카드뉴스·쇼츠·유튜브·SEO·해시태그).',
    fix: 'content-pack은 Gemini를 여러 번 호출합니다. maxDuration과 GEMINI_API_KEY 할당량을 확인하세요.',
  });

  const poorDraft: BlogDraft = {
    title: '여행',
    summary: '다녀왔다',
    intro: '갔다',
    story: '봤다',
    places: '거기',
    closing: '끝',
    body: '갔다. 봤다. 끝.',
    markdown: '',
    html: '',
    seo: { keywords: [], hashtags: [], searchQueries: [] },
    charCount: 12,
  };
  const richDraft: BlogDraft = {
    title: '해운대해수욕장에서 동백섬까지',
    summary: '갈맷길 1코스를 천천히 걸었다.',
    intro: '해운대해수욕장에서 하루를 열었다. 바람과 빛이 발걸음을 붙잡았다.',
    story:
      '우리는 해운대해수욕장 모래를 밟고 동백섬으로 걸음을 옮겼다. 하늘이 낮았고 걸음은 느렸다. 주차는 해운대 공영주차장을 썼고 화장실은 해수욕장 앞에 있었다.',
    places: '갈맷길 1코스 동해안, 해운대-송정-임랑 구간. 난이도는 쉬움이고 차박은 제한된다.',
    closing: '같은 하늘을 본 것으로 충분했다.',
    body: '',
    markdown: '',
    html: '',
    seo: {
      keywords: ['해운대', '갈맷길', '동백섬', '부산여행', '산책'],
      hashtags: ['#해운대', '#갈맷길', '#부산여행', '#시니어여행', '#부부여행', '#산책', '#힐링', '#국내여행'],
      searchQueries: ['해운대 여행'],
    },
    charCount: 1600,
  };
  richDraft.body = [richDraft.intro, richDraft.story, richDraft.places, richDraft.closing].join('\n\n');

  const poor = scoreBlogQuality({ draft: poorDraft, photos: [{ place: '해운대' } as never], galmaetgil: [] });
  const rich = scoreBlogQuality({
    draft: richDraft,
    photos: [{ place: '해운대해수욕장', status: 'analyzed' } as never],
    galmaetgil: [
      {
        placeName: '해운대해수욕장',
        matched: true,
        kind: 'exact',
        courseName: '갈맷길 1코스 동해안',
        sectionName: '해운대-송정-임랑',
        distanceLabel: '3km',
        durationLabel: '50분',
        difficulty: '쉬움',
        parking: '공영주차장',
        toilet: '있음',
        carCamping: '제한',
        seniorRecommend: '추천',
      },
    ],
  });

  log({
    step: '9. 품질 평가',
    status: poor.overall < 80 && rich.overall >= 50 ? 'pass' : 'fail',
    detail: `빈약한 초안 ${poor.overall}점(재작성 대상), 충실한 초안 ${rich.overall}점. UI는 ContentQualityCard.`,
    fix: '80점 미만이면 generateContentPack이 블로그를 1회 재작성합니다. 주차·화장실·갈맷길 코스명이 본문에 들어가야 점수가 오릅니다.',
  });

  const haeundaeGps = matchGalmaetgilTrail({ lat: 35.1586, lng: 129.1603 });
  log({
    step: '7b. 갈맷길 GPS 매칭',
    status: haeundaeGps.section && (haeundaeGps.distanceM ?? 9999) <= 1500 ? 'pass' : 'fail',
    detail: `해운대 좌표 35.1586,129.1603 → ${haeundaeGps.section ? `${haeundaeGps.section.courseName} / ${haeundaeGps.section.sectionName} (${Math.round(haeundaeGps.distanceM ?? 0)}m)` : '미매칭'}`,
    fix: 'catalog.ts geometry와 matchTrail 거리 임계값(1500m)을 확인하세요.',
  });

  const liveMatches = await matchPlacesToGalmaetgil(['해운대해수욕장']);
  log({
    step: '7c. matchPlacesToGalmaetgil',
    status: liveMatches[0]?.matched === true ? 'pass' : 'fail',
    detail: liveMatches
      .map((m) => `${m.placeName}: ${m.matched ? `${m.courseName} / ${m.sectionName}` : m.message}`)
      .join(' | '),
    fix: '이름 매칭이 실패하면 Places 지오코딩이 호출됩니다. GOOGLE_PLACES_API_KEY를 확인하세요.',
  });

  const geminiPing = await pingGemini();
  log({
    step: '3b. Gemini 실호출',
    status: geminiPing.ok ? 'pass' : 'fail',
    detail: geminiPing.detail,
    fix: 'Google Cloud에서 Generative Language API를 켜고, 키가 해당 API를 허용하는지 확인하세요. Places 전용 키를 쓰면 API_KEY_SERVICE_BLOCKED가 납니다.',
  });

  const placesPing = await pingPlaces();
  log({
    step: '4b. Places 실호출',
    status: placesPing.ok ? 'pass' : 'warn',
    detail: placesPing.detail,
    fix: 'Places API(New)와 키 제한(IP/HTTP 리퍼러)을 확인하세요. 서버 호출은 IP 제한이 더 잘 맞습니다.',
  });

  const routes = [
    '/api/photos/pipeline',
    '/api/photos/travel-info',
    '/api/photos/travel-map',
    '/api/photos/travel-course',
    '/api/photos/galmaetgil-match',
    '/api/photos/content-pack',
  ];
  const health = await probeHttp('http://127.0.0.1:3000/', 'GET');
  if (health.status === '200') {
    const authProbe: { route: string; status: string }[] = [];
    for (const route of routes) {
      authProbe.push(await probeApi(route));
    }
    const authOk = authProbe.every((item) => item.status === '401' || item.status === '400');
    log({
      step: 'API 인증 가드',
      status: authOk ? 'pass' : 'warn',
      detail: authProbe.map((item) => `${item.route}→${item.status}`).join(', '),
      fix: '401이면 로그인 가드가 정상입니다. 타임아웃이면 npm run dev를 재시작하세요.',
    });
  } else {
    log({
      step: 'API 인증 가드',
      status: 'warn',
      detail: `dev 서버가 응답하지 않음 (GET / → ${health.status}). 라우트 프로브는 건너뜀.`,
      fix: '터미널에서 실행 중인 npm run dev를 중지한 뒤 다시 시작하세요. 이전에 hang 된 요청이 서버를 막을 수 있습니다.',
    });
  }

  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const passed = results.filter((r) => r.status === 'pass').length;
  console.log(`SUMMARY pass=${passed} warn=${warned} fail=${failed}`);

  const outPath = path.join(root, 'scripts/pipeline-integration-report.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({ at: new Date().toISOString(), passed, warned, failed, results }, null, 2)
  );
  console.log(`REPORT_JSON=${outPath}`);
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 25000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeHttp(
  url: string,
  method: string,
  body?: string
): Promise<{ status: string }> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      },
      5000
    );
    return { status: String(response.status) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch failed';
    return { status: message.includes('abort') ? 'timeout' : message };
  }
}

async function probeApi(route: string): Promise<{ route: string; status: string }> {
  const result = await probeHttp(`http://127.0.0.1:3000${route}`, 'POST', '{}');
  return { route, status: result.status };
}

async function pingGemini(): Promise<{ ok: boolean; detail: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, detail: 'GEMINI_API_KEY 없음' };
  try {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' },
      12000
    );
    if (!response.ok) {
      const body = await response.text();
      const snippet = body.slice(0, 180).replace(/\s+/g, ' ');
      return { ok: false, detail: `HTTP ${response.status} ${snippet}` };
    }
    const json = (await response.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const usable = (json.models || [])
      .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((model) => (model.name || '').replace(/^models\//, ''))
      .filter((name) => name && /flash/i.test(name) && !/tts|image|embed|imagen|veo|audio/i.test(name))
      .filter((name) => !/gemini-2\.0|gemini-1\.5|gemini-2\.5-flash(?!-lite)/i.test(name))
      .sort((a, b) => {
        const score = (n: string) => {
          const lower = n.toLowerCase();
          if (lower.includes('3.6')) return -4;
          if (lower.includes('flash-latest')) return -3;
          if (lower.includes('3.') && lower.includes('flash')) return -2;
          return 1;
        };
        return score(a) - score(b);
      });
    const model = usable[0] || 'gemini-flash-latest';
    const names = usable.slice(0, 3);
    const gen = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with the single word ok' }] }],
        }),
      },
      45000
    );
    if (!gen.ok) {
      const body = await gen.text();
      return {
        ok: false,
        detail: `models OK (${json.models?.length ?? 0}) but ${model} generateContent HTTP ${gen.status} ${body.slice(0, 160).replace(/\s+/g, ' ')}`,
      };
    }
    return {
      ok: true,
      detail: `models ${json.models?.length ?? 0}개, ${model} generateContent OK (후보: ${names.join(', ')})`,
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Gemini ping 실패' };
  }
}

async function pingPlaces(): Promise<{ ok: boolean; detail: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return { ok: false, detail: 'GOOGLE_PLACES_API_KEY 없음' };
  try {
    const response = await fetchWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.location',
        },
        body: JSON.stringify({ textQuery: '해운대해수욕장', languageCode: 'ko', maxResultCount: 1 }),
      },
      12000
    );
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, detail: `HTTP ${response.status} ${body.slice(0, 180).replace(/\s+/g, ' ')}` };
    }
    const json = (await response.json()) as {
      places?: { displayName?: { text?: string } }[];
    };
    const name = json.places?.[0]?.displayName?.text || '(이름 없음)';
    return { ok: true, detail: `searchText 성공: ${name}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Places ping 실패' };
  }
}

void main();
