import { PlaceLocation } from '@/types/place';
import { VoiceStyle } from '@/lib/userData';

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

export const OFF_ROUTE_VOICE: Record<20 | 50 | 100, string> = {
  20: '할아버지. 길을 조금 벗어나셨어요. 초록색 지점으로 돌아오세요.',
  50: '할아버지. 길을 많이 벗어나셨어요. 초록색 지점으로 돌아오세요.',
  100: '아니에요. 반대 방향이에요. 초록색 지점으로 돌아오세요.',
};

export const RETURN_TO_ROUTE_VOICE = '와. 잘 찾으셨어요. 다시 길을 따라가시면 돼요.';

export const VOICE_PREVIEW: Record<Exclude<VoiceStyle, 'mute'>, string> = {
  female: '여성 목소리로 안내하겠습니다.',
  male: '남성 목소리로 안내하겠습니다.',
};

export function offRouteToastText(meters: number): string {
  return `⚠ 경로 이탈 ${meters}m\n📍 초록색 지점으로\n돌아오세요`;
}

/** 여성·남성 안내 녹음 */
function clipForText(style: Exclude<VoiceStyle, 'mute'>, text: string): string | null {
  const folder = `/voice/${style}`;
  if (text === OFF_ROUTE_VOICE[20]) return `${folder}/20.mp3`;
  if (text === OFF_ROUTE_VOICE[50]) return `${folder}/50.mp3`;
  if (text === OFF_ROUTE_VOICE[100]) return `${folder}/100.mp3`;
  if (text === RETURN_TO_ROUTE_VOICE) return `${folder}/return.mp3`;
  if (text === VOICE_PREVIEW[style]) return `${folder}/preview.mp3`;
  return null;
}

let currentVoiceAudio: HTMLAudioElement | null = null;

function stopVoiceAudio(): void {
  if (!currentVoiceAudio) return;
  currentVoiceAudio.pause();
  currentVoiceAudio.src = '';
  currentVoiceAudio = null;
}

function playVoiceClip(url: string): boolean {
  if (typeof Audio === 'undefined') return false;
  stopVoiceAudio();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  const audio = new Audio(url);
  audio.preload = 'auto';
  currentVoiceAudio = audio;
  void audio.play().catch(() => {
    if (currentVoiceAudio === audio) currentVoiceAudio = null;
  });
  return true;
}

const VOICE_TONE: Record<
  Exclude<VoiceStyle, 'mute'>,
  { pitch: number; rate: number }
> = {
  female: { pitch: 1, rate: 0.96 },
  male: { pitch: 0.78, rate: 0.92 },
};

let activeVoiceStyle: VoiceStyle = 'female';

export function setActiveVoiceStyle(style: VoiceStyle): void {
  activeVoiceStyle = style;
}

function koreanVoicePool(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices();
  const korean = voices.filter(
    (voice) => /^ko\b/i.test(voice.lang) || /한국|korean/i.test(`${voice.name} ${voice.lang}`)
  );
  return korean.length > 0 ? korean : voices;
}

function pickVoiceForStyle(style: Exclude<VoiceStyle, 'mute'>): SpeechSynthesisVoice | null {
  const pool = koreanVoicePool();
  if (pool.length === 0) return null;

  const byName = (pattern: RegExp) => pool.find((voice) => pattern.test(`${voice.name} ${voice.voiceURI}`));

  if (style === 'male') {
    return (
      byName(/injoon|hyunsu|jinho|wavenet-c|wavenet-d|standard-c|standard-d|남성|male|man|minho/i) ??
      pool.find((voice) => !/female|woman|여성|nari|sunhi|heami|yuna/i.test(voice.name)) ??
      pool[0]
    );
  }

  return (
    byName(/heami|sunhi|yuna|nari|wavenet-a|wavenet-b|standard-a|standard-b|neural|premium|여성|female|woman/i) ??
    pool[0]
  );
}

export function warmSpeechVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices();
  });
}

export function speakKorean(text: string): void {
  if (typeof window === 'undefined') return;
  if (activeVoiceStyle === 'mute') return;
  const clip = clipForText(activeVoiceStyle, text);
  if (clip && playVoiceClip(clip)) return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    const voice = pickVoiceForStyle(activeVoiceStyle);
    if (voice) utterance.voice = voice;
    const tone = VOICE_TONE[activeVoiceStyle];
    utterance.rate = tone.rate;
    utterance.pitch = tone.pitch;
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
  stopVoiceAudio();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function startRepeatingSpeech(text: string, intervalMs = 5000): void {
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
