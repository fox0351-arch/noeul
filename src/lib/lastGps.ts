import { PlaceLocation } from '@/types/place';

const KEY = 'noeul.lastGps.v1';

export interface LastGpsFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  heading: number | null;
  savedAt: string;
}

export function saveLastGps(fix: LastGpsFix): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(fix));
  } catch {
    // ignore
  }
}

export function loadLastGps(): LastGpsFix | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const fix = parsed as LastGpsFix;
    if (typeof fix.latitude !== 'number' || typeof fix.longitude !== 'number') return null;
    return fix;
  } catch {
    return null;
  }
}

export function lastGpsToLocation(fix: LastGpsFix | null): PlaceLocation | null {
  if (!fix) return null;
  return { latitude: fix.latitude, longitude: fix.longitude };
}
