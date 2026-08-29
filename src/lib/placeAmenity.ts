export type PlaceAmenity = {
  intro: string;
  oneLiner: string;
  parking: string;
  carCamping: string;
  visitTime: string;
  restaurants: string[];
};

type PlaceHint = {
  name: string;
  address?: string;
  types?: string[];
};

function blobOf(place: PlaceHint, query?: string): string {
  return `${query || ''} ${place.name} ${place.address || ''} ${(place.types || []).join(' ')}`;
}

function regionFallback(blob: string): PlaceAmenity {
  if (/제주/.test(blob)) {
    return {
      intro: '제주의 바람과 바다가 가까운 여행지입니다. 천천히 둘러보기 좋습니다.',
      oneLiner: '바다와 오름이 가까운 제주 여행지',
      parking: '공영주차장 또는 임시 주차면을 함께 쓰는 곳이 많습니다.',
      carCamping: '해안 도로변 무단 차박은 단속되는 구간이 있어, 지정 구역을 확인하는 것이 좋습니다.',
      visitTime: '오전 9시~낮 12시, 또는 해 질 녘',
      restaurants: ['성산 해물뚝배기', '서귀포 갈치조림', '협재 해산물'],
    };
  }
  if (/부산|해운대|광안/.test(blob)) {
    return {
      intro: '바닷가와 도심이 맞닿아 걷기 좋은 부산 여행지입니다.',
      oneLiner: '바다와 도시가 한 장면에 들어오는 곳',
      parking: '해수욕장 공영주차장은 주말에 빨리 찹니다. 조금 떨어진 자리에 두고 걷는 편이 편합니다.',
      carCamping: '해안 도로와 모래밭 차박은 제한되는 곳이 많습니다.',
      visitTime: '오전 또는 노을 질 무렵',
      restaurants: ['자갈치 회', '밀면', '씨앗호떡'],
    };
  }
  if (/대구|달성|수성/.test(blob)) {
    return {
      intro: '강바람과 공원이 넓은 대구 나들이 장소입니다.',
      oneLiner: '천천히 걷기 좋은 공원 여행지',
      parking: '공원 주변 공영주차장이 있습니다. 주말 낮에는 대기가 생길 수 있습니다.',
      carCamping: '공원 안 밤샘 주차는 제한되는 경우가 많습니다.',
      visitTime: '오전 10시~오후 4시',
      restaurants: ['따로국밥', '막창', '칼국수'],
    };
  }
  if (/강릉|경포|정동진/.test(blob)) {
    return {
      intro: '동해 바람과 솔향이 먼저 닿는 강릉 여행지입니다.',
      oneLiner: '동해와 솔숲이 가까운 강릉 명소',
      parking: '경포·정동진 해수욕장 공영주차장을 쓰기 쉽습니다.',
      carCamping: '해변 차박은 구간마다 다르니 안내판을 먼저 봅니다.',
      visitTime: '일출 무렵 또는 오후 느긋한 시간',
      restaurants: ['초당순두부', '고등어구이', '안목 커피거리 가벼운 식사'],
    };
  }
  return {
    intro: '천천히 둘러보기 좋은 여행지입니다.',
    oneLiner: '발걸음을 늦추고 보기 좋은 곳',
    parking: '목적지 공영주차장 여부를 현지에서 한 번 더 확인하는 것이 좋습니다.',
    carCamping: '차박은 구역마다 달라, 안내판을 보고 자리를 정하는 것이 안전합니다.',
    visitTime: '오전부터 해 지기 전',
    restaurants: ['현지 시장 식당', '국밥집', '공원 근처 백반'],
  };
}

