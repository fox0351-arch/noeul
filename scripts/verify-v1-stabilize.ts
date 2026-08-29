import { generateTravelBlogEssay, essaySimilarity } from '@/lib/travelBlogEssay';
import type { PlaceItem, PhotoAiScene } from '@/types/place';

function photoPlace(
  id: string,
  name: string,
  address: string,
  location: { latitude: number; longitude: number },
  memo: string,
  scenes: { scene: PhotoAiScene; caption: string; subjects: string[]; visualTags: string[] }[]
): PlaceItem {
  return {
    id,
    name,
    address,
    location,
    memo,
    photos: scenes.map((scene, index) => ({
      id: `${id}-${index + 1}`,
      dataUrl: `data:image/jpeg;base64,${Buffer.from(`${name}-${index}`).toString('base64')}`,
      analysis: {
        scene: scene.scene,
        caption: scene.caption,
        subjects: scene.subjects,
        keywords: scene.subjects,
        confidence: 0.8,
        visualTags: scene.visualTags,
      },
    })),
  };
}

const olle = photoPlace(
  'olle',
  '제주올레 1코스',
  '제주특별자치도 서귀포시 성산읍 시흥리',
  { latitude: 33.458, longitude: 126.942 },
  '올레 1-1, 성산에서 광치기까지',
  [
    { scene: 'landscape', caption: '성산일출봉이 바다 너머로 낮게 걸려 있었다.', subjects: ['성산일출봉', '바다'], visualTags: ['바다', '풍경'] },
    { scene: 'landscape', caption: '현무암 돌담 사이로 유채가 한 줄 피어 있었다.', subjects: ['돌담', '유채'], visualTags: ['꽃', '길'] },
    { scene: 'place', caption: '올레 이정표가 검은 돌 위에 서 있었다.', subjects: ['이정표', '올레길'], visualTags: ['길', '건물'] },
    { scene: 'landscape', caption: '파도가 광치기 해변의 검은 모래를 쓸고 지나갔다.', subjects: ['광치기해변', '파도'], visualTags: ['바다', '풍경'] },
    { scene: 'place', caption: '두 사람이 해안 산책로에서 나란히 걸음을 맞추고 있었다.', subjects: ['부부', '산책로'], visualTags: ['인물', '길'] },
    { scene: 'landscape', caption: '저녁 빛이 오름 능선을 한 겹 물들였다.', subjects: ['오름', '노을'], visualTags: ['산', '풍경'] },
    { scene: 'food', caption: '자리돔 구이 접시가 식탁 가운데에 남아 있었다.', subjects: ['자리돔', '식탁'], visualTags: ['건물'] },
    { scene: 'place', caption: '포구의 작은 배가 줄에 묶여 흔들리고 있었다.', subjects: ['포구', '배'], visualTags: ['바다', '건물'] },
    { scene: 'landscape', caption: '억새가 바람결에 하얗게 기울어 있었다.', subjects: ['억새', '바람'], visualTags: ['풍경', '길'] },
    { scene: 'sunset', caption: '수평선이 주황으로 잦아들 때까지 발걸음이 느려졌다.', subjects: ['수평선', '노을'], visualTags: ['바다', '풍경'] },
  ]
);

const songhae = photoPlace(
  'songhae',
  '송해공원',
  '대구광역시 달성군 다사읍 박석진길 157',
  { latitude: 35.858, longitude: 128.458 },
  '대구 낙동강변 공원',
  [
    { scene: 'place', caption: '송해 선생님 동상이 잔디 한가운데 서 있었다.', subjects: ['동상', '잔디'], visualTags: ['건물', '인물'] },
    { scene: 'landscape', caption: '낙동강이 공원 바깥으로 넓게 흘렀다.', subjects: ['낙동강', '강물'], visualTags: ['풍경'] },
    { scene: 'place', caption: '산책로 벤치에 노란 은행잎이 쌓여 있었다.', subjects: ['벤치', '은행잎'], visualTags: ['길', '꽃'] },
    { scene: 'landscape', caption: '다리 아래로 강바람이 낮게 지나갔다.', subjects: ['다리', '강바람'], visualTags: ['건물', '풍경'] },
    { scene: 'place', caption: '어린이 놀이터 미끄럼틀이 오후 햇살을 받고 있었다.', subjects: ['놀이터', '미끄럼틀'], visualTags: ['건물'] },
    { scene: 'place', caption: '공원 카페 창가에 커피잔이 식고 있었다.', subjects: ['카페', '커피'], visualTags: ['건물'] },
    { scene: 'landscape', caption: '갈대 군락이 강둑을 따라 흔들렸다.', subjects: ['갈대', '강둑'], visualTags: ['풍경', '길'] },
    { scene: 'place', caption: '부부가 동상 앞에서 기념 사진을 남기고 있었다.', subjects: ['부부', '동상'], visualTags: ['인물', '건물'] },
    { scene: 'landscape', caption: '해 질 녘 강물이 은빛으로 잠시 멈춘 듯했다.', subjects: ['강물', '석양'], visualTags: ['풍경'] },
    { scene: 'place', caption: '공원 입구 표석에 송해공원이라 새겨져 있었다.', subjects: ['표석', '입구'], visualTags: ['건물', '길'] },
  ]
);

