const AUTH_SCOPE_KEY = 'noeul.authUid.v1';
const GUEST_MIGRATION_CLAIM_KEY = 'noeul.guestMigrationClaim.v1';
const CLOUD_CHANGE_EVENT = 'noeul:cloud-data-changed';

export type CloudDataKind = 'travelMaps' | 'favorites' | 'settings';

export function getAuthScope(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AUTH_SCOPE_KEY);
  } catch {
    return null;
  }
}

export function setAuthScope(uid: string | null): void {
  if (typeof window === 'undefined') return;
  if (uid) {
    window.localStorage.setItem(AUTH_SCOPE_KEY, uid);
  } else {
    window.localStorage.removeItem(AUTH_SCOPE_KEY);
  }
}

export function scopedStorageKey(baseKey: string, uid = getAuthScope()): string {
  return uid ? `${baseKey}.user.${uid}` : baseKey;
}

export function copyGuestDataToUser(baseKeys: readonly string[], uid: string): void {
  if (typeof window === 'undefined') return;
  for (const baseKey of baseKeys) {
    const targetKey = scopedStorageKey(baseKey, uid);
    if (window.localStorage.getItem(targetKey) != null) continue;
    const guestValue = window.localStorage.getItem(baseKey);
    if (guestValue != null) window.localStorage.setItem(targetKey, guestValue);
  }
}

export function isGuestMigrationUnclaimed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(GUEST_MIGRATION_CLAIM_KEY) == null;
}

export function completeGuestMigrationClaim(uid: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GUEST_MIGRATION_CLAIM_KEY, uid);
}

export function getGuestMigrationClaim(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(GUEST_MIGRATION_CLAIM_KEY);
}

export function markCloudDataChanged(kind: CloudDataKind): void {
  if (typeof window === 'undefined') return;
  const uid = getAuthScope();
  if (uid) {
    const key = `noeul.cloudDirty.${uid}.${kind}`;
    const current = Number(window.localStorage.getItem(key));
    window.localStorage.setItem(key, String((Number.isFinite(current) ? current : 0) + 1));
  }
  window.dispatchEvent(new CustomEvent<CloudDataKind>(CLOUD_CHANGE_EVENT, { detail: kind }));
}

export function getCloudDirtyAt(uid: string, kind: CloudDataKind): number {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(`noeul.cloudDirty.${uid}.${kind}`));
  return Number.isFinite(value) ? value : 0;
}

export function clearCloudDirty(uid: string, kind: CloudDataKind): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(`noeul.cloudDirty.${uid}.${kind}`);
}

export function clearCloudDirtyIfUnchanged(
  uid: string,
  kind: CloudDataKind,
  expectedDirtyAt: number
): void {
  if (getCloudDirtyAt(uid, kind) === expectedDirtyAt) {
    clearCloudDirty(uid, kind);
  }
}

export function subscribeCloudDataChanges(listener: (kind: CloudDataKind) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<CloudDataKind>).detail);
  };
  window.addEventListener(CLOUD_CHANGE_EVENT, handler);
  return () => window.removeEventListener(CLOUD_CHANGE_EVENT, handler);
}

export const CLOUD_SCOPED_BASE_KEYS = [
  'noeul.travelMaps.v1',
  'noeul.manualPlaces.v1',
  'noeul.batterySave.v1',
  'noeul.highContrast.v1',
] as const;
