'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MapDomView from '@/components/MapDomView';
import { MapManager } from '@/services/MapManager';
import { useLocationStore, type FollowCameraDebug } from '@/store/useLocationStore';
import { LocationSignalManager } from '@/workers/locationSignalManager';
import { createMockTravelRoute, type SimReport } from '@/workers/location-mock';
import { OFF_ROUTE_VOICE, speakOffRouteAlert } from '@/lib/navSafety';
import { routePointsToLocations } from '@/types/route';

type WindowSim = Window & { __NOEUL_SIM__?: SimReport };

export default function LocationSimPanel() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-dvh text-lg font-bold text-slate-700">
        시뮬 페이지를 준비하는 중
      </div>
    );
  }

  return <LocationSimPanelLive />;
}

function LocationSimPanelLive() {
  const route = useMemo(() => createMockTravelRoute(), []);
  const routePoints = useMemo(() => routePointsToLocations(route.points), [route]);
  const center = routePoints[0] ?? { latitude: 35.3218, longitude: 129.2184 };
  const [running, setRunning] = useState(true);
  const [gpsCount, setGpsCount] = useState(0);
  const [userLocation, setUserLocation] = useState(center);
  const [report, setReport] = useState<SimReport | null>(null);
  const cameraDebug = useLocationStore((s) => s.cameraDebug);

  useEffect(() => {
    const first = routePoints[0];
    if (!first) return;
    useLocationStore.getState().applyFix({
      lat: first.latitude,
      lng: first.longitude,
      bearing: 45,
      hasBearing: true,
      accuracy: 8,
      speedKmh: 4,
      timestamp: Date.now(),
      fromGps: true,
    });
    const tryFit = () => MapManager.getInstance().fitRouteBounds();
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(tryFit, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [routePoints]);

  useEffect(() => {
    if (!running) {
      useLocationStore.getState().setFollowMode(false);
      return;
    }

    const store = useLocationStore.getState();
    store.setFollowMode(true);
    store.setHeadingUp(true);

    const signal = new LocationSignalManager();
    signal.setRoute(routePoints.map((point) => ({ lat: point.latitude, lng: point.longitude })));
    signal.start({
      intervalMs: 800,
      batterySave: false,
      useMock: true,
      onLocation: (fix) => {
        const next = { latitude: fix.coords.lat, longitude: fix.coords.lng };
        setUserLocation(next);
        if (fix.fromGps) setGpsCount((n) => n + 1);
        store.applyFix({
          lat: next.latitude,
          lng: next.longitude,
          bearing: fix.hasBearing ? fix.bearing : null,
          hasBearing: fix.hasBearing,
          accuracy: fix.accuracy,
          speedKmh: fix.speedKmh,
          timestamp: fix.timestamp,
          fromGps: fix.fromGps,
        });
        if (fix.hasBearing) store.setMapHeadingDeg(fix.bearing);
      },
      onError: (err) => {
        console.warn('[location-sim]', err);
        setRunning(false);
      },
    });

    const statsTimer = window.setInterval(() => {
      setReport((window as WindowSim).__NOEUL_SIM__ ?? null);
    }, 1000);

    return () => {
      window.clearInterval(statsTimer);
      signal.stop();
      useLocationStore.getState().setFollowMode(false);
    };
  }, [running, routePoints]);

  return (
    <div className="flex flex-col h-dvh bg-slate-100">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-200 shrink-0">
        <p className="text-base font-black text-slate-900">위치 시뮬 · 계곡따라2</p>
        <p className="text-sm font-bold text-slate-800">시속 4km · 헤딩 스무딩 · 따라가기</p>
        <button
          type="button"
          className="px-3 text-sm font-black text-white rounded-md min-h-10 bg-slate-900"
          onClick={() => setRunning((v) => !v)}
        >
          {running ? '시뮬 중지' : '시뮬 시작'}
        </button>
        <button
          type="button"
          className="px-3 text-sm font-black text-white rounded-md min-h-10 bg-rose-700"
          onClick={() => {
            const first = speakOffRouteAlert(OFF_ROUTE_VOICE[20]);
            window.setTimeout(() => {
              const second = speakOffRouteAlert(OFF_ROUTE_VOICE[20]);
              const result = { first, second, expectSecondFalse: true };
              (window as unknown as { __NOEUL_TTS_COOLDOWN__?: typeof result }).__NOEUL_TTS_COOLDOWN__ = result;
              console.info('[노을-sim] off-route TTS cooldown', result);
            }, 800);
          }}
        >
          이탈 TTS 테스트
        </button>
        <Link href="/" className="px-3 text-sm font-bold underline min-h-10 inline-flex items-center">
          홈으로
        </Link>
      </header>
      <DebugBar cameraDebug={cameraDebug} gpsCount={gpsCount} report={report} running={running} />
      <div className="relative flex-1 min-h-0">
        <MapDomView
          center={center}
          places={[]}
          selectedPlaceId={null}
          onSelectPlace={() => undefined}
          routePoints={routePoints}
          userLocation={userLocation}
        />
      </div>
    </div>
  );
}

function DebugBar({
  cameraDebug,
  gpsCount,
  report,
  running,
}: {
  cameraDebug: FollowCameraDebug | null;
  gpsCount: number;
  report: SimReport | null;
  running: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-sm font-bold bg-black text-white md:grid-cols-4 shrink-0">
      <p>상태 {running ? '실행 중' : '정지'}</p>
      <p>GPS {gpsCount}</p>
      <p>moveCamera {cameraDebug?.moveCameraCount ?? 0}</p>
      <p>panTo {cameraDebug?.panToCount ?? 0}</p>
      <p>setCenter {cameraDebug?.setCenterCount ?? 0}</p>
      <p>fitBounds {cameraDebug?.fitBoundsCount ?? 0}</p>
      <p>힙 {report?.heapEndMb ?? '-'}MB</p>
      <p>방향 RMS {report?.headingErrorRms ?? '-'}°</p>
      <p>경과 {report?.runningSec ?? 0}초</p>
      <p>전방 {cameraDebug?.centerDeltaM ?? '-'}m</p>
    </div>
  );
}
