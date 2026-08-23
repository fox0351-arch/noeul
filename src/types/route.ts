import { PlaceLocation } from '@/types/place';

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface TravelRoute {
  name: string;
  sourceFileName?: string;
  createdAt: string;
  points: RoutePoint[];
}

export function isRoutePoint(value: unknown): value is RoutePoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as RoutePoint;
  return typeof point.latitude === 'number' && typeof point.longitude === 'number'
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

export function isTravelRoute(value: unknown): value is TravelRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as TravelRoute;
  return (
    typeof route.name === 'string'
    && typeof route.createdAt === 'string'
    && Array.isArray(route.points)
    && route.points.length >= 2
    && route.points.every(isRoutePoint)
    && (route.sourceFileName === undefined || typeof route.sourceFileName === 'string')
  );
}

export function routePointsToLocations(points: RoutePoint[]): PlaceLocation[] {
  return points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
}
