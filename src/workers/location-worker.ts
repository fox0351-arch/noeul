import {
  GPS_JUMP_MAX_MPS,
  GPS_JUMP_MIN_M,
  MAX_ACCEPT_GPS_ACCURACY_M,
  MIN_HEADING_MOVE_M,
  bearingDegrees,
  haversineMeters,
  nearestSegmentBearing,
  speedKmhFromCoords,
} from '../lib/geo';
import type { PlaceLocation } from '../types/place';
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
let compassHeading: number | null = null;
let fusedBearing: number | null = null;
let lastSpeedKmh: number | null = null;
let lastAccuracy = 40;
let motionMagnitude = 0;
const HEADING_BUFFER = 7;
const COURSE_SPAN_M = 6;
let headingSamples: number[] = [];
let routePoints: PlaceLocation[] = [];
let trail: { lat: number; lng: number }[] = [];
let strayHeadingCount = 0;

function postToMain(message: LocationWorkerOutbound): void {
  ctx.postMessage(message);
}

function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function wrapDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

function smoothBearing(previous: number | null, next: number, alpha: number): number {
  if (previous == null || !Number.isFinite(previous)) return wrapDeg(next);
  return wrapDeg(previous + shortestAngleDelta(previous, next) * alpha);
}

function interpolateAngle(a: number, b: number, bWeight: number): number {
  return smoothBearing(a, b, Math.max(0, Math.min(1, bWeight)));
}

/** GPS 헤딩이 진행 벡터와 반대면 180° 뒤집습니다. */
function alignToTravel(reference: number | null, sample: number): number {
  const wrapped = wrapDeg(sample);
  if (reference == null || !Number.isFinite(reference)) return wrapped;
  const delta = Math.abs(shortestAngleDelta(reference, wrapped));
  if (delta < 140) return wrapped;
  const flipped = wrapDeg(wrapped + 180);
  return Math.abs(shortestAngleDelta(reference, flipped)) < delta ? flipped : wrapped;
}

function pushTrail(lat: number, lng: number): void {
  trail.push({ lat, lng });
  const here = { latitude: lat, longitude: lng };
  while (trail.length > 1) {
    const span = haversineMeters({ latitude: trail[0].lat, longitude: trail[0].lng }, here);
    if (span <= COURSE_SPAN_M * 2.2 && trail.length <= 12) break;
    trail.shift();
  }
}

/** 최근 6m 이동의 시작→끝 방위입니다. 연속 GPS 노이즈보다 안정적입니다. */
function courseFromTrail(): number | null {
  if (trail.length < 2) return null;
  const last = trail[trail.length - 1];
  const end = { latitude: last.lat, longitude: last.lng };
  for (let i = 0; i < trail.length - 1; i += 1) {
    const start = { latitude: trail[i].lat, longitude: trail[i].lng };
    if (haversineMeters(start, end) >= COURSE_SPAN_M) {
      return bearingDegrees(start, end);
    }
  }
  const first = { latitude: trail[0].lat, longitude: trail[0].lng };
  if (haversineMeters(first, end) >= MIN_HEADING_MOVE_M) {
    return bearingDegrees(first, end);
  }
  return null;
}

function alignToPath(sample: number, pathBearing: number | null): number {
  if (pathBearing == null) return wrapDeg(sample);
  const wrapped = wrapDeg(sample);
  if (Math.abs(shortestAngleDelta(pathBearing, wrapped)) > 140) {
    return wrapDeg(wrapped + 180);
  }
  return wrapped;
}

function blendWithPath(sample: number, pathBearing: number | null): number {
  let next = alignToPath(sample, pathBearing);
  if (pathBearing == null) {
    strayHeadingCount = 0;
    return next;
  }
  const delta = Math.abs(shortestAngleDelta(pathBearing, next));
  if (delta > 75) {
    strayHeadingCount += 1;
    if (strayHeadingCount < 3) next = interpolateAngle(pathBearing, next, 0.18);
  } else {
    strayHeadingCount = 0;
    next = interpolateAngle(pathBearing, next, 0.55);
  }
  return next;
}

function pushHeadingSample(sample: number): void {
  headingSamples.push(wrapDeg(sample));
  if (headingSamples.length > HEADING_BUFFER) headingSamples.shift();
}

/** 최근 값에 더 무게를 둔 원형 가중 이동평균입니다. */
function wmaHeading(): number | null {
  if (headingSamples.length === 0) return null;
  let x = 0;
  let y = 0;
  headingSamples.forEach((heading, index) => {
    const weight = index + 1;
    const rad = (heading * Math.PI) / 180;
    x += Math.cos(rad) * weight;
    y += Math.sin(rad) * weight;
  });
  return wrapDeg((Math.atan2(y, x) * 180) / Math.PI);
}

function headingFromOrientation(
  alpha: number | null,
  webkitCompassHeading: number | null,
  absolute: boolean
): number | null {
  if (webkitCompassHeading != null && Number.isFinite(webkitCompassHeading)) {
    return wrapDeg(webkitCompassHeading);
  }
  if (alpha == null || !Number.isFinite(alpha) || !absolute) return null;
  return wrapDeg(360 - alpha);
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
  if (lastFixAt && input.timestamp - lastFixAt < intervalMs - 150) return;

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

  const filtered = gpsFilter.update(input.lat, input.lng, accuracy);
  const next = { lat: filtered.lat, lng: filtered.lng };
  const prevFix = lastFix ? { latitude: lastFix.lat, longitude: lastFix.lng } : null;
  const elapsedMs = lastFixAt ? input.timestamp - lastFixAt : 0;
  lastSpeedKmh = speedKmhFromCoords(
    { speed: input.speedMps },
    prevFix,
    { latitude: next.lat, longitude: next.lng },
    elapsedMs
  );

  const walking = lastSpeedKmh != null && lastSpeedKmh >= 1;
  pushTrail(next.lat, next.lng);
  const pathBearing = nearestSegmentBearing(
    { latitude: next.lat, longitude: next.lng },
    routePoints
  );

  let sample = courseFromTrail();
  if (sample == null && !walking && input.heading != null && Number.isFinite(input.heading)) {
    const gpsHeading = alignToTravel(fusedBearing ?? pathBearing, input.heading);
    if (pathBearing == null || Math.abs(shortestAngleDelta(pathBearing, gpsHeading)) < 50) {
      sample = gpsHeading;
    }
  }

  if (sample != null) {
    const mixed = blendWithPath(sample, pathBearing);
    const aligned = alignToTravel(fusedBearing ?? wmaHeading() ?? pathBearing, mixed);
    pushHeadingSample(aligned);
    const wma = wmaHeading();
    if (wma != null) fusedBearing = smoothBearing(fusedBearing, wma, 0.28);
  } else if (!walking && compassHeading != null) {
    fusedBearing =
      fusedBearing == null ? compassHeading : interpolateAngle(fusedBearing, compassHeading, 0.18);
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
  compassHeading = null;
  fusedBearing = null;
  lastSpeedKmh = null;
  lastAccuracy = 40;
  motionMagnitude = 0;
  headingSamples = [];
  trail = [];
  strayHeadingCount = 0;
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
    routePoints = message.points.map((point) => ({
      latitude: point.lat,
      longitude: point.lng,
    }));
    strayHeadingCount = 0;
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
    const walking = lastSpeedKmh != null && lastSpeedKmh >= 1;
    if (walking) return;
    fusedBearing = fusedBearing == null ? heading : smoothBearing(fusedBearing, heading, 0.18);
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
