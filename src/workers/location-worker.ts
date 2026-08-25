import {
  CAMERA_BEARING_DEADZONE_DEG,
  GPS_JUMP_MAX_MPS,
  GPS_JUMP_MIN_M,
  MAP_ROTATE_LOCK_MPS,
  MAX_ACCEPT_GPS_ACCURACY_M,
  MAX_HEADING_STEP_DEG,
  MIN_HEADING_MOVE_M,
  bearingDegrees,
  haversineMeters,
  shortestAngleDelta,
  speedKmhFromCoords,
  wrapDegrees,
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
let smoothSpeedMps = 0;
let lastAccuracy = 40;
let trail: { lat: number; lng: number }[] = [];

function postToMain(message: LocationWorkerOutbound): void {
  ctx.postMessage(message);
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

function pushTrail(lat: number, lng: number): void {
  trail.push({ lat, lng });
  const here = { latitude: lat, longitude: lng };
  while (trail.length > 2) {
    const span = haversineMeters(
      { latitude: trail[0].lat, longitude: trail[0].lng },
      here
    );
    if (span <= MIN_HEADING_MOVE_M * 2.4 && trail.length <= 24) break;
    trail.shift();
  }
}

/** 최근 약 10m 이동의 시작→끝 방위만 씁니다. 연속 두 점(1.5m)은 GPS 흔들림에 옆으로 눕습니다. */
function courseFromTrail(): number | null {
  if (trail.length < 2) return null;
  const last = trail[trail.length - 1];
  const end = { latitude: last.lat, longitude: last.lng };
  for (let i = 0; i < trail.length - 1; i += 1) {
    const start = { latitude: trail[i].lat, longitude: trail[i].lng };
    if (haversineMeters(start, end) >= MIN_HEADING_MOVE_M) {
      return wrapDegrees(bearingDegrees(start, end));
    }
  }
  return null;
}

function applyCourse(course: number): void {
  if (fusedBearing == null) {
    fusedBearing = course;
    return;
  }
  const delta = Math.abs(shortestAngleDelta(fusedBearing, course));
  if (delta < CAMERA_BEARING_DEADZONE_DEG) return;
  if (delta > MAX_HEADING_STEP_DEG) return;
  fusedBearing = wrapDegrees(
    fusedBearing + shortestAngleDelta(fusedBearing, course) * 0.22
  );
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
  if (lastSpeedKmh != null) {
    const instantMps = lastSpeedKmh / 3.6;
    smoothSpeedMps = smoothSpeedMps * 0.75 + instantMps * 0.25;
  }

  pushTrail(next.lat, next.lng);
  const course = courseFromTrail();
  if (course != null && smoothSpeedMps > MAP_ROTATE_LOCK_MPS) {
    applyCourse(course);
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
  smoothSpeedMps = 0;
  lastAccuracy = 40;
  trail = [];
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
