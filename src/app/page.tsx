'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PlaceDetails, PlaceItem, PlaceLocation, PlacePhoto, PlacesSearchResponse } from '@/types/place';
import {
  clonePlaces,
  createTravelMapId,
  deleteTravelMap,
  hydrateTravelMaps,
  saveTravelMap,
  updateTravelMap,
} from '@/lib/travelMapStorage';
import { filesToPlacePhotos, isQuotaExceeded, MAX_PHOTOS_PER_PLACE } from '@/lib/placePhotos';
import { analyzePlacePhotos } from '@/lib/photoAiClient';
import { essaySimilarity, generateTravelBlogEssay, reviewMeetsRules, TravelBlogDraft } from '@/lib/travelBlogEssay';
import { photoAnalysesFromPlaces } from '@/lib/blog/photoFacts';
import { readSearchSession, writeSearchSession } from '@/lib/searchSessionStorage';
import { TravelMap } from '@/types/travelMap';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import MapDomView from '@/components/MapDomView';
import PlaceDetailCard from '@/components/PlaceDetailCard';
import SimQueryRedirect from '@/components/SimQueryRedirect';
import AuthControls from '@/components/AuthControls';
import { MapManager } from '@/services/MapManager';

const SEOUL: PlaceLocation = { latitude: 37.5665, longitude: 126.978 };

function collectTripPhotos(places: PlaceItem[]): PlacePhoto[] {
  const photos: PlacePhoto[] = [];
  for (const place of places) {
    for (const photo of place.photos ?? []) photos.push(photo);
  }
  return photos;
}

function applyTripPhotos(places: PlaceItem[], checkedIds: string[], photos: PlacePhoto[]): PlaceItem[] {
  const firstChecked = places.find((place) => checkedIds.includes(place.id))?.id;
  return places.map((place) => ({
    ...place,
    photos: place.id === firstChecked ? photos : [],
  }));
}

async function requestTravelReview(
  places: PlaceItem[],
  trip: { title: string; query: string }
) {
  const photos = photoAnalysesFromPlaces(places).map((photo, index) => {
    const target = places[Math.min(index, Math.max(places.length - 1, 0))];
    return {
      ...photo,
      place: target?.name || photo.place,
      address: target?.address || photo.address,
      order: index + 1,
    };
  });
  const response = await fetch('/api/photos/travel-blog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photos,
      trip: {
        title: trip.title,
        query: trip.query,
        places: places.map((place) => ({
          name: place.name,
          address: place.address,
          types: place.types,
        })),
      },
    }),
  });
  const body = (await response.json()) as {
    draft?: { title?: string; body?: string; markdown?: string; charCount?: number };
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || '여행 후기를 만들지 못했습니다.');
  return body;
}

