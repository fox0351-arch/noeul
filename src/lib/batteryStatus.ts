export type BatteryLevelBand = 'ok' | 'low20' | 'low10' | 'low5';

export interface BatteryStatus {
  supported: boolean;
  percent: number | null;
  charging: boolean;
}

type BatteryManager = EventTarget & {
  charging: boolean;
  level: number;
};

export function batteryBand(percent: number, charging: boolean): BatteryLevelBand {
  if (charging) return 'ok';
  if (percent <= 5) return 'low5';
  if (percent <= 10) return 'low10';
  if (percent <= 20) return 'low20';
  return 'ok';
}

export async function readBatteryStatus(): Promise<BatteryStatus> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
  if (typeof nav.getBattery !== 'function') {
    return { supported: false, percent: null, charging: false };
  }
  try {
    const battery = await nav.getBattery();
    return {
      supported: true,
      percent: Math.round(battery.level * 100),
      charging: Boolean(battery.charging),
    };
  } catch {
    return { supported: false, percent: null, charging: false };
  }
}

export function subscribeBattery(
  onChange: (status: BatteryStatus) => void
): () => void {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
  if (typeof nav.getBattery !== 'function') {
    onChange({ supported: false, percent: null, charging: false });
    return () => {};
  }

  let cancelled = false;
  let batteryRef: BatteryManager | null = null;
  const emit = () => {
    if (cancelled || !batteryRef) return;
    onChange({
      supported: true,
      percent: Math.round(batteryRef.level * 100),
      charging: Boolean(batteryRef.charging),
    });
  };

  nav.getBattery().then((battery) => {
    if (cancelled) return;
    batteryRef = battery;
    emit();
    battery.addEventListener('levelchange', emit);
    battery.addEventListener('chargingchange', emit);
  }).catch(() => {
    if (!cancelled) onChange({ supported: false, percent: null, charging: false });
  });

  return () => {
    cancelled = true;
    if (!batteryRef) return;
    batteryRef.removeEventListener('levelchange', emit);
    batteryRef.removeEventListener('chargingchange', emit);
  };
}
