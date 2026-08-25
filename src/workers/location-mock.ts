import { destinationPoint, haversineMeters, bearingDegrees } from '@/lib/geo';
import { PlaceLocation } from '@/types/place';
import { TravelRoute } from '@/types/route';
import type { LocationWorkerFix, LocationWorkerInbound } from './location-types';

/** public/gyeokttara-2.gpx (계곡따라2) 트랙. 서울 기본 중심이 아닌 기장 계곡입니다. */
export const GYEOKTTARA_2_POINTS: PlaceLocation[] = [
  { latitude: 35.3218, longitude: 129.2184 },
  { latitude: 35.3229, longitude: 129.2201 },
  { latitude: 35.3242, longitude: 129.2219 },
  { latitude: 35.3256, longitude: 129.2238 },
  { latitude: 35.3271, longitude: 129.2257 },
  { latitude: 35.3284, longitude: 129.2278 },
  { latitude: 35.3297, longitude: 129.23 },
  { latitude: 35.331, longitude: 129.2321 },
  { latitude: 35.3324, longitude: 129.2344 },
  { latitude: 35.3337, longitude: 129.2367 },
  { latitude: 35.3349, longitude: 129.2391 },
  { latitude: 35.336, longitude: 129.2416 },
  { latitude: 35.3371, longitude: 129.2442 },
  { latitude: 35.338, longitude: 129.2469 },
  { latitude: 35.3388, longitude: 129.2497 },
  { latitude: 35.3394, longitude: 129.2525 },
  { latitude: 35.3399, longitude: 129.2554 },
  { latitude: 35.3402, longitude: 129.2583 },
];

/** 시속 4km 보행 */
export const MOCK_WALK_KMH = 4;
const MOCK_WALK_MPS = MOCK_WALK_KMH / 3.6;

function routeLengthM(points: PlaceLocation[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    sum += haversineMeters(points[i], points[i + 1]);
  }
  return sum;
}

const ROUTE_LENGTH_M = routeLengthM(GYEOKTTARA_2_POINTS);

export function pointOnGyeokttara2(distanceM: number): { location: PlaceLocation; bearing: number } {
  const loop = Math.max(ROUTE_LENGTH_M, 1);
  let remain = ((distanceM % loop) + loop) % loop;
  for (let i = 0; i < GYEOKTTARA_2_POINTS.length - 1; i += 1) {
    const start = GYEOKTTARA_2_POINTS[i];
    const end = GYEOKTTARA_2_POINTS[i + 1];
    const edge = haversineMeters(start, end);
    const bearing = bearingDegrees(start, end);
    if (remain <= edge || i === GYEOKTTARA_2_POINTS.length - 2) {
      return { location: destinationPoint(start, bearing, Math.min(remain, edge)), bearing };
    }
    remain -= edge;
  }
  const last = GYEOKTTARA_2_POINTS[GYEOKTTARA_2_POINTS.length - 1];
  const prev = GYEOKTTARA_2_POINTS[GYEOKTTARA_2_POINTS.length - 2];
  return { location: last, bearing: bearingDegrees(prev, last) };
}

export function createMockTravelRoute(): TravelRoute {
  return {
    name: '계곡따라2',
    sourceFileName: 'gyeokttara-2.gpx',
    createdAt: new Date().toISOString(),
    points: GYEOKTTARA_2_POINTS.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
  };
}


export type SimHeapSample = {
  tSec: number;
  heapMb: number | null;
  bearing: number;
  trueBearing: number;
  headingError: number;
  lat: number;
  lng: number;
};

export type SimReport = {
  runningSec: number;
  sampleCount: number;
  heapStartMb: number | null;
  heapEndMb: number | null;
  heapPeakMb: number | null;
  heapSlopeMbPerMin: number | null;
  headingErrorRms: number;
  headingErrorMax: number;
  rotationDebug: LocationWorkerFix['rotationDebug'] | null;
  samples: SimHeapSample[];
};

