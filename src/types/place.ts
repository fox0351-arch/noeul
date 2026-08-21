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