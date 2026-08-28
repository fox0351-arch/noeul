'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { loadLastGps } from '@/lib/lastGps';
import type { TravelMapData, TravelMapMarkerKind } from '@/types/travelMapOverlay';

const KIND_COLOR: Record<TravelMapMarkerKind, string> = {
  destination: '#7c3aed',
  parking: '#475569',
  toilet: '#0f766e',
  restaurant: '#ea580c',
  cafe: '#a16207',
};

const KIND_LABEL: Record<TravelMapMarkerKind, string> = {
  destination: '추정 장소',
  parking: '주차장',
  toilet: '화장실',
  restaurant: '맛집',
  cafe: '카페',
};

type TravelPlaceMapProps = {
  data?: TravelMapData | null;
  error?: string | null;
  routePath?: { lat: number; lng: number }[] | null;
};

function pin(color: string, scale = 9): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  };
}

export default function TravelPlaceMap({ data, error, routePath }: TravelPlaceMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const [mapError, setMapError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => setFullscreen(Boolean(data) && media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [data]);

  useEffect(() => {
    if (!fullscreen) {
      document.body.style.overflow = '';
      return;
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!data || !hostRef.current) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setMapError('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY가 없어 지도를 표시할 수 없습니다.');
      return;
    }

    let cancelled = false;
    const watchHolder: { id?: number } = {};
    const host = hostRef.current;

    void (async () => {
      try {
        setOptions({ key, v: 'weekly' });
        await importLibrary('maps');
        if (cancelled || !host.isConnected) return;

        const map =
          mapRef.current ??
          new google.maps.Map(host, {
            center: { lat: data.center.lat, lng: data.center.lng },
            zoom: 14,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy',
          });
        mapRef.current = map;
        map.setCenter({ lat: data.center.lat, lng: data.center.lng });

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];
        const bounds = new google.maps.LatLngBounds();
        const info = new google.maps.InfoWindow();

        for (const item of data.markers ?? []) {
          const marker = new google.maps.Marker({
            map,
            position: { lat: item.lat, lng: item.lng },
            title: `${KIND_LABEL[item.kind]} · ${item.name}`,
            icon: pin(KIND_COLOR[item.kind], item.kind === 'destination' ? 11 : 8),
          });
          marker.addListener('click', () => {
            info.setContent(
              `<strong>${KIND_LABEL[item.kind]}</strong><div>${item.name}</div>`
            );
            info.open({ map, anchor: marker });
          });
          markersRef.current.push(marker);
          bounds.extend({ lat: item.lat, lng: item.lng });
        }

        if (data.markers?.length) map.fitBounds(bounds, 48);

        lineRef.current?.setMap(null);
        const path = (routePath ?? []).filter((point) => point?.lat && point?.lng);
        if (path.length >= 2) {
          lineRef.current = new google.maps.Polyline({
            map,
            path,
            strokeColor: '#7c3aed',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
          path.forEach((point) => bounds.extend(point));
          map.fitBounds(bounds, 48);
        }

        const last = loadLastGps();
        const placeUser = (lat: number, lng: number) => {
          if (!userMarkerRef.current) {
            userMarkerRef.current = new google.maps.Marker({
              map,
              title: '현재 위치',
              icon: pin('#2563eb', 12),
              zIndex: 999,
            });
          }
          userMarkerRef.current.setPosition({ lat, lng });
        };
        if (last) placeUser(last.latitude, last.longitude);
        if (navigator.geolocation) {
          const watch = navigator.geolocation.watchPosition(
            (position) => placeUser(position.coords.latitude, position.coords.longitude),
            () => undefined,
            { enableHighAccuracy: true, maximumAge: 10_000 }
          );
          watchHolder.id = watch;
        }
        setMapError('');
      } catch (cause) {
        setMapError(cause instanceof Error ? cause.message : '지도를 그리지 못했습니다.');
      }
    })();

    return () => {
      cancelled = true;
      if (watchHolder.id != null) navigator.geolocation.clearWatch(watchHolder.id);
    };
  }, [data, routePath]);

  if (error || mapError) {
    return (
      <section className="p-4 mt-4 bg-white border border-red-200 shadow-md rounded-2xl lg:mt-0">
        <h3 className="text-lg font-black text-red-800">지도를 표시하지 못했습니다</h3>
        <p className="mt-2 leading-relaxed text-red-700">{error || mapError}</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <>
      {!fullscreen && (
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="px-4 font-bold text-white bg-sky-700 rounded-lg min-h-11 lg:hidden"
        >
          전체 화면 지도
        </button>
      )}
      <section
        className={
          fullscreen
            ? 'fixed inset-0 z-50 flex flex-col bg-white'
            : 'relative mt-4 overflow-hidden bg-white shadow-md rounded-2xl lg:mt-0 min-h-[320px] lg:min-h-[520px] h-[50vh] lg:h-auto'
        }
      >
        <div className="flex items-center justify-between gap-2 p-3">
          <div>
            <p className="text-sm font-bold text-sky-700">여행 지도</p>
            <p className="text-xs text-slate-500">갈맷길 GPS 우선 · Directions 동선</p>
          </div>
          {fullscreen && (
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="px-3 font-bold bg-slate-100 rounded-lg min-h-11"
            >
              닫기
            </button>
          )}
        </div>
        <div ref={hostRef} className="flex-1 w-full min-h-[280px] lg:min-h-[460px]" />
        <div className="flex flex-wrap gap-2 p-3 text-xs font-bold text-slate-600">
          <span className="text-violet-700">● 추정 장소</span>
          <span className="text-blue-700">● 현재 위치</span>
          <span>● 주차장</span>
          <span className="text-teal-700">● 화장실</span>
          <span className="text-orange-700">● 맛집</span>
          <span className="text-amber-700">● 카페</span>
        </div>
      </section>
    </>
  );
}
