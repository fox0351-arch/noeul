export type TravelCourseOrderSource = 'exif' | 'file' | 'upload';

export interface TravelCourseStop {
  order: number;
  name: string;
  lat: number;
  lng: number;
  source: 'galmaetgil' | 'places';
  capturedAt?: string;
}

export interface TravelCourse {
  summary: string;
  stops: TravelCourseStop[];
  visitOrder: string[];
  totalDistanceM: number;
  totalDurationMin: number;
  distanceLabel: string;
  durationLabel: string;
  orderSource: TravelCourseOrderSource;
  path: { lat: number; lng: number }[];
}

export interface TravelCoursePhotoInput {
  place: string;
  fileName?: string;
  capturedAt?: string;
  lastModified?: number;
}
