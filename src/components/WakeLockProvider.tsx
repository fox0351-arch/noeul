'use client';

import { useEffect, type ReactNode } from 'react';

export default function WakeLockProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator)) return;
      try {
        sentinel?.removeEventListener('release', onReleased);
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener('release', onReleased);
      } catch {
        // 권한·절전 모드는 앱을 멈추지 않습니다.
      }
    };

    const onReleased = () => {
      if (!cancelled && document.visibilityState === 'visible') void request();
    };

    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      sentinel?.removeEventListener('release', onReleased);
      void sentinel?.release();
    };
  }, []);

  return <>{children}</>;
}
