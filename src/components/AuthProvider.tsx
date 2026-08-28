'use client';

import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getFirebaseServices, isFirebaseConfigured } from '@/lib/firebase/client';
import {
  CLOUD_SCOPED_BASE_KEYS,
  completeGuestMigrationClaim,
  copyGuestDataToUser,
  getAuthScope,
  isGuestMigrationUnclaimed,
  markCloudDataChanged,
  setAuthScope,
  subscribeCloudDataChanges,
  type CloudDataKind,
} from '@/lib/cloudSync/storageScope';
import { synchronizeUserData, uploadLocalUserData } from '@/lib/cloudSync/syncUserData';
import { requestDriveAccessToken } from '@/lib/googleDrive/client';

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

type AuthContextValue = {
  configured: boolean;
  ready: boolean;
  user: User | null;
  syncStatus: SyncStatus;
  errorMessage: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ANONYMOUS_USER_ID_KEY = 'noeul.userId.v1';

async function optionalDriveAccessToken(user: User | null): Promise<string | undefined> {
  if (!user || !navigator.onLine) return undefined;
  try {
    return await requestDriveAccessToken(user);
  } catch {
    return undefined;
  }
}

async function saveLoginUser(user: User): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;
  await setDoc(
    doc(services.db, 'users', user.uid, 'profile', 'account'),
    {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function copyGuestSettingsToUser(uid: string): void {
  const anonymousId = window.localStorage.getItem(ANONYMOUS_USER_ID_KEY);
  if (!anonymousId) return;
  const sourceKey = `noeul.users.${anonymousId}.settings.prefs`;
  const targetKey = `noeul.users.${uid}.settings.prefs`;
  if (window.localStorage.getItem(targetKey) != null) return;
  const value = window.localStorage.getItem(sourceKey);
  if (value != null) window.localStorage.setItem(targetKey, value);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const activeUidRef = useRef<string | null>(null);
  const activeUserRef = useRef<User | null>(null);
  const syncRunningRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const pendingKindsRef = useRef(new Set<CloudDataKind>());
  const reconcilePendingRef = useRef(false);

  const runUpload = useCallback(async (uid: string, kind?: CloudDataKind, reconcile = false) => {
    if (kind) pendingKindsRef.current.add(kind);
    if (reconcile) reconcilePendingRef.current = true;
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    if (syncRunningRef.current) return;
    syncRunningRef.current = true;
    setSyncStatus('syncing');
    try {
      let reloadAfterSync = false;
      while (reconcilePendingRef.current || pendingKindsRef.current.size > 0) {
        if (reconcilePendingRef.current) {
          reconcilePendingRef.current = false;
          pendingKindsRef.current.clear();
          const changed = await synchronizeUserData(
            uid,
            0,
            await optionalDriveAccessToken(activeUserRef.current)
          );
          reloadAfterSync ||= changed;
          continue;
        }
        const nextKind = pendingKindsRef.current.values().next().value as CloudDataKind | undefined;
        if (!nextKind) break;
        pendingKindsRef.current.delete(nextKind);
        await uploadLocalUserData(uid, nextKind);
      }
      if (reloadAfterSync) {
        window.location.reload();
        return;
      }
      retryCountRef.current = 0;
      setSyncStatus('idle');
      setErrorMessage('');
    } catch (error) {
      console.error('[노을-cloud] upload failed', error);
      reconcilePendingRef.current = true;
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
      setErrorMessage('클라우드 저장에 실패했습니다. 인터넷 연결 후 다시 시도합니다.');
      if (navigator.onLine && retryCountRef.current < 5) {
        retryCountRef.current += 1;
        if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          window.dispatchEvent(new Event('noeul:cloud-retry'));
        }, Math.min(5000 * 2 ** (retryCountRef.current - 1), 60000));
      }
    } finally {
      syncRunningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const services = getFirebaseServices();
    if (!services) return;
    void setPersistence(services.auth, browserLocalPersistence);

    const unsubscribeAuth = onAuthStateChanged(services.auth, (nextUser) => {
      void (async () => {
        try {
          if (!nextUser) {
            activeUidRef.current = null;
            activeUserRef.current = null;
            setUser(null);
            if (getAuthScope()) {
              setAuthScope(null);
              window.sessionStorage.removeItem('noeul.cloudBootSynced');
              window.location.reload();
              return;
            }
            setReady(true);
            setSyncStatus('idle');
            return;
          }

          const uid = nextUser.uid;
          const scopeChanged = getAuthScope() !== uid;
          let migratedGuestData = false;
          if (scopeChanged) {
            if (isGuestMigrationUnclaimed()) {
              copyGuestDataToUser(CLOUD_SCOPED_BASE_KEYS, uid);
              copyGuestSettingsToUser(uid);
              completeGuestMigrationClaim(uid);
              migratedGuestData = true;
            }
            setAuthScope(uid);
            if (migratedGuestData) {
              markCloudDataChanged('travelMaps');
              markCloudDataChanged('favorites');
              markCloudDataChanged('settings');
              markCloudDataChanged('guardian');
            }
          }
          activeUidRef.current = uid;
          activeUserRef.current = nextUser;
          setUser(nextUser);
          setSyncStatus(navigator.onLine ? 'syncing' : 'offline');
          if (navigator.onLine) await saveLoginUser(nextUser);

          const bootKey = `noeul.cloudBootSynced.${uid}`;
          const bootSynced = window.sessionStorage.getItem(bootKey) === '1';
          if (navigator.onLine && !bootSynced) {
            syncRunningRef.current = true;
            await synchronizeUserData(uid, 0, await optionalDriveAccessToken(nextUser));
            syncRunningRef.current = false;
            window.sessionStorage.setItem(bootKey, '1');
            window.location.reload();
            return;
          }
          if (scopeChanged) {
            window.location.reload();
            return;
          }
          setReady(true);
          setSyncStatus(navigator.onLine ? 'idle' : 'offline');
        } catch (error) {
          syncRunningRef.current = false;
          console.error('[노을-cloud] initial sync failed', error);
          setErrorMessage('클라우드 자료를 불러오지 못했습니다. 기기에 저장된 자료로 계속 사용합니다.');
          setSyncStatus(navigator.onLine ? 'error' : 'offline');
          setReady(true);
        }
      })();
    });

    const unsubscribeChanges = subscribeCloudDataChanges((kind) => {
      const uid = activeUidRef.current;
      if (!uid) return;
      pendingKindsRef.current.add(kind);
      if (syncRunningRef.current) return;
      if (syncTimerRef.current != null) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        void runUpload(uid, kind);
      }, 800);
    });

    const handleOnline = () => {
      const uid = activeUidRef.current;
      if (uid) void runUpload(uid, undefined, true);
    };
    const handleOffline = () => setSyncStatus('offline');
    const handleRetry = () => {
      const uid = activeUidRef.current;
      if (uid) void runUpload(uid, undefined, true);
    };
    const handleVisibility = () => {
      const uid = activeUidRef.current;
      if (uid && document.visibilityState === 'visible') {
        void runUpload(uid, undefined, true);
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('noeul:cloud-retry', handleRetry);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribeAuth();
      unsubscribeChanges();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('noeul:cloud-retry', handleRetry);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (syncTimerRef.current != null) window.clearTimeout(syncTimerRef.current);
      if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
    };
  }, [configured, runUpload]);

  const login = useCallback(async () => {
    const services = getFirebaseServices();
    if (!services) return;
    setErrorMessage('');
    try {
      await setPersistence(services.auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(services.auth, provider);
    } catch (error) {
      console.error('[노을-cloud] login failed', error);
      setErrorMessage('구글 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }, []);

  const logout = useCallback(async () => {
    const services = getFirebaseServices();
    if (!services) return;
    const uid = activeUidRef.current;
    if (uid && navigator.onLine) {
      try {
        await uploadLocalUserData(uid);
      } catch (error) {
        console.error('[노을-cloud] final upload failed', error);
      }
    }
    if (uid) window.sessionStorage.removeItem(`noeul.cloudBootSynced.${uid}`);
    await signOut(services.auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ configured, ready, user, syncStatus, errorMessage, login, logout }),
    [configured, ready, user, syncStatus, errorMessage, login, logout]
  );

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-50 text-slate-700">
        클라우드 자료를 확인하고 있습니다.
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      configured: false,
      ready: true,
      user: null,
      syncStatus: 'idle',
      errorMessage: '',
      login: async () => {},
      logout: async () => {},
    };
  }
  return context;
}
