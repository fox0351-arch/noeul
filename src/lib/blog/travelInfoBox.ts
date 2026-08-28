import { catalogTravelInfo, matchGalmaetgilByPlaceName } from '@/lib/travelInfo/catalogMatch';
import { sectionPathLengthM } from '@/lib/galmaetgil/matchTrail';
import type { PhotoAnalysis } from '@/types/blog';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

export type BlogTravelFacts = {
  placeName: string;
  courseName: string;
  distance: string;
  duration: string;
  difficulty: string;
  parking: string;
  toilet: string;
  cafe: string;
  restaurant: string;
  carCamping: string;
  seniorWalk: string;
  cafes: string[];
  restaurants: string[];
};

const UNKNOWN = '확인 불가';

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return UNKNOWN;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function formatDuration(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return UNKNOWN;
  const minutes = Math.max(1, Math.round((meters / 1000 / 3.5) * 60));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간`;
  return `${mins}분`;
}

function firstPlace(photos: PhotoAnalysis[]): string {
  return photos.find((photo) => photo.place?.trim())?.place.trim() || UNKNOWN;
}

export function resolveBlogTravelFacts(
  photos: PhotoAnalysis[],
  galmaetgil?: GalmaetgilPlaceMatch[]
): BlogTravelFacts {
  const placeName = firstPlace(photos);
  const matched = (galmaetgil ?? []).find((item) => item.matched);
  const catalog = matchGalmaetgilByPlaceName(placeName);
  const catalogInfo = catalogTravelInfo(placeName);
  const lengthM = catalog ? sectionPathLengthM(catalog) : 0;

  return {
    placeName,
    courseName:
      matched?.courseName && matched.matched
        ? `${matched.courseName} / ${matched.sectionName}`
        : catalog
          ? `${catalog.courseName} / ${catalog.sectionName}`
          : UNKNOWN,
    distance: matched?.distanceLabel && matched.matched ? matched.distanceLabel : formatDistance(lengthM),
    duration: matched?.durationLabel && matched.matched ? matched.durationLabel : formatDuration(lengthM),
    difficulty: matched?.difficulty && matched.matched ? matched.difficulty : catalogInfo?.difficulty || UNKNOWN,
    parking: matched?.parking && matched.matched ? matched.parking : catalogInfo?.parking || UNKNOWN,
    toilet: matched?.toilet && matched.matched ? matched.toilet : catalogInfo?.toilet || UNKNOWN,
    cafe: catalogInfo?.cafes?.[0] || UNKNOWN,
    restaurant: catalogInfo?.restaurants?.[0] || UNKNOWN,
    carCamping: matched?.carCamping && matched.matched ? matched.carCamping : catalogInfo?.carCamping || UNKNOWN,
    seniorWalk:
      matched?.seniorRecommend && matched.matched
        ? matched.seniorRecommend
        : catalogInfo?.seniorRecommend || UNKNOWN,
    cafes: catalogInfo?.cafes?.length ? catalogInfo.cafes : [UNKNOWN],
    restaurants: catalogInfo?.restaurants?.length ? catalogInfo.restaurants : [UNKNOWN],
  };
}

export function formatTravelInfoBox(facts: BlogTravelFacts): string {
  return [
    '[여행 정보]',
    '',
    `- 장소명: ${facts.placeName}`,
    `- 코스명: ${facts.courseName}`,
    `- 거리: ${facts.distance}`,
    `- 예상 소요시간: ${facts.duration}`,
    `- 난이도: ${facts.difficulty}`,
    `- 주차 여부: ${facts.parking}`,
    `- 화장실 여부: ${facts.toilet}`,
    `- 추천 카페: ${facts.cafe}`,
    `- 추천 맛집: ${facts.restaurant}`,
  ].join('\n');
}
