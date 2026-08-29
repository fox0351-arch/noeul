'use client';

import { useEffect, useRef } from 'react';
import { PlaceItem, PlaceLocation } from '@/types/place';
import { MapManager } from '@/services/MapManager';

type MapDomViewProps = {
  center: PlaceLocation;
  places: PlaceItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  onOpenPlaceDetail?: (id: string) => void;
  /** 홈 여행지도는 true. GPS 내비 시뮬은 false. */
  travelMode?: boolean;
  /** 관리자 시뮬 등에서만 사용. 홈 여행지도는 넘기지 않습니다. */
  routePoints?: PlaceLocation[];
  userLocation?: PlaceLocation | null;
};

/**
 * 지도 DOM만 붙입니다. 카메라 이동은 MapManager가 담당합니다.
 */
export default function MapDomView({
  center,
  places,
  selectedPlaceId,
  onSelectPlace,
  onOpenPlaceDetail,
  travelMode = false,
  routePoints = [],
}: MapDomViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;
  const onOpenPlaceDetailRef = useRef(onOpenPlaceDetail);
  onOpenPlaceDetailRef.current = onOpenPlaceDetail;
  const centerRef = useRef(center);
  centerRef.current = center;
  const placesRef = useRef(places);
  placesRef.current = places;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const manager = MapManager.getInstance();
    manager.setTravelMode(travelMode);
    manager.setOnSelectPlace((id) => onSelectPlaceRef.current(id));
    manager.setOnOpenPlaceDetail((id) => onOpenPlaceDetailRef.current?.(id));
    if (travelMode) manager.disableMapFabs();
    const first = placesRef.current[0]?.location ?? centerRef.current;
    manager.setMapCenter(first.latitude, first.longitude, placesRef.current.length ? 14 : 12);
    void manager.attach(host, first);
    return () => manager.detach();
    // 지도는 처음 한 번만 만듭니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    MapManager.getInstance().setOnSelectPlace((id) => onSelectPlaceRef.current(id));
    MapManager.getInstance().setOnOpenPlaceDetail((id) => onOpenPlaceDetailRef.current?.(id));
  }, [onSelectPlace, onOpenPlaceDetail]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) MapManager.getInstance().clickPlaceMarker(id);
    };
    window.addEventListener('noeul-open-place-info', onOpen);
    return () => window.removeEventListener('noeul-open-place-info', onOpen);
  }, []);

  useEffect(() => {
    MapManager.getInstance().setPlaces(places);
  }, [places]);

  useEffect(() => {
    MapManager.getInstance().setRoute(routePoints);
  }, [routePoints]);

  useEffect(() => {
    MapManager.getInstance().setSelectedPlace(selectedPlaceId);
  }, [selectedPlaceId]);

  return <div ref={hostRef} className="relative z-0 w-full h-full min-h-0 map-canvas" />;
}
