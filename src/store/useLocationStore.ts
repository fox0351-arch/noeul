import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type FollowCameraDebug = {
  followMode: boolean;
  setCenterCount: number;
  panToCount: number;
  moveCameraCount: number;
  fitBoundsCount: number;
  lat: number;
  lng: number;
  mapCenterLat: number | null;
  mapCenterLng: number | null;
  centerDeltaM: number | null;
  heading: number | null;
  arrowApplied: number | null;
  arrowOffset: number;
};

type LocationFixInput = {
  lat: number;
  lng: number;
  bearing: number | null;
  accuracy: number | null;
  speedKmh: number | null;
  timestamp: number;
  fromGps: boolean;
};

type LocationState = {
  lat: number | null;
  lng: number | null;
  bearing: number | null;
  accuracy: number | null;
  speedKmh: number | null;
  timestamp: number;
  fromGps: boolean;
  followMode: boolean;
  headingUp: boolean;
  mapHeadingDeg: number | null;
  recenterId: number;
  arrowRotationOffset: number;
  cameraDebug: FollowCameraDebug | null;
  applyFix: (fix: LocationFixInput) => void;
  setFollowMode: (followMode: boolean) => void;
  setHeadingUp: (headingUp: boolean) => void;
  setMapHeadingDeg: (mapHeadingDeg: number | null) => void;
  bumpRecenter: () => void;
  setRecenterId: (recenterId: number) => void;
  setArrowRotationOffset: (arrowRotationOffset: number) => void;
  setCameraDebug: (cameraDebug: FollowCameraDebug | null) => void;
};

export const useLocationStore = create<LocationState>()(
  subscribeWithSelector((set) => ({
    lat: null,
    lng: null,
    bearing: null,
    accuracy: null,
    speedKmh: null,
    timestamp: 0,
    fromGps: false,
    followMode: false,
    headingUp: true,
    mapHeadingDeg: null,
    recenterId: 0,
    arrowRotationOffset: 0,
    cameraDebug: null,
    applyFix: (fix) =>
      set({
        lat: fix.lat,
        lng: fix.lng,
        bearing: fix.bearing,
        accuracy: fix.accuracy,
        speedKmh: fix.speedKmh,
        timestamp: fix.timestamp,
        fromGps: fix.fromGps,
      }),
    setFollowMode: (followMode) => set({ followMode }),
    setHeadingUp: (headingUp) => set({ headingUp }),
    setMapHeadingDeg: (mapHeadingDeg) => set({ mapHeadingDeg }),
    bumpRecenter: () => set((s) => ({ recenterId: s.recenterId + 1 })),
    setRecenterId: (recenterId) => set({ recenterId }),
    setArrowRotationOffset: (arrowRotationOffset) => set({ arrowRotationOffset }),
    setCameraDebug: (cameraDebug) => set({ cameraDebug }),
  }))
);
