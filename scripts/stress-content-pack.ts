import fs from 'node:fs';
import path from 'node:path';
import { generateTravelBlogDraft } from '../src/lib/photoPipeline/generateTravelBlog';
import { generateContentPack } from '../src/lib/contentPack/generateContentPack';
import type { PhotoAnalysis } from '../src/types/blog';

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

function mockPhotos(count: number): PhotoAnalysis[] {
  const places = [
    '해운대해수욕장',
    '동백섬',
    '광안리해수욕장',
    '민락수변공원',
    '해운대해수욕장',
    '청사포',
    '송정해수욕장',
    '이기대',
    '오륙도',
    '해운대동백공원',
  ];
  return Array.from({ length: count }, (_, index) => ({
    driveFileId: `stress-${index + 1}`,
    fileName: `photo-${index + 1}.jpg`,
    place: places[index % places.length],
    description: `${places[index % places.length]}에서 걸음을 잠시 멈췄다. 바람과 빛이 사진에 남았다.`,
    objects: ['바다', '산책로'],
    mood: '여행 / 산책',
    keywords: ['갈맷길', '부산', places[index % places.length]],
    status: 'analyzed' as const,
    capturedAt: new Date(Date.now() - (count - index) * 20 * 60 * 1000).toISOString(),
    lastModified: Date.now() - (count - index) * 20 * 60 * 1000,
  }));
}

async function main() {
  loadEnvLocal(process.cwd());
  const photos = mockPhotos(10);
  const started = Date.now();
  const blog = await generateTravelBlogDraft(photos);
  const blogMs = Date.now() - started;
  if (!blog.draft?.title || !blog.draft.body) {
    throw new Error('블로그 초안이 비었습니다.');
  }
  console.log(`[PASS] blog-draft 10장 ${blogMs}ms title="${blog.draft.title}" chars=${blog.draft.charCount} gemini=${blog.fromGemini}`);

  const packStarted = Date.now();
  const pack = await generateContentPack({
    photos,
    galmaetgil: [
      {
        placeName: '해운대해수욕장',
        matched: true,
        kind: 'exact',
        courseName: '갈맷길 1코스 동해안',
        sectionName: '광안리-해운대',
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
  const packMs = Date.now() - packStarted;
  if (!pack.blog?.body) throw new Error('콘텐츠 팩 블로그가 비었습니다.');
  if (!pack.quality || typeof pack.quality.overall !== 'number') {
    throw new Error('품질 점수가 없습니다.');
  }
  if (!pack.cardNews || pack.cardNews.length < 10) {
    throw new Error('카드뉴스가 10장이 아닙니다.');
  }
  console.log(
    `[PASS] content-pack 10장 ${packMs}ms quality=${pack.quality.overall} slides=${pack.cardNews.length}`
  );
}

void main().catch((error) => {
  console.error('[FAIL]', error instanceof Error ? error.message : error);
  process.exit(1);
});
