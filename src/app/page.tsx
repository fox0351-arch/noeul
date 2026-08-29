'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaceDetails, PlaceItem, PlaceLocation, PlacesSearchResponse } from '@/types/place';
import {
  clonePlaces,
  createTravelMapId,
  deleteTravelMap,
  exportTravelMapBackupJson,
  hydrateTravelMaps,
  loadTravelMaps,
  removePlaceFromTravelMap,
  restoreTravelMapsFromBackup,
  saveTravelMap,
  updateTravelMap,
  updateTravelMapNotes,
} from '@/lib/travelMapStorage';
import { filesToPlacePhotos, isQuotaExceeded, MAX_PHOTOS_PER_PLACE } from '@/lib/placePhotos';
import { analyzePlacePhotos } from '@/lib/photoAiClient';
import { essaySimilarity, generateTravelBlogEssay, TravelBlogDraft } from '@/lib/travelBlogEssay';
import { photoAnalysesFromPlaces } from '@/lib/blog/photoFacts';
import { TRAVEL_MAP_CHECKLIST_PRESETS, TravelMap, TravelMapChecklistItem, withPresetChecklistTexts } from '@/types/travelMap';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import MapDomView from '@/components/MapDomView';
import SimQueryRedirect from '@/components/SimQueryRedirect';
import AuthControls from '@/components/AuthControls';
import { useAuth } from '@/components/AuthProvider';
import PlaceDetailCard from '@/components/PlaceDetailCard';
import { uploadPlacePhotosToDrive } from '@/lib/googleDrive/client';
import { requestPhotoPipeline } from '@/lib/photoPipelineClient';
import { MapManager } from '@/services/MapManager';

const SEOUL: PlaceLocation = { latitude: 37.5665, longitude: 126.978 };

function formatMapDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

async function requestTravelBlog(places: PlaceItem[], trip: { title: string; query: string; memo: string }) {
  const photos = photoAnalysesFromPlaces(places);
  const response = await fetch('/api/photos/travel-blog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photos,
      trip: {
        title: trip.title,
        query: trip.query,
        memo: trip.memo,
        places: places.map((place) => ({
          name: place.name,
          address: place.address,
          memo: place.memo,
          types: place.types,
        })),
      },
    }),
  });
  const body = (await response.json()) as {
    draft?: { title?: string; body?: string; markdown?: string; seo?: { hashtags?: string[] }; charCount?: number };
    fromGemini?: boolean;
    usedPhotos?: { order?: number; place?: string; caption?: string }[];
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || '블로그를 만들지 못했습니다.');
  return body;
}

