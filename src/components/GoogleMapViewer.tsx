'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { destinationPoint } from '@/lib/geo';
import { PlaceItem, PlaceLocation } from '@/types/place';

const USER_SCREEN_FRACTION_FROM_BOTTOM = 0.35;

const ROUTE_STROKE_COLOR = '#FF0000';
const ROUTE_STROKE_WEIGHT = 6;
const ROUTE_STROKE_OPACITY = 0.7;
const RETURN_STROKE_COLOR = '#00FF66';
const RETURN_STROKE_WEIGHT = 12;
/** Google Maps CIRCLE scale is radius in px → 12 = 직경 24px */
/** Google Maps CIRCLE scale is radius in px → 12 = 직경 24px */
const USER_MARKER_SCALE = 12;
/** 현장 표시 기준 16의 150% */
const RETURN_MARKER_SCALE = 24;

function offsetCenterForNav(
  user: PlaceLocation,
  map: google.maps.Map,
  headingDeg: number
): google.maps.LatLngLiteral {
  const zoom = map.getZoom() ?? 17;
  const height = map.getDiv().offsetHeight || 400;
  const metersPerPixel =
    (156543.03392 * Math.cos((user.latitude * Math.PI) / 180)) / 2 ** zoom;
  const offsetM = (0.5 - USER_SCREEN_FRACTION_FROM_BOTTOM) * height * metersPerPixel;
  const ahead = destinationPoint(user, headingDeg, Math.max(8, offsetM));
  return { lat: ahead.latitude, lng: ahead.longitude };
}

function applyNavCamera(
  map: google.maps.Map,
  user: PlaceLocation,
  headingUp: boolean,
  mapHeadingDeg: number | null
) {
  const travelHeading =
    headingUp && mapHeadingDeg != null && Number.isFinite(mapHeadingDeg) ? mapHeadingDeg : 0;
  const center = offsetCenterForNav(user, map, travelHeading);
  const zoom = map.getZoom() ?? 17;

  const camera = map as google.maps.Map & {
    moveCamera?: (options: { center: google.maps.LatLngLiteral; heading?: number; zoom?: number }) => void;
    setHeading?: (heading: number) => void;
  };

  try {
    if (typeof camera.moveCamera === 'function') {
      camera.moveCamera({
        center,
        heading: travelHeading,
        zoom,
      });
      return;
    }
  } catch {
    // raster 지도는 heading 미지원일 수 있음
  }

  map.panTo(center);
  try {
    camera.setHeading?.(travelHeading);
  } catch {
    // heading 미지원
  }
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
          rotateControl: false,
        };
        const renderingType = google.maps.RenderingType?.VECTOR;
        if (renderingType) {
          mapOptions.renderingType = renderingType;
        }

        const map = new google.maps.Map(mapRef.current, mapOptions);

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
        onSelectPlace(place.id);
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

    if (hasBounds && !followMode) {
      map.fitBounds(bounds);
    }
  }, [places, onSelectPlace, routePoints, mapReady, followMode]);

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

    const arrowRotation =
      (headingUp ? mapHeadingDeg ?? headingDeg : headingDeg) ?? 0;

    if ((headingDeg != null && Number.isFinite(headingDeg)) || (headingUp && mapHeadingDeg != null)) {
      if (!headingMarkerRef.current) {
        headingMarkerRef.current = new google.maps.Marker({
          position,
          map,
          clickable: false,
          zIndex: 11,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 7,
            fillColor: '#1d4ed8',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: arrowRotation,
            anchor: new google.maps.Point(0, 2.4),
          },
        });
      } else {
        headingMarkerRef.current.setPosition(position);
        headingMarkerRef.current.setIcon({
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 7,
          fillColor: '#1d4ed8',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          rotation: arrowRotation,
          anchor: new google.maps.Point(0, 2.4),
        });
        headingMarkerRef.current.setMap(map);
      }
    }

    if (followMode) {
      applyNavCamera(map, userLocation, headingUp, mapHeadingDeg);
    }
  }, [userLocation, headingDeg, followMode, headingUp, mapHeadingDeg, mapReady]);

  useEffect(() => {
    if (!recenterRequestId || !mapReady || !mapInstanceRef.current || !userLocation) return;
    const map = mapInstanceRef.current;
    map.setZoom(17);
    applyNavCamera(map, userLocation, headingUp, mapHeadingDeg);
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
          strokeWeight: 4,
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
        radius: 14,
        fillColor: RETURN_STROKE_COLOR,
        fillOpacity: 0.35,
        strokeColor: '#00FF66',
        strokeOpacity: 1,
        strokeWeight: 4,
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
        const wave = (Math.sin(tick / 3) + 1) / 2;
        const scale = RETURN_MARKER_SCALE + wave * 10;
        returnMarkerRef.current?.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: RETURN_STROKE_COLOR,
          fillOpacity: 1,
          strokeColor: '#003322',
          strokeWeight: 4,
        });
        returnHaloRef.current?.setOptions({
          radius: 10 + wave * 16,
          fillOpacity: 0.22 + wave * 0.28,
          strokeOpacity: 0.7 + wave * 0.3,
        });
      }, 90);
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
    if (!mapReady || !mapInstanceRef.current || followMode) return;
    const map = mapInstanceRef.current as google.maps.Map & { setHeading?: (heading: number) => void };
    try {
      map.setHeading?.(0);
    } catch {
      // heading 미지원
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
