import { generateTravelBlogEssay, essaySimilarity, sentenceSimilarity, templateResidueSimilarity, sceneDescriptionShare } from '@/lib/travelBlogEssay';
import type { PlaceItem, PhotoAiScene } from '@/types/place';

function photoPlace(
  id: string,
  name: string,
  address: string,
  location: { latitude: number; longitude: number },
  memo: string,
  scenes: { scene: PhotoAiScene; caption: string; subjects: string[]; visualTags: string[]; ocrText?: string[] }[]
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
        sceneDescription: scene.caption,
        subjects: scene.subjects,
        keywords: scene.subjects,
        confidence: 0.8,
        visualTags: scene.visualTags,
        ...(scene.ocrText ? { ocrText: scene.ocrText } : {}),
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
const olleHasOrder = /성산일출봉/.test(olleBlog.body) && /수평선/.test(olleBlog.body);
const songhaeHasOrder = /송해 선생님 동상/.test(songhaeBlog.body) && /송해공원/.test(songhaeBlog.body);
const diaryBanned = /했습니다|에 갔습니다|오늘 고른 곳은/.test(olleBlog.body) || /했습니다|에 갔습니다|오늘 고른 곳은/.test(songhaeBlog.body);
const lengthOk =
  olleBlog.body.length >= 500 &&
  olleBlog.body.length <= 800 &&
  songhaeBlog.body.length >= 500 &&
  songhaeBlog.body.length <= 800;
const noPhotoLabels = !/\[사진\d+\]/.test(olleBlog.body) && !/\[사진\d+\]/.test(songhaeBlog.body);
const noCopiedScene =
  !olle.photos?.some((photo) => {
    const scene = photo.analysis?.sceneDescription || '';
    return scene.length >= 20 && olleBlog.body.includes(scene);
  }) &&
  !songhae.photos?.some((photo) => {
    const scene = photo.analysis?.sceneDescription || '';
    return scene.length >= 20 && songhaeBlog.body.includes(scene);
  });

const fluff =
  /그늘이 보이면 잠시 앉았다|물소리가 들리면 걸음을 늦추|표지 하나, 물소리 하나|침묵이 길었다|색이 바뀌는 자리/;
const fluffHits = fluff.test(olleBlog.body) || fluff.test(songhaeBlog.body);

const taebaekPeak = photoPlace(
  'taebaek-peak',
  '태백산',
  '강원특별자치도 태백시',
  { latitude: 37.099, longitude: 128.915 },
  '태백산',
  [
    {
      scene: 'landscape',
      caption: '태백산 정상석에 도착했을 때 해발 1572.9m라는 숫자가 먼저 눈에 들어왔다.',
      subjects: ['정상석', '설경', '부부'],
      visualTags: ['산', '인물'],
      ocrText: ['태백산', '1572.9m'],
    },
    {
      scene: 'landscape',
      caption: '함백산 정상 표지 뒤로 눈 덮인 능선이 하얗게 걸려 있었다.',
      subjects: ['함백산', '상고대', '눈꽃'],
      visualTags: ['산', '풍경'],
      ocrText: ['함백산'],
    },
  ]
);
const namhae = photoPlace(
  'namhae',
  '남해 독일마을',
  '경상남도 남해군',
  { latitude: 34.78, longitude: 127.89 },
  '남해',
  [
    {
      scene: 'place',
      caption: '독일마을 지붕과 파독광부기념공원 안내판이 한 컷에 들어왔다.',
      subjects: ['독일마을', '파독광부기념공원'],
      visualTags: ['건물'],
      ocrText: ['독일마을', '파독광부'],
    },
    {
      scene: 'place',
      caption: '설리스카이워크 해안 현수교 아래로 기암과 바다가 보였다.',
      subjects: ['설리스카이워크', '현수교', '기암괴석'],
      visualTags: ['바다', '건물'],
      ocrText: ['설리스카이워크'],
    },
  ]
);
const mixedBlog = generateTravelBlogEssay({
  title: '태백·남해',
  memo: '',
  checklist: [],
  places: [taebaekPeak, namhae],
  query: '태백 남해',
});
const mixedHasOcr =
  mixedBlog.body.includes('1572.9') &&
  mixedBlog.body.includes('정상석') &&
  mixedBlog.body.includes('독일마을') &&
  mixedBlog.body.includes('설리스카이워크');
const mixedNoFluff = !fluff.test(mixedBlog.body);

const windRepeat = (body: string) => (body.match(/스쳤다/g) || []).length;
const bodyPartPad =
  /바람이 (옷깃|어깨|등|귓가|귀|팔목|무릎)/.test(olleBlog.body) ||
  /바람이 (옷깃|어깨|등|귓가|귀|팔목|무릎)/.test(songhaeBlog.body);

const taebaek = photoPlace(
  'taebaek',
  '황지연못',
  '강원특별자치도 태백시',
  { latitude: 37.164, longitude: 128.986 },
  '태백',
  Array.from({ length: 10 }, () => ({
    scene: 'landscape' as PhotoAiScene,
    caption: '',
    subjects: [] as string[],
    visualTags: [] as string[],
  }))
);
const taebaekBlog = generateTravelBlogEssay({
  title: '태백시',
  memo: '',
  checklist: [],
  places: [taebaek],
  query: '태백시',
});
const taebaekWind = windRepeat(taebaekBlog.body);
const taebaekPad = /팔목을 스쳤다|무릎을 스쳤다|귓가를 스쳤다|귀를 스쳤다/.test(taebaekBlog.body);

const taebaekEmptyNoFluff = !fluff.test(taebaekBlog.body) && !/그늘이 한 박자/.test(taebaekBlog.body);

const mixedTenScenes: {
  scene: PhotoAiScene;
  caption: string;
  subjects: string[];
  visualTags: string[];
  ocrText?: string[];
}[] = [
  { scene: 'landscape', caption: '등산복을 입은 중년 부부가 정상석 앞에서 웃으며 사진을 찍고 있다.', subjects: ['정상석', '부부'], visualTags: ['산', '인물'], ocrText: ['태백산', '1572.9m'] },
  { scene: 'landscape', caption: '하얀 상고대 가지 사이로 두 사람이 능선을 바라보고 있다.', subjects: ['상고대', '설경'], visualTags: ['산', '인물'], ocrText: ['함백산'] },
  { scene: 'place', caption: '빨간 지붕 앞에서 중년 부부가 바다를 내려다보며 서 있다.', subjects: ['지붕', '바다'], visualTags: ['건물', '인물'], ocrText: ['독일마을'] },
  { scene: 'place', caption: '안내판 앞에 선 사람이 글자를 읽고 있다.', subjects: ['안내판'], visualTags: ['건물', '인물'], ocrText: ['파독광부'] },
  { scene: 'place', caption: '현수교 난간을 잡고 아래 기암을 내려다보고 있다.', subjects: ['현수교', '기암'], visualTags: ['바다', '인물'], ocrText: ['설리스카이워크'] },
  { scene: 'place', caption: '출렁다리 위에서 두 사람이 촛대바위 쪽으로 손을 흔들고 있다.', subjects: ['출렁다리'], visualTags: ['바다', '인물'], ocrText: ['추암', '촛대바위'] },
  { scene: 'landscape', caption: '눈 덮인 나무 아래에서 한 사람이 목을 움츠리고 서 있다.', subjects: ['눈꽃'], visualTags: ['산', '인물'], ocrText: ['주목'] },
  { scene: 'place', caption: '돌담 옆에서 두 사람이 논 풍경을 가리키고 있다.', subjects: ['돌담'], visualTags: ['길', '인물'], ocrText: ['다랑이논'] },
  { scene: 'food', caption: '식탁에 앉은 두 사람이 구운 생선을 나눠 먹고 있다.', subjects: ['식탁'], visualTags: ['건물', '인물'], ocrText: ['황태'] },
  { scene: 'landscape', caption: '샘물 앞에서 중년 부부가 고개를 숙여 물을 보고 있다.', subjects: ['샘물'], visualTags: ['산', '인물'], ocrText: ['검룡소'] },
];

function album(id: string, name: string, address: string, query: string, scenes: typeof mixedTenScenes) {
  return generateTravelBlogEssay({
    title: query,
    memo: '',
    checklist: [],
    places: [photoPlace(id, name, address, { latitude: 37, longitude: 128 }, query, scenes)],
    query,
  });
}

const sameTaebaek = album('same-tb', '태백산', '강원특별자치도 태백시', '태백시', mixedTenScenes);
const sameChuam = album('same-chuam', '추암촛대바위', '강원특별자치도 동해시', '추암시', mixedTenScenes);
const sameHaeundae = album('same-hae', '해운대해수욕장', '부산광역시 해운대구', '부산 해운대', mixedTenScenes);

const samePhotoTokens = [
  '태백산', '1572.9m', '정상석', '함백산', '상고대', '독일마을', '설리스카이워크', '촛대바위', '출렁다리', '주목', '다랑이논', '황태', '검룡소',
];
const sameUlsan = album('same-ulsan', '간절곶', '울산광역시', '울산', mixedTenScenes);
const samePairSimilarity = Math.max(
  sentenceSimilarity(sameTaebaek.body, sameChuam.body),
  sentenceSimilarity(sameTaebaek.body, sameHaeundae.body),
  sentenceSimilarity(sameTaebaek.body, sameUlsan.body)
);
const sameResidue = Math.max(
  templateResidueSimilarity(sameTaebaek.body, sameChuam.body, samePhotoTokens),
  templateResidueSimilarity(sameTaebaek.body, sameHaeundae.body, samePhotoTokens),
  templateResidueSimilarity(sameChuam.body, sameHaeundae.body, samePhotoTokens)
);
const leftoverTemplate = /주차는|차박은|맛집은|목적지 앞에서|안내판을 보고 나서야/.test(
  `${sameTaebaek.body}\n${sameChuam.body}\n${sameHaeundae.body}`
);
const haeundaeLeak = /해운대|광안리|마린시티/.test(sameHaeundae.body) || /해운대|광안리/.test(sameTaebaek.body);
const ulsanLeak = /울산|간절곶/.test(sameUlsan.body);
const sameScenesAcrossPlaceNames =
  sameTaebaek.body === sameUlsan.body &&
  sameTaebaek.body === sameChuam.body &&
  sameTaebaek.paragraphs[0].sceneDescription.includes('웃으며 사진을 찍고');
const sceneShare = sceneDescriptionShare(sameTaebaek.paragraphs);

const taebaekOnlyScenes = mixedTenScenes.map((scene, index) => ({
  ...scene,
  caption: `등산복을 입은 중년 부부가 눈 덮인 능선 ${index + 1}에서 정상석을 짚고 웃고 있다.`,
  subjects: ['정상석', '부부'],
  visualTags: ['산', '인물'],
  ocrText: ['태백산'],
}));
const chuamOnlyScenes = mixedTenScenes.map((scene, index) => ({
  ...scene,
  caption: `바람 부는 출렁다리 ${index + 1}에서 두 사람이 촛대바위를 가리키며 손을 흔들고 있다.`,
  subjects: ['출렁다리', '부부'],
  visualTags: ['바다', '인물'],
  ocrText: ['추암'],
}));
const haeundaeOnlyScenes = mixedTenScenes.map((scene, index) => ({
  ...scene,
  caption: `모래사장 ${index + 1}에서 모자를 쓴 두 사람이 파도를 보며 걷고 있다.`,
  subjects: ['모래사장', '부부'],
  visualTags: ['바다', '인물'],
  ocrText: ['해운대'],
}));
const distinctTaebaek = album('d-tb', '태백산', '강원특별자치도 태백시', '태백시', taebaekOnlyScenes);
const distinctChuam = album('d-chuam', '추암촛대바위', '강원특별자치도 동해시', '추암시', chuamOnlyScenes);
const distinctHaeundae = album('d-hae', '해운대해수욕장', '부산광역시 해운대구', '부산 해운대', haeundaeOnlyScenes);
const distinctSimilarity = Math.max(
  sentenceSimilarity(distinctTaebaek.body, distinctChuam.body),
  sentenceSimilarity(distinctTaebaek.body, distinctHaeundae.body),
  sentenceSimilarity(distinctChuam.body, distinctHaeundae.body)
);

const deleted = album('del', '태백산', '강원특별자치도 태백시', '태백시', mixedTenScenes.filter((_, index) => index !== 0));
const deleteChanges = sameTaebaek.body.includes('1572.9m') && !deleted.body.includes('1572.9m') && deleted.photoCount === 9;

const reversed = album('rev', '태백산', '강원특별자치도 태백시', '태백시', [...mixedTenScenes].reverse());
const reorderChanges =
  sameTaebaek.paragraphs[0]?.sceneDescription.includes('웃으며 사진을 찍고') &&
  reversed.paragraphs[0]?.sceneDescription.includes('샘물 앞에서') &&
  reversed.paragraphs.at(-1)?.sceneDescription.includes('웃으며 사진을 찍고');

const noPhotoLabelsInSame = !/\[사진\d+\]/.test(sameTaebaek.body);

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
  noPhotoLabels,
  noCopiedScene,
  fluffHits,
  mixedHasOcr,
  mixedNoFluff,
  olleChars: olleBlog.body.length,
  songhaeChars: songhaeBlog.body.length,
  olleTitle: olleBlog.title,
  songhaeTitle: songhaeBlog.title,
  ollePhotoCount: olleBlog.photoCount,
  songhaePhotoCount: songhaeBlog.photoCount,
  olleWind: windRepeat(olleBlog.body),
  songhaeWind: windRepeat(songhaeBlog.body),
  bodyPartPad,
  taebaekChars: taebaekBlog.body.length,
  taebaekWind,
  taebaekPad,
  taebaekPhotoCount: taebaekBlog.photoCount,
  taebaekEmptyNoFluff,
  mixedChars: mixedBlog.body.length,
  samePairSimilarity,
  sameResidue,
  leftoverTemplate,
  haeundaeLeak,
  ulsanLeak,
  sameScenesAcrossPlaceNames,
  sceneShare,
  distinctSimilarity,
  deleteChanges,
  reorderChanges,
  noPhotoLabelsInSame,
  sampleEssay: sameTaebaek.body.slice(0, 400),
};