const NAMED: Record<string, Partial<PlaceAmenity>> = {
  성산일출봉: {
    intro: '바다 위로 솟은 거대한 분화구입니다. 능선을 따라 오르면 제주 동쪽 바다가 한눈에 들어옵니다.',
    oneLiner: '제주의 아침이 열리는 분화구',
    parking: '성산일출봉 공영주차장을 이용합니다. 성수기에는 조금 걸어 들어가는 편이 편합니다.',
    carCamping: '주차장·해안 도로 차박은 제한됩니다.',
    visitTime: '일출 전, 또는 오전 일찍',
    restaurants: ['성산 해물뚝배기', '오분자기 뚝배기', '성산포 회'],
  },
  섭지코지: {
    intro: '초원과 바다가 맞닿는 제주 동쪽 끝자락입니다. 바람 부는 날 풍경이 특히 넓습니다.',
    oneLiner: '초원과 바다가 한 선으로 만나는 곳',
    parking: '섭지코지 입구 주차장을 씁니다. 주말에는 대기 시간이 생길 수 있습니다.',
    carCamping: '해안 산책로와 초지 차박은 할 수 없습니다.',
    visitTime: '오전 10시~오후 4시',
    restaurants: ['성산 해물뚝배기', '섭지 근처 해산물', '성산포 몸국'],
  },
  한라산: {
    intro: '제주 한가운데 자리한 산입니다. 완만한 탐방로를 고르면 천천히 오를 수 있습니다.',
    oneLiner: '구름 아래 능선이 길게 이어지는 산',
    parking: '성판악·영실 등 탐방로 공영주차장을 이용합니다.',
    carCamping: '탐방로 주차장 밤샘은 제한되는 경우가 많습니다.',
    visitTime: '오전 일찍 출발',
    restaurants: ['고기국수', '흑돼지', '오름 아래 백반'],
  },
  협재해수욕장: {
    intro: '에메랄드빛 얕은 바다가 넓게 펼쳐진 서쪽 해변입니다. 비양도가 눈앞에 보입니다.',
    oneLiner: '얕은 바다와 비양도가 보이는 해변',
    parking: '협재 공영주차장을 이용합니다. 여름에는 빨리 찹니다.',
    carCamping: '모래사장 차박은 금지입니다. 지정 야영장을 확인하세요.',
    visitTime: '오전, 또는 해 질 녘',
    restaurants: ['협재 해산물', '갈치조림', '해물라면'],
  },
  함덕: {
    intro: '하얀 모래와 에메랄드 바다가 맑은 동쪽 해변입니다. 산책로가 평탄합니다.',
    oneLiner: '맑은 물이 먼저 눈에 들어오는 해변',
    parking: '함덕 공영주차장을 이용합니다.',
    carCamping: '해변 차박은 제한됩니다.',
    visitTime: '오전 또는 오후 느긋한 시간',
    restaurants: ['함덕 해물라면', '회국수', '해변 카페 가벼운 식사'],
  },
  만장굴: {
    intro: '용암이 흘러 만든 긴 동굴입니다. 안은 서늘하고, 바닥이 고르지 않은 구간이 있습니다.',
    oneLiner: '서늘한 용암동굴',
    parking: '만장굴 주차장에 차를 둡니다.',
    carCamping: '주차장 밤샘은 제한됩니다.',
    visitTime: '낮 시간, 더위를 피할 때',
    restaurants: ['김녕 해산물', '고기국수', '해물뚝배기'],
  },
  우도: {
    intro: '성산 앞바다의 작은 섬입니다. 배 시간에 맞춰 다녀오면 하루가 넉넉합니다.',
    oneLiner: '배 타고 들어가는 작은 섬',
    parking: '성산항 주차장에 차를 두고 도항선을 탑니다. 섬 안 렌트·버스도 있습니다.',
    carCamping: '우도 해안 차박은 제한되는 곳이 많습니다.',
    visitTime: '오전 배편으로 들어가 오후 일찍 돌아오기',
    restaurants: ['우도 땅콩아이스크림', '해물라면', '성산포 회'],
  },
  송해공원: {
    intro: '낙동강이 넓게 보이는 대구 달성군의 공원입니다. 평지가 많아 천천히 걷기 좋습니다.',
    oneLiner: '강바람이 넓은 대구 공원',
    parking: '송해공원 공영주차장이 있습니다. 주말 낮에는 대기가 생길 수 있습니다.',
    carCamping: '공원 안 밤샘 주차는 제한되는 경우가 많습니다.',
    visitTime: '오전 10시~오후 4시',
    restaurants: ['따로국밥', '막창', '수성못 근처 칼국수'],
  },
  오죽헌: {
    intro: '검은 대나무와 옛집이 남아 있는 강릉의 상징적인 공간입니다.',
    oneLiner: '검은 대나무 정원과 옛집',
    parking: '오죽헌 공영주차장을 이용합니다.',
    carCamping: '유적지 안 차박은 할 수 없습니다.',
    visitTime: '오전 관람 시간',
    restaurants: ['초당순두부', '고등어구이', '강릉 국밥'],
  },
  안목: {
    intro: '바다를 보며 커피 한 잔 하기 좋은 강릉 해변입니다. 산책로가 짧고 평탄합니다.',
    oneLiner: '바다 앞 커피거리',
    parking: '안목 공영주차장 또는 해변 주차면을 이용합니다.',
    carCamping: '해변 도로 차박은 구간마다 다릅니다.',
    visitTime: '오전 커피, 또는 노을 질 무렵',
    restaurants: ['안목 커피거리 가벼운 식사', '고등어구이', '초당순두부'],
  },
  정동진: {
    intro: '기차역과 바다가 맞닿은 일출 명소입니다. 모래시계공원과 함께 둘러보기 좋습니다.',
    oneLiner: '기차와 바다가 만나는 일출 해변',
    parking: '정동진 해수욕장 공영주차장을 이용합니다. 일출 때는 일찍 자리를 잡는 것이 좋습니다.',
    carCamping: '해변 차박은 구간마다 다르니 안내판을 먼저 봅니다.',
    visitTime: '일출 무렵',
    restaurants: ['고등어구이', '해물칼국수', '초당순두부'],
  },
  경포: {
    intro: '호수와 바다가 가까운 강릉의 대표 풍경입니다. 평탄한 산책로가 이어집니다.',
    oneLiner: '호수와 바다가 나란한 강릉',
    parking: '경포 해수욕장·호수 공영주차장을 이용합니다.',
    carCamping: '해변 차박은 금지 구간이 있습니다.',
    visitTime: '오전 산책, 또는 해 질 녘',
    restaurants: ['초당순두부', '경포 막국수', '고등어구이'],
  },
};

