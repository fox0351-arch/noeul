import { PlaceLocation } from '@/types/place';

const EARTH_RADIUS_M = 6371000;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(a: PlaceLocation, b: PlaceLocation): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function projectToMeters(point: PlaceLocation, originLat: number): { x: number; y: number } {
  const latRad = toRad(originLat);
  return {
    x: toRad(point.longitude) * EARTH_RADIUS_M * Math.cos(latRad),
    y: toRad(point.latitude) * EARTH_RADIUS_M,
  };
}

function closestOnSegment(
  point: PlaceLocation,
  start: PlaceLocation,
  end: PlaceLocation
): { point: PlaceLocation; distance: number } {
  const originLat = (start.latitude + end.latitude) / 2;
  const p = projectToMeters(point, originLat);
  const a = projectToMeters(start, originLat);
  const b = projectToMeters(end, originLat);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) {
    return { point: start, distance: haversineMeters(point, start) };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
  const closest: PlaceLocation = {
    latitude: start.latitude + (end.latitude - start.latitude) * t,
    longitude: start.longitude + (end.longitude - start.longitude) * t,
  };
  return { point: closest, distance: haversineMeters(point, closest) };
}

function distanceToSegmentMeters(
  point: PlaceLocation,
  start: PlaceLocation,
  end: PlaceLocation
): number {
  return closestOnSegment(point, start, end).distance;
}

export function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function lerpBearing(from: number, to: number, t: number): number {
  return wrapDegrees(from + shortestAngleDelta(from, to) * t);
}

/** 현재 위치에서 가장 가까운 경로 구간의 진행 방향(시작→끝)입니다. */
export function nearestSegmentBearing(
  point: PlaceLocation,
  route: PlaceLocation[]
): number | null {
  if (route.length < 2) return null;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestBearing = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const start = route[i];
    const end = route[i + 1];
    const dist = distanceToSegmentMeters(point, start, end);
    if (dist < bestDist) {
      bestDist = dist;
      bestBearing = bearingDegrees(start, end);
    }
  }
  return bestBearing;
}

export function closestPointOnRoute(
  point: PlaceLocation,
  route: PlaceLocation[]
): PlaceLocation | null {
  if (route.length === 0) return null;
  if (route.length === 1) return route[0];

  let best = closestOnSegment(point, route[0], route[1]);
  for (let i = 1; i < route.length - 1; i += 1) {
    const next = closestOnSegment(point, route[i], route[i + 1]);
    if (next.distance < best.distance) best = next;
  }
  return best.point;
}

export function distanceToRouteMeters(
  point: PlaceLocation,
  route: PlaceLocation[]
): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return haversineMeters(point, route[0]);

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length - 1; i += 1) {
    const next = distanceToSegmentMeters(point, route[i], route[i + 1]);
    if (next < min) min = next;
  }
  return min;
}

export function bearingDegrees(from: PlaceLocation, to: PlaceLocation): number {
  const fromLat = toRad(from.latitude);
  const toLat = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const OFF_ROUTE_THRESHOLD_M = 20;
export const FAR_OFF_ROUTE_THRESHOLD_M = 50;
export const WRONG_WAY_OFF_ROUTE_THRESHOLD_M = 100;
export const OFF_ROUTE_HOLD_MS = 800;
export const WEAK_GPS_ACCURACY_M = 30;
export const GPS_OK_ACCURACY_M = 15;
export const MAX_ACCEPT_GPS_ACCURACY_M = 40;
export const GPS_JUMP_MIN_M = 28;
export const GPS_JUMP_MAX_MPS = 5;
export const GPS_SMOOTH_COUNT = 2;
/** GPS ±5~10m보다 긴 구간이 쌓여야 진행 방향으로 인정합니다. */
export const MIN_HEADING_MOVE_M = 16;
/** 한 번에 이보다 크게 꺾이면 GPS 튕김으로 보고 이번 값은 버립니다. */
export const MAX_HEADING_STEP_DEG = 75;
/** 1 m/s 이하에서는 지도 회전을 잠급니다. GPS 5~10m 흔들림이 걷는 방향으로 오인되지 않게 합니다. */
export const MAP_ROTATE_LOCK_MPS = 1;
export const MAP_ROTATE_START_MPS = 1.15;
export const MAP_ROTATE_STOP_MPS = 0.85;
/** 이보다 작은 방위 변화는 카메라에 넣지 않습니다. */
export const CAMERA_BEARING_DEADZONE_DEG = 15;
export const MIN_MAP_ROTATE_KMH = MAP_ROTATE_START_MPS * 3.6;
export const STOP_MAP_ROTATE_KMH = MAP_ROTATE_STOP_MPS * 3.6;

export type OffRouteLevel = 0 | 20 | 50 | 100;

export function offRouteLevelFromDistance(distanceMeters: number): OffRouteLevel {
  if (distanceMeters >= WRONG_WAY_OFF_ROUTE_THRESHOLD_M) return 100;
  if (distanceMeters >= FAR_OFF_ROUTE_THRESHOLD_M) return 50;
  if (distanceMeters >= OFF_ROUTE_THRESHOLD_M) return 20;
  return 0;
}

export function destinationPoint(
  from: PlaceLocation,
  bearingDeg: number,
  distanceM: number
): PlaceLocation {
  const angular = distanceM / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(from.latitude);
  const lng1 = toRad(from.longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: ((((lng2 * 180) / Math.PI + 540) % 360) - 180),
  };
}

export function averageLocations(points: PlaceLocation[]): PlaceLocation {
  const n = points.length;
  return {
    latitude: points.reduce((sum, p) => sum + p.latitude, 0) / n,
    longitude: points.reduce((sum, p) => sum + p.longitude, 0) / n,
  };
}

export function speedKmhFromCoords(
  coords: { speed: number | null },
  from: PlaceLocation | null,
  to: PlaceLocation,
  elapsedMs: number
): number | null {
  if (coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0) {
    return coords.speed * 3.6;
  }
  if (!from || elapsedMs < 400) return null;
  return (haversineMeters(from, to) / (elapsedMs / 1000)) * 3.6;
}
