export interface PlaceLocation {
  latitude: number;
  longitude: number;
}

export interface PlaceItem {
  id: string;
  name: string;
  address: string;
  location: PlaceLocation;
  rating?: number;
  types?: string[];
  /** true면 검색이 아니라 사용자가 직접 추가한 장소 (주황 표시) */
  addedManually?: boolean;
  /** 사용자가 장소마다 남긴 메모 */
  memo?: string;
  /** 사용자가 장소마다 첨부한 사진 (압축 data URL) */
  photos?: PlacePhoto[];
}

export interface PlacePhoto {
  id: string;
  dataUrl: string;
  /** Google Drive에 저장된 원본 사진 파일 ID */
  driveFileId?: string;
  /** AI가 추정한 장면과 본문용 한 문장 */
  analysis?: PhotoAiAnalysis;
}

export type PhotoAiScene =
  | 'landscape'
  | 'place'
  | 'food'
  | 'sunrise'
  | 'sunset'
  | 'camping'
  | 'other';

export interface PhotoAiAnalysis {
  scene: PhotoAiScene;
  caption: string;
  subjects: string[];
  keywords: string[];
  confidence: number;
  landmark?: string;
}

export interface PlacesSearchResponse {
  query: string;
  center: PlaceLocation;
  places: PlaceItem[];
}

export interface PlaceReview {
  author: string;
  rating?: number;
  text: string;
  relativeTime?: string;
}

export interface PlaceDetails {
  id: string;
  name: string;
  address: string;
  rating?: number;
  userRatingCount?: number;
  description?: string;
  photoUrl?: string;
  openingHours: string[];
  phone?: string;
  website?: string;
  reviews: PlaceReview[];
  blogSummary: string;
}