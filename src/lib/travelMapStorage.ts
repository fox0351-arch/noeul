import { PlaceItem, PlacePhoto } from '@/types/place';
import { isTravelRoute } from '@/types/route';
import { TravelMap, TravelMapChecklistItem } from '@/types/travelMap';

const STORAGE_KEY = 'noeul.travelMaps.v1';

interface TravelMapStore {
  version: 1;
  maps: TravelMap[];
}

function isPlacePhoto(value: unknown): value is PlacePhoto {
  if (!value || typeof value !== 'object') return false;
  const photo = value as PlacePhoto;
  return typeof photo.id === 'string' && typeof photo.dataUrl === 'string' && photo.dataUrl.startsWith('data:image/');
}

function coerceCoordinate(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function coercePlaceItem(value: unknown): PlaceItem | null {
  if (!value || typeof value !== 'object') return null;
  const place = value as PlaceItem;
  const latitude = coerceCoordinate(place.location?.latitude);
  const longitude = coerceCoordinate(place.location?.longitude);
  if (
    typeof place.id !== 'string' ||
    typeof place.name !== 'string' ||
    typeof place.address !== 'string' ||
    latitude === null ||
    longitude === null
  ) {
    return null;
  }
  return {
    ...place,
    location: { latitude, longitude },
    memo: typeof place.memo === 'string' ? place.memo : undefined,
    photos: Array.isArray(place.photos) ? place.photos.filter(isPlacePhoto) : undefined,
  };
}

function normalizePlaceItem(place: PlaceItem): PlaceItem {
  return {
    ...place,
    photos: Array.isArray(place.photos) ? place.photos.filter(isPlacePhoto) : undefined,
  };
}

function isChecklistItem(value: unknown): value is TravelMapChecklistItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as TravelMapChecklistItem;
  return (
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    typeof item.completed === 'boolean'
  );
}

function coerceTravelMap(value: unknown): TravelMap | null {
  if (!value || typeof value !== 'object') return null;
  const map = value as TravelMap;
  if (typeof map.id !== 'string' || typeof map.title !== 'string' || typeof map.createdAt !== 'string') {
    return null;
  }
  const places = Array.isArray(map.places)
    ? map.places.map(coercePlaceItem).filter((place): place is PlaceItem => place !== null)
    : [];
  const route = map.route && isTravelRoute(map.route) ? map.route : undefined;
  if (places.length === 0 && !route) return null;
  return {
    ...map,
    places,
    updatedAt: typeof map.updatedAt === 'string' ? map.updatedAt : map.createdAt,
    memo: typeof map.memo === 'string' ? map.memo : undefined,
    checklist: Array.isArray(map.checklist) ? map.checklist.filter(isChecklistItem) : undefined,
    route,
  };
}

function emptyStore(): TravelMapStore {
  return { version: 1, maps: [] };
}

function readStore(): TravelMapStore {
  if (typeof window === 'undefined') return emptyStore();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyStore();

    const mapsValue = (parsed as { maps?: unknown }).maps;
    if (!Array.isArray(mapsValue)) return emptyStore();

    return {
      version: 1,
      maps: mapsValue
        .map(coerceTravelMap)
        .filter((map): map is TravelMap => map !== null)
        .map((map) => ({
          ...map,
          places: map.places.map(normalizePlaceItem),
        })),
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: TravelMapStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadTravelMaps(): TravelMap[] {
  return readStore().maps;
}

export function saveTravelMap(map: TravelMap): TravelMap[] {
  const store = readStore();
  const next: TravelMapStore = {
    version: 1,
    maps: [...store.maps, map],
  };
  writeStore(next);
  return next.maps;
}

export function updateTravelMap(
  id: string,
  updates: Pick<TravelMap, 'title' | 'places' | 'sourceQuery'> & {
    memo?: string;
    checklist?: TravelMap['checklist'];
    /** null이면 루트만 제거합니다. undefined면 기존 루트를 유지합니다. */
    route?: TravelMap['route'] | null;
  }
): TravelMap[] | null {
  const store = readStore();
  if (!store.maps.some((map) => map.id === id)) {
    return null;
  }

  const now = new Date().toISOString();
  const next: TravelMapStore = {
    version: 1,
    maps: store.maps.map((map) =>
      map.id === id
        ? {
            ...map,
            title: updates.title,
            places: updates.places,
            sourceQuery: updates.sourceQuery,
            memo: updates.memo !== undefined ? updates.memo : map.memo,
            checklist: updates.checklist !== undefined ? updates.checklist : map.checklist,
            route: updates.route === undefined ? map.route : updates.route ?? undefined,
            updatedAt: now,
          }
        : map
    ),
  };
  writeStore(next);
  return next.maps;
}

export function clearTravelMapRoute(id: string): TravelMap[] | null {
  const store = readStore();
  if (!store.maps.some((map) => map.id === id)) {
    return null;
  }

  const now = new Date().toISOString();
  const next: TravelMapStore = {
    version: 1,
    maps: store.maps.map((map) => {
      if (map.id !== id) return map;
      const { route: _removed, ...rest } = map;
      return { ...rest, updatedAt: now };
    }),
  };
  writeStore(next);
  return next.maps;
}

export function updateTravelMapMemo(id: string, memo: string): TravelMap[] | null {
  return updateTravelMapNotes(id, { memo });
}

export function updateTravelMapNotes(
  id: string,
  notes: { memo?: string; checklist?: NonNullable<TravelMap['checklist']> }
): TravelMap[] | null {
  const store = readStore();
  if (!store.maps.some((map) => map.id === id)) {
    return null;
  }

  const now = new Date().toISOString();
  const next: TravelMapStore = {
    version: 1,
    maps: store.maps.map((map) =>
      map.id === id
        ? {
            ...map,
            memo: notes.memo !== undefined ? notes.memo : map.memo,
            checklist: notes.checklist !== undefined ? notes.checklist : map.checklist,
            updatedAt: now,
          }
        : map
    ),
  };
  writeStore(next);
  return next.maps;
}

export function deleteTravelMap(id: string): TravelMap[] {
  const store = readStore();
  const next: TravelMapStore = {
    version: 1,
    maps: store.maps.filter((map) => map.id !== id),
  };
  writeStore(next);
  return next.maps;
}

export function removePlaceFromTravelMap(mapId: string, placeId: string): TravelMap[] | null {
  const store = readStore();
  if (!store.maps.some((map) => map.id === mapId)) {
    return null;
  }

  const now = new Date().toISOString();
  const next: TravelMapStore = {
    version: 1,
    maps: store.maps.map((map) =>
      map.id === mapId
        ? {
            ...map,
            places: map.places.filter((place) => place.id !== placeId),
            updatedAt: now,
          }
        : map
    ),
  };
  writeStore(next);
  return next.maps;
}

export function createTravelMapId(): string {
  return `map_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseBackupStore(value: unknown): TravelMapStore | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as { version?: unknown; maps?: unknown };
  if (record.version !== 1 || !Array.isArray(record.maps)) return null;
  const maps = record.maps
    .map(coerceTravelMap)
    .filter((map): map is TravelMap => map !== null)
    .map((map) => ({
      ...map,
      places: map.places.map(normalizePlaceItem),
    }));
  if (maps.length === 0) return null;

  return {
    version: 1,
    maps,
  };
}

export function exportTravelMapBackupJson(): string {
  return JSON.stringify(readStore(), null, 2);
}

export function restoreTravelMapsFromBackup(value: unknown): TravelMap[] | null {
  const store = parseBackupStore(value);
  if (!store) return null;

  writeStore(store);
  return store.maps;
}