const restored = JSON.parse(JSON.stringify([olle])) as PlaceItem[];
const savedOk =
  restored[0]?.name === '제주올레 1코스' &&
  restored[0]?.location.latitude === 33.458 &&
  restored[0]?.photos?.length === 10 &&
  Boolean(restored[0]?.photos?.[0]?.analysis?.caption?.includes('성산일출봉'));

const olleBlog = generateTravelBlogEssay({
  title: '제주 올레길 1-1',
  memo: '성산-광치기',
  checklist: [],
  places: [olle],
  query: '제주 올레길 1-1',
});
const songhaeBlog = generateTravelBlogEssay({
  title: '대구 송해공원',
  memo: '낙동강변',
  checklist: [],
  places: [songhae],
  query: '대구 송해공원',
});

const similarity = essaySimilarity(olleBlog.body, songhaeBlog.body);
const banned = ['우리는 서두르지 않았다', '천천히 걸어도 괜찮은 길이었다'];
const bannedHits = banned.filter((phrase) => olleBlog.body.includes(phrase) || songhaeBlog.body.includes(phrase));
const olleHasJeju = /제주|올레|성산|광치기|유채|현무암/.test(olleBlog.body);
const songhaeHasDaegu = /대구|송해|낙동강|동상|은행/.test(songhaeBlog.body);
const olleHasOrder = olleBlog.body.includes('성산일출봉이') && olleBlog.body.includes('수평선이');
const songhaeHasOrder = songhaeBlog.body.includes('송해 선생님 동상') && songhaeBlog.body.includes('송해공원이라');
const diaryBanned = /했습니다|에 갔습니다|오늘 고른 곳은/.test(olleBlog.body) || /했습니다|에 갔습니다|오늘 고른 곳은/.test(songhaeBlog.body);
const lengthOk =
  olleBlog.body.length >= 1200 &&
  olleBlog.body.length <= 1800 &&
  songhaeBlog.body.length >= 1200 &&
  songhaeBlog.body.length <= 1800;
const amenitiesOk =
  /주차/.test(olleBlog.body) &&
  /차박/.test(olleBlog.body) &&
  /맛집/.test(olleBlog.body) &&
  /주차/.test(songhaeBlog.body) &&
  /차박/.test(songhaeBlog.body) &&
  /맛집/.test(songhaeBlog.body);

const report = {
  saveLoadRoundTrip: savedOk,
  similarity,
  similarityPass: similarity <= 0.5,
  bannedHits,
  olleHasJeju,
  songhaeHasDaegu,
  olleHasOrder,
  songhaeHasOrder,
  diaryBanned,
  lengthOk,
  amenitiesOk,
  olleChars: olleBlog.body.length,
  songhaeChars: songhaeBlog.body.length,
  olleTitle: olleBlog.title,
  songhaeTitle: songhaeBlog.title,
  ollePhotoCount: olleBlog.photoCount,
  songhaePhotoCount: songhaeBlog.photoCount,
};

console.log(JSON.stringify(report, null, 2));
if (!savedOk) throw new Error('save/load roundtrip failed');
if (similarity > 0.5) throw new Error(`blog similarity too high: ${similarity}`);
if (bannedHits.length) throw new Error(`banned phrases: ${bannedHits.join(', ')}`);
if (!olleHasJeju || !songhaeHasDaegu) throw new Error('place features missing');
if (!olleHasOrder || !songhaeHasOrder) throw new Error('photo order missing');
if (diaryBanned) throw new Error('diary/AI list pattern found');
if (!lengthOk) throw new Error('review length must be 1200-1800');
if (!amenitiesOk) throw new Error('parking/camping/restaurants missing');