console.log(JSON.stringify(report, null, 2));
if (!savedOk) throw new Error('save/load roundtrip failed');
if (similarity > 0.5) throw new Error(`blog similarity too high: ${similarity}`);
if (bannedHits.length) throw new Error(`banned phrases: ${bannedHits.join(', ')}`);
if (!olleHasJeju || !songhaeHasDaegu) throw new Error('place features missing');
if (!olleHasOrder || !songhaeHasOrder) throw new Error('photo order missing');
if (diaryBanned) throw new Error('diary/AI list pattern found');
if (!lengthOk) throw new Error('review length out of range');
if (fluffHits) throw new Error('generic fluff in review');
if (windRepeat(olleBlog.body) > 1 || windRepeat(songhaeBlog.body) > 1) {
  throw new Error('스쳤다 repeated');
}
if (bodyPartPad) throw new Error('body-part wind padding found');
if (taebaekBlog.photoCount !== 10) throw new Error('taebaek photos not all used');
if (taebaekWind > 1 || taebaekPad || !taebaekEmptyNoFluff) throw new Error('taebaek empty photos invented fluff');
if (!mixedHasOcr) throw new Error('OCR landmarks missing from mixed trip review');
if (!mixedNoFluff) throw new Error('fluff in mixed trip review');
if (!sameScenesAcrossPlaceNames) throw new Error('same photos changed when place name changed');
if (ulsanLeak) throw new Error('울산 leaked into photo-locked review');
if (haeundaeLeak) throw new Error('해운대 leaked into photo-locked review');
if (leftoverTemplate) throw new Error('region parking/food template still in photo review');
if (distinctSimilarity >= 0.3) throw new Error(`distinct album similarity too high: ${distinctSimilarity}`);
if (!deleteChanges) throw new Error('deleting a photo did not change the body');
if (!reorderChanges) throw new Error('reordering photos did not change body order');
if (!noPhotoLabels || !noPhotoLabelsInSame) throw new Error('photo labels still in body');
if (!noCopiedScene) throw new Error('sceneDescription copied into essay');