function namedMatch(name: string): Partial<PlaceAmenity> | null {
  for (const [key, value] of Object.entries(NAMED)) {
    if (name.includes(key)) return value;
  }
  return null;
}

export function placeAmenity(place: PlaceHint, query?: string): PlaceAmenity {
  const blob = blobOf(place, query);
  const base = regionFallback(blob);
  const named = namedMatch(place.name);
  if (!named) {
    if (/해수욕장|해변/.test(place.name)) {
      return {
        ...base,
        intro: `${place.name}은 바다가 먼저 눈에 들어오는 곳입니다. 모래와 바람을 천천히 보기 좋습니다.`,
        oneLiner: '바다가 가까운 해변',
        visitTime: '오전 또는 노을 질 무렵',
      };
    }
    if (/공원|휴양림|습지/.test(place.name)) {
      return {
        ...base,
        intro: `${place.name}은 그늘과 벤치가 있어 쉬어 가기 좋습니다.`,
        oneLiner: '천천히 걷기 좋은 공원',
        visitTime: '오전 10시~오후 4시',
      };
    }
    return {
      ...base,
      intro: `${place.name}은 ${base.intro}`,
      oneLiner: base.oneLiner,
    };
  }
  return {
    intro: named.intro || base.intro,
    oneLiner: named.oneLiner || base.oneLiner,
    parking: named.parking || base.parking,
    carCamping: named.carCamping || base.carCamping,
    visitTime: named.visitTime || base.visitTime,
    restaurants: named.restaurants || base.restaurants,
  };
}

export function parkingShort(text: string): string {
  if (/제한|금지|할 수 없/.test(text) && /주차/.test(text)) return '주차 가능 · 혼잡할 수 있음';
  if (/공영|주차장/.test(text)) return '주차 가능';
  return '주차 확인 필요';
}

export function campingShort(text: string): string {
  if (/금지|할 수 없|제한/.test(text)) return '차박 제한';
  if (/지정|허용/.test(text)) return '지정 구역만 차박';
  return '차박 확인 필요';
}
