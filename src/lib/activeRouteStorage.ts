import { PlaceItem } from '@/types/place';
import { isTravelRoute, TravelRoute } from '@/types/route';

const STORAGE_KEY = 'noeul.activeRoute.v1';

export interface ActiveRouteSession {
  route: TravelRoute;
  places: PlaceItem[];
  title: string;
  query: string;
}

function stripPhotos(places: PlaceItem[]): PlaceItem[] {
  return places.map((place) => {
    const { photos: _photos, ...rest } = place;
    return rest;
  });
}

function isPlaceLite(value: unknown): value is PlaceItem {
  if (!value || typeof value !== 'object') return false;
  const place = value as PlaceItem;
  return (
    typeof place.id === 'string' &&
    typeof place.name === 'string' &&
    typeof place.address === 'string' &&
    typeof place.location?.latitude === 'number' &&
    typeof place.location?.longitude === 'number'
  );
}

export function saveActiveRouteSession(session: ActiveRouteSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: ActiveRouteSession = {
      route: session.route,
      places: stripPhotos(session.places),
      title: session.title,
      query: session.query,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 용량 부족 시 따라가기는 이번 화면에서만 유지
  }
}

export function loadActiveRouteSession(): ActiveRouteSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const session = parsed as ActiveRouteSession;
    if (!isTravelRoute(session.route)) return null;
    if (!Array.isArray(session.places) || !session.places.every(isPlaceLite)) return null;
    return {
      route: session.route,
      places: session.places,
      title: typeof session.title === 'string' ? session.title : session.route.name,
      query: typeof session.query === 'string' ? session.query : session.route.name,
    };
  } catch {
    return null;
  }
}
