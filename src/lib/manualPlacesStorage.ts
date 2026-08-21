import { PlaceItem } from '@/types/place';

const STORAGE_KEY = 'noeul.manualPlaces.v1';

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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isManualPlace).map((place) => ({
      ...place,
      addedManually: true,
    }));
  } catch {
    return [];
  }
}

export function saveManualPlaces(places: PlaceItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
}
