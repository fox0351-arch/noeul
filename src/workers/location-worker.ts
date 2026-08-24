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
let headingOrigin: { latitude: number; longitude: number } | null = null;
let compassHeading: number | null = null;
let fusedBearing: number | null = null;
let lastSpeedKmh: number | null = null;
let motionMagnitude = 0;

function postToMain(message: LocationWorkerOutbound): void {
  ctx.postMessage(message);
}

function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function smoothBearing(previous: number | null, next: number, alpha: number): number {
  if (previous == null || !Number.isFinite(previous)) return ((next % 360) + 360) % 360;
  const blended = previous + shortestAngleDelta(previous, next) * alpha;
  return ((blended % 360) + 360) % 360;
}

function interpolateAngle(a: number, b: number, bWeight: number): number {
  return smoothBearing(a, b, Math.max(0, Math.min(1, bWeight)));
}

function headingFromOrientation(alpha: number | null, webkitCompassHeading: number | null, absolute: boolean): number | null {
  if (webkitCompassHeading != null && Number.isFinite(webkitCompassHeading)) {
    return ((webkitCompassHeading % 360) + 360) % 360;
  }
  if (alpha == null || !Number.isFinite(alpha)) return null;
  if (!absolute) return null;
  return ((360 - alpha) % 360 + 360) % 360;
}

function emitLocation(force: boolean, fromGps: boolean): void {
  if (!lastFix) return;
  const now = Date.now();
  const minGap = batterySave ? Math.max(1000, intervalMs / 4) : 200;
  if (!force && now - lastEmitAt < minGap) return;
  lastEmitAt = now;

  const data = {
    coords: { lat: lastFix.lat, lng: lastFix.lng },
    bearing: fusedBearing ?? 0,
    accuracy: lastAccuracy,
    speedKmh: lastSpeedKmh,
    timestamp: now,
    fromGps,
    hasBearing: fusedBearing != null,
  };
  postToMain({ type: 'location', data });
}

let lastAccuracy = 40;

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
  if (lastFixAt && input.timestamp - lastFixAt < intervalMs - 150) return;

  const raw = { latitude: input.lat, longitude: input.lng };
  if (lastRaw && lastRawAt) {
    const jumpM = haversineMeters(
      { latitude: lastRaw.lat, longitude: lastRaw.lng },
      raw
    );
    const dt = input.timestamp - lastRawAt;
    const mps = (jumpM / Math.max(dt, 1)) * 1000;
    if (jumpM >= GPS_JUMP_MIN_M && mps > GPS_JUMP_MAX_MPS) {
      return;
    }
  }

  lastRaw = { lat: input.lat, lng: input.lng };
  lastRawAt = input.timestamp;
  lastAccuracy = accuracy;

  const filtered = gpsFilter.update(input.lat, input.lng, accuracy);
  const next = { lat: filtered.lat, lng: filtered.lng };
  const prevFix = lastFix
    ? { latitude: lastFix.lat, longitude: lastFix.lng }
    : null;
  const elapsedMs = lastFixAt ? input.timestamp - lastFixAt : 0;
  lastSpeedKmh = speedKmhFromCoords(
    { speed: input.speedMps },
    prevFix,
    { latitude: next.lat, longitude: next.lng },
    elapsedMs
  );

  if (!headingOrigin) headingOrigin = lastRaw
    ? { latitude: lastRaw.lat, longitude: lastRaw.lng }
    : raw;
  const origin = headingOrigin;
  const movedFromOrigin = origin ? haversineMeters(origin, raw) : 0;
  let gpsBearing: number | null =
    input.heading != null && Number.isFinite(input.heading) ? input.heading : null;
  if (origin && movedFromOrigin >= Math.max(8, MIN_HEADING_MOVE_M)) {
    gpsBearing = bearingDegrees(origin, raw);
    headingOrigin = raw;
  }

  if (compassHeading != null && gpsBearing != null) {
    const gpsWeight = lastSpeedKmh != null ? Math.max(0, Math.min(0.75, lastSpeedKmh / 8)) : 0.25;
    fusedBearing = interpolateAngle(compassHeading, gpsBearing, gpsWeight);
  } else if (compassHeading != null) {
    fusedBearing = smoothBearing(fusedBearing, compassHeading, 0.35);
  } else if (gpsBearing != null) {
    fusedBearing = smoothBearing(fusedBearing, gpsBearing, 0.45);
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
  headingOrigin = null;
  compassHeading = null;
  fusedBearing = null;
  lastSpeedKmh = null;
  lastAccuracy = 40;
  motionMagnitude = 0;
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

  if (message.type === 'gps') {
    applyGpsSample(message);
    return;
  }

  if (message.type === 'orientation') {
    const heading = headingFromOrientation(
      message.alpha,
      message.webkitCompassHeading,
      message.absolute
    );
    if (heading == null) return;
    compassHeading = heading;
    if (fusedBearing == null) fusedBearing = heading;
    else fusedBearing = smoothBearing(fusedBearing, heading, 0.3);
    emitLocation(false, false);
    return;
  }

  if (message.type === 'motion') {
    const x = message.acceleration.x ?? 0;
    const y = message.acceleration.y ?? 0;
    const z = message.acceleration.z ?? 0;
    motionMagnitude = Math.sqrt(x * x + y * y + z * z);
  }
};
