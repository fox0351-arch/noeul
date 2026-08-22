'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlaceDetails, PlaceItem, PlaceLocation, PlacesSearchResponse } from '@/types/place';
import { generateKML, downloadKmlFile } from '@/lib/kmlBuilder';
import { loadManualPlaces, saveManualPlaces } from '@/lib/manualPlacesStorage';
import { createTravelMapId, deleteTravelMap, exportTravelMapBackupJson, loadTravelMaps, removePlaceFromTravelMap, restoreTravelMapsFromBackup, saveTravelMap, updateTravelMap, updateTravelMapNotes } from '@/lib/travelMapStorage';
import { filesToPlacePhotos, isQuotaExceeded, MAX_PHOTOS_PER_PLACE } from '@/lib/placePhotos';
import { generateTravelBlogEssay, TravelBlogDraft } from '@/lib/travelBlogEssay';
import { TRAVEL_MAP_CHECKLIST_PRESETS, TravelMap, TravelMapChecklistItem, withPresetChecklistTexts } from '@/types/travelMap';
import GoogleMapViewer from '@/components/GoogleMapViewer';
import PlaceDetailCard from '@/components/PlaceDetailCard';

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

  useEffect(() => {
    setManualPlaces(loadManualPlaces());
    setHasLoadedManualPlaces(true);
    setTravelMaps(loadTravelMaps());
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
      setPlaces(nextPlaces);
      setManualPlaces((prev) =>
        prev.map((place) => (place.id === placeId ? { ...place, photos: nextPhotos } : place))
      );
      persistLoadedMapPlaces(nextPlaces);
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

  const handleSaveTravelMap = (e: React.FormEvent) => {
    e.preventDefault();
    const title = mapTitle.trim();
    setMapError('');
    setMapNotice('');

    if (!title) {
      setMapError('여행지도 이름을 입력해주세요.');
      return;
    }
    if (displayedPlaces.length === 0) {
      setMapError('저장할 장소가 없습니다. 먼저 장소를 수집하세요.');
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
    setSelectedPlaceId(null);
    setCurrentQuery(map.sourceQuery || map.title);
    if (snapshot[0]) {
      setCenter(snapshot[0].location);
    }
    setMapError('');
    setMapNotice(`'${map.title}' 여행지도를 불러왔습니다.`);
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

  const handleGenerateBlog = () => {
    if (displayedPlaces.length === 0) {
      setMapError('블로그를 만들 장소가 없습니다. 먼저 장소를 모으세요.');
      setMapNotice('');
      return;
    }

    setMapError('');
    setBlogCopyNotice('');
    setIsBlogGenerating(true);
    setIsBlogOpen(true);

    window.setTimeout(() => {
      const draft = generateTravelBlogEssay({
        title: mapTitle.trim() || currentQuery.trim() || '우리들의 여행',
        memo: mapMemo,
        checklist: mapChecklist,
        places: displayedPlaces,
      });
      setBlogDraft(draft);
      setIsBlogGenerating(false);
    }, 50);
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
      <header className="flex items-center justify-between gap-2 px-3 py-2 bg-white border-b shrink-0 md:px-6 md:py-3 border-slate-200">
        <div className="flex items-center min-w-0 gap-2">
          <span className="text-lg font-black md:text-xl text-amber-600">노을</span>
          <span className="hidden text-sm font-semibold sm:inline text-slate-700">My Maps 자동 생성기 MVP</span>
        </div>
        
        {displayedPlaces.length > 0 && (
          <button
            onClick={handleDownloadKml}
            className="flex items-center gap-1 px-3 py-2.5 text-sm font-medium text-white transition-colors bg-blue-600 rounded-lg shadow shrink-0 min-h-11 hover:bg-blue-700 md:gap-2 md:px-4"
          >
            <span className="md:hidden">KML</span>
            <span className="hidden md:inline">KML 다운로드 (My Maps용)</span>
          </button>
        )}
      </header>

      <div className="workspace">
          <form onSubmit={handleSearch} className="p-3 border-b shrink-0 workspace-search md:p-4 border-slate-100">
            <label className="block mb-1 text-xs font-semibold text-slate-500">여행지 / 지역명 검색</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 해운대, 여수, 강릉"
                className="place-field flex-1 min-w-0 px-3 py-2.5 text-base border rounded-lg outline-none md:text-sm border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 text-sm font-medium text-white transition-colors rounded-lg shrink-0 min-h-11 min-w-16 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
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
                className="place-field flex-1 min-w-0 px-3 py-2.5 text-base border rounded-lg outline-none md:text-sm border-slate-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
              <button
                type="submit"
                disabled={isAdding}
                className="px-4 text-sm font-medium text-white transition-colors rounded-lg shrink-0 min-h-11 min-w-16 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300"
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
              className="place-list-toggle flex items-center justify-between w-full gap-2 mb-3 text-left min-h-11 md:min-h-0 md:cursor-default"
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
                          className={`px-3 text-sm font-semibold rounded-lg min-h-11 ${
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
                          className={`px-3 text-sm font-semibold rounded-lg min-h-11 ${
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
                  className="place-field flex-1 min-w-0 px-3 py-2.5 text-base bg-white border rounded-lg outline-none md:text-sm border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-medium leading-tight text-white transition-colors rounded-lg shrink-0 min-h-11 max-w-[7.5rem] md:max-w-none bg-slate-700 hover:bg-slate-800"
                >
                  {loadedMapId ? '여행지도 수정 저장' : '여행지도 저장'}
                </button>
              </div>
            </form>
            <button
              type="button"
              onClick={() => setIsMapMemoOpen(true)}
              className={`w-full mb-3 px-3 text-sm font-semibold rounded-lg min-h-11 ${
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
              className="w-full mb-3 px-3 text-sm font-semibold text-white rounded-lg min-h-11 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
            >
              {isBlogGenerating ? '블로그 작성 중...' : '블로그 생성'}
            </button>
            <div className="flex gap-2 mb-3 shrink-0">
              <button
                type="button"
                onClick={handleBackupTravelMaps}
                className="flex-1 px-3 text-sm font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg min-h-11 hover:bg-amber-200"
              >
                여행지도 백업
              </button>
              <button
                type="button"
                onClick={handleRestoreTravelMapsClick}
                className="flex-1 px-3 text-sm font-semibold text-white rounded-lg min-h-11 bg-slate-700 hover:bg-slate-800"
              >
                여행지도 복원
              </button>
            </div>
            {mapError && <p className="mb-2 text-xs text-red-500">{mapError}</p>}
            {mapNotice && <p className="mb-2 text-xs text-slate-600">{mapNotice}</p>}

            {travelMaps.length === 0 ? (
              <p className="text-xs text-slate-400">저장된 여행지도가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {travelMaps.map((map) => (
                  <div
                    key={map.id}
                    onClick={() => setSelectedSavedMapId(map.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer ${
                      selectedSavedMapId === map.id
                        ? 'border-slate-700 bg-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{map.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">장소 {map.places.length}개</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSavedMapId(map.id);
                          handleLoadTravelMap(map);
                        }}
                        className="flex-1 px-3 text-sm font-medium text-white rounded-lg min-h-11 bg-blue-600 hover:bg-blue-700"
                      >
                        불러오기
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSavedMapId(map.id);
                          handleDeleteTravelMap(map);
                        }}
                        className="flex-1 px-3 text-sm font-medium text-red-600 border border-red-200 rounded-lg min-h-11 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        <div className="relative w-full min-h-0 workspace-map map-pane">
          <GoogleMapViewer
            center={center}
            places={displayedPlaces}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={(id) => setSelectedPlaceId(id)}
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
              <p className="py-10 text-sm text-center text-slate-500">일정을 이야기로 옮기는 중입니다...</p>
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
                className="flex-1 min-w-[7rem] text-sm font-semibold text-white rounded-lg min-h-11 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
              >
                복사
              </button>
              <button
                type="button"
                onClick={handleDownloadBlogMarkdown}
                disabled={!blogDraft || isBlogGenerating}
                className="flex-1 min-w-[7rem] text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg min-h-11 hover:bg-slate-50 disabled:text-slate-400"
              >
                Markdown 저장
              </button>
              <button
                type="button"
                onClick={() => setIsBlogOpen(false)}
                className="flex-1 min-w-[7rem] text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg min-h-11 hover:bg-slate-50"
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
                    className={`px-3 py-2 text-sm font-semibold rounded-lg min-h-11 ${
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
                className="flex-1 text-sm font-semibold text-white rounded-lg min-h-11 bg-amber-600 hover:bg-amber-700"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setIsMapMemoOpen(false)}
                className="flex-1 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg min-h-11 hover:bg-slate-50"
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