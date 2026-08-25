'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaceDetails, PlaceItem, PlaceLocation, PlacesSearchResponse } from '@/types/place';
import { generateKML, downloadKmlFile } from '@/lib/kmlBuilder';
import { loadManualPlaces, saveManualPlaces } from '@/lib/manualPlacesStorage';
import { loadActiveRouteSession, saveActiveRouteSession } from '@/lib/activeRouteStorage';
import { clearTravelMapRoute, createTravelMapId, deleteTravelMap, exportTravelMapBackupJson, loadTravelMaps, removePlaceFromTravelMap, restoreTravelMapsFromBackup, saveTravelMap, updateTravelMap, updateTravelMapNotes } from '@/lib/travelMapStorage';
import { filesToPlacePhotos, isQuotaExceeded, MAX_PHOTOS_PER_PLACE } from '@/lib/placePhotos';
import { analyzePlacePhotos } from '@/lib/photoAiClient';
import { generateTravelBlogEssay, TravelBlogDraft } from '@/lib/travelBlogEssay';
import { TRAVEL_MAP_CHECKLIST_PRESETS, TravelMap, TravelMapChecklistItem, withPresetChecklistTexts } from '@/types/travelMap';
import { TravelRoute, routePointsToLocations } from '@/types/route';
import { parseTrailFile } from '@/lib/gpxKmlParser';
import { OffRouteLevel, bearingDegrees, closestPointOnRoute, distanceToRouteMeters, offRouteLevelFromDistance, MIN_MAP_ROTATE_KMH, OFF_ROUTE_HOLD_MS, OFF_ROUTE_THRESHOLD_M, STOP_MAP_ROTATE_KMH, WEAK_GPS_ACCURACY_M } from '@/lib/geo';
import { LocationSignalManager } from '@/workers/locationSignalManager';
import {
  formatSosMessage,
  loadBatterySave,
  openKakaoShare,
  openPhoneCall,
  openSmsShare,
  OFF_ROUTE_VOICE,
  RETURN_TO_ROUTE_VOICE,
  VOICE_PREVIEW,
  offRouteToastText,
  saveBatterySave,
  shareOrCopy,
  setActiveVoiceStyle,
  speakKorean,
  speakOffRouteAlert,
  startRepeatingSpeech,
  stopRepeatingSpeech,
  unlockAlertAudio,
  vibrateAlert,
  vibrateOnce,
  vibrateTimes,
  warmSpeechVoices,
} from '@/lib/navSafety';
import { batteryBand, subscribeBattery, type BatteryLevelBand } from '@/lib/batteryStatus';
import { loadLastGps, saveLastGps, lastGpsToLocation } from '@/lib/lastGps';
import { loadGuardianPhone, saveGuardianPhone } from '@/lib/guardianStorage';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { loadUserSettings, saveUserSettings, type VoiceStyle } from '@/lib/userData';
import MapDomView from '@/components/MapDomView';
import SimQueryRedirect from '@/components/SimQueryRedirect';
import { useLocationStore } from '@/store/useLocationStore';
import { MapManager } from '@/services/MapManager';
import PlaceDetailCard from '@/components/PlaceDetailCard';

function formatMapDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export default function HomePage() {
  const [keyword, setKeyword] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [center, setCenter] = useState<PlaceLocation>({ latitude: 37.5665, longitude: 126.9780 });
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [addKeyword, setAddKeyword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addErrorMsg, setAddErrorMsg] = useState('');
  const [addSuccessMsg, setAddSuccessMsg] = useState('');
  const [manualPlaces, setManualPlaces] = useState<PlaceItem[]>([]);
  const [hasLoadedManualPlaces, setHasLoadedManualPlaces] = useState(false);
  const [hideManualExtras, setHideManualExtras] = useState(false);
  const [travelMaps, setTravelMaps] = useState<TravelMap[]>([]);
  const [mapTitle, setMapTitle] = useState('');
  const [selectedSavedMapId, setSelectedSavedMapId] = useState<string | null>(null);
  const [loadedMapId, setLoadedMapId] = useState<string | null>(null);
  const [mapNotice, setMapNotice] = useState('');
  const [mapError, setMapError] = useState('');
  const [isPlaceListCollapsed, setIsPlaceListCollapsed] = useState(false);
  const [placeListToggledByUser, setPlaceListToggledByUser] = useState(false);
  const placeListSectionRef = useRef<HTMLDivElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const routeFileInputRef = useRef<HTMLInputElement>(null);
  const routeImportTargetMapIdRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetPlaceId = useRef<string | null>(null);
  const shouldScrollToPlaceList = useRef(false);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [memoOpenPlaceId, setMemoOpenPlaceId] = useState<string | null>(null);
  const [mapMemo, setMapMemo] = useState('');
  const [mapChecklist, setMapChecklist] = useState<TravelMapChecklistItem[]>([]);
  const [isMapMemoOpen, setIsMapMemoOpen] = useState(false);
  const [photoBusyPlaceId, setPhotoBusyPlaceId] = useState<string | null>(null);
  const [isBlogOpen, setIsBlogOpen] = useState(false);
  const [isBlogGenerating, setIsBlogGenerating] = useState(false);
  const [blogDraft, setBlogDraft] = useState<TravelBlogDraft | null>(null);
  const [blogCopyNotice, setBlogCopyNotice] = useState('');
  const [currentRoute, setCurrentRoute] = useState<TravelRoute | null>(null);
  const [isFollowMode, setIsFollowMode] = useState(false);
  const [userLocation, setUserLocation] = useState<PlaceLocation | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [offRouteLevel, setOffRouteLevel] = useState<OffRouteLevel>(0);
  const [isOnline, setIsOnline] = useState(true);
  const [batterySave, setBatterySave] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [headingUpMode, setHeadingUpMode] = useState(true);
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('female');
  const [mapHeadingDeg, setMapHeadingDeg] = useState<number | null>(null);
  const [sosStep, setSosStep] = useState<0 | 1 | 2>(0);
  const [isSosShareOpen, setIsSosShareOpen] = useState(false);
  const [sosNotice, setSosNotice] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [navSessionReady, setNavSessionReady] = useState(false);
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const [locateToast, setLocateToast] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationDialogDismissed, setLocationDialogDismissed] = useState(false);
  const [returnPoint, setReturnPoint] = useState<PlaceLocation | null>(null);
  const [returnToast, setReturnToast] = useState('');
  const [offRouteToast, setOffRouteToast] = useState('');
  const offRouteToastTimerRef = useRef<number | null>(null);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [batteryCharging, setBatteryCharging] = useState(false);
  const [batterySupported, setBatterySupported] = useState(false);
  const [batteryAlertBand, setBatteryAlertBand] = useState<BatteryLevelBand>('ok');
  const offRouteLevelRef = useRef<OffRouteLevel>(0);
  const lastBatteryBandRef = useRef<BatteryLevelBand>('ok');
  const lastFixRef = useRef<PlaceLocation | null>(null);
  const lastFixAtRef = useRef(0);
  const mapHeadingRef = useRef<number | null>(null);
  const mapRotatingRef = useRef(false);
  const lastGoodHeadingRef = useRef<number | null>(null);
  const lastRawGpsRef = useRef<PlaceLocation | null>(null);
  const currentRouteRef = useRef(currentRoute);
  const isFollowModeRef = useRef(isFollowMode);
  const didCenterOnGpsRef = useRef(false);
  const gpsSignalRef = useRef<LocationSignalManager | null>(null);
  const applyImportedTrailFileRef = useRef<(file: File) => Promise<void>>(async () => {});
  const { installed, hint: installHint, install: installApp } = usePwaInstall();

  const displayedPlaces = useMemo(() => {
    if (hideManualExtras) {
      return places;
    }

    const savedById = new Map(manualPlaces.map((place) => [place.id, place]));
    const fromSearchOrList = places.map((place) => {
      const saved = savedById.get(place.id);
      return saved
        ? {
            ...place,
            addedManually: true,
            memo: place.memo ?? saved.memo,
            photos: place.photos ?? saved.photos,
          }
        : place;
    });
    const seen = new Set(fromSearchOrList.map((place) => place.id));
    const extras = manualPlaces.filter((place) => !seen.has(place.id));
    return [...fromSearchOrList, ...extras];
  }, [places, manualPlaces, hideManualExtras]);

  const selectedPlace = useMemo(
    () => displayedPlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [displayedPlaces, selectedPlaceId]
  );

  const routePoints = useMemo(
    () => (currentRoute ? routePointsToLocations(currentRoute.points) : []),
    [currentRoute]
  );

  const sosLocation = userLocation ?? lastGpsToLocation(loadLastGps());

  const handleSelectPlace = useCallback((id: string) => {
    setSelectedPlaceId(id);
  }, []);

  useEffect(() => {
    currentRouteRef.current = currentRoute;
    isFollowModeRef.current = isFollowMode;
  }, [currentRoute, isFollowMode]);

  /* eslint-disable react-hooks/set-state-in-effect -- 기기 저장값을 첫 화면에 올립니다 */
  useEffect(() => {
    setManualPlaces(loadManualPlaces());
    setHasLoadedManualPlaces(true);
    setTravelMaps(loadTravelMaps());
    setBatterySave(loadBatterySave());
    setGuardianPhone(loadGuardianPhone());
    const prefs = loadUserSettings();
    setVoiceStyle(prefs.voiceStyle);
    setHeadingUpMode(prefs.headingUp);
    setActiveVoiceStyle(prefs.voiceStyle);
    warmSpeechVoices();
    const contrastOn = window.localStorage.getItem('noeul.highContrast.v1') === '1';
    setHighContrast(contrastOn);
    document.documentElement.classList.toggle('high-contrast', contrastOn);
    setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const lastFix = loadLastGps();
    if (lastFix) {
      lastFixRef.current = { latitude: lastFix.latitude, longitude: lastFix.longitude };
      setUserLocation({ latitude: lastFix.latitude, longitude: lastFix.longitude });
      setCenter({ latitude: lastFix.latitude, longitude: lastFix.longitude });
      useLocationStore.getState().applyFix({
        lat: lastFix.latitude,
        lng: lastFix.longitude,
        bearing: null,
        accuracy: lastFix.accuracyM,
        speedKmh: null,
        timestamp: Date.now(),
        fromGps: true,
      });
    }

    const session = loadActiveRouteSession();
    if (session) {
      setCurrentRoute(session.route);
      setPlaces(session.places);
      setHideManualExtras(true);
      setMapTitle(session.title);
      setCurrentQuery(session.query);
      if (session.places[0]) {
        setCenter(session.places[0].location);
      } else if (session.route.points[0]) {
        setCenter(session.route.points[0]);
      }
      if ((session.route.points.length ?? 0) >= 2) {
        window.setTimeout(() => MapManager.getInstance().fitRouteBounds(), 0);
      }
    }
    setNavSessionReady(true);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return subscribeBattery((status) => {
      setBatterySupported(status.supported);
      setBatteryPercent(status.percent);
      setBatteryCharging(status.charging);
      if (!status.supported || status.percent == null) {
        setBatteryAlertBand('ok');
        lastBatteryBandRef.current = 'ok';
        return;
      }
      const nextBand = batteryBand(status.percent, status.charging);
      const prevBand = lastBatteryBandRef.current;
      lastBatteryBandRef.current = nextBand;
      setBatteryAlertBand(nextBand);
      if (nextBand === prevBand || nextBand === 'ok') return;

      const rank = { ok: 0, low20: 1, low10: 2, low5: 3 };
      if (rank[nextBand] <= rank[prevBand]) return;

      if (nextBand === 'low20') {
        vibrateTimes(1);
        return;
      }
      if (nextBand === 'low10') {
        vibrateTimes(2);
        speakKorean('배터리가 10퍼센트 남았습니다. 충전을 준비하세요.');
        return;
      }
      vibrateTimes(3);
      speakKorean('배터리가 5퍼센트입니다. 지금 충전하십시오.');
    });
  }, []);

  useEffect(() => {
    if (!hasLoadedManualPlaces) return;
    try {
      saveManualPlaces(manualPlaces);
    } catch (error) {
      if (isQuotaExceeded(error)) {
        queueMicrotask(() => {
          setMapError('사진 용량이 커서 기기에 저장하지 못했습니다. 사진을 줄여 주세요.');
        });
      }
    }
  }, [manualPlaces, hasLoadedManualPlaces]);

  useEffect(() => {
    if (!navSessionReady) return;
    if (currentRoute && currentRoute.points.length >= 2) {
      saveActiveRouteSession({
        route: currentRoute,
        places: displayedPlaces,
        title: mapTitle.trim() || currentRoute.name,
        query: currentQuery || currentRoute.name,
      });
      return;
    }
    saveActiveRouteSession(null);
  }, [navSessionReady, currentRoute, displayedPlaces, mapTitle, currentQuery]);

  /* eslint-disable react-hooks/set-state-in-effect -- 장소 수에 맞춰 목록 접힘만 맞춥니다 */
  useEffect(() => {
    if (placeListToggledByUser) return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) {
      setIsPlaceListCollapsed(false);
      return;
    }
    setIsPlaceListCollapsed(displayedPlaces.length >= 15);
  }, [displayedPlaces.length, placeListToggledByUser]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!shouldScrollToPlaceList.current) return;
    shouldScrollToPlaceList.current = false;
    placeListSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [places]);

  useEffect(() => {
    if (!isFollowMode) {
      queueMicrotask(() => {
        setOffRouteLevel(0);
        setReturnPoint(null);
      });
      offRouteLevelRef.current = 0;
      stopRepeatingSpeech();
    }

    let cancelled = false;
    const intervalMs = batterySave ? 10000 : 800;
    let offRouteSince = 0;
    let onRouteSince = 0;
    console.info('[노을-gps] watch start', { intervalMs, follow: isFollowModeRef.current });

    const applyOffRoute = (distance: number, loc: PlaceLocation, routeLocations: PlaceLocation[]) => {
      if (distance < OFF_ROUTE_THRESHOLD_M) {
        if (!onRouteSince) onRouteSince = Date.now();
        if (offRouteLevelRef.current !== 0 && Date.now() - onRouteSince < 4000) {
          return;
        }
        offRouteSince = 0;
        const prevLevel = offRouteLevelRef.current;
        if (prevLevel === 0) {
          setReturnPoint(null);
          return;
        }
        offRouteLevelRef.current = 0;
        setOffRouteLevel(0);
        setReturnPoint(null);
        stopRepeatingSpeech();
        speakKorean(RETURN_TO_ROUTE_VOICE);
        vibrateOnce();
        setOffRouteToast('');
        if (offRouteToastTimerRef.current) window.clearTimeout(offRouteToastTimerRef.current);
        setReturnToast('✅ 원래 경로로 복귀했습니다');
        window.setTimeout(() => setReturnToast(''), 2000);
        return;
      }

      onRouteSince = 0;
      if (!offRouteSince) offRouteSince = Date.now();
      if (Date.now() - offRouteSince < OFF_ROUTE_HOLD_MS) return;

      const nextLevel = offRouteLevelFromDistance(distance);
      const prevLevel = offRouteLevelRef.current;
      setReturnPoint(closestPointOnRoute(loc, routeLocations));
      if (nextLevel === prevLevel) return;

      offRouteLevelRef.current = nextLevel;
      setOffRouteLevel(nextLevel);

      if (nextLevel !== 100 && prevLevel === 100) {
        stopRepeatingSpeech();
      }

      if ((nextLevel === 20 || nextLevel === 50 || nextLevel === 100) && prevLevel < nextLevel) {
        const meters = Math.max(1, Math.round(distance));
        setOffRouteToast(offRouteToastText(meters));
        if (offRouteToastTimerRef.current) window.clearTimeout(offRouteToastTimerRef.current);
        offRouteToastTimerRef.current = window.setTimeout(() => setOffRouteToast(''), 3000);
        vibrateAlert(nextLevel);
        if (nextLevel === 100) {
          startRepeatingSpeech(OFF_ROUTE_VOICE[100], 11000);
        } else {
          speakOffRouteAlert(OFF_ROUTE_VOICE[nextLevel]);
        }
      }
    };

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        setLocationDenied(true);
        setMapError('이 기기에서는 위치를 쓸 수 없습니다. 위치 기능이 있는 휴대폰 브라우저를 사용해 주세요.');
      });
      return;
    }

    void LocationSignalManager.requestSensorPermissions();
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;
        setLocationDenied(status.state === 'denied');
        status.onchange = () => setLocationDenied(status.state === 'denied');
      })
      .catch(() => {});

    const signal = new LocationSignalManager();
    gpsSignalRef.current = signal;
    signal.setRoute(
      (currentRouteRef.current?.points ?? []).map((point) => ({
        lat: point.latitude,
        lng: point.longitude,
      }))
    );
    signal.start({
      intervalMs,
      batterySave,
      onLocation: (fix) => {
        if (cancelled) return;
        const next: PlaceLocation = {
          latitude: fix.coords.lat,
          longitude: fix.coords.lng,
        };
        const heading = fix.hasBearing && Number.isFinite(fix.bearing) ? fix.bearing : null;
        const accuracy = Number.isFinite(fix.accuracy) ? fix.accuracy : null;

        setGpsAccuracyM(accuracy);
        lastRawGpsRef.current = next;
        setLocationDenied(false);

        if (fix.speedKmh != null) {
          if (fix.speedKmh >= MIN_MAP_ROTATE_KMH) mapRotatingRef.current = true;
          if (fix.speedKmh < STOP_MAP_ROTATE_KMH) mapRotatingRef.current = false;
        }
        if (heading != null) {
          lastGoodHeadingRef.current = heading;
          mapHeadingRef.current = heading;
        }

        lastFixRef.current = next;
        lastFixAtRef.current = fix.timestamp;
        setUserLocation(next);
        setHeadingDeg(lastGoodHeadingRef.current);
        setMapHeadingDeg(mapHeadingRef.current);
        setMapError('');
        useLocationStore.getState().applyFix({
          lat: next.latitude,
          lng: next.longitude,
          bearing: lastGoodHeadingRef.current,
          accuracy,
          speedKmh: fix.speedKmh,
          timestamp: fix.timestamp,
          fromGps: fix.fromGps,
        });
        useLocationStore.getState().setMapHeadingDeg(mapHeadingRef.current);

        if (!fix.fromGps) return;

        if (!didCenterOnGpsRef.current) {
          didCenterOnGpsRef.current = true;
          setCenter(next);
          MapManager.getInstance().moveCamera(next.latitude, next.longitude, 17);
        }

        saveLastGps({
          latitude: next.latitude,
          longitude: next.longitude,
          accuracyM: accuracy,
          heading: lastGoodHeadingRef.current,
          savedAt: new Date().toISOString(),
        });

        if (!isFollowModeRef.current) return;
        const route = currentRouteRef.current;
        if (!route || route.points.length < 2) return;
        const routeLocations = routePointsToLocations(route.points);
        const distance = distanceToRouteMeters(next, routeLocations);
        applyOffRoute(distance, next, routeLocations);
      },
      onError: (err) => {
        if (cancelled) return;
        if (err.code === 1) {
          setLocationDenied(true);
          setMapError('위치 권한이 꺼져 있습니다. 아래 안내에서 위치를 허용해 주세요.');
          if (isFollowModeRef.current) setIsFollowMode(false);
          return;
        }
        if (err.code === 3) {
          setMapError('GPS가 느립니다. 하늘이 보이는 곳에서 잠시 기다려 주세요. 추적은 계속됩니다.');
          return;
        }
        setMapError('GPS를 찾지 못했습니다. 건물 밖, 하늘이 보이는 곳으로 이동해 주세요. 추적은 계속됩니다.');
      },
    });

    return () => {
      cancelled = true;
      gpsSignalRef.current = null;
      signal.stop();
      stopRepeatingSpeech();
      console.info('[노을-gps] watch stop');
    };
    // GPS는 따라가기와 무관하게 켜 둡니다. 이탈 판정만 isFollowModeRef를 봅니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batterySave]);

  useEffect(() => {
    gpsSignalRef.current?.setRoute(
      (currentRoute?.points ?? []).map((point) => ({
        lat: point.latitude,
        lng: point.longitude,
      }))
    );
  }, [currentRoute]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('shared') !== 'gpx') return;
    let cancelled = false;
    void (async () => {
      try {
        const cache = await caches.open('noeul-share-target');
        const res = await cache.match('/__shared_file__');
        if (!res || cancelled) return;
        const blob = await res.blob();
        const rawName = res.headers.get('X-Filename');
        const name = rawName ? decodeURIComponent(rawName) : 'shared.gpx';
        await cache.delete('/__shared_file__');
        const file = new File([blob], name, { type: blob.type || 'application/gpx+xml' });
        await applyImportedTrailFileRef.current(file);
        window.history.replaceState({}, '', '/');
      } catch (error) {
        console.error('[노을-gpx] share target failed', error);
        setMapError('공유된 GPX 파일을 열지 못했습니다. 앱에서 루트 가져오기를 사용해 주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const store = useLocationStore.getState();
    store.setFollowMode(isFollowMode);
    store.setHeadingUp(isFollowMode && headingUpMode);
    store.setMapHeadingDeg(mapHeadingDeg);
    store.setRecenterId(recenterRequestId);
  }, [isFollowMode, headingUpMode, mapHeadingDeg, recenterRequestId]);

  /* eslint-disable react-hooks/set-state-in-effect -- 선택한 장소 설명을 불러옵니다 */
  useEffect(() => {
    if (!selectedPlaceId) {
      setPlaceDetails(null);
      setDetailsError('');
      setIsDetailsLoading(false);
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsDetailsLoading(false);
      setPlaceDetails(null);
      setDetailsError('인터넷이 없어 장소 설명을 불러올 수 없습니다. 저장된 루트와 GPS 따라가기는 그대로 쓸 수 있습니다.');
      return;
    }

    let cancelled = false;
    setIsDetailsLoading(true);
    setDetailsError('');
    setPlaceDetails(null);

    fetch(`/api/places/details?id=${encodeURIComponent(selectedPlaceId)}`)
      .then(async (res) => {
        const data: PlaceDetails & { error?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '상세 정보를 불러올 수 없습니다.');
        }
        return data;
      })
      .then((data) => {
        if (!cancelled) setPlaceDetails(data);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '상세 정보를 불러올 수 없습니다.';
        if (!cancelled) setDetailsError(message);
      })
      .finally(() => {
        if (!cancelled) setIsDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPlaceId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleTogglePlaceList = () => {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    setPlaceListToggledByUser(true);
    setIsPlaceListCollapsed((prev) => !prev);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: keyword.trim() }),
      });

      const data: PlacesSearchResponse & { error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '장소를 검색할 수 없습니다.');
      }

      setPlaces(data.places);
      setCenter(data.center);
      setCurrentQuery(data.query);
      setSelectedPlaceId(null);
      setHideManualExtras(false);
      setSelectedSavedMapId(null);
      setLoadedMapId(null);
      setMapMemo('');
      setMapChecklist([]);
      setIsMapMemoOpen(false);
      setCurrentRoute(null);
      setIsFollowMode(false);
      if (window.matchMedia('(max-width: 767px)').matches) {
        setIsPlaceListCollapsed(false);
        setPlaceListToggledByUser(true);
        shouldScrollToPlaceList.current = true;
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '검색 도중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = addKeyword.trim();
    if (!query) return;

    setIsAdding(true);
    setAddErrorMsg('');
    setAddSuccessMsg('');

    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data: PlacesSearchResponse & { error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '장소를 추가할 수 없습니다.');
      }

      const found = data.places[0];
      if (!found) {
        throw new Error('일치하는 장소를 찾지 못했습니다.');
      }

      const alreadyOnThisMap = displayedPlaces.some((place) => place.id === found.id);
      if (loadedMapId && alreadyOnThisMap) {
        throw new Error('이미 이 여행지도에 있는 장소입니다.');
      }

      const alreadySaved = !loadedMapId && manualPlaces.some((place) => place.id === found.id);
      if (alreadySaved) {
        throw new Error('이미 모아 둔 장소입니다.');
      }

      const manualPlace: PlaceItem = { ...found, addedManually: true };
      setPlaces((prev) => (prev.some((place) => place.id === found.id) ? prev : [...prev, manualPlace]));
      setManualPlaces((prev) => [...prev, manualPlace]);
      setSelectedPlaceId(manualPlace.id);
      setAddKeyword('');
      setAddSuccessMsg(`'${manualPlace.name}'을(를) 내 장소에 저장했습니다.`);
    } catch (err: unknown) {
      setAddErrorMsg(err instanceof Error ? err.message : '장소 추가 도중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const persistLoadedMapPlaces = (nextPlaces: PlaceItem[]) => {
    if (!loadedMapId) return;
    try {
      const updated = updateTravelMap(loadedMapId, {
        title: mapTitle.trim() || '여행지도',
        places: nextPlaces.map((place) => ({ ...place })),
        sourceQuery: currentQuery || undefined,
        memo: mapMemo,
        checklist: mapChecklist,
        route: currentRoute,
      });
      if (updated) {
        setTravelMaps(updated);
      }
    } catch (error) {
      if (isQuotaExceeded(error)) {
        setMapError('사진 용량이 커서 여행지도에 저장하지 못했습니다. 사진을 줄여 주세요.');
      }
    }
  };

  const handleMovePlace = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= displayedPlaces.length) return;

    const nextPlaces = [...displayedPlaces];
    const [moved] = nextPlaces.splice(index, 1);
    nextPlaces.splice(target, 0, moved);

    setPlaces(nextPlaces);
    persistLoadedMapPlaces(nextPlaces);
  };

  const handleTogglePlaceMemo = (placeId: string) => {
    setMemoOpenPlaceId((current) => (current === placeId ? null : placeId));
  };

  const handleChangePlaceMemo = (placeId: string, memo: string) => {
    const nextPlaces = displayedPlaces.map((place) =>
      place.id === placeId ? { ...place, memo } : place
    );
    setPlaces(nextPlaces);
    setManualPlaces((prev) =>
      prev.map((place) => (place.id === placeId ? { ...place, memo } : place))
    );
    persistLoadedMapPlaces(nextPlaces);
  };

  const handleOpenPlacePhotos = (placeId: string) => {
    photoTargetPlaceId.current = placeId;
    photoInputRef.current?.click();
  };

  const handlePlacePhotosSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const placeId = photoTargetPlaceId.current;
    e.target.value = '';
    if (!files?.length || !placeId) return;

    setPhotoBusyPlaceId(placeId);
    setMapError('');
    try {
      const added = await filesToPlacePhotos(files);
      if (added.length === 0) {
        setMapError('선택한 사진을 읽지 못했습니다. 다른 사진을 골라 주세요.');
        return;
      }

      const current = displayedPlaces.find((place) => place.id === placeId);
      const existing = current?.photos ?? [];
      const nextPhotos = [...existing, ...added].slice(0, MAX_PHOTOS_PER_PLACE);
      if (existing.length + added.length > MAX_PHOTOS_PER_PLACE) {
        setMapNotice(`장소당 사진은 최대 ${MAX_PHOTOS_PER_PLACE}장까지 저장됩니다.`);
      }

      const nextPlaces = displayedPlaces.map((place) =>
        place.id === placeId ? { ...place, photos: nextPhotos } : place
      );
      const analyzed = await analyzePlacePhotos(nextPlaces);
      setPlaces(analyzed);
      setManualPlaces((prev) =>
        prev.map((place) => {
          const updated = analyzed.find((item) => item.id === place.id);
          return updated ? { ...place, photos: updated.photos } : place;
        })
      );
      persistLoadedMapPlaces(analyzed);
    } finally {
      setPhotoBusyPlaceId(null);
    }
  };

  const handleDeletePlacePhoto = (placeId: string, photoId: string) => {
    const nextPlaces = displayedPlaces.map((place) =>
      place.id === placeId
        ? { ...place, photos: (place.photos ?? []).filter((photo) => photo.id !== photoId) }
        : place
    );
    setPlaces(nextPlaces);
    setManualPlaces((prev) =>
      prev.map((place) =>
        place.id === placeId
          ? { ...place, photos: (place.photos ?? []).filter((photo) => photo.id !== photoId) }
          : place
      )
    );
    persistLoadedMapPlaces(nextPlaces);
  };

  const handleDeletePlace = (placeId: string) => {
    setPlaces((prev) => prev.filter((place) => place.id !== placeId));
    setManualPlaces((prev) => prev.filter((place) => place.id !== placeId));
    setSelectedPlaceId((current) => (current === placeId ? null : current));
    setMemoOpenPlaceId((current) => (current === placeId ? null : current));

    if (loadedMapId) {
      const updated = removePlaceFromTravelMap(loadedMapId, placeId);
      if (updated) {
        setTravelMaps(updated);
        setMapNotice('선택한 장소를 여행지도에서 삭제했습니다.');
        setMapError('');
      }
    }
  };

  const handleDownloadKml = () => {
    if (displayedPlaces.length === 0) return;
    const title = `[${currentQuery}] 여행지도`;
    const kmlContent = generateKML(title, displayedPlaces);
    downloadKmlFile(`${currentQuery}_여행지도_V0.1.kml`, kmlContent);
  };

  const handleImportRouteClick = () => {
    routeFileInputRef.current?.click();
  };

  const applyImportedTrailFile = async (file: File) => {
    setMapError('');
    setMapNotice('');
    try {
      const parsed = await parseTrailFile(file);
      if (parsed.route.points.length < 2) {
        setMapError('파일에서 걸을 수 있는 경로를 찾지 못했습니다.');
        return;
      }
      const targetMapId = routeImportTargetMapIdRef.current ?? loadedMapId;
      routeImportTargetMapIdRef.current = null;
      const savedMap =
        targetMapId
          ? travelMaps.find((map) => map.id === targetMapId)
            ?? loadTravelMaps().find((map) => map.id === targetMapId)
          : undefined;

      setCurrentRoute(parsed.route);
      setHideManualExtras(true);
      setSelectedPlaceId(null);
      setIsFollowMode(false);
      useLocationStore.getState().setFollowMode(false);

      if (savedMap) {
        const keptPlaces = savedMap.places.map((place) => ({ ...place }));
        setPlaces(keptPlaces);
        setLoadedMapId(savedMap.id);
        setSelectedSavedMapId(savedMap.id);
        setMapTitle(savedMap.title);
        setMapMemo(savedMap.memo ?? '');
        setMapChecklist(withPresetChecklistTexts(savedMap.checklist ?? []));
        setCurrentQuery(savedMap.sourceQuery || savedMap.title);
        const first = keptPlaces[0]?.location ?? parsed.route.points[0];
        if (first) setCenter(first);
        setMapNotice(
          `'${savedMap.title}' 여행지도에 새 루트를 넣었습니다. 장소와 메모는 그대로입니다.`
        );
        const updated = updateTravelMap(savedMap.id, {
          title: savedMap.title,
          places: keptPlaces,
          sourceQuery: savedMap.sourceQuery,
          memo: savedMap.memo,
          checklist: savedMap.checklist,
          route: parsed.route,
        });
        if (updated) setTravelMaps(updated);
      } else {
        setPlaces(parsed.places);
        setCurrentQuery(parsed.route.name);
        if (!mapTitle.trim()) {
          setMapTitle(parsed.route.name);
        }
        const first = parsed.places[0]?.location ?? parsed.route.points[0];
        if (first) setCenter(first);
        setMapNotice(`'${parsed.route.name}' 루트를 지도에 표시했습니다. 여행지도 저장으로 함께 보관하세요.`);
      }
      window.setTimeout(() => MapManager.getInstance().fitRouteBounds(), 0);
    } catch (err: unknown) {
      console.error('[노을-gpx] import failed', file.name, err);
      const message = err instanceof Error ? err.message : '루트 파일을 읽지 못했습니다.';
      setMapError(message);
    }
  };
  useEffect(() => {
    applyImportedTrailFileRef.current = applyImportedTrailFile;
  });

  const handleImportRouteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await applyImportedTrailFile(file);
  };

  const handleToggleFollowRoute = () => {
    setMapError('');
    setMapNotice('');
    if (isFollowMode) {
      setIsFollowMode(false);
      useLocationStore.getState().setFollowMode(false);
      useLocationStore.getState().setCameraDebug(null);
      setMapNotice('루트 따라가기를 종료했습니다.');
      return;
    }
    if (!currentRoute || currentRoute.points.length < 2) {
      setMapError('따라갈 루트가 없습니다. 먼저 GPX/KML을 가져오거나, 저장된 여행지도에서 루트 있음을 불러오세요.');
      return;
    }
    if (!navigator.geolocation) {
      setMapError('이 기기에서는 위치를 쓸 수 없습니다. 위치 기능이 있는 휴대폰으로 열어 주세요.');
      return;
    }
    unlockAlertAudio();
    void LocationSignalManager.requestSensorPermissions();
    const last = loadLastGps();
    if (last) {
      const loc = { latitude: last.latitude, longitude: last.longitude };
      lastFixRef.current = loc;
      lastFixAtRef.current = Date.now();
      setUserLocation(loc);
      setGpsAccuracyM(last.accuracyM);
      useLocationStore.getState().applyFix({
        lat: loc.latitude,
        lng: loc.longitude,
        bearing: lastGoodHeadingRef.current,
        accuracy: last.accuracyM,
        speedKmh: null,
        timestamp: Date.now(),
        fromGps: true,
      });
    }
    mapRotatingRef.current = false;
    setHeadingUpMode(true);
    saveUserSettings({ headingUp: true });
    warmSpeechVoices();
    setIsFollowMode(true);
    setRecenterRequestId((id) => id + 1);
    setIsPlaceListCollapsed(true);
    const seconds = batterySave ? 10 : 1;
    setMapNotice(
      navigator.onLine
        ? `현재 위치를 약 ${seconds}초마다 갱신합니다. 지도가 내 위치를 따라갑니다.`
        : `인터넷이 없어도 GPS로 따라갈 수 있습니다. ${seconds}초마다 위치를 확인합니다.`
    );
  };

  const handleToggleBatterySave = () => {
    setBatterySave((current) => {
      const next = !current;
      saveBatterySave(next);
      setMapNotice(next ? '배터리 절약: 10초마다 위치를 확인합니다.' : '일반 모드: 약 1초마다 위치를 확인합니다.');
      return next;
    });
  };

  const handleToggleHighContrast = () => {
    setHighContrast((current) => {
      const next = !current;
      window.localStorage.setItem('noeul.highContrast.v1', next ? '1' : '0');
      document.documentElement.classList.toggle('high-contrast', next);
      return next;
    });
  };

  const handleOpenSos = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => console.log('Fullscreen exit error:', err));
    }
    setSosNotice('');
    setSosStep(1);
  };

  const handleSosFirstYes = () => {
    setSosStep(2);
  };

  const handleSosSecondYes = () => {
    setSosStep(0);
    setIsSosShareOpen(true);
  };

  const handleSmsSos = () => {
    const { text } = formatSosMessage(sosLocation, gpsAccuracyM);
    if (!guardianPhone.trim()) {
      setSosNotice('보호자 번호를 먼저 저장해 주세요.');
      return;
    }
    openSmsShare(text, guardianPhone);
  };

  const handleCall119 = () => {
    openPhoneCall('119');
  };

  const handleCallGuardian = () => {
    if (!guardianPhone.trim()) {
      setSosNotice('보호자 번호를 먼저 저장해 주세요.');
      return;
    }
    openPhoneCall(guardianPhone.replace(/[^\d+]/g, ''));
  };

  const handleSaveGuardian = () => {
    saveGuardianPhone(guardianPhone);
    setSosNotice('보호자 번호를 저장했습니다.');
  };

  const handleLocateMe = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => console.log('Fullscreen exit error:', err));
    }
    setMapError('');
    setLocateToast('');
    if (!navigator.geolocation) {
      setMapError('이 기기에서는 위치를 쓸 수 없습니다. 위치 기능이 있는 휴대폰으로 열어 주세요.');
      return;
    }

    const known = lastFixRef.current ?? userLocation;
    if (known) {
      setCenter(known);
      MapManager.getInstance().moveCamera(known.latitude, known.longitude, 17);
      setRecenterRequestId((id) => id + 1);
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: PlaceLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        let heading: number | null =
          pos.coords.heading != null && Number.isFinite(pos.coords.heading) ? pos.coords.heading : headingDeg;
        if ((heading == null || !Number.isFinite(heading)) && lastFixRef.current) {
          const moved = Math.hypot(
            next.latitude - lastFixRef.current.latitude,
            next.longitude - lastFixRef.current.longitude
          );
          if (moved > 0.00001) {
            heading = bearingDegrees(lastFixRef.current, next);
          }
        }
        lastFixRef.current = next;
        setUserLocation(next);
        setCenter(next);
        setLocationDenied(false);
        setHeadingDeg(heading);
        setGpsAccuracyM(Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null);
        saveLastGps({
          latitude: next.latitude,
          longitude: next.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          heading,
          savedAt: new Date().toISOString(),
        });
        useLocationStore.getState().applyFix({
          lat: next.latitude,
          lng: next.longitude,
          bearing: heading,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          speedKmh: null,
          timestamp: pos.timestamp,
          fromGps: true,
        });
        MapManager.getInstance().moveCamera(next.latitude, next.longitude, 17);
        setRecenterRequestId((id) => id + 1);
        vibrateOnce();
        setLocateToast('현재 위치로 이동했습니다.');
        setIsLocating(false);
        window.setTimeout(() => setLocateToast(''), 2500);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationDenied(true);
          setMapError('위치 권한이 꺼져 있습니다. 설정에서 위치를 허용한 뒤 다시 눌러 주세요.');
          return;
        }
        setMapError('현재 위치를 찾지 못했습니다. 하늘이 보이는 곳에서 다시 눌러 주세요.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000,
      }
    );
  };

  const handleKakaoSos = async () => {
    const { text, mapsUrl } = formatSosMessage(sosLocation, gpsAccuracyM);
    try {
      await navigator.clipboard.writeText(text);
      setSosNotice('SOS 글을 복사했습니다. 카카오톡이 열리면 붙여 보내 주세요.');
    } catch {
      setSosNotice('카카오톡이 열리면 SOS 글을 붙여 보내 주세요.');
    }
    openKakaoShare(text, mapsUrl);
  };

  const handleShareSos = async () => {
    const { text, mapsUrl } = formatSosMessage(sosLocation, gpsAccuracyM);
    const result = await shareOrCopy(text, mapsUrl);
    if (result === 'shared') {
      setSosNotice('공유 창을 열었습니다.');
      return;
    }
    if (result === 'copied') {
      setSosNotice('SOS 글을 복사했습니다. 카카오톡이나 문자에 붙여 보내 주세요.');
      return;
    }
    setSosNotice('공유에 실패했습니다. 문자 또는 카카오톡 버튼을 눌러 주세요.');
  };

  const handleSaveTravelMap = (e: React.FormEvent) => {
    e.preventDefault();
    const title = mapTitle.trim();
    setMapError('');
    setMapNotice('');

    if (!title) {
      setMapError('여행지도 이름을 입력해주세요.');
      return;
    }
    if (displayedPlaces.length === 0 && (!currentRoute || currentRoute.points.length < 2)) {
      setMapError('저장할 장소나 루트가 없습니다. 먼저 장소를 모으거나 루트를 가져오세요.');
      return;
    }

    const snapshotPlaces = displayedPlaces.map((place) => ({ ...place }));

    try {
    if (loadedMapId) {
      const updated = updateTravelMap(loadedMapId, {
        title,
        places: snapshotPlaces,
        sourceQuery: currentQuery || undefined,
        memo: mapMemo,
        checklist: mapChecklist,
        route: currentRoute,
      });

      if (!updated) {
        setLoadedMapId(null);
        setMapError('불러온 여행지도를 찾을 수 없어 새로 저장하지 못했습니다. 다시 불러오거나 새로 저장해주세요.');
        return;
      }

      setTravelMaps(updated);
      setMapNotice(`'${title}' 여행지도를 수정 저장했습니다.`);
      return;
    }

    const now = new Date().toISOString();
    const nextMap: TravelMap = {
      id: createTravelMapId(),
      title,
      createdAt: now,
      updatedAt: now,
      places: snapshotPlaces,
      sourceQuery: currentQuery || undefined,
      memo: mapMemo,
      checklist: mapChecklist,
      route: currentRoute ?? undefined,
    };

    setTravelMaps(saveTravelMap(nextMap));
    setSelectedSavedMapId(nextMap.id);
    setMapTitle('');
    setMapNotice(`'${title}' 여행지도를 저장했습니다.`);
    } catch (error) {
      if (isQuotaExceeded(error)) {
        setMapError('사진 용량이 커서 여행지도를 저장하지 못했습니다. 사진을 줄여 주세요.');
        return;
      }
      setMapError('여행지도를 저장하지 못했습니다.');
    }
  };

  const handleLoadTravelMap = (map: TravelMap) => {
    const snapshot = map.places.map((place) => ({ ...place }));
    setPlaces(snapshot);
    setHideManualExtras(true);
    setSelectedSavedMapId(map.id);
    setLoadedMapId(map.id);
    setMapTitle(map.title);
    setMapMemo(map.memo ?? '');
    setMapChecklist(withPresetChecklistTexts(map.checklist ?? []));
    setCurrentRoute(map.route ?? null);
    setIsFollowMode(false);
    setSelectedPlaceId(null);
    setCurrentQuery(map.sourceQuery || map.title);
    if (snapshot[0]) {
      setCenter(snapshot[0].location);
    } else if (map.route?.points[0]) {
      setCenter(map.route.points[0]);
    }
    setMapError('');
    const routeReady = (map.route?.points.length ?? 0) >= 2;
    setMapNotice(
      routeReady
        ? `'${map.title}' 여행지도와 루트를 불러왔습니다.`
        : `'${map.title}' 여행지도를 불러왔습니다.`
    );
    if (routeReady) {
      window.setTimeout(() => MapManager.getInstance().fitRouteBounds(), 0);
    }
  };

  const handleBackupTravelMaps = () => {
    const json = exportTravelMapBackupJson();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const filename = `noeul-backup-${year}-${month}-${day}.json`;

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setMapError('');
    setMapNotice('여행지도를 보관 파일로 저장했습니다.');
  };

  const handleRestoreTravelMapsClick = () => {
    backupFileInputRef.current?.click();
  };

  const handleRestoreTravelMapsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const confirmed = window.confirm('현재 저장된 여행지도를 덮어쓸까요?');
    if (!confirmed) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const parsed: unknown = JSON.parse(text);
        const restored = restoreTravelMapsFromBackup(parsed);

        if (!restored) {
          setMapNotice('');
          setMapError('올바른 보관 파일이 아닙니다.');
          return;
        }

        setTravelMaps(restored);
        const keepLoadedId = loadedMapId && restored.some((map) => map.id === loadedMapId)
          ? loadedMapId
          : null;
        setSelectedSavedMapId((current) =>
          current && restored.some((map) => map.id === current) ? current : null
        );
        setLoadedMapId(keepLoadedId);
        setMapMemo(
          keepLoadedId
            ? restored.find((map) => map.id === keepLoadedId)?.memo ?? ''
            : ''
        );
        setMapChecklist(
          keepLoadedId
            ? withPresetChecklistTexts(
                restored.find((map) => map.id === keepLoadedId)?.checklist ?? []
              )
            : []
        );
        if (keepLoadedId) {
          setCurrentRoute(restored.find((map) => map.id === keepLoadedId)?.route ?? null);
        }
        setMapError('');
        setMapNotice(`여행지도 ${restored.length}개를 가져왔습니다.`);
        window.alert('여행지도를 가져왔습니다.');
      } catch {
        setMapNotice('');
        setMapError('올바른 보관 파일이 아닙니다.');
      }
    };
    reader.onerror = () => {
      setMapNotice('');
      setMapError('올바른 보관 파일이 아닙니다.');
    };
    reader.readAsText(file);
  };

  const handleDeleteTravelMap = (map: TravelMap) => {
    const confirmed = window.confirm(`'${map.title}' 여행지도를 삭제할까요?`);
    if (!confirmed) return;

    const remaining = deleteTravelMap(map.id);
    setTravelMaps(remaining);
    setSelectedSavedMapId((current) => (current === map.id ? null : current));
    setLoadedMapId((current) => (current === map.id ? null : current));
    if (loadedMapId === map.id) {
      setMapMemo('');
      setMapChecklist([]);
      setIsMapMemoOpen(false);
    }
    setMapError('');
    setMapNotice(`'${map.title}' 여행지도를 삭제했습니다. 지금 화면의 장소는 그대로입니다.`);
  };

  const handleDeleteTravelMapRoute = (map: TravelMap) => {
    if (!map.route) return;
    const confirmed = window.confirm(
      `'${map.title}'의 루트만 삭제할까요? 장소와 메모는 그대로입니다.`
    );
    if (!confirmed) return;

    const updated = clearTravelMapRoute(map.id);
    if (!updated) return;

    setTravelMaps(updated);
    if (loadedMapId === map.id) {
      setCurrentRoute(null);
      setIsFollowMode(false);
      useLocationStore.getState().setFollowMode(false);
      useLocationStore.getState().setCameraDebug(null);
    }
    setMapError('');
    setMapNotice(`'${map.title}'의 루트를 삭제했습니다. 장소와 메모는 그대로입니다.`);
  };

  const handleImportRouteForMap = (map: TravelMap) => {
    routeImportTargetMapIdRef.current = map.id;
    handleLoadTravelMap(map);
    handleImportRouteClick();
  };

  const persistMapNotes = (
    memo: string,
    checklist: TravelMapChecklistItem[]
  ) => {
    if (!loadedMapId) return;
    const updated = updateTravelMapNotes(loadedMapId, { memo, checklist });
    if (updated) setTravelMaps(updated);
  };

  const handleAddChecklistPreset = (presetId: string) => {
    const preset = TRAVEL_MAP_CHECKLIST_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setMapChecklist((current) => {
      if (current.some((item) => item.id === preset.id)) return current;
      return [...current, { id: preset.id, text: preset.text, completed: false }];
    });
  };

  const handleToggleChecklistItem = (itemId: string) => {
    setMapChecklist((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const handleDeleteChecklistItem = (itemId: string) => {
    setMapChecklist((current) => current.filter((item) => item.id !== itemId));
  };

  const handleSaveMapNotes = () => {
    persistMapNotes(mapMemo, mapChecklist);
    setIsMapMemoOpen(false);
    setMapError('');
    setMapNotice(
      loadedMapId
        ? '여행지도 메모와 체크리스트를 저장했습니다.'
        : '메모와 체크리스트를 반영했습니다. 여행지도 저장을 눌러 함께 보관하세요.'
    );
  };

  const handleGenerateBlog = async () => {
    if (displayedPlaces.length === 0) {
      setMapError('블로그를 만들 장소가 없습니다. 먼저 장소를 모으세요.');
      setMapNotice('');
      return;
    }

    setMapError('');
    setBlogCopyNotice('');
    setIsBlogGenerating(true);
    setIsBlogOpen(true);

    try {
      const analyzed = await analyzePlacePhotos(displayedPlaces);
      setPlaces(analyzed);
      setManualPlaces((prev) =>
        prev.map((place) => {
          const updated = analyzed.find((item) => item.id === place.id);
          return updated ? { ...place, photos: updated.photos } : place;
        })
      );
      persistLoadedMapPlaces(analyzed);

      const draft = generateTravelBlogEssay({
        title: mapTitle.trim() || currentQuery.trim() || '우리들의 여행',
        memo: mapMemo,
        checklist: mapChecklist,
        places: analyzed,
      });
      setBlogDraft(draft);
    } catch {
      setBlogDraft(
        generateTravelBlogEssay({
          title: mapTitle.trim() || currentQuery.trim() || '우리들의 여행',
          memo: mapMemo,
          checklist: mapChecklist,
          places: displayedPlaces,
        })
      );
    } finally {
      setIsBlogGenerating(false);
    }
  };

  const handleCopyBlog = async () => {
    if (!blogDraft) return;
    const text = `${blogDraft.title}\n\n${blogDraft.body}\n\n${blogDraft.hashtags.join(' ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setBlogCopyNotice('제목, 본문, SEO 태그를 복사했습니다.');
    } catch {
      setBlogCopyNotice('복사에 실패했습니다. 본문을 길게 눌러 복사해 주세요.');
    }
  };

  const handleDownloadBlogMarkdown = () => {
    if (!blogDraft) return;
    const safeTitle = (mapTitle.trim() || currentQuery.trim() || '여행에세이').replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([blogDraft.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}_블로그.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={`flex flex-col h-dvh bg-slate-50 ${isFollowMode ? 'hiking-mode' : ''}`}>
      <SimQueryRedirect />
      {(locationDenied || (!locationDialogDismissed && !userLocation)) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-permission-title"
          className="fixed inset-0 z-[96] flex items-end justify-center p-4 sm:items-center bg-black/55"
        >
          <div className="w-full max-w-md p-5 bg-white rounded-2xl shadow-xl">
            <p id="location-permission-title" className="text-2xl font-black text-slate-900">
              내 위치가 필요합니다
            </p>
            <p className="mt-3 text-lg font-bold leading-relaxed text-slate-800">
              {locationDenied
                ? '위치 권한이 꺼져 있습니다. 브라우저 또는 앱 설정에서 위치를 허용한 뒤 아래 버튼을 눌러 주세요.'
                : '지도를 현재 위치로 옮기려면 위치 권한을 허용해 주세요. (홈 화면에 설치한 앱에서도 동일합니다.)'}
            </p>
            <button
              type="button"
              onClick={handleLocateMe}
              className="w-full mt-5 text-xl font-black text-white rounded-xl min-h-14 bg-blue-700"
            >
              내 위치 허용하기
            </button>
            {!locationDenied && (
              <button
                type="button"
                onClick={() => setLocationDialogDismissed(true)}
                className="w-full mt-2 text-lg font-bold text-slate-700 rounded-xl min-h-12 bg-slate-100"
              >
                나중에
              </button>
            )}
          </div>
        </div>
      )}
      <header className="flex items-center justify-between gap-2 px-3 py-2 bg-white border-b shrink-0 md:px-6 md:py-3 border-slate-200">
        <div className="flex items-center min-w-0 gap-2">
          <span className="text-xl font-black text-amber-600">노을</span>
          <span className="hidden text-base font-semibold sm:inline text-slate-700">시니어 걷기 내비</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {batterySupported && batteryPercent != null && (
            <div
              className={`flex items-center px-2 text-sm font-black rounded-md min-h-10 ${
                batteryAlertBand === 'low5' || batteryAlertBand === 'low10'
                  ? 'text-white bg-red-600'
                  : batteryAlertBand === 'low20'
                    ? 'text-black bg-amber-300'
                    : 'text-slate-900 bg-slate-100'
              }`}
              title={batteryCharging ? '충전 중' : '배터리'}
            >
              {batteryCharging ? '🔌 ' : ''}배터리 {batteryPercent}%
            </div>
          )}
          {isFollowMode && gpsAccuracyM != null && (
            <div
              className="flex items-center px-2 text-sm font-black rounded-md min-h-10 text-slate-900 bg-slate-100"
              title="위치 정확도"
            >
              위치 ±{Math.round(gpsAccuracyM)}m
            </div>
          )}
          {!installed && (
            <button
              type="button"
              onClick={() => void installApp()}
              className="px-3 text-xl font-black text-white rounded-lg min-h-12 bg-slate-900"
            >
              📱 앱 설치
            </button>
          )}
          {displayedPlaces.length > 0 && (
            <button
              onClick={handleDownloadKml}
              className="flex items-center gap-1 px-3 py-2.5 text-base font-bold text-white transition-colors bg-blue-600 rounded-lg shadow min-h-12 hover:bg-blue-700"
            >
              <span className="md:hidden">KML</span>
              <span className="hidden md:inline">KML 다운로드</span>
            </button>
          )}
        </div>
      </header>
      {installHint && (
        <p className="px-3 py-2 text-base font-bold text-center text-slate-900 bg-amber-100">{installHint}</p>
      )}
      {batterySupported && batteryAlertBand === 'low20' && (
        <div role="status" className="px-3 py-3 text-xl font-black text-center text-black shrink-0 bg-amber-300">
          배터리 {batteryPercent}% · 충전해 주세요
        </div>
      )}
      {batterySupported && batteryAlertBand === 'low10' && (
        <div role="alert" className="px-3 py-3 text-xl font-black text-center text-white shrink-0 bg-red-600">
          배터리 {batteryPercent}% · 충전을 준비하세요
        </div>
      )}
      {!isOnline && (
        <div
          role="status"
          className="px-3 py-3 text-xl font-black text-center text-white shrink-0 bg-slate-900"
        >
          오프라인 모드로 동작 중
        </div>
      )}

      <div className="workspace">
          <form onSubmit={handleSearch} className="p-3 border-b shrink-0 workspace-search md:p-4 border-slate-100">
            <label className="block mb-1 text-xs font-semibold text-slate-500">여행지 / 지역명 검색</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 해운대, 여수, 강릉"
                className="place-field flex-1 min-w-0 px-3 py-2.5 text-base border rounded-lg outline-none md:text-base border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 text-sm font-medium text-white transition-colors rounded-lg shrink-0 min-h-12 min-w-16 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
              >
                {isLoading ? '검색 중...' : '생성'}
              </button>
            </div>
            {errorMsg && <p className="mt-2 text-xs text-red-500">{errorMsg}</p>}
          </form>

          <form onSubmit={handleAddPlace} className="p-3 border-b shrink-0 workspace-add md:p-4 border-slate-100">
            <label className="block mb-1 text-xs font-semibold text-slate-500">장소 직접 추가</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={addKeyword}
                onChange={(e) => setAddKeyword(e.target.value)}
                placeholder="예: 광안리해수욕장"
                className="place-field flex-1 min-w-0 px-3 py-2.5 text-base border rounded-lg outline-none md:text-base border-slate-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
              <button
                type="submit"
                disabled={isAdding}
                className="px-4 text-sm font-medium text-white transition-colors rounded-lg shrink-0 min-h-12 min-w-16 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300"
              >
                {isAdding ? '추가 중...' : '추가'}
              </button>
            </div>
            {addErrorMsg && <p className="mt-2 text-xs text-red-500">{addErrorMsg}</p>}
            {addSuccessMsg && <p className="mt-2 text-xs text-orange-600">{addSuccessMsg}</p>}
          </form>

          <div
            ref={placeListSectionRef}
            className={`workspace-places p-3 md:min-h-0 md:overflow-y-auto md:p-4 ${
              isPlaceListCollapsed ? 'max-md:flex-none' : ''
            }`}
          >
            <button
              type="button"
              onClick={handleTogglePlaceList}
              aria-expanded={!isPlaceListCollapsed}
              className="place-list-toggle flex items-center justify-between w-full gap-2 mb-3 text-left min-h-12 md:min-h-0 md:cursor-default"
            >
              <span className="flex items-center min-w-0 gap-2 text-sm font-bold text-slate-800">
                <span className="inline-block w-4 text-center md:hidden" aria-hidden>
                  {isPlaceListCollapsed ? '▶' : '▼'}
                </span>
                <span>
                  수집된 관광지 {displayedPlaces.length > 0 && `(${displayedPlaces.length})`}
                </span>
              </span>
              {currentQuery && (
                <span className="text-xs shrink-0 text-slate-500">&apos;{currentQuery}&apos; 기준</span>
              )}
            </button>

            <div className={isPlaceListCollapsed ? 'max-md:hidden' : undefined}>
            {displayedPlaces.length === 0 ? (
              <div className="py-6 text-center md:py-12 text-slate-400">
                <p className="text-sm">검색어를 입력하고 지도를 생성하세요.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedPlaces.map((place, idx) => (
                  <div
                    key={place.id}
                    onClick={() => setSelectedPlaceId(place.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      selectedPlaceId === place.id
                        ? place.addedManually
                          ? 'border-orange-500 bg-orange-50/50 shadow-sm'
                          : 'border-blue-500 bg-blue-50/50 shadow-sm'
                        : place.addedManually
                          ? 'border-orange-200 hover:border-orange-300 bg-orange-50/40'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          aria-label={`${place.name} 한 칸 위로`}
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMovePlace(idx, -1);
                          }}
                          className="flex items-center justify-center text-sm font-bold rounded w-9 h-9 md:w-7 md:h-7 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          aria-label={`${place.name} 한 칸 아래로`}
                          disabled={idx === displayedPlaces.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMovePlace(idx, 1);
                          }}
                          className="flex items-center justify-center text-sm font-bold rounded w-9 h-9 md:w-7 md:h-7 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          ▼
                        </button>
                      </div>
                      <h3
                        className={`flex-1 min-w-0 text-sm font-semibold ${
                          place.addedManually ? 'text-orange-600' : 'text-slate-900'
                        }`}
                      >
                        {idx + 1}. {place.name}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {place.rating && (
                          <span className="text-xs font-bold text-amber-500">★ {place.rating}</span>
                        )}
                        <button
                          type="button"
                          aria-label={`${place.name} 삭제`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePlace(place.id);
                          }}
                          className="flex items-center justify-center text-sm font-bold text-slate-500 rounded w-9 h-9 md:w-6 md:h-6 md:text-xs hover:bg-red-50 hover:text-red-600"
                        >
                          X
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">{place.address}</p>
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePlaceMemo(place.id)}
                          className={`px-3 text-sm font-semibold rounded-lg min-h-12 ${
                            place.memo?.trim()
                              ? 'text-amber-800 bg-amber-100 border border-amber-300'
                              : 'text-slate-600 bg-white border border-slate-300'
                          }`}
                        >
                          메모{place.memo?.trim() ? ' 있음' : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPlacePhotos(place.id)}
                          className={`px-3 text-sm font-semibold rounded-lg min-h-12 ${
                            (place.photos?.length ?? 0) > 0
                              ? 'text-amber-800 bg-amber-100 border border-amber-300'
                              : 'text-slate-600 bg-white border border-slate-300'
                          }`}
                        >
                          {photoBusyPlaceId === place.id
                            ? '사진 준비 중...'
                            : (place.photos?.length ?? 0) > 0
                              ? `📷 사진 ${place.photos?.length}장`
                              : '사진'}
                        </button>
                      </div>
                      {memoOpenPlaceId === place.id ? (
                        <textarea
                          value={place.memo ?? ''}
                          onChange={(e) => handleChangePlaceMemo(place.id, e.target.value)}
                          placeholder="방문 팁, 영업시간, 주차 등을 적어 두세요"
                          rows={3}
                          className="w-full px-3 py-2.5 mt-2 text-base bg-white border rounded-lg outline-none resize-y min-h-24 border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        />
                      ) : place.memo?.trim() ? (
                        <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600">{place.memo}</p>
                      ) : null}
                      {(place.photos?.length ?? 0) > 0 && (
                        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                          {place.photos?.map((photo) => (
                            <div key={photo.id} className="relative shrink-0">
                              {/* 첨부 사진은 data URL이라 next/image 최적화 대상이 아닙니다. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo.dataUrl}
                                alt={`${place.name} 첨부 사진`}
                                className="object-cover w-20 h-20 rounded-lg bg-slate-100"
                              />
                              <button
                                type="button"
                                onClick={() => handleDeletePlacePhoto(place.id, photo.id)}
                                className="absolute top-0.5 right-0.5 flex items-center justify-center text-sm font-bold text-white rounded-full w-8 h-8 bg-slate-900/70"
                                aria-label={`${place.name} 사진 삭제`}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          <div className="p-3 overflow-y-auto border-t workspace-saved md:p-4 border-slate-200 bg-slate-50/80">
            <div className="hiking-hide">
            <h2 className="mb-2 text-sm font-bold text-slate-800">내 여행지도</h2>
            <input
              ref={backupFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleRestoreTravelMapsFile}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePlacePhotosSelected}
            />
            <form onSubmit={handleSaveTravelMap} className="mb-3">
              <label className="block mb-1 text-xs font-semibold text-slate-500">여행지도 이름</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mapTitle}
                  onChange={(e) => setMapTitle(e.target.value)}
                  placeholder="예: 갈맷길 1-1"
                  className="place-field flex-1 min-w-0 px-3 py-2.5 text-base bg-white border rounded-lg outline-none md:text-base border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-medium leading-tight text-white transition-colors rounded-lg shrink-0 min-h-12 max-w-[7.5rem] md:max-w-none bg-slate-700 hover:bg-slate-800"
                >
                  {loadedMapId ? '여행지도 수정 저장' : '여행지도 저장'}
                </button>
              </div>
            </form>
            <button
              type="button"
              onClick={() => setIsMapMemoOpen(true)}
              className={`w-full mb-3 px-3 text-sm font-semibold rounded-lg min-h-12 ${
                mapMemo.trim() || mapChecklist.length > 0
                  ? 'text-amber-800 bg-amber-100 border border-amber-300'
                  : 'text-slate-700 bg-white border border-slate-300'
              }`}
            >
              여행지도 메모{mapMemo.trim() || mapChecklist.length > 0 ? ' 있음' : ''}
            </button>
            <button
              type="button"
              onClick={handleGenerateBlog}
              disabled={isBlogGenerating}
              className="w-full mb-3 px-3 text-sm font-semibold text-white rounded-lg min-h-12 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
            >
              {isBlogGenerating ? '사진 읽고 작성 중...' : '블로그 생성'}
            </button>
            <input
              ref={routeFileInputRef}
              type="file"
              accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
              className="hidden"
              onChange={handleImportRouteFile}
            />
            <button
              type="button"
              onClick={handleToggleBatterySave}
              aria-pressed={batterySave}
              className={`status-chip mb-2 px-2 py-1 text-xs font-bold rounded-md border ${
                batterySave
                  ? 'text-amber-950 bg-amber-100 border-amber-400'
                  : 'text-slate-600 bg-slate-100 border-slate-300'
              }`}
            >
              {batterySave ? '🔋 절전 ON' : '🔋 절전 OFF'}
            </button>
            <button
              type="button"
              onClick={handleToggleHighContrast}
              aria-pressed={highContrast}
              className="w-full mb-2 px-3 text-base font-bold text-white rounded-lg min-h-12 bg-black"
            >
              {highContrast ? '흑백 켜짐' : '흑백 모드'}
            </button>
            <label className="block mb-1 text-base font-bold text-slate-800">음성 안내 스타일</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(
                [
                  ['female', '👩 여성'],
                  ['male', '👨 남성'],
                  ['mute', '🔇 무음'],
                ] as const
              ).map(([style, label]) => (
                <button
                  key={style}
                  type="button"
                  aria-pressed={voiceStyle === style}
                  onClick={() => {
                    setVoiceStyle(style);
                    setActiveVoiceStyle(style);
                    saveUserSettings({ voiceStyle: style });
                    if (style !== 'mute') {
                      warmSpeechVoices();
                      speakKorean(VOICE_PREVIEW[style]);
                    } else {
                      stopRepeatingSpeech();
                    }
                  }}
                  className={`px-2 text-base font-black rounded-lg min-h-12 border-2 ${
                    voiceStyle === style
                      ? 'text-white bg-blue-800 border-blue-800'
                      : 'text-slate-900 bg-white border-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block mb-1 text-base font-bold text-slate-800">보호자 전화번호</label>
            <div className="flex gap-2 mb-3">
              <input
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="place-field flex-1 min-w-0 px-3 text-base bg-white border-2 rounded-lg outline-none border-slate-400"
              />
              <button
                type="button"
                onClick={handleSaveGuardian}
                className="px-3 text-base font-bold text-white rounded-lg min-h-12 bg-slate-800"
              >
                저장
              </button>
            </div>
            <div className="flex gap-2 mb-3 shrink-0">
              <button
                type="button"
                onClick={handleBackupTravelMaps}
                className="flex-1 px-3 text-sm font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg min-h-12 hover:bg-amber-200"
              >
                여행지도 보관하기
              </button>
              <button
                type="button"
                onClick={handleRestoreTravelMapsClick}
                className="flex-1 px-3 text-sm font-semibold text-white rounded-lg min-h-12 bg-slate-700 hover:bg-slate-800"
              >
                여행지도 가져오기
              </button>
            </div>
            {mapError && <p className="mb-2 text-sm font-semibold text-red-600">{mapError}</p>}
            {mapNotice && <p className="mb-2 text-sm font-semibold text-slate-700">{mapNotice}</p>}
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                onClick={handleImportRouteClick}
                className="flex-1 min-w-0 px-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-400 rounded-md min-h-10 hover:bg-slate-50"
              >
                📁 루트 가져오기
              </button>
              <button
                type="button"
                onClick={handleToggleFollowRoute}
                className={`flex-1 min-w-0 px-1.5 text-xs font-bold rounded-md min-h-10 ${
                  isFollowMode
                    ? 'text-white bg-blue-800 hover:bg-blue-900'
                    : 'text-white bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isFollowMode ? '🚶 따라가기 종료' : '🚶 루트 따라가기'}
              </button>
            </div>

            {travelMaps.length === 0 ? (
              <p className="text-xs text-slate-400">저장된 여행지도가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {travelMaps.map((map) => (
                  <div
                    key={map.id}
                    onClick={() => handleLoadTravelMap(map)}
                    className={`p-2.5 rounded-lg border cursor-pointer ${
                      selectedSavedMapId === map.id
                        ? 'border-slate-700 bg-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{map.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      생성일 {formatMapDate(map.createdAt)}
                      {map.places.length > 0 ? ` · 장소 ${map.places.length}개` : ''}
                      {map.route ? ' · 루트 있음' : ' · 루트 없음'}
                    </p>
                    {map.route ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTravelMapRoute(map);
                        }}
                        className="w-full mt-1 px-3 text-sm font-medium text-slate-800 bg-white border border-slate-400 rounded-lg min-h-10 hover:bg-slate-50"
                      >
                        루트 삭제
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImportRouteForMap(map);
                        }}
                        className="w-full mt-1 px-3 text-sm font-medium text-slate-900 bg-white border border-slate-400 rounded-lg min-h-10 hover:bg-slate-50"
                      >
                        📁 루트 가져오기
                      </button>
                    )}
                    <div className="flex gap-1 mt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSavedMapId(map.id);
                          handleLoadTravelMap(map);
                        }}
                        className="flex-1 px-3 text-sm font-medium text-white rounded-lg min-h-10 bg-blue-600 hover:bg-blue-700"
                      >
                        불러오기{map.route ? ' (루트)' : ''}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSavedMapId(map.id);
                          handleDeleteTravelMap(map);
                        }}
                        className="flex-1 px-3 text-sm font-medium text-red-600 border border-red-200 rounded-lg min-h-10 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
            {isFollowMode && (
              <button
                type="button"
                onClick={handleToggleFollowRoute}
                className="w-full mt-1 px-2 text-sm font-bold text-white rounded-md min-h-10 bg-blue-800"
              >
                🚶 따라가기 종료
              </button>
            )}
          </div>

        <div className="relative isolate w-full min-h-0 overflow-hidden workspace-map map-pane">
          <MapDomView
            center={center}
            places={displayedPlaces}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
            routePoints={routePoints}
            userLocation={userLocation}
            returnPoint={offRouteLevel >= 20 ? returnPoint : null}
            onLocateMe={handleLocateMe}
            onOpenSos={handleOpenSos}
            locateBusy={isLocating}
            weakGps={Boolean(
              userLocation && gpsAccuracyM != null && gpsAccuracyM >= WEAK_GPS_ACCURACY_M
            )}
          />
          {isFollowMode && (
            <div className="absolute z-20 flex flex-col items-end gap-1.5 top-2 right-12 pointer-events-none">
              <button
                type="button"
                onClick={() => {
                  setHeadingUpMode(false);
                  saveUserSettings({ headingUp: false });
                }}
                aria-pressed={!headingUpMode}
                className={`pointer-events-auto px-2 text-xs font-black rounded-md border ${
                  !headingUpMode
                    ? 'text-white bg-slate-900/80 border-slate-900/80'
                    : 'text-slate-900 bg-white/75 border-slate-400/80'
                }`}
                style={{ minHeight: 36, minWidth: 72 }}
              >
                🧭 북쪽
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeadingUpMode(true);
                  saveUserSettings({ headingUp: true });
                }}
                aria-pressed={headingUpMode}
                className={`pointer-events-auto px-2 text-xs font-black rounded-md border ${
                  headingUpMode
                    ? 'text-white bg-blue-800/80 border-blue-800/80'
                    : 'text-slate-900 bg-white/75 border-slate-400/80'
                }`}
                style={{ minHeight: 36, minWidth: 72 }}
              >
                🚶 따라가기
              </button>
            </div>
          )}
          {!isOnline && isFollowMode && (
            <p className="absolute z-10 px-3 py-2 text-sm font-bold text-white rounded-lg shadow bottom-3 left-3 right-24 bg-slate-800/90">
              지도 사진은 인터넷이 필요합니다. GPS 추적은 계속됩니다.
            </p>
          )}
        </div>
      </div>
      {offRouteToast && (
        <div className="fixed left-3 right-3 z-[70] pointer-events-none" style={{ top: '4.75rem' }}>
          <div role="alert" className="px-3 py-2 text-base font-black leading-snug text-white whitespace-pre-line bg-red-700 rounded-lg shadow">
            {offRouteToast}
          </div>
        </div>
      )}
      {batterySupported && batteryAlertBand === 'low5' && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center p-6 bg-red-800" role="alert">
          <div className="text-center text-white">
            <p className="text-4xl font-black leading-tight">배터리 {batteryPercent}%</p>
            <p className="mt-6 text-3xl font-bold leading-snug">지금 충전하십시오</p>
          </div>
        </div>
      )}
      {(locateToast || returnToast) && (
        <div
          role="status"
          className="fixed z-[92] left-1/2 -translate-x-1/2 px-3 py-2 text-sm font-bold text-white bg-slate-800/95 rounded-lg shadow"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {returnToast || locateToast}
        </div>
      )}
      {sosStep === 1 && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button type="button" aria-label="SOS 취소" onClick={() => setSosStep(0)} className="absolute inset-0 bg-slate-900/50" />
          <div className="relative z-10 w-full max-w-sm p-6 bg-white border-4 border-red-600 rounded-2xl shadow-lg">
            <p className="text-2xl font-black text-center text-red-700">긴급 구조 요청을 보내시겠습니까?</p>
            <p className="mt-3 text-base font-semibold text-center text-slate-700">1차 확인입니다. 실수면 취소를 누르세요.</p>
            <div className="flex flex-col gap-3 mt-5">
              <button type="button" onClick={handleSosFirstYes} className="w-full text-xl font-black text-white rounded-lg min-h-14 bg-red-600">
                다음
              </button>
              <button type="button" onClick={() => setSosStep(0)} className="w-full text-xl font-bold text-slate-800 bg-white border-2 border-slate-400 rounded-lg min-h-14">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {sosStep === 2 && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button type="button" aria-label="SOS 취소" onClick={() => setSosStep(0)} className="absolute inset-0 bg-slate-900/50" />
          <div className="relative z-10 w-full max-w-sm p-6 bg-white border-4 border-red-700 rounded-2xl shadow-lg">
            <p className="text-2xl font-black text-center text-red-800">한 번 더 확인합니다.</p>
            <p className="mt-3 text-xl font-bold text-center text-slate-900">119와 보호자에게 알릴까요?</p>
            <div className="flex flex-col gap-3 mt-5">
              <button type="button" onClick={handleSosSecondYes} className="w-full text-xl font-black text-white rounded-lg min-h-14 bg-red-700">
                예, 알리기
              </button>
              <button type="button" onClick={() => setSosStep(0)} className="w-full text-xl font-bold text-slate-800 bg-white border-2 border-slate-400 rounded-lg min-h-14">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {isSosShareOpen && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center md:items-center md:p-6">
          <button type="button" aria-label="SOS 닫기" onClick={() => setIsSosShareOpen(false)} className="absolute inset-0 bg-slate-900/50" />
          <div className="relative z-10 w-full max-w-sm p-5 bg-white rounded-t-2xl md:rounded-2xl shadow-lg">
            <h2 className="text-xl font-black text-slate-900">SOS 비상벨</h2>
            <p className="mt-2 text-base font-semibold whitespace-pre-wrap text-slate-800">
              {formatSosMessage(sosLocation, gpsAccuracyM).text}
            </p>
            {sosNotice && <p className="mt-2 text-base font-bold text-amber-800">{sosNotice}</p>}
            <div className="flex flex-col gap-3 mt-4">
              <button type="button" onClick={handleCall119} className="w-full text-xl font-black text-white rounded-lg min-h-14 bg-red-600">
                1. 119 전화
              </button>
              <button type="button" onClick={handleCallGuardian} className="w-full text-xl font-black text-white rounded-lg min-h-14 bg-orange-600">
                2. 보호자 연락
              </button>
              <button type="button" onClick={handleSmsSos} className="w-full text-xl font-black text-white rounded-lg min-h-14 bg-slate-800">
                3. 현재 위치 전송
              </button>
              <button type="button" onClick={() => void handleKakaoSos()} className="w-full text-lg font-bold text-slate-900 rounded-lg min-h-12 bg-yellow-300">
                카카오톡
              </button>
              <button type="button" onClick={() => void handleShareSos()} className="w-full text-lg font-bold text-white rounded-lg min-h-12 bg-blue-600">
                공유하기
              </button>
              <button type="button" onClick={() => setIsSosShareOpen(false)} className="w-full text-xl font-bold text-slate-800 bg-white border-2 border-slate-400 rounded-lg min-h-14">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedPlace && (
        <PlaceDetailCard
          place={selectedPlace}
          details={placeDetails}
          isLoading={isDetailsLoading}
          error={detailsError}
          onClose={() => setSelectedPlaceId(null)}
        />
      )}
      {isBlogOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
          <button
            type="button"
            aria-label="블로그 닫기"
            onClick={() => setIsBlogOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div className="relative z-10 flex flex-col w-full max-h-[88vh] p-4 bg-white shadow-sm md:max-w-[640px] md:rounded-2xl rounded-t-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-800">여행 에세이 블로그</h2>
                <p className="mt-1 text-xs text-slate-500">
                  첨부 사진 순서를 동선으로 쓴 60대 부부 나레이션입니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBlogOpen(false)}
                className="flex items-center justify-center text-lg font-bold bg-slate-100 rounded-full shrink-0 w-11 h-11 text-slate-700"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            {isBlogGenerating || !blogDraft ? (
              <p className="py-10 text-sm text-center text-slate-500">사진을 읽고 이야기로 옮기는 중입니다...</p>
            ) : (
              <div className="flex flex-col min-h-0 overflow-y-auto">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  본문 {blogDraft.charCount}자
                  {blogDraft.photoCount > 0 ? ` · 사진 ${blogDraft.photoCount}장 순서` : ''}
                </p>
                <h3 className="mb-3 text-lg font-bold text-slate-900">{blogDraft.title}</h3>
                <div className="text-base leading-7 whitespace-pre-wrap text-slate-800">{blogDraft.body}</div>
                <p className="mt-4 text-xs font-semibold text-slate-500">SEO 태그 10개</p>
                <p className="mt-1 text-sm text-amber-800">{blogDraft.hashtags.join(' ')}</p>
                {blogCopyNotice && <p className="mt-2 text-xs text-slate-600">{blogCopyNotice}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={handleCopyBlog}
                disabled={!blogDraft || isBlogGenerating}
                className="flex-1 min-w-[7rem] text-sm font-semibold text-white rounded-lg min-h-12 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
              >
                복사
              </button>
              <button
                type="button"
                onClick={handleDownloadBlogMarkdown}
                disabled={!blogDraft || isBlogGenerating}
                className="flex-1 min-w-[7rem] text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg min-h-12 hover:bg-slate-50 disabled:text-slate-400"
              >
                Markdown 저장
              </button>
              <button
                type="button"
                onClick={() => setIsBlogOpen(false)}
                className="flex-1 min-w-[7rem] text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg min-h-12 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {isMapMemoOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
          <button
            type="button"
            aria-label="여행지도 메모 닫기"
            onClick={() => setIsMapMemoOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div className="relative z-10 flex flex-col w-full max-h-[88vh] p-4 bg-white shadow-sm md:max-w-[560px] md:rounded-2xl rounded-t-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-800">여행지도 메모</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {mapTitle.trim() || '여행 전체 계획과 아이디어를 적어 두세요.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMapMemoOpen(false)}
                className="flex items-center justify-center text-lg font-bold bg-slate-100 rounded-full shrink-0 w-11 h-11 text-slate-700"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {TRAVEL_MAP_CHECKLIST_PRESETS.map((preset) => {
                const added = mapChecklist.some((item) => item.id === preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleAddChecklistPreset(preset.id)}
                    disabled={added}
                    className={`px-3 py-2 text-sm font-semibold rounded-lg min-h-12 ${
                      added
                        ? 'text-slate-400 bg-slate-100 border border-slate-200'
                        : 'text-slate-800 bg-white border border-slate-300 hover:border-amber-400 hover:bg-amber-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            {(() => {
              const completedCount = mapChecklist.filter((item) => item.completed).length;
              const totalCount = mapChecklist.length;
              const percent = totalCount === 0 ? 0 : Math.floor((completedCount / totalCount) * 100);
              return (
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  진행률 : {completedCount}/{totalCount} 완료 ({percent}%)
                </p>
              );
            })()}
            <div className="mb-3 overflow-y-auto max-h-52 space-y-1">
              {mapChecklist.length === 0 ? (
                <p className="text-sm text-slate-400">빠른 추가 버튼으로 할 일을 만들 수 있습니다.</p>
              ) : (
                mapChecklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-1 pr-1">
                    <button
                      type="button"
                      onClick={() => handleToggleChecklistItem(item.id)}
                      className="flex items-center flex-1 min-w-0 gap-3 px-1 py-1 text-left min-h-12"
                      aria-pressed={item.completed}
                    >
                      <span
                        className={`flex items-center justify-center shrink-0 w-8 h-8 rounded-md border-2 text-lg font-bold ${
                          item.completed
                            ? 'text-white bg-amber-600 border-amber-600'
                            : 'text-transparent bg-white border-slate-400'
                        }`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span className={`text-base ${item.completed ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                        {item.text}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteChecklistItem(item.id)}
                      className="flex items-center justify-center text-lg font-bold shrink-0 w-11 h-11 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-slate-800"
                      aria-label={`${item.text} 삭제`}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
            <textarea
              value={mapMemo}
              onChange={(e) => setMapMemo(e.target.value)}
              placeholder="일정, 숙소, 동선, 챙겨갈 것 등을 자유롭게 기록하세요."
              className="flex-1 w-full min-h-[22vh] md:min-h-[180px] px-3 py-3 text-base bg-white border rounded-lg outline-none resize-y border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleSaveMapNotes}
                className="flex-1 text-sm font-semibold text-white rounded-lg min-h-12 bg-amber-600 hover:bg-amber-700"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setIsMapMemoOpen(false)}
                className="flex-1 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg min-h-12 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}