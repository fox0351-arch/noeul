'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { PlaceItem, PlaceLocation } from '@/types/place';
import { destinationPoint } from '@/lib/geo';

const USER_MARKER_SCALE = 12;
/** 현재 위치의 약 1.5배 */
const RETURN_MARKER_SCALE = 18;
const ROUTE_STROKE_COLOR = '#FF0000';
const ROUTE_STROKE_WEIGHT = 6;
const ROUTE_STROKE_OPACITY = 0.7;
const RETURN_STROKE_COLOR = '#00FF66';
const RETURN_STROKE_WEIGHT = 12;
const WALK_ZOOM = 18;
export const ARROW_ROTATION_OFFSETS = [0, 90, -90, 180] as const;

export type FollowCameraDebug = {
  followMode: boolean;
  setCenterCount: number;
  panToCount: number;
  moveCameraCount: number;
  fitBoundsCount: number;
  lat: number;
  lng: number;
  mapCenterLat: number | null;
  mapCenterLng: number | null;
  centerDeltaM: number | null;
  heading: number | null;
  arrowApplied: number | null;
  arrowOffset: number;
};

type CameraCounts = {
  setCenter: number;
  panTo: number;
  moveCamera: number;
  fitBounds: number;
};

function lookAheadPoint(
  user: PlaceLocation,
  headingDeg: number | null,
  mapHeightPx: number,
  zoom: number
): google.maps.LatLngLiteral {
  const heading = headingDeg != null && Number.isFinite(headingDeg) ? headingDeg : 0;
  const metersPerPixel =
    (156543.03392 * Math.cos((user.latitude * Math.PI) / 180)) / 2 ** zoom;
  const shiftM = Math.max(22, (mapHeightPx / 6) * metersPerPixel);
  const ahead = destinationPoint(user, heading, shiftM);
  return { lat: ahead.latitude, lng: ahead.longitude };
}

function applyNavCamera(
  map: google.maps.Map,
  user: PlaceLocation,
  headingUp: boolean,
  headingDeg: number | null,
  counts: CameraCounts
): { lat: number; lng: number } {
  const zoom = WALK_ZOOM;
  const heading =
    headingUp && headingDeg != null && Number.isFinite(headingDeg) ? headingDeg : 0;
  const mapH = map.getDiv()?.clientHeight || 640;
  const target = headingUp
    ? lookAheadPoint(user, heading, mapH, zoom)
    : { lat: user.latitude, lng: user.longitude };
  const latLng = new google.maps.LatLng(target.lat, target.lng);
  const proto = google.maps.Map.prototype as google.maps.Map & {
    moveCamera?: (opts: {
      center: google.maps.LatLngLiteral;
      heading?: number;
      zoom?: number;
      tilt?: number;
    }) => void;
    panTo?: (latLng: google.maps.LatLng | google.maps.LatLngLiteral) => void;
  };

  try {
    map.setOptions({
      center: latLng,
      zoom,
      heading,
      tilt: 0,
    });
  } catch {
    // setOptions 미지원
  }

  try {
    map.setCenter(latLng);
    counts.setCenter += 1;
  } catch {
    // setCenter 실패
  }

  const panTo = (typeof map.panTo === 'function' ? map.panTo : proto.panTo)?.bind(map);
  if (typeof panTo === 'function') {
    try {
      panTo(latLng);
      counts.panTo += 1;
    } catch {
      // panTo 실패
    }
  }

  const camera = map as google.maps.Map & {
    moveCamera?: (opts: {
      center: google.maps.LatLngLiteral;
      heading?: number;
      zoom?: number;
      tilt?: number;
    }) => void;
  };
  const moveCamera =
    typeof camera.moveCamera === 'function' ? camera.moveCamera.bind(map) : proto.moveCamera?.bind(map);
  if (typeof moveCamera === 'function') {
    try {
      moveCamera({
        center: { lat: target.lat, lng: target.lng },
        zoom,
        heading,
        tilt: 0,
      });
      counts.moveCamera += 1;
    } catch {
      // moveCamera 실패
    }
  }

  try {
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: user.latitude, lng: user.longitude });
    bounds.extend(target);
    map.fitBounds(bounds, {
      top: Math.round(mapH * 0.1),
      right: 80,
      bottom: Math.round(mapH * 0.45),
      left: 16,
    });
    counts.fitBounds += 1;
    const fittedZoom = map.getZoom() ?? zoom;
    if (fittedZoom > 18) map.setZoom(18);
    if (fittedZoom < 16) map.setZoom(17);
  } catch {
    // fitBounds 실패
  }

  const after = map.getCenter();
  return {
    lat: after?.lat() ?? target.lat,
    lng: after?.lng() ?? target.lng,
  };
}

