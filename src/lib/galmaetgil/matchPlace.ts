import { matchGalmaetgilByPlaceName } from '@/lib/travelInfo/catalogMatch';
import { matchGalmaetgilTrail, sectionPathLengthM } from '@/lib/galmaetgil/matchTrail';
import { resolveDestination } from '@/lib/travelMap/buildTravelMap';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';
import type { GalmaetgilSection } from '@/lib/galmaetgil/catalog';

const NEARBY_M = 1500;
const WALK_KMH = 3.5;

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result.slice(0, 12);
}

function difficultyFromWalk(text: string): string {
  if (/쉽|평지|완만/.test(text) && !/언덕|가파|난이도|산길|계단/.test(text)) return '쉬움';
  if (/산길|가파|언덕|계단|난이도/.test(text)) return '어려움';
  return '보통';
}

function seniorFromWalk(text: string): string {
  if (/60대 이상도|걷기 좋|걷기 쉽/.test(text)) return '추천';
  if (/산길|가파|계단이 있/.test(text)) return '비추천';
  return '보통';
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.max(0, Math.round(meters))}m`;
}

function formatDuration(meters: number): string {
  const minutes = Math.max(1, Math.round((meters / 1000 / WALK_KMH) * 60));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간`;
  return `${mins}분`;
}

function unmatched(placeName: string): GalmaetgilPlaceMatch {
  return {
    placeName,
    matched: false,
    kind: 'none',
    message: '갈맷길 구간 아님',
    courseName: '갈맷길 구간 아님',
    sectionName: '갈맷길 구간 아님',
    distanceLabel: '-',
    durationLabel: '-',
    difficulty: '-',
    parking: '-',
    toilet: '-',
    carCamping: '-',
    seniorRecommend: '-',
  };
}

function fromSection(
  placeName: string,
  section: GalmaetgilSection,
  kind: 'exact' | 'nearby',
  distanceToCourseM?: number
): GalmaetgilPlaceMatch {
  const lengthM = sectionPathLengthM(section);
  const amenity = section.amenity;
  return {
    placeName,
    matched: true,
    kind,
    courseName: section.courseName,
    sectionName: section.sectionName,
    distanceLabel: formatDistance(lengthM),
    durationLabel: formatDuration(lengthM),
    difficulty: difficultyFromWalk(amenity?.walkDifficulty60 || ''),
    parking: amenity?.parking || '확인 불가',
    toilet: amenity?.toilet || '확인 불가',
    carCamping: amenity?.carCamping || '확인 불가',
    seniorRecommend: seniorFromWalk(amenity?.walkDifficulty60 || ''),
    distanceToCourseM,
  };
}

export async function matchPlacesToGalmaetgil(placeNames: string[]): Promise<GalmaetgilPlaceMatch[]> {
  const names = uniqueNames(placeNames);
  const results: GalmaetgilPlaceMatch[] = [];

  for (const placeName of names) {
    const byName = matchGalmaetgilByPlaceName(placeName);
    if (byName) {
      results.push(fromSection(placeName, byName, 'exact', 0));
      continue;
    }

    const dest = await resolveDestination(placeName);
    if (!dest) {
      results.push(unmatched(placeName));
      continue;
    }

    const trail = matchGalmaetgilTrail({ lat: dest.lat, lng: dest.lng });
    const near = trail?.distanceM ?? Number.POSITIVE_INFINITY;
    if (trail?.section && near <= NEARBY_M) {
      results.push(fromSection(placeName, trail.section, 'nearby', Math.round(near)));
      continue;
    }

    results.push(unmatched(placeName));
  }

  return results;
}
