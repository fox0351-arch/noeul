import {
  GPS_JUMP_MAX_MPS,
  GPS_JUMP_MIN_M,
  MAX_ACCEPT_GPS_ACCURACY_M,
  MIN_HEADING_MOVE_M,
  bearingDegrees,
  haversineMeters,
  speedKmhFromCoords,
} from '../lib/geo';
import { GpsKalmanFilter } from './kalman-filter';
import type { LocationWorkerInbound, LocationWorkerOutbound } from './location-types';

type WorkerScope = {
  postMessage: (message: LocationWorkerOutbound) => void;
  onmessage: ((event: MessageEvent<LocationWorkerInbound>) => void) | null;
};

const ctx = self as unknown as WorkerScope;

const gpsFilter = new GpsKalmanFilter();
let intervalMs = 800;
let batterySave = false;
let lastEmitAt = 0;
let lastRaw: { lat: number; lng: number } | null = null;
let lastRawAt = 0;
let lastFix: { lat: number; lng: number } | null = null;
let lastFixAt = 0;
let fusedBearing: number | null = null;
let lastSpeedKmh: number | null = null;
let lastAccuracy = 40;

function postToMain(message: LocationWorkerOutbound): void {
  ctx.postMessage(message);
}

function wrapDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

function emitLocation(force: boolean, fromGps: boolean): void {
  if (!lastFix) return;
  const now = Date.now();
  const minGap = batterySave ? Math.max(1000, intervalMs / 4) : 200;
  if (!force && now - lastEmitAt < minGap) return;
  lastEmitAt = now;
  postToMain({
    type: 'location',
    data: {
      coords: { lat: lastFix.lat, lng: lastFix.lng },
      bearing: fusedBearing ?? 0,
      accuracy: lastAccuracy,
      speedKmh: lastSpeedKmh,
      timestamp: now,
      fromGps,
      hasBearing: fusedBearing != null,
    },
  });
}

function applyGpsSample(input: {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speedMps: number | null;
  timestamp: number;
}): void {
  const accuracy = Number.isFinite(input.accuracy) ? input.accuracy : 40;
  if (accuracy > MAX_ACCEPT_GPS_ACCURACY_M) return;
  if (lastFixAt && input.timestamp - lastFixAt < 200) return;

  const raw = { latitude: input.lat, longitude: input.lng };
  if (lastRaw && lastRawAt) {
    const jumpM = haversineMeters({ latitude: lastRaw.lat, longitude: lastRaw.lng }, raw);
    const dt = input.timestamp - lastRawAt;
    const mps = (jumpM / Math.max(dt, 1)) * 1000;
    if (jumpM >= GPS_JUMP_MIN_M && mps > GPS_JUMP_MAX_MPS) return;
  }

  lastRaw = { lat: input.lat, lng: input.lng };
  lastRawAt = input.timestamp;
  lastAccuracy = accuracy;

  const prevSmoothed = lastFix;
  const filtered = gpsFilter.update(input.lat, input.lng, accuracy);
  const next = { lat: filtered.lat, lng: filtered.lng };
  const elapsedMs = lastFixAt ? input.timestamp - lastFixAt : 0;
  lastSpeedKmh = speedKmhFromCoords(
    { speed: input.speedMps },
    prevSmoothed ? { latitude: prevSmoothed.lat, longitude: prevSmoothed.lng } : null,
    { latitude: next.lat, longitude: next.lng },
    elapsedMs
  );

  if (prevSmoothed) {
    const movedM = haversineMeters(
      { latitude: prevSmoothed.lat, longitude: prevSmoothed.lng },
      { latitude: next.lat, longitude: next.lng }
    );
    if (movedM > MIN_HEADING_MOVE_M) {
      fusedBearing = wrapDeg(
        bearingDegrees(
          { latitude: prevSmoothed.lat, longitude: prevSmoothed.lng },
          { latitude: next.lat, longitude: next.lng }
        )
      );
    }
  }

  lastFix = next;
  lastFixAt = input.timestamp;
  emitLocation(true, true);
}

function resetSignalState(): void {
  gpsFilter.reset();
  lastEmitAt = 0;
  lastRaw = null;
  lastRawAt = 0;
  lastFix = null;
  lastFixAt = 0;
  fusedBearing = null;
  lastSpeedKmh = null;
  lastAccuracy = 40;
}

ctx.onmessage = (event: MessageEvent<LocationWorkerInbound>) => {
  const message = event.data;
  if (!message) return;

  if (message.type === 'start') {
    resetSignalState();
    intervalMs = message.intervalMs;
    batterySave = message.batterySave;
    postToMain({ type: 'ready', geolocationInWorker: false });
    return;
  }

  if (message.type === 'stop') {
    resetSignalState();
    return;
  }

  if (message.type === 'route') {
    return;
  }

  if (message.type === 'gps') {
    applyGpsSample(message);
    return;
  }

  if (message.type === 'orientation' || message.type === 'motion') {
    return;
  }
};
