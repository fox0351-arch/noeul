import { isLocationSimAllowed } from '@/lib/locationSimAccess';
import type { LocationWorkerFix, LocationWorkerInbound, LocationWorkerOutbound } from './location-types';
import { LocationMockPump } from './location-mock';

export type LocationSignalError = {
  code: number;
  message: string;
};

type StartOptions = {
  intervalMs: number;
  batterySave: boolean;
  useMock?: boolean;
  onLocation: (fix: LocationWorkerFix) => void;
  onError: (error: LocationSignalError) => void;
};

/**
 * 메인 스레드에서 Worker와 센서를 잇는 관리자.
 * PWA/브라우저에서는 Worker가 GPS·나침반을 직접 못 듣는 경우가 많아,
 * 그때는 이쪽에서 듣고 Worker로 원본만 넘깁니다.
 */
export class LocationSignalManager {
  private worker: Worker | null = null;
  private watchId: number | null = null;
  private options: StartOptions | null = null;
  private geolocationInWorker = false;
  private mockPump: LocationMockPump | null = null;

  static async requestSensorPermissions(): Promise<void> {
    const orientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    const motion = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (typeof orientation.requestPermission === 'function') {
        await orientation.requestPermission();
      }
      if (typeof motion.requestPermission === 'function') {
        await motion.requestPermission();
      }
    } catch {
      // 권한이 없어도 GPS 따라가기는 계속합니다.
    }
  }

  start(options: StartOptions): void {
    this.stop();
    this.options = options;
    const useMock = options.useMock === true;
    if (useMock && !isLocationSimAllowed()) {
      options.onError({ code: 2, message: 'location sim disabled' });
      return;
    }

    if (!useMock && (typeof navigator === 'undefined' || !navigator.geolocation)) {
      options.onError({ code: 2, message: 'geolocation unavailable' });
      return;
    }

    this.worker = new Worker(new URL('./location-worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event: MessageEvent<LocationWorkerOutbound>) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'ready') {
        this.geolocationInWorker = false;
        if (useMock) {
          this.mockPump = new LocationMockPump();
          this.mockPump.start((msg) => this.post(msg), options.intervalMs);
          return;
        }
        this.attachMainThreadSensors();
        return;
      }
      if (message.type === 'location') {
        this.mockPump?.noteFusedBearing(message.data.bearing);
        this.options?.onLocation(message.data);
        return;
      }
      if (message.type === 'error') {
        this.options?.onError({ code: message.code, message: message.message });
      }
    };

    this.worker.onerror = () => {
      this.options?.onError({ code: 2, message: 'location worker failed' });
    };

    this.post({
      type: 'start',
      intervalMs: options.intervalMs,
      batterySave: options.batterySave,
    });
  }

  stop(): void {
    this.mockPump?.stop();
    this.mockPump = null;
    this.detachMainThreadSensors();
    if (this.worker) {
      this.post({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    this.geolocationInWorker = false;
    this.options = null;
  }

  private post(message: LocationWorkerInbound): void {
    this.worker?.postMessage(message);
  }

  private attachMainThreadSensors(): void {
    if (!this.options || this.watchId != null) return;
    const { intervalMs, batterySave } = this.options;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.post({
          type: 'gps',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speedMps: pos.coords.speed,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        this.options?.onError({ code: err.code, message: err.message });
      },
      {
        enableHighAccuracy: true,
        maximumAge: intervalMs,
        timeout: batterySave ? 15000 : 10000,
      }
    );

    this.attachOrientationAndMotion();
  }

  private attachOrientationAndMotion(): void {
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('devicemotion', this.onMotion);
  }

  private detachMainThreadSensors(): void {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
  }

  private onOrientation = (event: DeviceOrientationEvent): void => {
    const withCompass = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
    this.post({
      type: 'orientation',
      alpha: event.alpha,
      webkitCompassHeading:
        typeof withCompass.webkitCompassHeading === 'number' ? withCompass.webkitCompassHeading : null,
      absolute: Boolean(event.absolute),
      timestamp: Date.now(),
    });
  };

  private onMotion = (event: DeviceMotionEvent): void => {
    const acc = event.accelerationIncludingGravity ?? event.acceleration;
    this.post({
      type: 'motion',
      acceleration: {
        x: acc?.x ?? null,
        y: acc?.y ?? null,
        z: acc?.z ?? null,
      },
      timestamp: Date.now(),
    });
  };
}
