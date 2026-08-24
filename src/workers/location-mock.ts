import { destinationPoint } from '@/lib/geo';
import { PlaceLocation } from '@/types/place';
import { TravelRoute } from '@/types/route';
import type { LocationWorkerInbound } from './location-types';

/** 시속 4km 보행 */
export const MOCK_WALK_KMH = 4;
const MOCK_WALK_MPS = MOCK_WALK_KMH / 3.6;
const ORIGIN: PlaceLocation = { latitude: 37.5285, longitude: 126.9342 };
const LOOP_EDGES_M = [180, 120, 180, 120];
const LOOP_BEARINGS = [90, 0, 270, 180];

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

function loopLengthM(): number {
  return LOOP_EDGES_M.reduce((sum, edge) => sum + edge, 0);
}

export function pointOnMockLoop(distanceM: number): { location: PlaceLocation; bearing: number } {
  const loop = loopLengthM();
  let remain = ((distanceM % loop) + loop) % loop;
  let cursor = ORIGIN;
  for (let i = 0; i < LOOP_EDGES_M.length; i += 1) {
    const edge = LOOP_EDGES_M[i];
    const bearing = LOOP_BEARINGS[i];
    if (remain <= edge) {
      return { location: destinationPoint(cursor, bearing, remain), bearing };
    }
    cursor = destinationPoint(cursor, bearing, edge);
    remain -= edge;
  }
  return { location: ORIGIN, bearing: LOOP_BEARINGS[0] };
}

export function createMockTravelRoute(): TravelRoute {
  const loop = loopLengthM();
  const points: PlaceLocation[] = [];
  for (let d = 0; d <= loop; d += 12) {
    points.push(pointOnMockLoop(d).location);
  }
  return {
    name: '가상 보행 루프 (4km/h)',
    sourceFileName: 'mock-walk-loop',
    createdAt: new Date().toISOString(),
    points: points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
  };
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
  const compassShake = 28 * Math.sin(elapsedMs / 420) + 10 * randn();
  return {
    trueLat: location.latitude,
    trueLng: location.longitude,
    trueBearing: bearing,
    noisyLat: noisy.latitude,
    noisyLng: noisy.longitude,
    noisyGpsHeading: wrapDeg(bearing + 6 * randn()),
    noisyCompass: wrapDeg(bearing + compassShake),
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
  private samples: SimHeapSample[] = [];

  start(post: (message: LocationWorkerInbound) => void, gpsIntervalMs: number): void {
    this.stop();
    this.startedAt = Date.now();
    this.samples = [];
    this.lastFusedBearing = null;

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

  noteFusedBearing(bearing: number): void {
    this.lastFusedBearing = bearing;
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
