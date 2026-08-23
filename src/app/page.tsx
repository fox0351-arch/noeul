'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlaceDetails, PlaceItem, PlaceLocation, PlacesSearchResponse } from '@/types/place';
import { generateKML, downloadKmlFile } from '@/lib/kmlBuilder';
import { loadManualPlaces, saveManualPlaces } from '@/lib/manualPlacesStorage';
import { loadActiveRouteSession, saveActiveRouteSession } from '@/lib/activeRouteStorage';
import { createTravelMapId, deleteTravelMap, exportTravelMapBackupJson, loadTravelMaps, removePlaceFromTravelMap, restoreTravelMapsFromBackup, saveTravelMap, updateTravelMap, updateTravelMapNotes } from '@/lib/travelMapStorage';
import { filesToPlacePhotos, isQuotaExceeded, MAX_PHOTOS_PER_PLACE } from '@/lib/placePhotos';
import { analyzePlacePhotos } from '@/lib/photoAiClient';
import { generateTravelBlogEssay, TravelBlogDraft } from '@/lib/travelBlogEssay';
import { TRAVEL_MAP_CHECKLIST_PRESETS, TravelMap, TravelMapChecklistItem, withPresetChecklistTexts } from '@/types/travelMap';
import { TravelRoute, routePointsToLocations } from '@/types/route';
import { parseTrailFile } from '@/lib/gpxKmlParser';
import { OffRouteLevel, bearingDegrees, closestPointOnRoute, distanceToRouteMeters, offRouteLevelFromDistance, speedKmhFromCoords, MIN_MAP_ROTATE_KMH, STOP_MAP_ROTATE_KMH, WEAK_GPS_ACCURACY_M } from '@/lib/geo';
import {
  formatSosMessage,
  loadBatterySave,
  openKakaoShare,
  openPhoneCall,
  openSmsShare,
  OFF_ROUTE_VOICE,
  RETURN_TO_ROUTE_VOICE,
  offRouteToastText,
  saveBatterySave,
  shareOrCopy,
  setActiveVoiceStyle,
  speakKorean,
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
import { FIELD_TEST_ITEMS, loadFieldTestChecks, saveFieldTestChecks } from '@/lib/fieldTestChecklist';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { loadUserSettings, saveUserSettings, type VoiceStyle } from '@/lib/userData';
import GoogleMapViewer from '@/components/GoogleMapViewer';
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
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('grandchild');
  const [mapHeadingDeg, setMapHeadingDeg] = useState<number | null>(null);
  const [sosStep, setSosStep] = useState<0 | 1 | 2>(0);
  const [isSosShareOpen, setIsSosShareOpen] = useState(false);
  const [sosNotice, setSosNotice] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [fieldChecks, setFieldChecks] = useState<Record<string, boolean>>({});
  const [isFieldTestOpen, setIsFieldTestOpen] = useState(false);
  const [navSessionReady, setNavSessionReady] = useState(false);
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const [locateToast, setLocateToast] = useState('');
  const [isLocating, setIsLocating] = useState(false);
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

  useEffect(() => {
    setManualPlaces(loadManualPlaces());
    setHasLoadedManualPlaces(true);
    setTravelMaps(loadTravelMaps());
    setBatterySave(loadBatterySave());
    setGuardianPhone(loadGuardianPhone());
    setFieldChecks(loadFieldTestChecks());
    const prefs = loadUserSettings();
    setVoiceStyle(prefs.voiceStyle);
    setHeadingUpMode(prefs.headingUp);
    setActiveVoiceStyle(prefs.voiceStyle);
    const contrastOn = window.localStorage.getItem('noeul.highContrast.v1') === '1';
    setHighContrast(contrastOn);
    document.documentElement.classList.toggle('high-contrast', contrastOn);
    setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const lastFix = loadLastGps();
    if (lastFix) {
      lastFixRef.current = { latitude: lastFix.latitude, longitude: lastFix.longitude };
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
        setMapError('사진 용량이 커서 기기에 저장하지 못했습니다. 사진을 줄여 주세요.');
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

  useEffect(() => {
    if (placeListToggledByUser) return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) {
      setIsPlaceListCollapsed(false);
      return;
    }
    setIsPlaceListCollapsed(displayedPlaces.length >= 15);
  }, [displayedPlaces.length, placeListToggledByUser]);

  useEffect(() => {
    if (!shouldScrollToPlaceList.current) return;
    shouldScrollToPlaceList.current = false;
    placeListSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [places]);

  useEffect(() => {
    if (!isFollowMode) {
      setOffRouteLevel(0);
      offRouteLevelRef.current = 0;
      setReturnPoint(null);
      stopRepeatingSpeech();
      return;
    }

    let cancelled = false;
    const intervalMs = batterySave ? 10000 : 2000;
    let lastAcceptedAt = 0;
    let watchId: number | null = null;

    const applyOffRoute = (distance: number) => {
      const nextLevel = offRouteLevelFromDistance(distance);
      const prevLevel = offRouteLevelRef.current;
      if (nextLevel === prevLevel) return;

      offRouteLevelRef.current = nextLevel;
      setOffRouteLevel(nextLevel);

      if (nextLevel !== 100 && prevLevel === 100) {
        stopRepeatingSpeech();
      }

      if (nextLevel === 0 && prevLevel > 0) {
        speakKorean(RETURN_TO_ROUTE_VOICE);
        vibrateOnce();
        setOffRouteToast('');
        if (offRouteToastTimerRef.current) window.clearTimeout(offRouteToastTimerRef.current);
        setReturnToast('✅ 원래 경로로 복귀했습니다');
        window.setTimeout(() => setReturnToast(''), 2000);
        return;
      }
      if ((nextLevel === 20 || nextLevel === 50 || nextLevel === 100) && prevLevel < nextLevel) {
        const meters = Math.max(1, Math.round(distance));
        setOffRouteToast(offRouteToastText(meters));
        if (offRouteToastTimerRef.current) window.clearTimeout(offRouteToastTimerRef.current);
        offRouteToastTimerRef.current = window.setTimeout(() => setOffRouteToast(''), 3000);
        vibrateAlert(nextLevel);
        if (nextLevel === 100) {
          startRepeatingSpeech(OFF_ROUTE_VOICE[100], 5000);
        } else {
          speakKorean(OFF_ROUTE_VOICE[nextLevel]);
        }
      }
    };

    const updateFromPosition = (coords: GeolocationCoordinates) => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastAcceptedAt < intervalMs - 200) return;
      lastAcceptedAt = now;

      const next: PlaceLocation = {
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
      const prevFix = lastFixRef.current;
      const elapsedMs = lastFixAtRef.current ? now - lastFixAtRef.current : 0;
      const speedKmh = speedKmhFromCoords(coords, prevFix, next, elapsedMs);

      let heading: number | null =
        coords.heading != null && Number.isFinite(coords.heading) ? coords.heading : null;
      if (heading == null && prevFix) {
        const moved = Math.hypot(
          next.latitude - prevFix.latitude,
          next.longitude - prevFix.longitude
        );
        if (moved > 0.00001) {
          heading = bearingDegrees(prevFix, next);
        }
      }

      if (speedKmh != null) {
        if (speedKmh >= MIN_MAP_ROTATE_KMH) mapRotatingRef.current = true;
        if (speedKmh < STOP_MAP_ROTATE_KMH) mapRotatingRef.current = false;
      }
      if (mapRotatingRef.current && heading != null && Number.isFinite(heading)) {
        mapHeadingRef.current = heading;
      }

      lastFixRef.current = next;
      lastFixAtRef.current = now;
      setUserLocation(next);
      setHeadingDeg(heading);
      setMapHeadingDeg(mapHeadingRef.current);
      setGpsAccuracyM(Number.isFinite(coords.accuracy) ? coords.accuracy : null);
      saveLastGps({
        latitude: next.latitude,
        longitude: next.longitude,
        accuracyM: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        heading,
        savedAt: new Date().toISOString(),
      });
      setMapError('');

      if (!currentRoute || currentRoute.points.length < 2) return;
      const routeLocations = routePointsToLocations(currentRoute.points);
      const distance = distanceToRouteMeters(next, routeLocations);
      if (distance >= 20) {
        setReturnPoint(closestPointOnRoute(next, routeLocations));
      } else {
        setReturnPoint(null);
      }
      applyOffRoute(distance);
    };

    const onError = (err: GeolocationPositionError) => {
      if (cancelled) return;
      if (err.code === err.PERMISSION_DENIED) {
        setMapError('위치 권한이 꺼져 있습니다. 브라우저 설정에서 위치를 허용한 뒤 다시 따라가기를 눌러 주세요.');
        setIsFollowMode(false);
        return;
      }
      if (err.code === err.TIMEOUT) {
        setMapError('GPS가 느립니다. 하늘이 보이는 곳에서 잠시 기다려 주세요. 추적은 계속됩니다.');
        return;
      }
      setMapError('GPS를 찾지 못했습니다. 건물 밖, 하늘이 보이는 곳으로 이동해 주세요. 추적은 계속됩니다.');
    };

    const gpsOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: intervalMs,
      timeout: batterySave ? 15000 : 10000,
    };

    if (!navigator.geolocation) {
      setMapError('이 기기에서는 위치를 쓸 수 없습니다. 위치 기능이 있는 휴대폰 브라우저를 사용해 주세요.');
      setIsFollowMode(false);
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => updateFromPosition(pos.coords),
      onError,
      gpsOptions
    );

    return () => {
      cancelled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      stopRepeatingSpeech();
    };
  }, [isFollowMode, currentRoute, batterySave]);

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
      .catch((err: any) => {
        if (!cancelled) setDetailsError(err.message || '상세 정보를 불러올 수 없습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPlaceId]);

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
    } catch (err: any) {
      setErrorMsg(err.message || '검색 도중 오류가 발생했습니다.');
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
    } catch (err: any) {
      setAddErrorMsg(err.message || '장소 추가 도중 오류가 발생했습니다.');
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
        route: currentRoute ?? undefined,
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

  const handleImportRouteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setMapError('');
    setMapNotice('');
    try {
      const parsed = await parseTrailFile(file);
      setCurrentRoute(parsed.route);
      setPlaces(parsed.places);
      setHideManualExtras(true);
      setSelectedPlaceId(null);
      setCurrentQuery(parsed.route.name);
      if (!mapTitle.trim()) {
        setMapTitle(parsed.route.name);
      }
      const first = parsed.places[0]?.location ?? parsed.route.points[0];
      if (first) setCenter(first);
      setIsFollowMode(false);
      setMapNotice(`'${parsed.route.name}' 루트를 지도에 표시했습니다. 여행지도 저장으로 함께 보관하세요.`);
      if (loadedMapId) {
        const updated = updateTravelMap(loadedMapId, {
          title: mapTitle.trim() || parsed.route.name,
          places: parsed.places,
          sourceQuery: parsed.route.name,
          memo: mapMemo,
          checklist: mapChecklist,
          route: parsed.route,
        });
        if (updated) setTravelMaps(updated);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '루트 파일을 읽지 못했습니다.';
      setMapError(message);
    }
  };

  const handleToggleFollowRoute = () => {
    setMapError('');
    setMapNotice('');
    if (isFollowMode) {
      setIsFollowMode(false);
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
    const last = loadLastGps();
    if (last) {
      const loc = { latitude: last.latitude, longitude: last.longitude };
      lastFixRef.current = loc;
      lastFixAtRef.current = Date.now();
      setUserLocation(loc);
      setGpsAccuracyM(last.accuracyM);
      setHeadingDeg(last.heading);
      mapHeadingRef.current = last.heading;
      setMapHeadingDeg(last.heading);
    }
    mapRotatingRef.current = false;
    warmSpeechVoices();
    setIsFollowMode(true);
    setIsPlaceListCollapsed(true);
    setIsFieldTestOpen(false);
    const seconds = batterySave ? 10 : 2;
    setMapNotice(
      navigator.onLine
        ? `현재 위치를 ${seconds}초마다 갱신합니다. 루트는 이 기기에 저장되어 있습니다.`
        : `인터넷이 없어도 GPS로 따라갈 수 있습니다. ${seconds}초마다 위치를 확인합니다.`
    );
  };

  const handleToggleBatterySave = () => {
    setBatterySave((current) => {
      const next = !current;
      saveBatterySave(next);
      setMapNotice(next ? '배터리 절약: 10초마다 GPS를 확인합니다.' : '일반 모드: 2초마다 GPS를 확인합니다.');
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

  const handleToggleFieldCheck = (id: string) => {
    setFieldChecks((current) => {
      const next = { ...current, [id]: !current[id] };
      saveFieldTestChecks(next);
      return next;
    });
  };

  const handleOpenSos = () => {
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
    setMapError('');
    setLocateToast('');
    if (!navigator.geolocation) {
      setMapError('이 기기에서는 위치를 쓸 수 없습니다. 위치 기능이 있는 휴대폰으로 열어 주세요.');
      return;
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
        setHeadingDeg(heading);
        setGpsAccuracyM(Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null);
        saveLastGps({
          latitude: next.latitude,
          longitude: next.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          heading,
          savedAt: new Date().toISOString(),
        });
        setRecenterRequestId((id) => id + 1);
        vibrateOnce();
        setLocateToast('현재 위치로 이동했습니다.');
        setIsLocating(false);
        window.setTimeout(() => setLocateToast(''), 2500);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
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
        route: currentRoute ?? undefined,
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
    setMapNotice(
      map.route
        ? `'${map.title}' 여행지도와 루트를 불러왔습니다.`
        : `'${map.title}' 여행지도를 불러왔습니다.`
    );
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
    setMapNotice('여행지도를 백업 파일로 저장했습니다.');
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
          setMapError('올바른 백업 파일이 아닙니다.');
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
        setMapNotice(`여행지도 ${restored.length}개를 복원했습니다.`);
        window.alert('여행지도를 복원했습니다.');
      } catch {
        setMapNotice('');
        setMapError('올바른 백업 파일이 아닙니다.');
      }
    };
    reader.onerror = () => {
      setMapNotice('');
      setMapError('올바른 백업 파일이 아닙니다.');
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
            <div className="flex items-center px-2 text-sm font-black rounded-md min-h-10 text-slate-900 bg-slate-100">
              📍±{Math.round(gpsAccuracyM)}m
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
                <span className="text-xs shrink-0 text-slate-500">'{currentQuery}' 기준</span>
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
              onClick={handleImportRouteClick}
              className="w-full mb-2 px-3 text-base font-bold text-slate-900 bg-white border-2 border-slate-400 rounded-lg min-h-12 hover:bg-slate-50"
            >
              📂 루트 가져오기
            </button>
            </div>
            <button
              type="button"
              onClick={handleToggleFollowRoute}
              className={`w-full mb-2 px-3 text-base font-bold rounded-lg min-h-12 ${
                isFollowMode
                  ? 'text-white bg-blue-800 hover:bg-blue-900'
                  : 'text-white bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isFollowMode ? '🚶 따라가기 종료' : '🚶 루트 따라가기'}
            </button>
            <div className="hiking-hide">
            <button
              type="button"
              onClick={handleToggleBatterySave}
              aria-pressed={batterySave}
              className={`w-full mb-2 px-3 text-xl font-black rounded-lg min-h-12 border-2 ${
                batterySave
                  ? 'text-amber-950 bg-amber-200 border-amber-500'
                  : 'text-slate-800 bg-white border-slate-400'
              }`}
            >
              {batterySave ? '배터리 절약 켜짐 (10초)' : '배터리 절약 꺼짐 (2초)'}
            </button>
            <button
              type="button"
              onClick={handleToggleHighContrast}
              aria-pressed={highContrast}
              className="w-full mb-2 px-3 text-base font-bold text-white rounded-lg min-h-12 bg-black"
            >
              {highContrast ? '고대비 켜짐' : '고대비 모드'}
            </button>
            <label className="block mb-1 text-base font-bold text-slate-800">음성 안내 스타일</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(
                [
                  ['grandchild', '👧 손녀 목소리'],
                  ['female', '👩 여성 목소리'],
                  ['male', '👨 남성 목소리'],
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
                      const preview =
                        style === 'grandchild'
                          ? '할아버지, 손녀 목소리로 안내할게요.'
                          : style === 'female'
                            ? '여성 목소리로 안내하겠습니다.'
                            : '남성 목소리로 안내하겠습니다.';
                      speakKorean(preview);
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
            <button
              type="button"
              onClick={() => setIsFieldTestOpen((open) => !open)}
              className="w-full mb-3 px-3 text-base font-bold text-slate-900 bg-white border-2 border-slate-500 rounded-lg min-h-12"
            >
              {isFieldTestOpen ? '현장 테스트 닫기' : '현장 테스트 체크리스트'}
            </button>
            {isFieldTestOpen && (
              <div className="p-3 mb-3 bg-white border-2 border-slate-400 rounded-lg">
                <p className="mb-2 text-xl font-black text-slate-900">갈맷길 · 제주올레 · 둘레길</p>
                <ul className="space-y-2">
                  {FIELD_TEST_ITEMS.map((item) => (
                    <li key={item.id}>
                      <label className="flex items-center gap-3 text-base font-bold min-h-12">
                        <input
                          type="checkbox"
                          checked={Boolean(fieldChecks[item.id])}
                          onChange={() => handleToggleFieldCheck(item.id)}
                          className="w-6 h-6"
                        />
                        {item.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2 mb-3 shrink-0">
              <button
                type="button"
                onClick={handleBackupTravelMaps}
                className="flex-1 px-3 text-sm font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg min-h-12 hover:bg-amber-200"
              >
                여행지도 백업
              </button>
              <button
                type="button"
                onClick={handleRestoreTravelMapsClick}
                className="flex-1 px-3 text-sm font-semibold text-white rounded-lg min-h-12 bg-slate-700 hover:bg-slate-800"
              >
                여행지도 복원
              </button>
            </div>
            {mapError && <p className="mb-2 text-sm font-semibold text-red-600">{mapError}</p>}
            {mapNotice && <p className="mb-2 text-sm font-semibold text-slate-700">{mapNotice}</p>}

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
                      {map.route ? ' · 루트 있음' : ''}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSavedMapId(map.id);
                          handleLoadTravelMap(map);
                        }}
                        className="flex-1 px-3 text-sm font-medium text-white rounded-lg min-h-12 bg-blue-600 hover:bg-blue-700"
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
                        className="flex-1 px-3 text-sm font-medium text-red-600 border border-red-200 rounded-lg min-h-12 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

        <div className="relative w-full min-h-0 workspace-map map-pane">
          <GoogleMapViewer
            center={center}
            places={displayedPlaces}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={(id) => setSelectedPlaceId(id)}
            routePoints={routePoints}
            userLocation={userLocation}
            headingDeg={headingDeg}
            followMode={isFollowMode}
            headingUp={isFollowMode && headingUpMode}
            mapHeadingDeg={mapHeadingDeg}
            recenterRequestId={recenterRequestId}
            returnPoint={offRouteLevel >= 20 ? returnPoint : null}
          />
          {isFollowMode && (
            <div className="absolute z-20 flex gap-2 top-2 left-2 right-2">
              <button
                type="button"
                onClick={() => {
                  setHeadingUpMode(false);
                  saveUserSettings({ headingUp: false });
                }}
                aria-pressed={!headingUpMode}
                className={`flex-1 px-2 text-base font-black rounded-lg min-h-12 border-2 ${
                  !headingUpMode
                    ? 'text-white bg-slate-900 border-slate-900'
                    : 'text-slate-900 bg-white/95 border-slate-400'
                }`}
              >
                🧭 북쪽고정
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeadingUpMode(true);
                  saveUserSettings({ headingUp: true });
                }}
                aria-pressed={headingUpMode}
                className={`flex-1 px-2 text-base font-black rounded-lg min-h-12 border-2 ${
                  headingUpMode
                    ? 'text-white bg-blue-800 border-blue-800'
                    : 'text-slate-900 bg-white/95 border-slate-400'
                }`}
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
      <button
        type="button"
        onClick={handleLocateMe}
        disabled={isLocating}
        className={`fixed z-[90] relative flex items-center justify-center text-3xl rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.35)] right-4 border-4 border-white ${
          userLocation
            ? 'bg-blue-600 text-white'
            : 'bg-slate-400 text-slate-100'
        }`}
        style={{
          width: 64,
          height: 64,
          bottom: 'calc(1rem + 56px + 12px + env(safe-area-inset-bottom, 0px))',
        }}
        aria-label="현재 위치로 이동"
      >
        <span aria-hidden>🎯</span>
        {userLocation && gpsAccuracyM != null && gpsAccuracyM >= WEAK_GPS_ACCURACY_M && (
          <span className="absolute flex items-center justify-center w-7 h-7 text-base font-black text-white bg-red-600 rounded-full -top-1 -right-1">
            !
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={handleOpenSos}
        className="fixed z-[90] flex items-center justify-center text-xl font-black text-white bg-red-600 rounded-full shadow-lg right-4 hover:bg-red-700"
        style={{
          width: 56,
          height: 56,
          bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        }}
        aria-label="긴급 SOS"
      >
        SOS
      </button>
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
          style={{ bottom: 'calc(1rem + 56px + 76px + env(safe-area-inset-bottom, 0px))' }}
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