export default function HomePage() {
  const [keyword, setKeyword] = useState('');
  const [addKeyword, setAddKeyword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addErrorMsg, setAddErrorMsg] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [tripPhotos, setTripPhotos] = useState<PlacePhoto[]>([]);
  const [center, setCenter] = useState<PlaceLocation>(SEOUL);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [detailPlace, setDetailPlace] = useState<PlaceItem | null>(null);
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [travelMaps, setTravelMaps] = useState<TravelMap[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [selectedSavedMapId, setSelectedSavedMapId] = useState<string | null>(null);
  const [loadedMapId, setLoadedMapId] = useState<string | null>(null);
  const [mapNotice, setMapNotice] = useState('');
  const [mapError, setMapError] = useState('');
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isReviewGenerating, setIsReviewGenerating] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<TravelBlogDraft | null>(null);
  const [reviewCopyNotice, setReviewCopyNotice] = useState('');
  const [lastReviewFingerprint, setLastReviewFingerprint] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const sessionReadyRef = useRef(false);
  const placesRef = useRef<PlaceItem[]>([]);
  placesRef.current = places;
  const { installed, hint: installHint, install: installApp } = usePwaInstall();

  const selectedPlaces = places.filter((place) => checkedIds.includes(place.id));
  const tripTitle = currentQuery.trim() || keyword.trim() || '여행';

  const persistSession = (
    nextPlaces: PlaceItem[],
    nextChecked: string[],
    nextPhotos: PlacePhoto[],
    nextQuery = currentQuery,
    nextKeyword = keyword,
    nextCenter = center,
    nextLoadedId = loadedMapId,
    nextSelected = selectedPlaceId
  ) => {
    writeSearchSession({
      query: nextQuery,
      keyword: nextKeyword,
      center: nextCenter,
      places: nextPlaces,
      checkedIds: nextChecked,
      selectedPlaceId: nextSelected,
      loadedMapId: nextLoadedId,
      photos: nextPhotos,
    });
  };

  const persistTrip = (nextPlaces: PlaceItem[], nextChecked: string[], nextPhotos: PlacePhoto[]) => {
    persistSession(nextPlaces, nextChecked, nextPhotos);
    const chosen = nextPlaces.filter((place) => nextChecked.includes(place.id));
    const snapshot = applyTripPhotos(chosen.length ? chosen : nextPlaces, nextChecked, nextPhotos);
    const title = currentQuery.trim() || keyword.trim() || '여행';
    if (snapshot.length === 0) return;
    try {
      if (loadedMapId) {
        const updated = updateTravelMap(loadedMapId, {
          title,
          places: clonePlaces(snapshot),
          sourceQuery: currentQuery || undefined,
        });
        if (updated) setTravelMaps(updated);
        return;
      }
      const existing = travelMaps.find((map) => (map.sourceQuery || map.title) === title);
      if (existing) {
        const updated = updateTravelMap(existing.id, {
          title,
          places: clonePlaces(snapshot),
          sourceQuery: currentQuery || undefined,
        });
        if (updated) setTravelMaps(updated);
        setLoadedMapId(existing.id);
        setSelectedSavedMapId(existing.id);
        return;
      }
      const now = new Date().toISOString();
      const nextMap: TravelMap = {
        id: createTravelMapId(),
        title,
        createdAt: now,
        updatedAt: now,
        places: clonePlaces(snapshot),
        sourceQuery: currentQuery || undefined,
      };
      setTravelMaps(saveTravelMap(nextMap));
      setLoadedMapId(nextMap.id);
      setSelectedSavedMapId(nextMap.id);
    } catch (error) {
      if (isQuotaExceeded(error)) {
        setMapError('사진 용량이 커서 저장하지 못했습니다. 사진을 줄여 주세요.');
      }
    }
  };

  const closeOverlays = useCallback(() => {
    setIsReviewOpen(false);
    setDetailPlace(null);
    setDetails(null);
    setDetailsError('');
  }, []);

  const openPlaceDetail = useCallback((place: PlaceItem) => {
    setSelectedPlaceId(place.id);
    setDetailPlace(place);
    setDetails(null);
    setDetailsError('');
    setDetailsLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/places/details?id=${encodeURIComponent(place.id)}`);
        const body = (await res.json()) as PlaceDetails & { error?: string };
        if (!res.ok) throw new Error(body.error || '상세 정보를 불러오지 못했습니다.');
        setDetails(body);
      } catch (error) {
        setDetailsError(error instanceof Error ? error.message : '상세 정보를 불러오지 못했습니다.');
      } finally {
        setDetailsLoading(false);
      }
    })();
  }, []);

  const handleSelectPlace = useCallback((id: string) => {
    setSelectedPlaceId(id);
  }, []);

  const handleOpenPlaceDetail = useCallback(
    (id: string) => {
      const place = placesRef.current.find((item) => item.id === id);
      if (place) openPlaceDetail(place);
    },
    [openPlaceDetail]
  );

  const handleBack = () => {
    if (isReviewOpen || detailPlace) {
      closeOverlays();
      return;
    }
    setMapNotice(places.length ? '검색 결과와 선택한 관광지를 그대로 두었습니다.' : '');
  };

  /* eslint-disable react-hooks/set-state-in-effect -- 저장 목록과 마지막 검색을 첫 화면에 올립니다 */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maps = await hydrateTravelMaps();
      const session = await readSearchSession();
      if (cancelled) return;
      setTravelMaps(maps);
      setMapsReady(true);
      if (session && session.places.length > 0) {
        setPlaces(session.places);
        setCheckedIds(session.checkedIds);
        setTripPhotos(session.photos);
        setCenter(session.center);
        setCurrentQuery(session.query);
        setKeyword(session.keyword || session.query);
        setSelectedPlaceId(session.selectedPlaceId);
        setLoadedMapId(session.loadedMapId);
        setSelectedSavedMapId(session.loadedMapId);
        const manager = MapManager.getInstance();
        manager.setTravelMode(true);
        manager.setPlaces(session.places);
        if (session.places.length >= 2) manager.fitPlacesBounds(session.places);
        else manager.setMapCenter(session.center.latitude, session.center.longitude, 14);
        setMapNotice(`지난 검색 '${session.query || session.keyword}' ${session.places.length}곳을 그대로 두었습니다.`);
      }
      sessionReadyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const onPop = () => closeOverlays();
    const onShow = () => {
      if (!sessionReadyRef.current) return;
      void readSearchSession().then((session) => {
        if (!session?.places.length) return;
        setPlaces(session.places);
        setCheckedIds(session.checkedIds);
        setTripPhotos(session.photos);
        setCenter(session.center);
        setCurrentQuery(session.query);
        setKeyword(session.keyword || session.query);
        setSelectedPlaceId(session.selectedPlaceId);
        setLoadedMapId(session.loadedMapId);
      });
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pageshow', onShow);
    };
  }, [closeOverlays]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setIsLoading(true);
    setErrorMsg('');
    setMapError('');
    setMapNotice('');
    closeOverlays();
    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: keyword.trim() }),
      });
      const data: PlacesSearchResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || '장소를 검색할 수 없습니다.');
      const nextPlaces = clonePlaces(data.places);
      const nextCenter = data.center ?? nextPlaces[0]?.location ?? SEOUL;
      const nextChecked = nextPlaces.map((place) => place.id);
      const manager = MapManager.getInstance();
      manager.setTravelMode(true);
      manager.setPlaces(nextPlaces);
      if (nextPlaces.length >= 2) manager.fitPlacesBounds(nextPlaces);
      else manager.setMapCenter(nextCenter.latitude, nextCenter.longitude, 14);
      setPlaces(nextPlaces);
      setCheckedIds(nextChecked);
      setTripPhotos([]);
      setCenter(nextCenter);
      setCurrentQuery(data.query);
      setSelectedPlaceId(null);
      setLoadedMapId(null);
      setSelectedSavedMapId(null);
      setReviewDraft(null);
      persistSession(nextPlaces, nextChecked, [], data.query, keyword.trim(), nextCenter, null, null);
      setMapNotice(`추천 관광지 ${nextPlaces.length}곳입니다. 갈 곳을 고르세요.`);
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
    setErrorMsg('');
    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, intent: 'add' }),
      });
      const data: PlacesSearchResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || '장소를 추가하지 못했습니다.');
      const found = data.places[0];
      if (!found) throw new Error('일치하는 장소를 찾지 못했습니다.');
      if (places.some((place) => place.id === found.id)) {
        throw new Error('이미 목록에 있는 장소입니다.');
      }
      const nextPlace: PlaceItem = { ...found, addedManually: true };
      const nextPlaces = [...places, nextPlace];
      const nextChecked = [...checkedIds, nextPlace.id];
      const nextCenter = nextPlace.location;
      setPlaces(nextPlaces);
      setCheckedIds(nextChecked);
      setSelectedPlaceId(nextPlace.id);
      setAddKeyword('');
      const manager = MapManager.getInstance();
      manager.setTravelMode(true);
      manager.setPlaces(nextPlaces);
      if (nextPlaces.length >= 2) manager.fitPlacesBounds(nextPlaces);
      else manager.setMapCenter(nextCenter.latitude, nextCenter.longitude, 14);
      persistTrip(nextPlaces, nextChecked, tripPhotos);
      setMapNotice(`'${nextPlace.name}'을 목록에 넣었습니다.`);
    } catch (err: unknown) {
      setAddErrorMsg(err instanceof Error ? err.message : '장소 추가 도중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleFitMap = () => {
    if (places.length === 0) return;
    MapManager.getInstance().fitPlacesBounds(places);
  };

  const handleTogglePlace = (placeId: string) => {
    const next = checkedIds.includes(placeId)
      ? checkedIds.filter((id) => id !== placeId)
      : [...checkedIds, placeId];
    setCheckedIds(next);
    persistTrip(places, next, tripPhotos);
    setSelectedPlaceId(placeId);
  };

  const handlePhotosSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files?.length) return;
    setIsPhotoBusy(true);
    setMapError('');
    try {
      const added = await filesToPlacePhotos(files);
      if (added.length === 0) {
        setMapError('사진을 읽지 못했습니다. 다른 사진을 골라 주세요.');
        return;
      }
      const nextPhotos = [...tripPhotos, ...added].slice(0, MAX_PHOTOS_PER_PLACE);
      setTripPhotos(nextPhotos);
      persistTrip(places, checkedIds, nextPhotos);
      setMapNotice(`사진 ${nextPhotos.length}장을 올렸습니다.`);
    } finally {
      setIsPhotoBusy(false);
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    const nextPhotos = tripPhotos.filter((photo) => photo.id !== photoId);
    setTripPhotos(nextPhotos);
    persistTrip(places, checkedIds, nextPhotos);
  };

  const handleLoadTravelMap = (map: TravelMap) => {
    const snapshot = clonePlaces(map.places);
    const nextCenter = snapshot[0]?.location ?? SEOUL;
    const nextPhotos = collectTripPhotos(snapshot);
    const nextChecked = snapshot.map((place) => place.id);
    const nextQuery = map.sourceQuery || map.title;
    setPlaces(snapshot);
    setCheckedIds(nextChecked);
    setTripPhotos(nextPhotos);
    setCenter(nextCenter);
    setSelectedSavedMapId(map.id);
    setLoadedMapId(map.id);
    setCurrentQuery(nextQuery);
    setKeyword(nextQuery);
    setSelectedPlaceId(null);
    setReviewDraft(null);
    setMapError('');
    persistSession(snapshot, nextChecked, nextPhotos, nextQuery, nextQuery, nextCenter, map.id, null);
    setMapNotice(`'${map.title}'을 불러왔습니다. 장소 ${snapshot.length}곳.`);
    MapManager.getInstance().setTravelMode(true);
    MapManager.getInstance().setPlaces(snapshot);
    if (snapshot.length >= 2) MapManager.getInstance().fitPlacesBounds(snapshot);
    else MapManager.getInstance().setMapCenter(nextCenter.latitude, nextCenter.longitude, 14);
  };

  const handleDeleteTravelMap = (map: TravelMap) => {
    if (!window.confirm(`'${map.title}'을 삭제할까요?`)) return;
    const remaining = deleteTravelMap(map.id);
    setTravelMaps(remaining);
    setSelectedSavedMapId((current) => (current === map.id ? null : current));
    if (loadedMapId === map.id) setLoadedMapId(null);
    setMapNotice(`'${map.title}'을 삭제했습니다.`);
  };

  const handleGenerateReview = async () => {
    if (selectedPlaces.length === 0) {
      setMapError('갈 관광지를 먼저 골라 주세요.');
      return;
    }
    setMapError('');
    setReviewCopyNotice('');
    setIsReviewGenerating(true);
    setIsReviewOpen(true);
    const prepared = applyTripPhotos(selectedPlaces, checkedIds, tripPhotos);
    try {
      const analyzed = await analyzePlacePhotos(prepared);
      persistTrip(places, checkedIds, collectTripPhotos(analyzed));
      const trip = { title: tripTitle, query: currentQuery };
      let draft = generateTravelBlogEssay({
        title: trip.title,
        memo: '',
        checklist: [],
        places: analyzed,
        query: currentQuery,
      });
      try {
        const remote = await requestTravelReview(analyzed, trip);
        if (remote.draft?.body && reviewMeetsRules(remote.draft.body)) {
          draft = {
            ...draft,
            title: remote.draft.title || draft.title,
            body: remote.draft.body,
            markdown: remote.draft.markdown || draft.markdown,
            charCount: remote.draft.body.length,
            hashtags: [],
          };
        }
      } catch {
        // 서버 실패 시 로컬 후기를 씁니다.
      }
      if (lastReviewFingerprint && essaySimilarity(lastReviewFingerprint, draft.body) > 0.55) {
        draft = generateTravelBlogEssay({
          title: trip.title,
          memo: '장소와 사진 순서를 더 구체적으로 적는다.',
          checklist: [],
          places: analyzed,
          query: currentQuery,
        });
      }
      setLastReviewFingerprint(draft.body);
      setReviewDraft(draft);
    } catch {
      setReviewDraft(
        generateTravelBlogEssay({
          title: tripTitle,
          memo: '',
          checklist: [],
          places: prepared,
          query: currentQuery,
        })
      );
    } finally {
      setIsReviewGenerating(false);
    }
  };

  const handleCopyReview = async () => {
    if (!reviewDraft) return;
    try {
      await navigator.clipboard.writeText(`${reviewDraft.title}\n\n${reviewDraft.body}`);
      setReviewCopyNotice('후기를 복사했습니다.');
    } catch {
      setReviewCopyNotice('복사에 실패했습니다. 글을 길게 눌러 복사해 주세요.');
    }
  };

  return (
    <main className="flex flex-col h-dvh bg-slate-50">
      <SimQueryRedirect />
      <header className="flex items-center justify-between gap-2 px-3 py-3 bg-white border-b shrink-0 md:px-6 border-slate-200">
        <div className="flex items-center min-w-0 gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center justify-center text-2xl font-black rounded-xl shrink-0 w-14 h-14 bg-slate-100 text-slate-800"
            aria-label="뒤로가기"
          >
            ←
          </button>
          <div className="min-w-0">
            <p className="text-xl font-black text-amber-600">노을</p>
            <p className="text-base font-semibold text-slate-700">여행지 추천 · 여행 후기</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AuthControls />
          {!installed && (
            <button
              type="button"
              onClick={() => void installApp()}
              className="px-3 text-lg font-black text-white rounded-xl min-h-12 bg-slate-900"
            >
              앱 설치
            </button>
          )}
        </div>
      </header>
      {installHint && (
        <p className="px-3 py-2 text-lg font-bold text-center text-slate-900 bg-amber-100">{installHint}</p>
      )}

      <div className="flex-1 min-h-0 workspace">
        <div className="border-b shrink-0 workspace-search border-slate-100">
          <form onSubmit={handleSearch} className="px-4 pt-4">
            <label className="block mb-2 text-lg font-bold text-slate-800">1. 어디로 가세요?</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="제주도, 부산, 강릉"
                className="place-field flex-1 min-w-0 px-4 text-xl border rounded-xl outline-none border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 text-xl font-bold text-white rounded-xl shrink-0 h-16 min-h-16 min-w-24 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
              >
                {isLoading ? '찾는 중' : '검색'}
              </button>
            </div>
            {errorMsg && <p className="mt-2 text-base font-semibold text-red-600">{errorMsg}</p>}
          </form>
          <form onSubmit={handleAddPlace} className="px-4 pt-3 pb-4">
            <label className="block mb-2 text-lg font-bold text-slate-800">장소 직접 추가</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={addKeyword}
                onChange={(e) => setAddKeyword(e.target.value)}
                placeholder="예: 광안리해수욕장"
                className="place-field flex-1 min-w-0 px-4 text-xl border rounded-xl outline-none border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={isAdding}
                className="px-5 text-xl font-bold text-white rounded-xl shrink-0 h-16 min-h-16 min-w-24 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300"
              >
                {isAdding ? '추가 중' : '추가'}
              </button>
            </div>
            {addErrorMsg && <p className="mt-2 text-base font-semibold text-red-600">{addErrorMsg}</p>}
          </form>
        </div>

        <div className="p-4 workspace-places md:min-h-0 md:overflow-y-auto">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-bold text-slate-800">
              2. 갈 곳을 고르세요
              {places.length > 0 ? ` (${checkedIds.length}/${places.length})` : ''}
            </h2>
            {places.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const next = checkedIds.length === places.length ? [] : places.map((place) => place.id);
                  setCheckedIds(next);
                  persistTrip(places, next, tripPhotos);
                }}
                className="px-3 text-base font-semibold rounded-xl min-h-12 text-slate-700 bg-white border border-slate-300"
              >
                {checkedIds.length === places.length ? '다 빼기' : '다 고르기'}
              </button>
            )}
          </div>
          {places.length === 0 ? (
            <p className="py-8 text-lg text-center text-slate-400">지역 이름을 검색하면 관광지가 나옵니다.</p>
          ) : (
            <div className="space-y-3">
              {places.map((place, idx) => {
                const checked = checkedIds.includes(place.id);
                return (
                  <div
                    key={place.id}
                    className={`flex items-center gap-4 px-4 py-4 min-h-[76px] rounded-2xl border ${
                      checked ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'
                    } ${place.addedManually ? 'border-orange-400' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleTogglePlace(place.id)}
                      className="w-10 h-10 accent-amber-600 shrink-0"
                      aria-label={`${place.name} 선택`}
                    />
                    <button
                      type="button"
                      onClick={() => openPlaceDetail(place)}
                      className="flex-1 min-w-0 py-2 text-left"
                    >
                      <span className={`text-xl font-black leading-snug ${place.addedManually ? 'text-orange-700' : 'text-slate-900'}`}>
                        {idx + 1}. {place.name}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 overflow-y-auto border-t workspace-saved border-slate-200 bg-slate-50/80">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotosSelected}
          />
          <h2 className="mb-2 text-lg font-bold text-slate-800">3. 사진을 올리세요</h2>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={isPhotoBusy}
            className="w-full mb-2 text-lg font-bold text-slate-800 bg-white border-2 border-slate-300 rounded-xl min-h-14 hover:bg-slate-50 disabled:text-slate-400"
          >
            {isPhotoBusy ? '사진 준비 중...' : tripPhotos.length > 0 ? `사진 더 올리기 (${tripPhotos.length}장)` : '사진 올리기'}
          </button>
          {tripPhotos.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              {tripPhotos.map((photo, index) => (
                <div key={photo.id} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.dataUrl} alt={`${index + 1}번째 사진`} className="object-cover w-16 h-16 rounded-xl bg-slate-100" />
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute top-0.5 right-0.5 flex items-center justify-center text-lg font-bold text-white rounded-full w-8 h-8 bg-slate-900/70"
                    aria-label={`${index + 1}번째 사진 삭제`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleGenerateReview}
            disabled={isReviewGenerating}
            className="w-full mb-3 text-2xl font-black text-white rounded-2xl min-h-[76px] h-[76px] bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
          >
            {isReviewGenerating ? '후기 작성 중...' : '여행 후기 생성'}
          </button>
          {mapError && <p className="mb-2 text-base font-semibold text-red-600">{mapError}</p>}
          {mapNotice && <p className="mb-2 text-base font-semibold text-slate-700">{mapNotice}</p>}

          <h2 className="mb-2 text-lg font-bold text-slate-800">저장된 여행</h2>
          {!mapsReady ? (
            <p className="text-base text-slate-400">목록을 확인하는 중...</p>
          ) : travelMaps.length === 0 ? (
            <p className="text-base text-slate-400">아직 저장된 여행이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {travelMaps.map((map) => (
                <div
                  key={map.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border ${
                    selectedSavedMapId === map.id ? 'border-slate-700 bg-white' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold truncate text-slate-800">{map.title}</p>
                    <p className="text-sm text-slate-500">{map.places.length}곳</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLoadTravelMap(map)}
                    className="px-3 text-base font-bold text-white rounded-lg min-h-11 bg-blue-600"
                  >
                    불러오기
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTravelMap(map)}
                    className="px-3 text-base font-bold text-red-600 border border-red-200 rounded-lg min-h-11"
                  >
                    삭제
                  </button>
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
            onOpenPlaceDetail={handleOpenPlaceDetail}
            travelMode
          />
          <button
            type="button"
            onClick={handleFitMap}
            disabled={places.length === 0}
            className="noeul-fit-bounds"
          >
            지도 전체 보기
          </button>
        </div>
      </div>

      {detailPlace && (
        <PlaceDetailCard
          place={detailPlace}
          details={details}
          isLoading={detailsLoading}
          error={detailsError}
          query={currentQuery}
          onClose={closeOverlays}
        />
      )}

      {isReviewOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white md:items-center md:justify-center md:bg-slate-900/40 md:p-6">
          <div className="relative z-10 flex flex-col w-full h-full max-h-full p-4 bg-white md:h-auto md:max-h-[88vh] md:max-w-[640px] md:rounded-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-xl font-black text-slate-800">여행 후기</h2>
              <button
                type="button"
                onClick={closeOverlays}
                className="flex items-center justify-center text-2xl font-bold bg-slate-100 rounded-full shrink-0 w-12 h-12 text-slate-700"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            {isReviewGenerating || !reviewDraft ? (
              <p className="py-10 text-lg text-center text-slate-500">사진을 읽고 후기를 적는 중입니다...</p>
            ) : (
              <div className="flex flex-col min-h-0 overflow-y-auto">
                <p className="mb-2 text-base text-slate-500">본문 {reviewDraft.charCount}자</p>
                <h3 className="mb-3 text-xl font-bold text-slate-900">{reviewDraft.title}</h3>
                <div className="text-lg leading-8 whitespace-pre-wrap text-slate-800">{reviewDraft.body}</div>
                {reviewCopyNotice && <p className="mt-2 text-base text-slate-600">{reviewCopyNotice}</p>}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleCopyReview}
                disabled={!reviewDraft || isReviewGenerating}
                className="flex-1 text-lg font-bold text-white rounded-xl min-h-14 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300"
              >
                복사
              </button>
              <button
                type="button"
                onClick={closeOverlays}
                className="flex-1 text-lg font-bold text-slate-700 bg-white border border-slate-300 rounded-xl min-h-14"
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
