import { PlaceLocation } from '@/types/place';
import { VoiceStyle } from '@/lib/userData';
import { markCloudDataChanged, scopedStorageKey } from '@/lib/cloudSync/storageScope';

const BATTERY_SAVE_KEY = 'noeul.batterySave.v1';

export function loadBatterySave(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(scopedStorageKey(BATTERY_SAVE_KEY)) === '1';
  } catch {
    return false;
  }
}

export function saveBatterySave(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(scopedStorageKey(BATTERY_SAVE_KEY), enabled ? '1' : '0');
    markCloudDataChanged('settings');
  } catch {
    // 저장 실패는 이번 화면 설정만 유지
  }
}

export const OFF_ROUTE_VOICE: Record<20 | 50 | 100, string> = {
  20: '할아버지. 길을 조금 벗어나셨어요. 초록색 지점으로 돌아오세요.',
  50: '할아버지. 길을 많이 벗어나셨어요. 초록색 지점으로 돌아오세요.',
  100: '아니에요. 반대 방향이에요. 초록색 지점으로 돌아오세요.',
};

export const RETURN_TO_ROUTE_VOICE = '와. 잘 찾으셨어요. 다시 길을 따라가시면 돼요.';

export const VOICE_PREVIEW: Record<Exclude<VoiceStyle, 'mute'>, string> = {
  female: '길을 조금 벗어났어요. 초록색 지점으로 돌아와 주세요.',
  male: '길을 조금 벗어났어요. 초록색 지점으로 돌아와 주세요.',
};

export function offRouteToastText(meters: number): string {
  return `⚠ 경로 이탈 ${meters}m\n📍 초록색 지점으로\n돌아오세요`;
}

let currentVoiceAudio: HTMLAudioElement | null = null;

function stopVoiceAudio(): void {
  if (!currentVoiceAudio) return;
  currentVoiceAudio.pause();
  currentVoiceAudio.src = '';
  currentVoiceAudio = null;
}

let activeVoiceStyle: VoiceStyle = 'female';
let cachedVoices: SpeechSynthesisVoice[] = [];
let lastOffRouteSpeechAt = 0;
const OFF_ROUTE_SPEECH_COOLDOWN_MS = 10000;

export function setActiveVoiceStyle(style: VoiceStyle): void {
  activeVoiceStyle = style;
  if (style === 'mute') {
    stopRepeatingSpeech();
  }
}

function refreshVoiceCache(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return cachedVoices;
  const list = window.speechSynthesis.getVoices();
  if (list.length > 0) cachedVoices = Array.from(list);
  return cachedVoices.length > 0 ? cachedVoices : list;
}

function koreanVoicePool(): SpeechSynthesisVoice[] {
  const voices = refreshVoiceCache();
  const korean = voices.filter(
    (voice) => /^ko\b/i.test(voice.lang) || /한국|korean/i.test(`${voice.name} ${voice.lang}`)
  );
  return korean.length > 0 ? korean : voices;
}

function pickVoiceForStyle(style: Exclude<VoiceStyle, 'mute'>): SpeechSynthesisVoice | null {
  const pool = koreanVoicePool().filter(
    (voice) => !/compact|robot|eloquence|espeak/i.test(`${voice.name} ${voice.voiceURI}`)
  );
  const voices = pool.length > 0 ? pool : koreanVoicePool();
  if (voices.length === 0) return null;

  const byName = (pattern: RegExp) => voices.find((voice) => pattern.test(`${voice.name} ${voice.voiceURI}`));
  const local = voices.filter((voice) => voice.localService);

  if (style === 'male') {
    return (
      byName(/injoon|hyunsu|jinho|minho|wavenet-[cd]|standard-[cd]|neural2-[cd]|남성|남자|\bmale\b/i) ??
      local.find((voice) => !/female|woman|여성|nari|sunhi|heami|yuna/i.test(voice.name)) ??
      voices.find((voice) => !/female|woman|여성|nari|sunhi|heami|yuna/i.test(voice.name)) ??
      voices[0]
    );
  }

  return (
    byName(/google/i) ??
    byName(/samsung|삼성/i) ??
    byName(/heami|sunhi|yuna|nari|neural|premium|여성|female|woman/i) ??
    local[0] ??
    voices[0]
  );
}

export function warmSpeechVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  const pull = () => {
    refreshVoiceCache();
  };
  pull();
  synth.getVoices();
  synth.onvoiceschanged = pull;
  synth.addEventListener('voiceschanged', pull);
}

function waitForVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (refreshVoiceCache().length > 0) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    const finish = () => {
      synth.removeEventListener('voiceschanged', finish);
      if (synth.onvoiceschanged === finish) synth.onvoiceschanged = null;
      refreshVoiceCache();
      resolve();
    };
    synth.onvoiceschanged = finish;
    synth.addEventListener('voiceschanged', finish);
    synth.getVoices();
    window.setTimeout(finish, 4000);
  });
}

function liveVoiceByUri(uri: string | undefined): SpeechSynthesisVoice | null {
  if (!uri || typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === uri) ?? null;
}

function voiceLabel(voice: SpeechSynthesisVoice | null): string {
  return `${voice?.name ?? ''} ${voice?.voiceURI ?? ''} ${voice?.lang ?? ''}`;
}

function isNamedMaleVoice(voice: SpeechSynthesisVoice | null): boolean {
  if (!voice) return false;
  const label = voiceLabel(voice);
  if (/female|woman|feminine|여성|여자|heami|sunhi|yuna|nari/i.test(label)) return false;
  return /남성|남자|\bmale\b|injoon|hyunsu|jinho|minho|wavenet-[cd]|standard-[cd]|neural2-[cd]/i.test(label);
}

function bindUtteranceVoice(utterance: SpeechSynthesisUtterance): void {
  utterance.lang = 'ko-KR';
  utterance.rate = 0.95;
  utterance.volume = 1;
  if (activeVoiceStyle === 'mute') return;

  const allVoices = refreshVoiceCache();
  const picked = pickVoiceForStyle(activeVoiceStyle);
  const voice = picked ? liveVoiceByUri(picked.voiceURI) ?? picked : null;

  if (activeVoiceStyle === 'female') {
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'ko-KR';
    }
    utterance.pitch = 1.0;
    return;
  }

  const nativeMale = isNamedMaleVoice(voice)
    ? voice
    : allVoices.find((item) => isNamedMaleVoice(item)) ?? null;
  if (nativeMale) {
    utterance.voice = nativeMale;
    utterance.lang = nativeMale.lang || 'ko-KR';
    utterance.pitch = 0.92;
    return;
  }

  // 기기에 남성 음성이 없으면 voice를 묶지 않아야 Android가 pitch를 적용합니다.
  utterance.voice = null;
  utterance.pitch = 0.5;
}

export function speakKorean(text: string): void {
  if (typeof window === 'undefined') return;
  if (activeVoiceStyle === 'mute') return;
  if (!('speechSynthesis' in window)) return;
  void waitForVoices().then(() => {
    if (activeVoiceStyle === 'mute') return;
    try {
      stopVoiceAudio();
      window.speechSynthesis.cancel();
      window.setTimeout(() => {
        if (activeVoiceStyle === 'mute') return;
        refreshVoiceCache();
        const utterance = new SpeechSynthesisUtterance(text);
        bindUtteranceVoice(utterance);
        window.speechSynthesis.speak(utterance);
      }, 120);
    } catch {
      // 음성 미지원 기기는 무시
    }
  });
}

export function speakOffRouteAlert(text: string): boolean {
  const now = Date.now();
  if (now - lastOffRouteSpeechAt < OFF_ROUTE_SPEECH_COOLDOWN_MS) return false;
  lastOffRouteSpeechAt = now;
  speakKorean(text);
  return true;
}

export function resetOffRouteSpeechCooldown(): void {
  lastOffRouteSpeechAt = 0;
}

let repeatingTimer: number | null = null;

export function stopRepeatingSpeech(): void {
  if (repeatingTimer != null) {
    window.clearInterval(repeatingTimer);
    repeatingTimer = null;
  }
  stopVoiceAudio();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function startRepeatingSpeech(text: string, intervalMs = 11000): void {
  stopRepeatingSpeech();
  speakOffRouteAlert(text);
  repeatingTimer = window.setInterval(() => {
    speakOffRouteAlert(text);
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

export function vibrateAlert(level: 20 | 50 | 100): void {
  try {
    const pattern =
      level === 100
        ? [400, 100, 400, 100, 400]
        : level === 50
          ? [320, 120, 320, 120, 320]
          : [240, 120, 240];
    navigator.vibrate?.(pattern);
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
  warmSpeechVoices();
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
    ? `\n위치 정확도: ±${Math.round(accuracyM)}m`
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
