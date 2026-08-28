import { UserCollection, UserDataAdapter } from './types';
import { getAuthScope, markCloudDataChanged } from '@/lib/cloudSync/storageScope';

const USER_ID_KEY = 'noeul.userId.v1';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 용량 초과 등은 이번 세션만 유지
  }
}

function ensureUserId(): string {
  const authUid = getAuthScope();
  if (authUid) return authUid;
  const existing = readStorage(USER_ID_KEY);
  if (existing) return existing;
  const created =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  writeStorage(USER_ID_KEY, created);
  return created;
}

function docKey(userId: string, collection: UserCollection, docId: string): string {
  return `noeul.users.${userId}.${collection}.${docId}`;
}

/** 지금은 LocalStorage, 이후 Firebase `users/{userId}/...` 로 교체 */
export const localUserDataAdapter: UserDataAdapter = {
  getUserId() {
    return ensureUserId();
  },
  get<T>(collection: UserCollection, docId: string): T | null {
    const raw = readStorage(docKey(this.getUserId(), collection, docId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  set<T>(collection: UserCollection, docId: string, value: T): void {
    writeStorage(docKey(this.getUserId(), collection, docId), JSON.stringify(value));
    markCloudDataChanged(collection === 'favorites' ? 'favorites' : collection === 'travelMaps' ? 'travelMaps' : 'settings');
  },
};
