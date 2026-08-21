'use client';

import { useEffect, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { PlaceItem, PlaceLocation } from '@/types/place';

interface GoogleMapViewerProps {
  center: PlaceLocation;
  places: PlaceItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
}

export default function GoogleMapViewer({
  center,
  places,
  selectedPlaceId,
  onSelectPlace,
}: GoogleMapViewerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    // 최신 구글 지도 로더 설정
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
        infoWindowRef.current = new google.maps.InfoWindow();
      } catch (err) {
        console.error('Google Maps 로드 실패:', err);
      }
    };

    initMap();
  }, []);

  // 장소 목록이 바뀌면 마커를 지도에 표시
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (places.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    places.forEach((place) => {
      const position = { lat: place.location.latitude, lng: place.location.longitude };
      bounds.extend(position);

      const marker = new google.maps.Marker({
        position,
        map,
        title: place.name,
        icon: place.addedManually
          ? 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png'
          : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
      });

      marker.addListener('click', () => {
        onSelectPlace(place.id);
        if (infoWindowRef.current) {
          infoWindowRef.current.setContent(`
            <div style="padding: 6px; font-family: sans-serif;">
              <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #1e293b;">${place.name}</h4>
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">${place.address}</p>
              <p style="margin: 0; font-size: 12px; color: #f59e0b;">★ ${place.rating ?? '평점 없음'}</p>
            </div>
          `);
          infoWindowRef.current.open(map, marker);
        }
      });

      markersRef.current.push(marker);
    });

    map.fitBounds(bounds);
  }, [places, onSelectPlace]);

  // 왼쪽 목록에서 장소를 눌렀을 때 해당 핀으로 이동
  useEffect(() => {
    if (!selectedPlaceId || !mapInstanceRef.current || !infoWindowRef.current) return;
    const targetIndex = places.findIndex((p) => p.id === selectedPlaceId);
    if (targetIndex !== -1 && markersRef.current[targetIndex]) {
      const marker = markersRef.current[targetIndex];
      const place = places[targetIndex];
      mapInstanceRef.current.panTo(marker.getPosition()!);
      mapInstanceRef.current.setZoom(15);
      infoWindowRef.current.setContent(`
        <div style="padding: 6px; font-family: sans-serif;">
          <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #1e293b;">${place.name}</h4>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">${place.address}</p>
          <p style="margin: 0; font-size: 12px; color: #f59e0b;">★ ${place.rating ?? '평점 없음'}</p>
        </div>
      `);
      infoWindowRef.current.open(mapInstanceRef.current, marker);
    }
  }, [selectedPlaceId, places]);

  return <div ref={mapRef} className="w-full h-full min-h-[400px]" />;
}