export default function HomePage() {
  const { user } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [center, setCenter] = useState<PlaceLocation>(SEOUL);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [addKeyword, setAddKeyword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addErrorMsg, setAddErrorMsg] = useState('');
  const [addSuccessMsg, setAddSuccessMsg] = useState('');
  const [travelMaps, setTravelMaps] = useState<TravelMap[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapTitle, setMapTitle] = useState('');
  const [selectedSavedMapId, setSelectedSavedMapId] = useState<string | null>(null);
  const [loadedMapId, setLoadedMapId] = useState<string | null>(null);
  const [mapNotice, setMapNotice] = useState('');
  const [mapError, setMapError] = useState('');
  const [isPlaceListCollapsed, setIsPlaceListCollapsed] = useState(false);
  const [placeListToggledByUser, setPlaceListToggledByUser] = useState(false);
  const placeListSectionRef = useRef<HTMLDivElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
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
  const [lastBlogFingerprint, setLastBlogFingerprint] = useState('');
  const { installed, hint: installHint, install: installApp } = usePwaInstall();

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId]
  );

  const handleSelectPlace = useCallback((id: string) => {
    setSelectedPlaceId(id);
  }, []);

  const clearTransientTripState = () => {
    setSelectedPlaceId(null);
    setPlaceDetails(null);
    setDetailsError('');
    setMemoOpenPlaceId(null);
    setBlogDraft(null);
    setBlogCopyNotice('');
    setLastBlogFingerprint('');
    setAddErrorMsg('');
    setAddSuccessMsg('');
  };

  /* eslint-disable react-hooks/set-state-in-effect -- 저장 목록을 첫 화면에 올립니다 */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maps = await hydrateTravelMaps();
      if (cancelled) return;
      setTravelMaps(maps);
      setMapsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- 장소 수에 맞춰 목록 접힘만 맞춥니다 */
  useEffect(() => {
    if (placeListToggledByUser) return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) {
      setIsPlaceListCollapsed(false);
      return;
    }
    setIsPlaceListCollapsed(places.length >= 15);
  }, [places.length, placeListToggledByUser]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!shouldScrollToPlaceList.current) return;
    shouldScrollToPlaceList.current = false;
    placeListSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [places]);

  /* eslint-disable react-hooks/set-state-in-effect -- 선택한 장소 설명을 불러옵니다 */
  useEffect(() => {
    if (!selectedPlaceId) {
      setPlaceDetails(null);
      setDetailsError('');
      setIsDetailsLoading(false);
      return;
    }

    let cancelled = false;
    setIsDetailsLoading(true);
    setDetailsError('');
    setPlaceDetails(null);

    fetch(`/api/places/details?id=${encodeURIComponent(selectedPlaceId)}`)
      .then(async (res) => {
        const data: PlaceDetails & { error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error || '상세 정보를 불러올 수 없습니다.');
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

  const persistLoadedMapPlaces = (nextPlaces: PlaceItem[]) => {
    if (!loadedMapId) return;
    try {
      const updated = updateTravelMap(loadedMapId, {
        title: mapTitle.trim() || currentQuery.trim() || '여행지도',
        places: clonePlaces(nextPlaces),
        sourceQuery: currentQuery || undefined,
        memo: mapMemo,
        checklist: mapChecklist,
      });
      if (updated) setTravelMaps(updated);
    } catch (error) {
      if (isQuotaExceeded(error)) {
        setMapError('사진 용량이 커서 여행지도에 저장하지 못했습니다. 사진을 줄여 주세요.');
      }
    }
  };

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
    setMapError('');
    setMapNotice('');

    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: keyword.trim() }),
      });
      const data: PlacesSearchResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || '장소를 검색할 수 없습니다.');

      const nextPlaces = clonePlaces(data.places);
      const nextCenter = data.center ?? nextPlaces[0]?.location;
      const manager = MapManager.getInstance();
      manager.setTravelMode(true);
      manager.setPlaces(nextPlaces);
      if (nextPlaces.length >= 2) {
        manager.fitPlacesBounds(nextPlaces);
      } else if (nextCenter) {
        manager.setMapCenter(nextCenter.latitude, nextCenter.longitude, 14);
      }
      const logSearch = (when: string) => {
        const liveCenter = manager.getMapCenter();
        const payload = {
          when,
          검색어: data.query,
          'place.lat': nextCenter?.latitude ?? null,
          'place.lng': nextCenter?.longitude ?? null,
          'map center': liveCenter,
          selectedPlace: null,
        };
        console.info('[노을-search]', payload);
        if (typeof window !== 'undefined') {
          (window as Window & { __NOEUL_SEARCH_LOG__?: unknown }).__NOEUL_SEARCH_LOG__ = payload;
        }
      };
      logSearch('immediate');
      window.setTimeout(() => logSearch('after-setCenter'), 400);
      clearTransientTripState();
      setPlaces(nextPlaces);
      if (nextCenter) setCenter(nextCenter);
      setCurrentQuery(data.query);
      setMapTitle(data.query);
      setLoadedMapId(null);
      setSelectedSavedMapId(null);
      setMapMemo('');
      setMapChecklist([]);
      setIsMapMemoOpen(false);
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
        body: JSON.stringify({ query, intent: 'add' }),
      });
      const data: PlacesSearchResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || '장소를 추가할 수 없습니다.');
      const found = data.places[0];
      if (!found) throw new Error('일치하는 장소를 찾지 못했습니다.');
      if (places.some((place) => place.id === found.id)) {
        throw new Error('이미 이 여행지도에 있는 장소입니다.');
      }

      const nextPlace: PlaceItem = { ...found, addedManually: true };
      const nextPlaces = [...places, nextPlace];
      setPlaces(nextPlaces);
      setSelectedPlaceId(nextPlace.id);
      setAddKeyword('');
      setAddSuccessMsg(`'${nextPlace.name}'을(를) 추가했습니다.`);
      persistLoadedMapPlaces(nextPlaces);
      if (nextPlaces.length === 1) {
        setCenter(nextPlace.location);
        MapManager.getInstance().setMapCenter(nextPlace.location.latitude, nextPlace.location.longitude, 14);
      }
    } catch (err: unknown) {
      setAddErrorMsg(err instanceof Error ? err.message : '장소 추가 도중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleMovePlace = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= places.length) return;
    const nextPlaces = [...places];
    const [moved] = nextPlaces.splice(index, 1);
    nextPlaces.splice(target, 0, moved);
    setPlaces(nextPlaces);
    persistLoadedMapPlaces(nextPlaces);
  };

  const handleTogglePlaceMemo = (placeId: string) => {
    setMemoOpenPlaceId((current) => (current === placeId ? null : placeId));
  };

  const handleChangePlaceMemo = (placeId: string, memo: string) => {
    const nextPlaces = places.map((place) => (place.id === placeId ? { ...place, memo } : place));
    setPlaces(nextPlaces);
    persistLoadedMapPlaces(nextPlaces);
  };

  const handleOpenPlacePhotos = (placeId: string) => {
    photoTargetPlaceId.current = placeId;
    photoInputRef.current?.click();
  };

  const handlePlacePhotosSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const selectedFiles = files ? Array.from(files) : [];
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

      const current = places.find((place) => place.id === placeId);
      const existing = current?.photos ?? [];
      const nextPhotos = [...existing, ...added].slice(0, MAX_PHOTOS_PER_PLACE);
      if (existing.length + added.length > MAX_PHOTOS_PER_PLACE) {
        setMapNotice(`장소당 사진은 최대 ${MAX_PHOTOS_PER_PLACE}장까지 저장됩니다.`);
      }

      const nextPlaces = places.map((place) =>
        place.id === placeId ? { ...place, photos: nextPhotos } : place
      );
      const analyzed = await analyzePlacePhotos(nextPlaces);
      setPlaces(analyzed);
      persistLoadedMapPlaces(analyzed);
      if (user) {
        try {
          const uploaded = await uploadPlacePhotosToDrive(user, selectedFiles, {
            placeId,
            travelMapId: loadedMapId,
            photoIds: added.map((photo) => photo.id),
          });
          const driveFileIds = new Map<string, string>();
          added.forEach((photo, index) => {
            const driveFileId = uploaded[index]?.id;
            if (driveFileId) driveFileIds.set(photo.id, driveFileId);
          });
          const withDriveReferences = analyzed.map((place) =>
            place.id === placeId
              ? {
                  ...place,
                  photos: place.photos?.map((photo) => {
                    const driveFileId = driveFileIds.get(photo.id);
                    return driveFileId ? { ...photo, driveFileId } : photo;
                  }),
                }
              : place
          );
          setPlaces(withDriveReferences);
          persistLoadedMapPlaces(withDriveReferences);
          setMapNotice('사진을 기기와 Google Drive에 저장했습니다.');
          void (async () => {
            for (const item of uploaded) {
              try {
                await requestPhotoPipeline(user, { driveFileId: item.id });
              } catch {
                // Drive 저장은 유지합니다.
              }
            }
          })();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Google Drive 저장에 실패했습니다.';
          setMapNotice(`사진은 기기에 저장했습니다. ${message}`);
        }
      }
    } finally {
      setPhotoBusyPlaceId(null);
    }
  };

  const handleDeletePlacePhoto = (placeId: string, photoId: string) => {
    const nextPlaces = places.map((place) =>
      place.id === placeId
        ? { ...place, photos: (place.photos ?? []).filter((photo) => photo.id !== photoId) }
        : place
    );
    setPlaces(nextPlaces);
    persistLoadedMapPlaces(nextPlaces);
  };

  const handleDeletePlace = (placeId: string) => {
    const nextPlaces = places.filter((place) => place.id !== placeId);
    setPlaces(nextPlaces);
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

  const handleSaveTravelMap = (e: React.FormEvent) => {
    e.preventDefault();
    const title = mapTitle.trim() || currentQuery.trim();
    setMapError('');
    setMapNotice('');

    if (!title) {
      setMapError('여행지도 이름을 입력해주세요.');
      return;
    }
    if (places.length === 0) {
      setMapError('저장할 장소가 없습니다. 먼저 장소를 검색하거나 추가하세요.');
      return;
    }

    const snapshotPlaces = clonePlaces(places);

    try {
      if (loadedMapId) {
        const updated = updateTravelMap(loadedMapId, {
          title,
          places: snapshotPlaces,
          sourceQuery: currentQuery || undefined,
          memo: mapMemo,
          checklist: mapChecklist,
        });
        if (!updated) {
          setLoadedMapId(null);
          setMapError('불러온 여행지도를 찾을 수 없어 새로 저장하지 못했습니다. 다시 불러오거나 새로 저장해주세요.');
          return;
        }
        setTravelMaps(updated);
        setMapTitle(title);
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
      };

      setTravelMaps(saveTravelMap(nextMap));
      setLoadedMapId(nextMap.id);
      setSelectedSavedMapId(nextMap.id);
      setMapTitle(title);
      setMapNotice(`'${title}' 여행지도를 저장했습니다. 앱을 다시 열어도 불러오기로 복원할 수 있습니다.`);
    } catch (error) {
      if (isQuotaExceeded(error)) {
        setMapError('사진 용량이 커서 여행지도를 저장하지 못했습니다. 사진을 줄여 주세요.');
        return;
      }
      setMapError('여행지도를 저장하지 못했습니다.');
    }
  };

  const handleLoadTravelMap = (map: TravelMap) => {
    const snapshot = clonePlaces(map.places);
    const nextCenter = snapshot[0]?.location ?? SEOUL;
    clearTransientTripState();
    setPlaces(snapshot);
    setCenter(nextCenter);
    setSelectedSavedMapId(map.id);
    setLoadedMapId(map.id);
    setMapTitle(map.title);
    setMapMemo(map.memo ?? '');
    setMapChecklist(withPresetChecklistTexts(map.checklist ?? []));
    setCurrentQuery(map.sourceQuery || map.title);
    setKeyword(map.sourceQuery || map.title);
    setMapError('');
    setMapNotice(`'${map.title}' 여행지도를 불러왔습니다. 장소 ${snapshot.length}개${
      snapshot.some((place) => (place.photos?.length ?? 0) > 0)
        ? ` · 사진 ${snapshot.reduce((sum, place) => sum + (place.photos?.length ?? 0), 0)}장`
        : ''
    }.`);
    MapManager.getInstance().setTravelMode(true);
    MapManager.getInstance().setPlaces(snapshot);
    MapManager.getInstance().setMapCenter(nextCenter.latitude, nextCenter.longitude, 14);
  };

  const handleBackupTravelMaps = () => {
    const json = exportTravelMapBackupJson();
    const now = new Date();
    const filename = `noeul-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;
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

  const handleRestoreTravelMapsClick = () => backupFileInputRef.current?.click();

  const handleRestoreTravelMapsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('현재 저장된 여행지도를 덮어쓸까요?')) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const restored = restoreTravelMapsFromBackup(JSON.parse(text));
        if (!restored) {
          setMapNotice('');
          setMapError('올바른 보관 파일이 아닙니다.');
          return;
        }
        setTravelMaps(restored);
        const keepLoadedId = loadedMapId && restored.some((map) => map.id === loadedMapId) ? loadedMapId : null;
        setSelectedSavedMapId((current) => (current && restored.some((map) => map.id === current) ? current : null));
        setLoadedMapId(keepLoadedId);
        setMapError('');
        setMapNotice(`여행지도 ${restored.length}개를 가져왔습니다.`);
      } catch {
        setMapNotice('');
        setMapError('올바른 보관 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteTravelMap = (map: TravelMap) => {
    if (!window.confirm(`'${map.title}' 여행지도를 삭제할까요?`)) return;
    const remaining = deleteTravelMap(map.id);
    setTravelMaps(remaining);
    setSelectedSavedMapId((current) => (current === map.id ? null : current));
    if (loadedMapId === map.id) {
      setLoadedMapId(null);
      setMapMemo('');
      setMapChecklist([]);
      setIsMapMemoOpen(false);
    }
    setMapError('');
    setMapNotice(`'${map.title}' 여행지도를 삭제했습니다. 지금 화면의 장소는 그대로입니다.`);
  };

  const persistMapNotes = (memo: string, checklist: TravelMapChecklistItem[]) => {
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
      current.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item))
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
    if (places.length === 0) {
      setMapError('블로그를 만들 장소가 없습니다. 먼저 장소를 모으세요.');
      setMapNotice('');
      return;
    }

    setMapError('');
    setBlogCopyNotice('');
    setIsBlogGenerating(true);
    setIsBlogOpen(true);

    try {
      const analyzed = await analyzePlacePhotos(places);
      setPlaces(analyzed);
      persistLoadedMapPlaces(analyzed);
      const trip = {
        title: mapTitle.trim() || currentQuery.trim() || '우리들의 여행',
        query: currentQuery,
        memo: mapMemo,
      };
      let draft: TravelBlogDraft = generateTravelBlogEssay({
        title: trip.title,
        memo: trip.memo,
        checklist: mapChecklist,
        places: analyzed,
        query: currentQuery,
      });
      try {
        const remote = await requestTravelBlog(analyzed, trip);
        if (remote.draft?.body) {
          draft = {
            title: remote.draft.title || draft.title,
            body: remote.draft.body,
            hashtags: remote.draft.seo?.hashtags?.length ? remote.draft.seo.hashtags : draft.hashtags,
            markdown: remote.draft.markdown || draft.markdown,
            charCount: remote.draft.charCount || remote.draft.body.length,
            photoCount: draft.photoCount,
            usedPhotoFacts: draft.usedPhotoFacts,
            usedPlaces: draft.usedPlaces,
          };
        }
      } catch {
        // 서버 생성 실패 시 사진 분석을 반영한 로컬 초안을 씁니다.
      }
      if (lastBlogFingerprint && essaySimilarity(lastBlogFingerprint, draft.body) > 0.55) {
        draft = generateTravelBlogEssay({
          title: trip.title,
          memo: `${trip.memo}\n장소 특징을 더 구체적으로 적는다.`,
          checklist: mapChecklist,
          places: analyzed,
          query: currentQuery,
        });
      }
      setLastBlogFingerprint(draft.body);
      setBlogDraft(draft);
    } catch {
      setBlogDraft(
        generateTravelBlogEssay({
          title: mapTitle.trim() || currentQuery.trim() || '우리들의 여행',
          memo: mapMemo,
          checklist: mapChecklist,
          places,
          query: currentQuery,
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
    <main className="flex flex-col h-dvh bg-slate-50">
      <SimQueryRedirect />
      <header className="flex items-center justify-between gap-2 px-3 py-2 bg-white border-b shrink-0 md:px-6 md:py-3 border-slate-200">
        <div className="flex items-center min-w-0 gap-2">
          <span className="text-xl font-black text-amber-600">노을</span>
          <span className="hidden text-base font-semibold sm:inline text-slate-700">여행지도 · 블로그</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AuthControls />
          {!installed && (
            <button
              type="button"
              onClick={() => void installApp()}
              className="px-3 text-xl font-black text-white rounded-lg min-h-12 bg-slate-900"
            >
              📱 앱 설치
            </button>
          )}
        </div>
      </header>
      {installHint && (
        <p className="px-3 py-2 text-base font-bold text-center text-slate-900 bg-amber-100">{installHint}</p>
      )}

      <div className="workspace">
        <form onSubmit={handleSearch} className="p-3 border-b shrink-0 workspace-search md:p-4 border-slate-100">
          <label className="block mb-1 text-xs font-semibold text-slate-500">여행지 / 지역명 검색</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 제주 올레길 1-1, 대구 송해공원"
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
              <span>수집된 관광지 {places.length > 0 && `(${places.length})`}</span>
            </span>
            {currentQuery && <span className="text-xs shrink-0 text-slate-500">&apos;{currentQuery}&apos; 기준</span>}
          </button>

          <div className={isPlaceListCollapsed ? 'max-md:hidden' : undefined}>
            {places.length === 0 ? (
              <div className="py-6 text-center md:py-12 text-slate-400">
                <p className="text-sm">검색어를 입력하고 지도를 생성하세요.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {places.map((place, idx) => (
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
                          disabled={idx === places.length - 1}
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
                        {place.rating && <span className="text-xs font-bold text-amber-500">★ {place.rating}</span>}
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
                placeholder="예: 제주 올레길 1-1"
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
              보관 파일 열기
            </button>
          </div>
          {mapError && <p className="mb-2 text-sm font-semibold text-red-600">{mapError}</p>}
          {mapNotice && <p className="mb-2 text-sm font-semibold text-slate-700">{mapNotice}</p>}

          {!mapsReady ? (
            <p className="text-xs text-slate-400">저장된 여행지도를 확인하는 중...</p>
          ) : travelMaps.length === 0 ? (
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
                    저장일 {formatMapDate(map.updatedAt || map.createdAt)}
                    {map.places.length > 0 ? ` · 장소 ${map.places.length}개` : ''}
                    {map.places.some((place) => (place.photos?.length ?? 0) > 0)
                      ? ` · 사진 ${map.places.reduce((sum, place) => sum + (place.photos?.length ?? 0), 0)}장`
                      : ''}
                  </p>
                  <div className="flex gap-1 mt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadTravelMap(map);
                      }}
                      className="flex-1 px-3 text-sm font-medium text-white rounded-lg min-h-10 bg-blue-600 hover:bg-blue-700"
                    >
                      불러오기
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
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

        <div className="relative isolate w-full min-h-0 overflow-hidden workspace-map map-pane">
          <MapDomView
            center={center}
            places={places}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
            travelMode
          />
        </div>
      </div>

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
                <p className="mt-1 text-xs text-slate-500">사진 분석·장소 정보·촬영 순서를 동선으로 쓴 기록입니다.</p>
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
                <p className="mt-4 text-xs font-semibold text-slate-500">SEO 태그</p>
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
