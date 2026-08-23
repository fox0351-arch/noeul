'use client';

import { useEffect } from 'react';

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // 서비스 워커가 없어도 저장된 루트와 GPS는 동작합니다.
    });
  }, []);

  return <>{children}</>;
}
