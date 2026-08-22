import { PlaceItem } from '@/types/place';

export interface TravelMapChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export const TRAVEL_MAP_CHECKLIST_PRESETS: {
  id: string;
  label: string;
  text: string;
}[] = [
  { id: 'parking', label: '주차', text: '주차 확인' },
  { id: 'restroom', label: '화장실', text: '화장실 위치 확인' },
  { id: 'restaurant', label: '식당', text: '식당 후보 조사' },
  { id: 'food', label: '맛집', text: '맛집 방문' },
  { id: 'cafe', label: '카페', text: '카페 방문' },
  { id: 'lodging', label: '숙박', text: '숙박 예약 확인' },
  { id: 'carcamping', label: '차박', text: '차박 가능 여부 확인' },
  { id: 'sunrise', label: '일출', text: '일출 포인트 확인' },
  { id: 'sunset', label: '일몰', text: '일몰 포인트 확인' },
  { id: 'photo', label: '사진명소', text: '사진명소 촬영' },
];

export interface TravelMap {
  id: string;
  title: string;
  createdAt: string;
  /** 수정 저장 시 같은 id를 유지하고 updatedAt만 갱신합니다. */
  updatedAt: string;
  places: PlaceItem[];
  sourceQuery?: string;
  /** 여행 전체 계획·아이디어를 적는 공용 메모 */
  memo?: string;
  /** 여행 준비 체크리스트 */
  checklist?: TravelMapChecklistItem[];
}

export function withPresetChecklistTexts(
  items: TravelMapChecklistItem[]
): TravelMapChecklistItem[] {
  return items.map((item) => {
    const preset = TRAVEL_MAP_CHECKLIST_PRESETS.find((entry) => entry.id === item.id);
    return preset ? { ...item, text: preset.text } : item;
  });
}