function randn(): number {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function wrapDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

function shortestDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function pointOnMockLoop(distanceM: number): { location: PlaceLocation; bearing: number } {
  return pointOnGyeokttara2(distanceM);
}

export { isLocationSimAllowed } from '@/lib/locationSimAccess';

function sampleTick(elapsedMs: number): {
  trueLat: number;
  trueLng: number;
  trueBearing: number;
  noisyLat: number;
  noisyLng: number;
  noisyGpsHeading: number;
  noisyCompass: number;
} {
  const { location, bearing } = pointOnMockLoop((elapsedMs / 1000) * MOCK_WALK_MPS);
  const noisy = destinationPoint(location, Math.random() * 360, Math.abs(2.4 * randn()));
  const compassShake = 55 * Math.sin(elapsedMs / 380) + 22 * randn();
  const gpsFlip = Math.random() < 0.12 ? 180 : 0;
  const compassJerk = Math.random() < 0.08 ? 90 : 0;
  return {
    trueLat: location.latitude,
    trueLng: location.longitude,
    trueBearing: bearing,
    noisyLat: noisy.latitude,
    noisyLng: noisy.longitude,
    noisyGpsHeading: wrapDeg(bearing + gpsFlip + 25 * randn()),
    noisyCompass: wrapDeg(bearing + compassShake + compassJerk),
  };
}

function readHeapMb(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return null;
  return Math.round((memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
}

/**
 * 실제 GPS 대신 4km/h 가상 경로와 좌우로 흔들리는 나침반을 Worker로 보냅니다.
 */
export class LocationMockPump {
  private gpsTimer: number | null = null;
  private orientationTimer: number | null = null;
  private statsTimer: number | null = null;
  private startedAt = 0;
  private lastFusedBearing: number | null = null;
  private lastRotationDebug: LocationWorkerFix['rotationDebug'] = undefined;
  private samples: SimHeapSample[] = [];

  start(post: (message: LocationWorkerInbound) => void, gpsIntervalMs: number): void {
    this.stop();
    this.startedAt = Date.now();
    this.samples = [];
    this.lastFusedBearing = null;
    this.lastRotationDebug = undefined;

    const gpsMs = Math.max(400, gpsIntervalMs);
    this.gpsTimer = window.setInterval(() => {
      const tick = sampleTick(Date.now() - this.startedAt);
      post({
        type: 'gps',
        lat: tick.noisyLat,
        lng: tick.noisyLng,
        accuracy: 9 + Math.abs(randn()) * 4,
        heading: tick.noisyGpsHeading,
        speedMps: MOCK_WALK_MPS,
        timestamp: Date.now(),
      });
    }, gpsMs);

    this.orientationTimer = window.setInterval(() => {
      const tick = sampleTick(Date.now() - this.startedAt);
      post({
        type: 'orientation',
        alpha: wrapDeg(360 - tick.noisyCompass),
        webkitCompassHeading: tick.noisyCompass,
        absolute: true,
        timestamp: Date.now(),
      });
    }, 100);

    this.statsTimer = window.setInterval(() => this.captureSample(), 15000);
    this.captureSample();
    this.publish();
  }

  noteFusedBearing(
    bearing: number,
    rotationDebug?: LocationWorkerFix['rotationDebug']
  ): void {
    this.lastFusedBearing = bearing;
    this.lastRotationDebug = rotationDebug;
  }

  stop(): void {
    if (this.gpsTimer != null) window.clearInterval(this.gpsTimer);
    if (this.orientationTimer != null) window.clearInterval(this.orientationTimer);
    if (this.statsTimer != null) window.clearInterval(this.statsTimer);
    this.gpsTimer = null;
    this.orientationTimer = null;
    this.statsTimer = null;
  }

  report(): SimReport {
    const heaps = this.samples.map((s) => s.heapMb).filter((v): v is number => v != null);
    const errors = this.samples.map((s) => s.headingError);
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const minutes = last && first ? (last.tSec - first.tSec) / 60 : 0;
    const heapStart = heaps[0] ?? null;
    const heapEnd = heaps[heaps.length - 1] ?? null;
    const slope =
      heapStart != null && heapEnd != null && minutes > 0.5
        ? (heapEnd - heapStart) / minutes
        : null;
    const rms =
      errors.length > 0
        ? Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)
        : 0;
    return {
      runningSec: Math.round((Date.now() - this.startedAt) / 1000),
      sampleCount: this.samples.length,
      heapStartMb: heapStart,
      heapEndMb: heapEnd,
      heapPeakMb: heaps.length ? Math.max(...heaps) : null,
      heapSlopeMbPerMin: slope != null ? Math.round(slope * 100) / 100 : null,
      headingErrorRms: Math.round(rms * 10) / 10,
      headingErrorMax: errors.length ? Math.round(Math.max(...errors) * 10) / 10 : 0,
      rotationDebug: this.lastRotationDebug ?? null,
      samples: this.samples,
    };
  }

  private captureSample(): void {
    const elapsedMs = Date.now() - this.startedAt;
    const tick = sampleTick(elapsedMs);
    const fused = this.lastFusedBearing ?? tick.trueBearing;
    this.samples.push({
      tSec: Math.round(elapsedMs / 1000),
      heapMb: readHeapMb(),
      bearing: fused,
      trueBearing: tick.trueBearing,
      headingError: Math.abs(shortestDelta(tick.trueBearing, fused)),
      lat: tick.trueLat,
      lng: tick.trueLng,
    });
    this.publish();
  }

  private publish(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as { __NOEUL_SIM__?: SimReport }).__NOEUL_SIM__ = this.report();
  }
}
