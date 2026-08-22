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

    places.forEach((place, index) => {
      const position = { lat: place.location.latitude, lng: place.location.longitude };
      bounds.extend(position);

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

    map.fitBounds(bounds);
  }, [places, onSelectPlace]);

  // 왼쪽 목록에서 장소를 눌렀을 때 해당 핀으로 이동
  useEffect(() => {
    if (!selectedPlaceId || !mapInstanceRef.current) return;
    const targetIndex = places.findIndex((p) => p.id === selectedPlaceId);
    if (targetIndex !== -1 && markersRef.current[targetIndex]) {
      const marker = markersRef.current[targetIndex];
      mapInstanceRef.current.panTo(marker.getPosition()!);
      mapInstanceRef.current.setZoom(15);
    }
  }, [selectedPlaceId, places]);

  return <div ref={mapRef} className="w-full h-full min-h-[400px]" />;
}