import { PlaceItem, PlaceLocation, PlacePhoto } from '@/types/place';
import { scopedStorageKey } from '@/lib/cloudSync/storageScope';

const LS_KEY = 'noeul.searchSession.v1';
const IDB_NAME = 'noeul-search-session';
const IDB_STORE = 'kv';
const IDB_PHOTOS = 'photos.v1';

export type SearchSession = {
  query: string;
  keyword: string;
  center: PlaceLocation;
  places: PlaceItem[];
  checkedIds: string[];
  selectedPlaceId: string | null;
  loadedMapId: string | null;
  photos: PlacePhoto[];
};

function isPhoto(value: unknown): value is PlacePhoto {
  if (!value || typeof value !== 'object') return false;
  const photo = value as PlacePhoto;
  return typeof photo.id === 'string' && typeof photo.dataUrl === 'string' && photo.dataUrl.startsWith('data:image/');
}

function stripPhotos(places: PlaceItem[]): PlaceItem[] {
  return places.map((place) => ({
    ...place,
    photos: undefined,
  }));
}

function openDb(): Promise<IDBDatabase> {
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

async function writePhotos(photos: PlacePhoto[]): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(IDB_STORE).put(photos, scopedStorageKey(IDB_PHOTOS));
  });
  db.close();
}

async function readPhotos(): Promise<PlacePhoto[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const request = tx.objectStore(IDB_STORE).get(scopedStorageKey(IDB_PHOTOS));
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return Array.isArray(value) ? value.filter(isPhoto) : [];
  } catch {
    return [];
  }
}

export function writeSearchSession(session: SearchSession): void {
  if (typeof window === 'undefined') return;
  const payload = {
    query: session.query,
    keyword: session.keyword,
    center: session.center,
    places: stripPhotos(session.places),
    checkedIds: session.checkedIds,
    selectedPlaceId: session.selectedPlaceId,
    loadedMapId: session.loadedMapId,
  };
  try {
    window.localStorage.setItem(scopedStorageKey(LS_KEY), JSON.stringify(payload));
  } catch {
    // 사진은 IndexedDB에만 둡니다.
  }
  void writePhotos(session.photos);
}

export async function readSearchSession(): Promise<SearchSession | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(LS_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SearchSession>;
    if (!Array.isArray(parsed.places) || parsed.places.length === 0) return null;
    const photos = await readPhotos();
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : '',
      center: parsed.center || parsed.places[0]?.location,
      places: parsed.places,
      checkedIds: Array.isArray(parsed.checkedIds) ? parsed.checkedIds : parsed.places.map((place) => place.id),
      selectedPlaceId: parsed.selectedPlaceId || null,
      loadedMapId: parsed.loadedMapId || null,
      photos,
    };
  } catch {
    return null;
  }
}

export function clearSearchSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(scopedStorageKey(LS_KEY));
  void writePhotos([]);
}
