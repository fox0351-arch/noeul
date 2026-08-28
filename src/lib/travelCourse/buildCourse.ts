import { haversineMeters } from '@/lib/geo';
import { resolveDestination } from '@/lib/travelMap/buildTravelMap';
import type { TravelCourse, TravelCourseOrderSource, TravelCoursePhotoInput, TravelCourseStop } from '@/types/travelCourse';

const STAY_MIN_PER_STOP = 20;
const WALK_KMH = 3.5;
const MAX_WAYPOINTS = 23;

function mapsKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.GOOGLE_MAPS_SERVER_KEY?.trim() || null;
}

function sortTime(photo: TravelCoursePhotoInput, index: number): number {
  if (photo.capturedAt) {
    const time = Date.parse(photo.capturedAt);
    if (Number.isFinite(time)) return time;
  }
  if (typeof photo.lastModified === 'number' && Number.isFinite(photo.lastModified)) {
    return photo.lastModified;
  }
  return index;
}

function orderSourceOf(photos: TravelCoursePhotoInput[]): TravelCourseOrderSource {
  if (photos.some((photo) => photo.capturedAt && Number.isFinite(Date.parse(photo.capturedAt)))) return 'exif';
  if (photos.some((photo) => typeof photo.lastModified === 'number')) return 'file';
  return 'upload';
}

function collapsePlaces(photos: TravelCoursePhotoInput[]): TravelCoursePhotoInput[] {
  const ordered = photos
    .map((photo, index) => ({ photo, index }))
    .filter((item) => item.photo.place?.trim())
    .sort((a, b) => sortTime(a.photo, a.index) - sortTime(b.photo, b.index));
  const collapsed: TravelCoursePhotoInput[] = [];
  for (const item of ordered) {
    const place = item.photo.place.trim();
    const last = collapsed[collapsed.length - 1];
    if (last?.place === place) continue;
    collapsed.push({ ...item.photo, place });
  }
  return collapsed;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.max(0, Math.round(meters))}m`;
}

function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간`;
  return `${mins}분`;
}

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

async function fetchWalkingDirections(stops: TravelCourseStop[]): Promise<{
  distanceM: number;
  durationMin: number;
  path: { lat: number; lng: number }[];
} | null> {
  const apiKey = mapsKey();
  if (!apiKey || stops.length < 2) return null;
  const origin = `${stops[0].lat},${stops[0].lng}`;
  const destination = `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`;
  const middle = stops.slice(1, -1).slice(0, MAX_WAYPOINTS);
  const search = new URLSearchParams({
    origin,
    destination,
    mode: 'walking',
    language: 'ko',
    key: apiKey,
  });
  if (middle.length) {
    search.set('waypoints', middle.map((stop) => `${stop.lat},${stop.lng}`).join('|'));
  }
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${search}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: string;
    routes?: {
      overview_polyline?: { points?: string };
      legs?: { distance?: { value?: number }; duration?: { value?: number } }[];
    }[];
  };
  if (payload.status !== 'OK' || !payload.routes?.[0]) return null;
  const route = payload.routes[0];
  const legs = route.legs ?? [];
  const distanceM = legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
  const durationMin = legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0) / 60;
  const path = route.overview_polyline?.points ? decodePolyline(route.overview_polyline.points) : [];
  return { distanceM, durationMin, path };
}

function fallbackWalk(stops: TravelCourseStop[]): { distanceM: number; durationMin: number; path: { lat: number; lng: number }[] } {
  let distanceM = 0;
  const path = stops.map((stop) => ({ lat: stop.lat, lng: stop.lng }));
  for (let index = 1; index < stops.length; index += 1) {
    distanceM += haversineMeters(
      { latitude: stops[index - 1].lat, longitude: stops[index - 1].lng },
      { latitude: stops[index].lat, longitude: stops[index].lng }
    ) * 1.25;
  }
  const durationMin = (distanceM / 1000 / WALK_KMH) * 60;
  return { distanceM, durationMin, path };
}

export async function buildTravelCourse(photos: TravelCoursePhotoInput[]): Promise<TravelCourse> {
  const collapsed = collapsePlaces(photos ?? []);
  const source = orderSourceOf(photos ?? []);
  const stops: TravelCourseStop[] = [];
  for (const photo of collapsed) {
    const dest = await resolveDestination(photo.place);
    if (!dest) continue;
    stops.push({
      order: stops.length + 1,
      name: photo.place,
      lat: dest.lat,
      lng: dest.lng,
      source: dest.source,
      capturedAt: photo.capturedAt,
    });
  }
  if (stops.length === 0) {
    throw new Error('장소를 정렬할 수 없어 여행 코스를 만들지 못했습니다.');
  }

  const walking =
    stops.length >= 2 ? (await fetchWalkingDirections(stops)) ?? fallbackWalk(stops) : { distanceM: 0, durationMin: 0, path: stops.map((stop) => ({ lat: stop.lat, lng: stop.lng })) };
  const stayMin = stops.length * STAY_MIN_PER_STOP;
  const totalDurationMin = walking.durationMin + stayMin;
  const visitOrder = stops.map((stop) => stop.name);
  const first = visitOrder[0];
  const last = visitOrder[visitOrder.length - 1];
  const orderLabel = source === 'exif' ? '촬영 시각' : source === 'file' ? '파일 시간' : '업로드 순서';
  const summary =
    visitOrder.length > 1
      ? `${orderLabel} 기준으로 ${first}에서 ${last}까지 ${visitOrder.length}곳을 이은 도보 코스입니다.`
      : `${first} 한 곳을 중심으로 본 코스입니다.`;

  return {
    summary,
    stops,
    visitOrder,
    totalDistanceM: Math.round(walking.distanceM),
    totalDurationMin: Math.round(totalDurationMin),
    distanceLabel: formatDistance(walking.distanceM),
    durationLabel: formatDuration(totalDurationMin),
    orderSource: source,
    path: walking.path,
  };
}
