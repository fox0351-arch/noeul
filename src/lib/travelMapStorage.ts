import { PlaceItem, PlacePhoto } from '@/types/place';
import { TravelMap, TravelMapChecklistItem } from '@/types/travelMap';
import { markCloudDataChanged, scopedStorageKey } from '@/lib/cloudSync/storageScope';

const STORAGE_KEY = 'noeul.travelMaps.v1';
const IDB_NAME = 'noeul-travel-maps';
const IDB_STORE = 'kv';
const IDB_KEY = 'store.v1';

interface TravelMapStore {
  version: 1;
  maps: TravelMap[];
}

let memoryStore: TravelMapStore | null = null;

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
  if (places.length === 0) return null;
  return {
    id: map.id,
    title: map.title,
    createdAt: map.createdAt,
    updatedAt: typeof map.updatedAt === 'string' ? map.updatedAt : map.createdAt,
    places: places.map(normalizePlaceItem),
    sourceQuery: typeof map.sourceQuery === 'string' ? map.sourceQuery : undefined,
    memo: typeof map.memo === 'string' ? map.memo : undefined,
    checklist: Array.isArray(map.checklist) ? map.checklist.filter(isChecklistItem) : undefined,
  };
}

function emptyStore(): TravelMapStore {
  return { version: 1, maps: [] };
}

function newestUpdatedAt(store: TravelMapStore): string {
  return store.maps.reduce((latest, map) => (map.updatedAt > latest ? map.updatedAt : latest), '');
}

function pickRicherStore(a: TravelMapStore, b: TravelMapStore): TravelMapStore {
  if (a.maps.length !== b.maps.length) return a.maps.length > b.maps.length ? a : b;
  return newestUpdatedAt(a) >= newestUpdatedAt(b) ? a : b;
}

function openMapsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB'));
  });
}

async function readIdbStore(): Promise<TravelMapStore | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  try {
    const db = await openMapsDb();
    const parsed = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const request = tx.objectStore(IDB_STORE).get(scopedStorageKey(IDB_KEY));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!parsed || typeof parsed !== 'object') return null;
    const mapsValue = (parsed as { maps?: unknown }).maps;
    if (!Array.isArray(mapsValue)) return null;
    return {
      version: 1,
      maps: mapsValue.map(coerceTravelMap).filter((map): map is TravelMap => map !== null),
    };
  } catch {
    return null;
  }
}

async function writeIdbStore(store: TravelMapStore): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  const db = await openMapsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(IDB_STORE).put(store, scopedStorageKey(IDB_KEY));
  });
  db.close();
}

function readLocalStore(): TravelMapStore {
  if (typeof window === 'undefined') return emptyStore();

  try {
    const raw = window.localStorage.getItem(scopedStorageKey(STORAGE_KEY));
    if (!raw) return emptyStore();

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyStore();

    const mapsValue = (parsed as { maps?: unknown }).maps;
    if (!Array.isArray(mapsValue)) return emptyStore();

    return {
      version: 1,
      maps: mapsValue
        .map(coerceTravelMap)
        .filter((map): map is TravelMap => map !== null),
    };
  } catch {
    return emptyStore();
  }
}

function writeLocalStore(store: TravelMapStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(store));
}

function readStore(): TravelMapStore {
  if (memoryStore) return memoryStore;
  const local = readLocalStore();
  memoryStore = local;
  return local;
}

function writeStore(store: TravelMapStore): void {
  if (typeof window === 'undefined') return;
  memoryStore = store;
  try {
    writeLocalStore(store);
  } catch {
    // 사진이 크면 localStorage 한도를 넘을 수 있습니다. IndexedDB가 원본을 보관합니다.
  }
  void writeIdbStore(store);
  markCloudDataChanged('travelMaps');
}

export async function hydrateTravelMaps(): Promise<TravelMap[]> {
  if (typeof window === 'undefined') return [];
  const local = readLocalStore();
  const idb = await readIdbStore();
  const next = idb ? pickRicherStore(idb, local) : local;
  memoryStore = next;
  try {
    writeLocalStore(next);
  } catch {
    // IndexedDB만으로 복원 가능
  }
  if (idb == null || pickRicherStore(next, idb) === next) {
    void writeIdbStore(next);
  }
  return next.maps;
}

export function loadTravelMaps(): TravelMap[] {
  return readStore().maps;
}

export function replaceTravelMapsForSync(maps: TravelMap[]): void {
  writeStore({ version: 1, maps });
}

export function saveTravelMap(map: TravelMap): TravelMap[] {
  const store = readStore();
  const next: TravelMapStore = {
    version: 1,
    maps: [...store.maps.filter((item) => item.id !== map.id), map],
  };
  writeStore(next);
  return next.maps;
}

export function updateTravelMap(
  id: string,
  updates: Pick<TravelMap, 'title' | 'places' | 'sourceQuery'> & {
    memo?: string;
    checklist?: TravelMap['checklist'];
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
            updatedAt: now,
          }
        : map
    ),
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
    .filter((map): map is TravelMap => map !== null);
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

export function clonePlaces(places: PlaceItem[]): PlaceItem[] {
  return places.map((place) => ({
    ...place,
    location: { ...place.location },
    types: place.types ? [...place.types] : undefined,
    photos: place.photos?.map((photo) => ({
      ...photo,
      analysis: photo.analysis ? { ...photo.analysis, subjects: [...photo.analysis.subjects], keywords: [...photo.analysis.keywords], visualTags: photo.analysis.visualTags ? [...photo.analysis.visualTags] : undefined } : undefined,
    })),
  }));
}
