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
  onLocateMe?: () => void;
  onOpenSos?: () => void;
  locateBusy?: boolean;
  weakGps?: boolean;
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
  onLocateMe,
  onOpenSos,
  locateBusy = false,
  weakGps = false,
}: MapDomViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;
  const onLocateMeRef = useRef(onLocateMe);
  onLocateMeRef.current = onLocateMe;
  const onOpenSosRef = useRef(onOpenSos);
  onOpenSosRef.current = onOpenSos;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const manager = MapManager.getInstance();
    manager.setOnSelectPlace((id) => onSelectPlaceRef.current(id));
    if (onLocateMeRef.current && onOpenSosRef.current) {
      manager.setMapFabs({
        onLocateMe: () => onLocateMeRef.current?.(),
        onOpenSos: () => onOpenSosRef.current?.(),
        locateBusy,
        weakGps,
      });
    } else {
      manager.disableMapFabs();
    }
    void manager.attach(host, center);
    return () => manager.detach();
    // 지도는 처음 한 번만 만듭니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const manager = MapManager.getInstance();
    if (!onLocateMe || !onOpenSos) {
      manager.disableMapFabs();
      return;
    }
    manager.setMapFabs({
      onLocateMe: () => onLocateMeRef.current?.(),
      onOpenSos: () => onOpenSosRef.current?.(),
      locateBusy,
      weakGps,
    });
  }, [onLocateMe, onOpenSos, locateBusy, weakGps]);

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

  return <div ref={hostRef} className="relative z-0 w-full h-full min-h-[400px] map-canvas" />;
}
