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

function isPlaceItem(value: unknown): value is PlaceItem {
  if (!value || typeof value !== 'object') return false;
  const place = value as PlaceItem;
  return (
    typeof place.id === 'string' &&
    typeof place.name === 'string' &&
    typeof place.address === 'string' &&
    typeof place.location?.latitude === 'number' &&
    typeof place.location?.longitude === 'number' &&
    (place.memo === undefined || typeof place.memo === 'string') &&
    (place.photos === undefined || Array.isArray(place.photos))
  );
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

function isTravelMap(value: unknown): value is TravelMap {
  if (!value || typeof value !== 'object') return false;
  const map = value as TravelMap;
  return (
    typeof map.id === 'string' &&
    typeof map.title === 'string' &&
    typeof map.createdAt === 'string' &&
    typeof map.updatedAt === 'string' &&
    Array.isArray(map.places) &&
    map.places.every(isPlaceItem) &&
    (map.memo === undefined || typeof map.memo === 'string') &&
    (map.checklist === undefined || (Array.isArray(map.checklist) && map.checklist.every(isChecklistItem))) &&
    (map.route === undefined || isTravelRoute(map.route))
  );
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
      maps: mapsValue.filter(isTravelMap).map((map) => ({
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
  if (!record.maps.every(isTravelMap)) return null;

  return {
    version: 1,
    maps: (record.maps as TravelMap[]).map((map) => ({
      ...map,
      places: map.places.map(normalizePlaceItem),
    })),
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
