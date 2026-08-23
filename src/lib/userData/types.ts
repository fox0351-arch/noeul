export type VoiceStyle = 'grandchild' | 'female' | 'male' | 'mute';

export interface UserSettings {
  voiceStyle: VoiceStyle;
  headingUp: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  voiceStyle: 'grandchild',
  headingUp: true,
};

/** Firebase `users/{userId}/{collection}` 경로와 맞출 컬렉션 이름 */
export type UserCollection = 'settings' | 'favorites' | 'hikeLogs' | 'travelMaps';

export interface UserDataAdapter {
  getUserId(): string;
  get<T>(collection: UserCollection, docId: string): T | null;
  set<T>(collection: UserCollection, docId: string, value: T): void;
}
