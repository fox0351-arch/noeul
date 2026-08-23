const KEY = 'noeul.guardianPhone.v1';

export function loadGuardianPhone(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveGuardianPhone(phone: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, phone.trim());
  } catch {
    // ignore
  }
}

export function normalizePhoneHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits;
}
