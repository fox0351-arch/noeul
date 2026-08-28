import { GALMAETGIL_SECTIONS, type GalmaetgilAmenity, type GalmaetgilSection } from '@/lib/galmaetgil/catalog';
import type { TravelPlaceInfo } from '@/types/travelInfo';

function compact(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function tokens(value: string): string[] {
  return value
    .split(/[-–—,·\/\s]+/)
    .map((item) => item.replace(/해수욕장|유원지|공원|시장|마을/g, ''))
    .filter((item) => item.length >= 2);
}

export function matchGalmaetgilByPlaceName(placeName: string): GalmaetgilSection | null {
  const name = compact(placeName || '');
  if (!name) return null;
  let best: GalmaetgilSection | null = null;
  let bestScore = 0;
  for (const section of GALMAETGIL_SECTIONS) {
    const hay = compact(`${section.sectionName}${section.courseName}`);
    let score = 0;
    if (hay.includes(name) || name.includes(compact(section.sectionName))) score += 5;
    for (const token of tokens(section.sectionName)) {
      if (name.includes(compact(token)) || compact(token).includes(name)) score += 2;
    }
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

function splitFood(food: string): { restaurants: string[]; cafes: string[] } {
  const parts = food.split(/[·,]/).map((item) => item.trim()).filter(Boolean);
  const cafes = parts.filter((item) => /카페/.test(item));
  const restaurants = parts.filter((item) => !/카페/.test(item));
  return {
    restaurants: restaurants.length ? restaurants : parts.slice(0, 2),
    cafes: cafes.length ? cafes : ['인근 카페'],
  };
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

export function travelInfoFromAmenity(placeName: string, amenity: GalmaetgilAmenity): TravelPlaceInfo {
  const food = splitFood(amenity.food || '');
  return {
    placeName,
    parking: amenity.parking || '확인 불가',
    toilet: amenity.toilet || '확인 불가',
    carCamping: amenity.carCamping || '확인 불가',
    difficulty: difficultyFromWalk(amenity.walkDifficulty60 || ''),
    seniorRecommend: seniorFromWalk(amenity.walkDifficulty60 || ''),
    restaurants: food.restaurants,
    cafes: food.cafes,
  };
}

export function galmaetgilGps(placeName: string): { lat: number; lng: number; sectionName: string } | null {
  const section = matchGalmaetgilByPlaceName(placeName);
  const points = section?.geometry ?? [];
  if (!section || points.length === 0) return null;
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;
  return { lat, lng, sectionName: section.sectionName };
}

export function catalogTravelInfo(placeName: string): TravelPlaceInfo | null {
  const section = matchGalmaetgilByPlaceName(placeName);
  if (!section?.amenity) return null;
  return travelInfoFromAmenity(placeName, section.amenity);
}
