'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { PlaceItem, PlaceLocation } from '@/types/place';

const ROUTE_STROKE_COLOR = '#FF0000';
const ROUTE_STROKE_WEIGHT = 8;
/** Google Maps CIRCLE scale is radius in px → 12 = 직경 24px */
const USER_MARKER_SCALE = 12;

interface GoogleMapViewerProps {
  center: PlaceLocation;
  places: PlaceItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  routePoints?: PlaceLocation[];
  userLocation?: PlaceLocation | null;
  headingDeg?: number | null;
  followMode?: boolean;
  /** 값이 바뀔 때마다 현재 위치로 이동하고 줌 17 */
  recenterRequestId?: number;
  /** 30m 이탈 시 가장 가까운 루트 복귀 지점 */
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

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: center.latitude, lng: center.longitude },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
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
        strokeOpacity: 1,
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

    if (headingDeg != null && Number.isFinite(headingDeg)) {
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
            rotation: headingDeg,
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
          rotation: headingDeg,
          anchor: new google.maps.Point(0, 2.4),
        });
        headingMarkerRef.current.setMap(map);
      }
    }

    if (followMode) {
      map.panTo(position);
    }
  }, [userLocation, headingDeg, followMode, mapReady]);

  useEffect(() => {
    if (!recenterRequestId || !mapReady || !mapInstanceRef.current || !userLocation) return;
    const map = mapInstanceRef.current;
    map.panTo({ lat: userLocation.latitude, lng: userLocation.longitude });
    map.setZoom(17);
  }, [recenterRequestId, mapReady, userLocation]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;

    const clearReturn = () => {
      returnMarkerRef.current?.setMap(null);
      returnMarkerRef.current = null;
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
        zIndex: 9,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#16a34a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });
    } else {
      returnMarkerRef.current.setPosition(returnPos);
      returnMarkerRef.current.setMap(map);
    }

    const lineOptions: google.maps.PolylineOptions = {
      path: [userPos, returnPos],
      geodesic: true,
      strokeColor: '#16a34a',
      strokeOpacity: 0,
      strokeWeight: 8,
      zIndex: 8,
      map,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            strokeColor: '#16a34a',
            strokeWeight: 8,
            scale: 1,
          },
          offset: '0',
          repeat: '22px',
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

  return <div ref={mapRef} className="w-full h-full min-h-[400px]" />;
}
