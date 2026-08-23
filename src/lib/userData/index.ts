import { localUserDataAdapter } from './localAdapter';
import { DEFAULT_USER_SETTINGS, UserDataAdapter, UserSettings, VoiceStyle } from './types';

export type { UserCollection, UserDataAdapter, UserSettings, VoiceStyle } from './types';
export { DEFAULT_USER_SETTINGS } from './types';

let adapter: UserDataAdapter = localUserDataAdapter;

/** 향후 Firebase 어댑터로 교체할 때 이 함수만 호출 */
export function setUserDataAdapter(next: UserDataAdapter): void {
  adapter = next;
}

export function getUserId(): string {
  return adapter.getUserId();
}

export function getUserDataAdapter(): UserDataAdapter {
  return adapter;
}

function isVoiceStyle(value: unknown): value is VoiceStyle {
  return value === 'grandchild' || value === 'female' || value === 'male' || value === 'mute';
}

export function loadUserSettings(): UserSettings {
  const stored = adapter.get<Partial<UserSettings>>('settings', 'prefs');
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_USER_SETTINGS };
  return {
    voiceStyle: isVoiceStyle(stored.voiceStyle) ? stored.voiceStyle : DEFAULT_USER_SETTINGS.voiceStyle,
    headingUp: typeof stored.headingUp === 'boolean' ? stored.headingUp : DEFAULT_USER_SETTINGS.headingUp,
  };
}

export function saveUserSettings(patch: Partial<UserSettings>): UserSettings {
  const next = { ...loadUserSettings(), ...patch };
  adapter.set('settings', 'prefs', next);
  return next;
}
