const KEY = 'noeul.fieldTest.v1';

export const FIELD_TEST_ITEMS = [
  { id: 'install', label: '앱 설치' },
  { id: 'gps', label: '내 위치 확인' },
  { id: 'offline', label: '오프라인 동작' },
  { id: 'gpx', label: 'GPX 불러오기' },
  { id: 'follow', label: '루트 따라가기' },
  { id: 'warn20', label: '20m 경고' },
  { id: 'warn30', label: '30m 음성 경고' },
  { id: 'sos', label: 'SOS 테스트' },
  { id: 'battery', label: '배터리 사용량' },
] as const;

export type FieldTestId = (typeof FIELD_TEST_ITEMS)[number]['id'];

export function loadFieldTestChecks(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function saveFieldTestChecks(checks: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(checks));
  } catch {
    // ignore
  }
}
