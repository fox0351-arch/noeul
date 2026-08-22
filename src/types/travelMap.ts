import { PlaceItem } from '@/types/place';

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
}
