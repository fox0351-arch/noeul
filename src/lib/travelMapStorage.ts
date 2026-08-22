import { PlaceItem } from '@/types/place';
import { TravelMap } from '@/types/travelMap';

const STORAGE_KEY = 'noeul.travelMaps.v1';

interface TravelMapStore {
  version: 1;
  maps: TravelMap[];
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
    (place.memo === undefined || typeof place.memo === 'string')
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
    map.places.every(isPlaceItem)
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
      maps: mapsValue.filter(isTravelMap),
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
  updates: Pick<TravelMap, 'title' | 'places' | 'sourceQuery'>
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
    maps: record.maps,
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
