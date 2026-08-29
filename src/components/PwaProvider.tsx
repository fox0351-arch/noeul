'use client';

import { useEffect } from 'react';

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {
        // 서비스 워커가 없어도 여행지도 저장은 동작합니다.
      });
  }, []);

  return <>{children}</>;
}
