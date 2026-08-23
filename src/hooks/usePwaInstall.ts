'use client';

import { useEffect, useRef, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function usePwaInstall() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    setInstalled(isStandalone());

    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferredRef.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      deferredRef.current = null;
      setCanPrompt(false);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const media = window.matchMedia('(display-mode: standalone)');
    const onMode = () => setInstalled(isStandalone());
    media.addEventListener('change', onMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onMode);
    };
  }, []);

  const install = async () => {
    setHint('');
    const deferred = deferredRef.current;
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setCanPrompt(false);
      }
      deferredRef.current = null;
      return;
    }

    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIos) {
      setHint('공유 버튼 → 홈 화면에 추가를 눌러 설치하세요.');
      return;
    }
    setHint('Chrome 오른쪽 위 메뉴(⋮)에서 앱 설치를 눌러 주세요.');
  };

  return { installed, canPrompt, hint, install };
}
