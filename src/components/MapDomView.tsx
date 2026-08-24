'use client';

import { useEffect, useRef } from 'react';
import { PlaceItem, PlaceLocation } from '@/types/place';
import { MapManager } from '@/services/MapManager';

export const ARROW_ROTATION_OFFSETS = [0, 90, -90, 180] as const;
export type { FollowCameraDebug } from '@/store/useLocationStore';

type MapDomViewProps = {
  center: PlaceLocation;
  places: PlaceItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  routePoints?: PlaceLocation[];
  returnPoint?: PlaceLocation | null;
  userLocation?: PlaceLocation | null;
};

/**
 * 지도 DOM만 붙입니다. 카메라 이동(panTo/fitBounds/moveCamera)은 하지 않습니다.
 */
export default function MapDomView({
  center,
  places,
  selectedPlaceId,
  onSelectPlace,
  routePoints = [],
  returnPoint = null,
  userLocation = null,
}: MapDomViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const manager = MapManager.getInstance();
    manager.setOnSelectPlace((id) => onSelectPlaceRef.current(id));
    void manager.attach(host, center);
    return () => manager.detach();
    // 지도는 처음 한 번만 만듭니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    MapManager.getInstance().setOnSelectPlace((id) => onSelectPlaceRef.current(id));
  }, [onSelectPlace]);

  useEffect(() => {
    MapManager.getInstance().setPlaces(places);
  }, [places]);

  useEffect(() => {
    MapManager.getInstance().setSelectedPlace(selectedPlaceId);
  }, [selectedPlaceId]);

  useEffect(() => {
    MapManager.getInstance().setRoute(routePoints);
  }, [routePoints]);

  useEffect(() => {
    MapManager.getInstance().setReturnPoint(returnPoint, userLocation);
  }, [returnPoint, userLocation]);

  return <div ref={hostRef} className="map-canvas w-full h-full min-h-[400px]" />;
}
