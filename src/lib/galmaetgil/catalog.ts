export type GalmaetgilAmenity = {
  carCamping: string;
  parking: string;
  toilet: string;
  walkDifficulty60: string;
  food: string;
};

export type GalmaetgilSection = {
  courseId: string;
  courseName: string;
  sectionId: string;
  sectionName: string;
  geometry: { lat: number; lng: number }[];
  amenity: GalmaetgilAmenity;
};

function line(points: [number, number][]): { lat: number; lng: number }[] {
  return points.map(([lat, lng]) => ({ lat, lng }));
}

const EAST_AMENITY: GalmaetgilAmenity = {
  carCamping: '해안 공원 인근은 야간 차박이 제한되는 구간이 많습니다. 지정 주차 공간만 이용하세요.',
  parking: '민락수변공원·광안리·해운대 공영주차장을 이용하기 쉽습니다.',
  toilet: '수변공원과 해수욕장 화장실이 비교적 가깝습니다.',
  walkDifficulty60: '평지 위주라 60대 이상도 천천히 걷기 좋습니다. 난간 없는 방파제는 피하세요.',
  food: '광안리·민락 회센터와 카페거리가 가깝습니다.',
};

const NAKDONG_AMENITY: GalmaetgilAmenity = {
  carCamping: '을숙도·삼락 생태공원은 차박보다 주간 산책에 맞습니다.',
  parking: '을숙도 주차장, 삼락생태공원 주차장을 이용하세요.',
  toilet: '방문자센터와 공원 화장실을 이용할 수 있습니다.',
  walkDifficulty60: '강변 자전거길과 겹쳐 평탄합니다. 바람이 세면 체감 난이도가 올라갑니다.',
  food: '하단·명지 일대 국밥과 카페를 들르기 좋습니다.',
};

