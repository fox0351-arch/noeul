export type GalmaetgilMatchKind = 'exact' | 'nearby' | 'none';

export interface GalmaetgilPlaceMatch {
  placeName: string;
  matched: boolean;
  kind: GalmaetgilMatchKind;
  message?: string;
  courseName: string;
  sectionName: string;
  distanceLabel: string;
  durationLabel: string;
  difficulty: string;
  parking: string;
  toilet: string;
  carCamping: string;
  seniorRecommend: string;
  distanceToCourseM?: number;
}