function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function headingArrowIcon(rotation: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 7,
    fillColor: '#1d4ed8',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    rotation,
    anchor: new google.maps.Point(0, 2.4),
  };
}

interface GoogleMapViewerProps {
  center: PlaceLocation;
  places: PlaceItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  routePoints?: PlaceLocation[];
  userLocation?: PlaceLocation | null;
  headingDeg?: number | null;
  followMode?: boolean;
  /** 진행 방향이 화면 위쪽 (카카오/티맵 길안내) */
  headingUp?: boolean;
  /** 저속에서는 고정된 지도 회전각 */
  mapHeadingDeg?: number | null;
  /** 값이 바뀔 때마다 현재 위치로 이동하고 줌 17 */
  recenterRequestId?: number;
  /** 경로 이탈 시 가장 가까운 루트 복귀 지점 */
  returnPoint?: PlaceLocation | null;
  onFollowCamera?: (info: FollowCameraDebug) => void;
  arrowRotationOffset?: number;
}

export default function GoogleMapViewer({
  center,
  places,
  selectedPlaceId,
  onSelectPlace,
  routePoints = [],
  userLocation = null,
  headingDeg = null,
  followMode = false,
  headingUp = false,
  mapHeadingDeg = null,
  recenterRequestId = 0,
  returnPoint = null,
  onFollowCamera,
  arrowRotationOffset = 0,
}: GoogleMapViewerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const headingMarkerRef = useRef<google.maps.Marker | null>(null);
  const returnMarkerRef = useRef<google.maps.Marker | null>(null);
  const returnLineRef = useRef<google.maps.Polyline | null>(null);
  const returnHaloRef = useRef<google.maps.Circle | null>(null);
  const returnPulseTimerRef = useRef<number | null>(null);
  const followModeRef = useRef(followMode);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onFollowCameraRef = useRef(onFollowCamera);
  const panToCountRef = useRef(0);
  const setCenterCountRef = useRef(0);
  const moveCameraCountRef = useRef(0);
  const fitBoundsCountRef = useRef(0);
  const lastUserPosRef = useRef<google.maps.LatLngLiteral | null>(null);
  const prevFollowRef = useRef(false);
  const userDragPauseUntilRef = useRef(0);
  followModeRef.current = followMode;
  onSelectPlaceRef.current = onSelectPlace;
  onFollowCameraRef.current = onFollowCamera;
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      v: 'weekly',
    });

    const initMap = async () => {
      try {
        await importLibrary('maps');
        if (!mapRef.current) return;

        const mapOptions: google.maps.MapOptions = {
          center: { lat: center.latitude, lng: center.longitude },
          zoom: 13,
          heading: 0,
          tilt: 0,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          rotateControl: true,
          gestureHandling: 'greedy',
        };
        const vector = google.maps.RenderingType?.VECTOR;
        if (vector) {
          mapOptions.renderingType = vector;
        }

        const map = new google.maps.Map(mapRef.current, mapOptions);
        map.addListener('dragstart', () => {
          userDragPauseUntilRef.current = Date.now() + 8000;
        });

        mapInstanceRef.current = map;
        setMapReady(true);
      } catch (err) {
        console.error('Google Maps 로드 실패:', err);
      }
    };

    initMap();
  }, []);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    places.forEach((place, index) => {
      const position = { lat: place.location.latitude, lng: place.location.longitude };
      bounds.extend(position);
      hasBounds = true;

      const marker = new google.maps.Marker({
        position,
        map,
        title: `${index + 1}. ${place.name}`,
        label: {
          text: String(index + 1),
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '11px',
        },
        icon: {
          url: place.addedManually
            ? 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png'
            : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          labelOrigin: new google.maps.Point(16, 10),
        },
      });

      marker.addListener('click', () => {
        onSelectPlaceRef.current(place.id);
      });

      markersRef.current.push(marker);
    });

    if (routePoints.length >= 2) {
      const path = routePoints.map((point) => ({
        lat: point.latitude,
        lng: point.longitude,
      }));
      path.forEach((point) => {
        bounds.extend(point);
        hasBounds = true;
      });

      polylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: ROUTE_STROKE_COLOR,
        strokeOpacity: ROUTE_STROKE_OPACITY,
        strokeWeight: ROUTE_STROKE_WEIGHT,
        map,
        zIndex: 2,
      });
    }

    if (hasBounds && !followModeRef.current) {
      map.fitBounds(bounds);
    }
  }, [places, routePoints, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;

    if (!userLocation) {
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      headingMarkerRef.current?.setMap(null);
      headingMarkerRef.current = null;
      return;
    }

    const position = { lat: userLocation.latitude, lng: userLocation.longitude };
    lastUserPosRef.current = position;

    if (followMode && !prevFollowRef.current) {
      setCenterCountRef.current = 0;
      panToCountRef.current = 0;
      moveCameraCountRef.current = 0;
      fitBoundsCountRef.current = 0;
      userDragPauseUntilRef.current = 0;
    }
    prevFollowRef.current = followMode;

    if (!userMarkerRef.current) {
      userMarkerRef.current = new google.maps.Marker({
        position,
        map,
        title: '현재 위치',
        zIndex: 10,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: USER_MARKER_SCALE,
          fillColor: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });
    } else {
      userMarkerRef.current.setPosition(position);
      userMarkerRef.current.setMap(map);
    }

    const arrowApplied =
      headingDeg != null && Number.isFinite(headingDeg)
        ? (((headingDeg + arrowRotationOffset) % 360) + 360) % 360
        : 0;

    if (headingDeg != null && Number.isFinite(headingDeg)) {
      if (!headingMarkerRef.current) {
        headingMarkerRef.current = new google.maps.Marker({
          position,
          map,
          clickable: false,
          optimized: false,
          zIndex: 11,
          icon: headingArrowIcon(arrowApplied),
        });
      } else {
        headingMarkerRef.current.setPosition(position);
        headingMarkerRef.current.setIcon(headingArrowIcon(arrowApplied));
        headingMarkerRef.current.setMap(map);
      }
    }

    if (followMode && Date.now() >= userDragPauseUntilRef.current) {
      const counts = {
        setCenter: setCenterCountRef.current,
        panTo: panToCountRef.current,
        moveCamera: moveCameraCountRef.current,
        fitBounds: fitBoundsCountRef.current,
      };
      const after = applyNavCamera(map, userLocation, headingUp, mapHeadingDeg, counts);
      setCenterCountRef.current = counts.setCenter;
      panToCountRef.current = counts.panTo;
      moveCameraCountRef.current = counts.moveCamera;
      fitBoundsCountRef.current = counts.fitBounds;
      const debug: FollowCameraDebug = {
        followMode: true,
        setCenterCount: counts.setCenter,
        panToCount: counts.panTo,
        moveCameraCount: counts.moveCamera,
        fitBoundsCount: counts.fitBounds,
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        mapCenterLat: after.lat,
        mapCenterLng: after.lng,
        centerDeltaM: Math.round(
          metersBetween(
            { lat: userLocation.latitude, lng: userLocation.longitude },
            { lat: after.lat, lng: after.lng }
          )
        ),
        heading: headingDeg,
        arrowApplied,
        arrowOffset: arrowRotationOffset,
      };
      console.info('[노을-follow] camera', debug);
      onFollowCameraRef.current?.(debug);
    }
  }, [
    userLocation,
    headingDeg,
    followMode,
    headingUp,
    mapHeadingDeg,
    mapReady,
    arrowRotationOffset,
  ]);

  useEffect(() => {
    if (!recenterRequestId || !mapReady || !mapInstanceRef.current || !userLocation) return;
    const map = mapInstanceRef.current;
    userDragPauseUntilRef.current = 0;
    const counts = {
      setCenter: setCenterCountRef.current,
      panTo: panToCountRef.current,
      moveCamera: moveCameraCountRef.current,
      fitBounds: fitBoundsCountRef.current,
    };
    applyNavCamera(map, userLocation, headingUp, mapHeadingDeg, counts);
    setCenterCountRef.current = counts.setCenter;
    panToCountRef.current = counts.panTo;
    moveCameraCountRef.current = counts.moveCamera;
    fitBoundsCountRef.current = counts.fitBounds;
  }, [recenterRequestId, mapReady, userLocation, headingUp, mapHeadingDeg]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;

    const stopPulse = () => {
      if (returnPulseTimerRef.current != null) {
        window.clearInterval(returnPulseTimerRef.current);
        returnPulseTimerRef.current = null;
      }
    };

    const clearReturn = () => {
      stopPulse();
      returnMarkerRef.current?.setMap(null);
      returnMarkerRef.current = null;
      returnHaloRef.current?.setMap(null);
      returnHaloRef.current = null;
      returnLineRef.current?.setMap(null);
      returnLineRef.current = null;
    };

    if (!returnPoint || !userLocation) {
      clearReturn();
      return;
    }

    const returnPos = { lat: returnPoint.latitude, lng: returnPoint.longitude };
    const userPos = { lat: userLocation.latitude, lng: userLocation.longitude };

    if (!returnMarkerRef.current) {
      returnMarkerRef.current = new google.maps.Marker({
        position: returnPos,
        map,
        title: '복귀 지점',
        zIndex: 41,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: RETURN_MARKER_SCALE,
          fillColor: RETURN_STROKE_COLOR,
          fillOpacity: 1,
          strokeColor: '#003322',
          strokeWeight: 3,
        },
      });
    } else {
      returnMarkerRef.current.setPosition(returnPos);
      returnMarkerRef.current.setMap(map);
    }

    if (!returnHaloRef.current) {
      returnHaloRef.current = new google.maps.Circle({
        center: returnPos,
        map,
        radius: 8,
        fillColor: RETURN_STROKE_COLOR,
        fillOpacity: 0.28,
        strokeColor: '#00FF66',
        strokeOpacity: 0.9,
        strokeWeight: 3,
        zIndex: 39,
        clickable: false,
      });
    } else {
      returnHaloRef.current.setCenter(returnPos);
      returnHaloRef.current.setMap(map);
    }

    if (returnPulseTimerRef.current == null) {
      let tick = 0;
      returnPulseTimerRef.current = window.setInterval(() => {
        tick += 1;
        const wave = (Math.sin(tick / 8) + 1) / 2;
        const scale = RETURN_MARKER_SCALE - 1.5 + wave * 3;
        returnMarkerRef.current?.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: RETURN_STROKE_COLOR,
          fillOpacity: 0.85 + wave * 0.15,
          strokeColor: '#003322',
          strokeWeight: 3,
        });
        returnHaloRef.current?.setOptions({
          radius: 6 + wave * 5,
          fillOpacity: 0.12 + wave * 0.18,
          strokeOpacity: 0.45 + wave * 0.25,
        });
      }, 180);
    }

    const lineOptions: google.maps.PolylineOptions = {
      path: [userPos, returnPos],
      geodesic: true,
      strokeColor: RETURN_STROKE_COLOR,
      strokeOpacity: 1,
      strokeWeight: RETURN_STROKE_WEIGHT,
      zIndex: 40,
      map,
      icons: [
        {
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: RETURN_STROKE_COLOR,
            fillOpacity: 1,
            strokeColor: '#003322',
            strokeWeight: 1,
          },
          offset: '12px',
          repeat: '28px',
        },
      ],
    };

    if (!returnLineRef.current) {
      returnLineRef.current = new google.maps.Polyline(lineOptions);
    } else {
      returnLineRef.current.setOptions(lineOptions);
    }
  }, [returnPoint, userLocation, mapReady]);

  useEffect(() => {
    if (!selectedPlaceId || !mapInstanceRef.current || followMode) return;
    const targetIndex = places.findIndex((p) => p.id === selectedPlaceId);
    if (targetIndex !== -1 && markersRef.current[targetIndex]) {
      const marker = markersRef.current[targetIndex];
      mapInstanceRef.current.panTo(marker.getPosition()!);
      mapInstanceRef.current.setZoom(15);
    }
  }, [selectedPlaceId, places, followMode]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current as google.maps.Map & { setHeading?: (heading: number) => void };
    if (!followMode) {
      try {
        map.setHeading?.(0);
      } catch {
        // heading 미지원
      }
    }
  }, [followMode, mapReady]);

  useEffect(() => {
    return () => {
      if (returnPulseTimerRef.current != null) {
        window.clearInterval(returnPulseTimerRef.current);
        returnPulseTimerRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef} className="map-canvas w-full h-full min-h-[400px]" />;
}