export const GALMAETGIL_SECTIONS: GalmaetgilSection[] = [
  {
    courseId: '1',
    courseName: '갈맷길 1코스 동해안',
    sectionId: '1-1',
    sectionName: '민락수변공원-광안리',
    geometry: line([
      [35.1587, 129.1604],
      [35.1598, 129.1618],
      [35.1612, 129.1635],
      [35.1626, 129.1652],
      [35.1638, 129.167],
    ]),
    amenity: EAST_AMENITY,
  },
  {
    courseId: '1',
    courseName: '갈맷길 1코스 동해안',
    sectionId: '1-2',
    sectionName: '광안리-해운대',
    geometry: line([
      [35.1638, 129.167],
      [35.1559, 129.152],
      [35.1586, 129.1603],
      [35.1588, 129.1709],
    ]),
    amenity: EAST_AMENITY,
  },
  {
    courseId: '1',
    courseName: '갈맷길 1코스 동해안',
    sectionId: '1-3',
    sectionName: '해운대-송정-임랑',
    geometry: line([
      [35.1588, 129.1709],
      [35.1786, 129.1998],
      [35.242, 129.218],
      [35.3185, 129.264],
    ]),
    amenity: EAST_AMENITY,
  },
  {
    courseId: '2',
    courseName: '갈맷길 2코스 기장 해안',
    sectionId: '2-1',
    sectionName: '임랑-월내-대변',
    geometry: line([
      [35.3185, 129.264],
      [35.327, 129.278],
      [35.223, 129.228],
      [35.2235, 129.227],
    ]),
    amenity: {
      ...EAST_AMENITY,
      food: '기장 대변항 멸치회와 연화리 카페가 가깝습니다.',
      parking: '임랑·월내 해수욕장 주차장을 이용하세요.',
    },
  },
  {
    courseId: '3',
    courseName: '갈맷길 3코스 낙동강하구',
    sectionId: '3-1',
    sectionName: '을숙도-다대포',
    geometry: line([
      [35.1046, 128.9416],
      [35.096, 128.944],
      [35.0477, 128.966],
      [35.047, 128.9655],
    ]),
    amenity: NAKDONG_AMENITY,
  },
  {
    courseId: '4',
    courseName: '갈맷길 4코스 남항',
    sectionId: '4-1',
    sectionName: '송도-암남공원',
    geometry: line([
      [35.0764, 129.0178],
      [35.069, 129.017],
      [35.0598, 129.014],
      [35.059, 129.025],
    ]),
    amenity: {
      carCamping: '송도 해안도로는 야간 주차가 혼잡합니다. 지정 주차장만 이용하세요.',
      parking: '송도해수욕장·암남공원 주차장을 이용하세요.',
      toilet: '송도 해수욕장 화장실이 가깝습니다.',
      walkDifficulty60: '해안 데크는 평탄하나 암남공원 언덕은 가쁩니다.',
      food: '송도 밀면과 해산물, 남항 카페를 들를 수 있습니다.',
    },
  },
  {
    courseId: '5',
    courseName: '갈맷길 5코스 영도',
    sectionId: '5-1',
    sectionName: '태종대-흰여울',
    geometry: line([
      [35.0537, 129.085],
      [35.06, 129.08],
      [35.078, 129.045],
      [35.0795, 129.041],
    ]),
    amenity: {
      carCamping: '태종대는 차박보다 주간 탐방에 맞습니다.',
      parking: '태종대 유원지 주차장을 이용하세요.',
      toilet: '태종대 입구와 전망대 화장실을 이용할 수 있습니다.',
      walkDifficulty60: '흰여울 골목은 계단이 있습니다. 태종대 순환로는 완만합니다.',
      food: '영도 봉래시장과 흰여울 카페가 가깝습니다.',
    },
  },
  {
    courseId: '6',
    courseName: '갈맷길 6코스 금정산',
    sectionId: '6-1',
    sectionName: '범어사-금정산성',
    geometry: line([
      [35.283, 129.063],
      [35.28, 129.055],
      [35.254, 129.049],
      [35.246, 129.05],
    ]),
    amenity: {
      carCamping: '산성 안 마을 인근은 야간 주차를 삼가세요.',
      parking: '범어사 주차장을 이용하세요.',
      toilet: '범어사와 산성마을 화장실을 이용할 수 있습니다.',
      walkDifficulty60: '산길이라 난이도가 있습니다. 짧은 사찰 구간만 걷는 편이 안전합니다.',
      food: '범어사 입구 사찰 음식과 산성마을 막걸리를 들를 수 있습니다.',
    },
  },
  {
    courseId: '7',
    courseName: '갈맷길 7코스 온천천',
    sectionId: '7-1',
    sectionName: '동래-온천천',
    geometry: line([
      [35.2046, 129.0837],
      [35.198, 129.08],
      [35.186, 129.075],
      [35.176, 129.075],
    ]),
    amenity: {
      carCamping: '하천변은 차박이 금지입니다.',
      parking: '동래읍성·온천천 인근 공영주차장을 이용하세요.',
      toilet: '온천천 시민공원 화장실이 가깝습니다.',
      walkDifficulty60: '평지 산책로라 60대 이상도 걷기 쉽습니다.',
      food: '동래 파전과 명륜동 카페거리가 가깝습니다.',
    },
  },
  {
    courseId: '8',
    courseName: '갈맷길 8코스 낙동강 중류',
    sectionId: '8-1',
    sectionName: '삼락-화명',
    geometry: line([
      [35.167, 128.973],
      [35.18, 129.003],
      [35.204, 129.004],
      [35.23, 129.013],
    ]),
    amenity: NAKDONG_AMENITY,
  },
  {
    courseId: '9',
    courseName: '갈맷길 9코스 철마·아홉산',
    sectionId: '9-1',
    sectionName: '철마-아홉산숲',
    geometry: line([
      [35.275, 129.17],
      [35.28, 129.18],
      [35.29, 129.19],
      [35.3, 129.2],
    ]),
    amenity: {
      carCamping: '숲 주차장 야간 이용은 제한될 수 있습니다.',
      parking: '아홉산숲 주차장을 이용하세요.',
      toilet: '방문자센터 화장실을 이용하세요.',
      walkDifficulty60: '완만한 숲길이나 거리가 길어 중간에 쉬는 것이 좋습니다.',
      food: '철마면 농가맛집과 기장 카페를 들를 수 있습니다.',
    },
  },
];

export function galmaetgilToGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: GALMAETGIL_SECTIONS.map((section) => ({
      type: 'Feature' as const,
      properties: {
        courseId: section.courseId,
        courseName: section.courseName,
        sectionId: section.sectionId,
        sectionName: section.sectionName,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: section.geometry.map((point) => [point.lng, point.lat]),
      },
    })),
  };
}
