export interface LocationState {
  coords: { lat: number; lng: number };
  bearing: number;
  accuracy: number;
}

export interface LocationWorkerFix extends LocationState {
  speedKmh: number | null;
  timestamp: number;
  fromGps: boolean;
  hasBearing: boolean;
  rotationDebug?: {
    measuredSpeedMps: number | null;
    smoothSpeedMps: number;
    windowSpeedMps: number | null;
    gateSpeedMps: number;
    course: number | null;
    fusedBearing: number | null;
    decision: 'waiting_distance' | 'speed_lock' | 'initial' | 'deadzone' | 'jump_rejected' | 'updated';
    counts: {
      waitingDistance: number;
      speedLock: number;
      deadzone: number;
      jumpRejected: number;
      updated: number;
    };
  };
}

export type LocationWorkerInbound =
  | { type: 'start'; intervalMs: number; batterySave: boolean }
  | { type: 'stop' }
  | {
      type: 'gps';
      lat: number;
      lng: number;
      accuracy: number;
      heading: number | null;
      speedMps: number | null;
      timestamp: number;
    }
  | {
      type: 'orientation';
      alpha: number | null;
      webkitCompassHeading: number | null;
      absolute: boolean;
      timestamp: number;
    }
    | {
      type: 'motion';
      acceleration: { x: number | null; y: number | null; z: number | null };
      timestamp: number;
    }
  | { type: 'route'; points: { lat: number; lng: number }[] };

export type LocationWorkerOutbound =
  | { type: 'ready'; geolocationInWorker: boolean }
  | { type: 'location'; data: LocationWorkerFix }
  | { type: 'error'; code: number; message: string };
