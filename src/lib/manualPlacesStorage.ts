import { PlaceItem, PlacePhoto } from '@/types/place';
import { markCloudDataChanged, scopedStorageKey } from '@/lib/cloudSync/storageScope';

const STORAGE_KEY = 'noeul.manualPlaces.v1';

function isPlacePhoto(value: unknown): value is PlacePhoto {
  if (!value || typeof value !== 'object') return false;
  const photo = value as PlacePhoto;
  return typeof photo.id === 'string' && typeof photo.dataUrl === 'string' && photo.dataUrl.startsWith('data:image/');
}

function isManualPlace(value: unknown): value is PlaceItem {
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

export function loadManualPlaces(): PlaceItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(scopedStorageKey(STORAGE_KEY));
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isManualPlace).map((place) => ({
      ...place,
      addedManually: true,
      photos: Array.isArray(place.photos) ? place.photos.filter(isPlacePhoto) : undefined,
    }));
  } catch {
    return [];
  }
}

export function saveManualPlaces(places: PlaceItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(places));
  markCloudDataChanged('favorites');
}
