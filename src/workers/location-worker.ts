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
let trail: { lat: number; lng: number; at: number }[] = [];
let lastCourse: number | null = null;
let lastWindowSpeedMps: number | null = null;
let lastGateSpeedMps = 0;
let lastDecision: NonNullable<
  Extract<LocationWorkerOutbound, { type: 'location' }>['data']['rotationDebug']
>['decision'] = 'waiting_distance';
let decisionCounts = {
  waitingDistance: 0,
  speedLock: 0,
  deadzone: 0,
  jumpRejected: 0,
  updated: 0,
};

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
      rotationDebug: {
        measuredSpeedMps: lastSpeedKmh == null ? null : lastSpeedKmh / 3.6,
        smoothSpeedMps,
        windowSpeedMps: lastWindowSpeedMps,
        gateSpeedMps: lastGateSpeedMps,
        course: lastCourse,
        fusedBearing,
        decision: lastDecision,
        counts: { ...decisionCounts },
      },
    },
  });
}

function pushTrail(lat: number, lng: number, at: number): void {
  trail.push({ lat, lng, at });
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

/** 최근 약 10m 이동의 방향과 구간 평균 속도를 함께 계산합니다. */
function courseFromTrail(): { bearing: number; speedMps: number } | null {
  if (trail.length < 2) return null;
  const last = trail[trail.length - 1];
  const end = { latitude: last.lat, longitude: last.lng };
  for (let i = 0; i < trail.length - 1; i += 1) {
    const start = { latitude: trail[i].lat, longitude: trail[i].lng };
    const distanceM = haversineMeters(start, end);
    if (distanceM >= MIN_HEADING_MOVE_M) {
      const elapsedSec = Math.max((last.at - trail[i].at) / 1000, 0.2);
      return {
        bearing: wrapDegrees(bearingDegrees(start, end)),
        speedMps: distanceM / elapsedSec,
      };
    }
  }
  return null;
}

function applyCourse(
  course: number
): 'initial' | 'deadzone' | 'jump_rejected' | 'updated' {
  if (fusedBearing == null) {
    fusedBearing = course;
    return 'initial';
  }
  const delta = Math.abs(shortestAngleDelta(fusedBearing, course));
  if (delta < CAMERA_BEARING_DEADZONE_DEG) return 'deadzone';
  if (delta > MAX_HEADING_STEP_DEG) return 'jump_rejected';
  fusedBearing = wrapDegrees(
    fusedBearing + shortestAngleDelta(fusedBearing, course) * 0.3
  );
  return 'updated';
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

  pushTrail(next.lat, next.lng, input.timestamp);
  const courseResult = courseFromTrail();
  lastCourse = courseResult?.bearing ?? null;
  lastWindowSpeedMps = courseResult?.speedMps ?? null;
  lastGateSpeedMps = Math.max(smoothSpeedMps, lastWindowSpeedMps ?? 0);
  if (courseResult == null) {
    lastDecision = 'waiting_distance';
    decisionCounts.waitingDistance += 1;
  } else if (lastGateSpeedMps < MAP_ROTATE_LOCK_MPS) {
    lastDecision = 'speed_lock';
    decisionCounts.speedLock += 1;
  } else {
    lastDecision = applyCourse(courseResult.bearing);
    if (lastDecision === 'initial' || lastDecision === 'updated') {
      decisionCounts.updated += 1;
    } else if (lastDecision === 'deadzone') {
      decisionCounts.deadzone += 1;
    } else {
      decisionCounts.jumpRejected += 1;
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
  smoothSpeedMps = 0;
  lastAccuracy = 40;
  trail = [];
  lastCourse = null;
  lastWindowSpeedMps = null;
  lastGateSpeedMps = 0;
  lastDecision = 'waiting_distance';
  decisionCounts = {
    waitingDistance: 0,
    speedLock: 0,
    deadzone: 0,
    jumpRejected: 0,
    updated: 0,
  };
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
