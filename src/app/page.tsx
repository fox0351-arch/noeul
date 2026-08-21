'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlaceDetails, PlaceItem, PlaceLocation, PlacesSearchResponse } from '@/types/place';
import { generateKML, downloadKmlFile } from '@/lib/kmlBuilder';
import { loadManualPlaces, saveManualPlaces } from '@/lib/manualPlacesStorage';
import { createTravelMapId, deleteTravelMap, loadTravelMaps, saveTravelMap, updateTravelMap } from '@/lib/travelMapStorage';
import { TravelMap } from '@/types/travelMap';
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
  const shouldScrollToPlaceList = useRef(false);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const displayedPlaces = useMemo(() => {
    if (hideManualExtras) {
      return places;
    }

    const savedById = new Map(manualPlaces.map((place) => [place.id, place]));
    const fromSearchOrList = places.map((place) => {
      const saved = savedById.get(place.id);
      return saved ? { ...place, addedManually: true } : place;
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
    saveManualPlaces(manualPlaces);
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

  const handleDeleteManualPlace = (placeId: string) => {
    if (loadedMapId) {
      setPlaces((prev) => prev.filter((place) => place.id !== placeId));
    } else {
      setPlaces((prev) =>
        prev.filter((place) => !(place.id === placeId && place.addedManually))
      );
    }
    setManualPlaces((prev) => prev.filter((place) => place.id !== placeId));
    setSelectedPlaceId((current) => (current === placeId ? null : current));
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

    if (loadedMapId) {
      const updated = updateTravelMap(loadedMapId, {
        title,
        places: snapshotPlaces,
        sourceQuery: currentQuery || undefined,
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
    };

    setTravelMaps(saveTravelMap(nextMap));
    setSelectedSavedMapId(nextMap.id);
    setMapTitle('');
    setMapNotice(`'${title}' 여행지도를 저장했습니다.`);
  };

  const handleLoadTravelMap = (map: TravelMap) => {
    const snapshot = map.places.map((place) => ({ ...place }));
    setPlaces(snapshot);
    setHideManualExtras(true);
    setSelectedSavedMapId(map.id);
    setLoadedMapId(map.id);
    setMapTitle(map.title);
    setSelectedPlaceId(null);
    setCurrentQuery(map.sourceQuery || map.title);
    if (snapshot[0]) {
      setCenter(snapshot[0].location);
    }
    setMapError('');
    setMapNotice(`'${map.title}' 여행지도를 불러왔습니다.`);
  };

  const handleDeleteTravelMap = (map: TravelMap) => {
    const confirmed = window.confirm(`'${map.title}' 여행지도를 삭제할까요?`);
    if (!confirmed) return;

    const remaining = deleteTravelMap(map.id);
    setTravelMaps(remaining);
    setSelectedSavedMapId((current) => (current === map.id ? null : current));
    setLoadedMapId((current) => (current === map.id ? null : current));
    setMapError('');
    setMapNotice(`'${map.title}' 여행지도를 삭제했습니다. 지금 화면의 장소는 그대로입니다.`);
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
            className={`workspace-places min-h-0 p-3 overflow-y-auto md:p-4 ${
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
                      <h3
                        className={`text-sm font-semibold ${
                          place.addedManually ? 'text-orange-600' : 'text-slate-900'
                        }`}
                      >
                        {idx + 1}. {place.name}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {place.rating && (
                          <span className="text-xs font-bold text-amber-500">★ {place.rating}</span>
                        )}
                        {(place.addedManually || loadedMapId) && (
                          <button
                            type="button"
                            aria-label={`${place.name} 삭제`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteManualPlace(place.id);
                            }}
                            className="flex items-center justify-center text-sm font-bold text-orange-600 rounded w-9 h-9 md:w-6 md:h-6 md:text-xs hover:bg-orange-100"
                          >
                            X
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">{place.address}</p>
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
          />
        </div>

          <div className="p-3 overflow-y-auto border-t workspace-saved md:p-4 border-slate-200 bg-slate-50/80">
            <h2 className="mb-2 text-sm font-bold text-slate-800">내 여행지도</h2>
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
    </main>
  );
}