import { PlaceLocation } from '@/types/place';

const BATTERY_SAVE_KEY = 'noeul.batterySave.v1';

export function loadBatterySave(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(BATTERY_SAVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveBatterySave(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BATTERY_SAVE_KEY, enabled ? '1' : '0');
  } catch {
    // 저장 실패는 이번 화면 설정만 유지
  }
}

export function speakKorean(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // 음성 미지원 기기는 무시
  }
}

let repeatingTimer: number | null = null;

export function stopRepeatingSpeech(): void {
  if (repeatingTimer != null) {
    window.clearInterval(repeatingTimer);
    repeatingTimer = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function startRepeatingSpeech(text: string, intervalMs = 7000): void {
  stopRepeatingSpeech();
  speakKorean(text);
  repeatingTimer = window.setInterval(() => {
    speakKorean(text);
  }, intervalMs);
}

export function vibrateOnce(): void {
  try {
    navigator.vibrate?.(200);
  } catch {
    // 진동 미지원
  }
}

export function vibrateTimes(count: 1 | 2 | 3): void {
  try {
    const pattern =
      count === 1 ? [200] : count === 2 ? [200, 120, 200] : [200, 120, 200, 120, 200];
    navigator.vibrate?.(pattern);
  } catch {
    // 진동 미지원
  }
}

export function vibrateAlert(level: 20 | 30): void {
  try {
    navigator.vibrate?.(level === 30 ? [400, 120, 400, 120, 400] : [240, 120, 240]);
  } catch {
    // 진동 미지원
  }
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    audioContext = new Ctor();
  }
  return audioContext;
}

export function unlockAlertAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

export function playAlertBeep(level: 20 | 30): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume();

  const now = ctx.currentTime;
  const beep = (start: number, freq: number, duration: number) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level === 30 ? 0.22 : 0.14, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  if (level === 30) {
    beep(now, 880, 0.28);
    beep(now + 0.34, 660, 0.28);
    beep(now + 0.68, 880, 0.35);
  } else {
    beep(now, 740, 0.25);
    beep(now + 0.32, 740, 0.25);
  }
}

export function formatSosMessage(location: PlaceLocation | null, accuracyM?: number | null): {
  text: string;
  mapsUrl: string | null;
} {
  const now = new Date();
  const time = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!location) {
    return {
      mapsUrl: null,
      text: `도움이 필요합니다.\n현재 위치를 아직 찾지 못했습니다.\n현재 시간: ${time}`,
    };
  }

  const mapsUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
  const accuracy = accuracyM != null && Number.isFinite(accuracyM)
    ? `\nGPS 정확도: ±${Math.round(accuracyM)}m`
    : '';

  return {
    mapsUrl,
    text: `도움이 필요합니다.\n현재 위치 :\n위도 ${location.latitude.toFixed(6)}, 경도 ${location.longitude.toFixed(6)}${accuracy}\n현재 시간: ${time}\n${mapsUrl}`,
  };
}

export function openPhoneCall(phone: string): void {
  window.location.href = `tel:${phone}`;
}

export function openSmsShare(text: string, phone?: string): void {
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const number = phone?.replace(/[^\d+]/g, '') ?? '';
  const href = isIos
    ? `sms:${number}&body=${encodeURIComponent(text)}`
    : `sms:${number}?body=${encodeURIComponent(text)}`;
  window.location.href = href;
}

export function openKakaoShare(text: string, mapsUrl: string | null): void {
  const body = mapsUrl && !text.includes(mapsUrl) ? `${text}\n${mapsUrl}` : text;
  const encoded = encodeURIComponent(body);
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
    window.location.href = `intent://send?text=${encoded}#Intent;scheme=kakaotalk;package=com.kakao.talk;S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=com.kakao.talk')};end`;
    return;
  }

  window.location.href = `kakaotalk://send?text=${encoded}`;
}

export async function shareOrCopy(text: string, mapsUrl: string | null): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'SOS 요청',
        text,
        url: mapsUrl ?? undefined,
      });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'failed';
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
