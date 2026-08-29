import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { destinationPoint } from '@/lib/geo';
import { PlaceItem, PlaceLocation } from '@/types/place';
import { campingShort, parkingShort, placeAmenity } from '@/lib/placeAmenity';
import { useLocationStore, type FollowCameraDebug } from '@/store/useLocationStore';

const WALK_ZOOM = 18;
const CAMERA_MIN_INTERVAL_MS = 200;
/** worker에서 안정화한 bearing을 카메라가 부드럽게 따라갑니다. */
const CAMERA_HEADING_LERP = 0.12;
const CAMERA_POSITION_LERP = 0.35;
const MAX_TRACK_POINTS = 3000;
const TRACK_MIN_STEP_M = 2;
const USER_MARKER_SCALE = 8;
const RETURN_MARKER_SCALE = 18;
const ROUTE_STROKE_COLOR = '#FF0000';
const ROUTE_STROKE_WEIGHT = 6;
const ROUTE_STROKE_OPACITY = 0.7;
const RETURN_STROKE_COLOR = '#00FF66';
const RETURN_STROKE_WEIGHT = 12;
const TRACK_STROKE_COLOR = '#2563eb';
const TRACK_STROKE_WEIGHT = 5;

type MapWithCamera = google.maps.Map & {
  moveCamera?: (opts: {
    center: google.maps.LatLngLiteral;
    heading?: number;
    zoom?: number;
    tilt?: number;
  }) => void;
};

export type RotationCameraLog = {
  timestamp: number;
  headingBeforeCall: number | null;
  headingAtCall: number | null;
  moveCameraCallCount: number;
  gpsBearing: number | null;
  renderedHeading: number;
  mapHeadingAfterCall: number | null;
  mapTiltAfterCall: number | null;
  renderingTypeAfterCall: string | null;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (((from + delta * t) % 360) + 360) % 360;
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

function lookAhead(
  user: PlaceLocation,
  headingDeg: number,
  mapHeightPx: number,
  zoom: number
): google.maps.LatLngLiteral {
  const metersPerPixel =
    (156543.03392 * Math.cos((user.latitude * Math.PI) / 180)) / 2 ** zoom;
  const shiftM = Math.max(22, (mapHeightPx / 6) * metersPerPixel);
  const ahead = destinationPoint(user, headingDeg, shiftM);
  return { lat: ahead.latitude, lng: ahead.longitude };
}

export function exitBrowserFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch((err) => console.log('Fullscreen exit error:', err));
  }
}

function userDotIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: USER_MARKER_SCALE,
    fillColor: '#4285F4',
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 3,
  };
}

/**
 * 구글 지도와 카메라를 React 바깥에서 다루는 싱글톤입니다.
 * 따라가기 카메라는 200ms마다 moveCamera만 호출합니다.
 */
export class MapManager {
  private static instance: MapManager | null = null;

  static getInstance(): MapManager {
    if (!MapManager.instance) MapManager.instance = new MapManager();
    return MapManager.instance;
  }

  readonly getRotationLogs = (): readonly RotationCameraLog[] => this.rotationLogs;

  readonly subscribeRotationLogs = (listener: () => void): (() => void) => {
    this.rotationLogListeners.add(listener);
    return () => this.rotationLogListeners.delete(listener);
  };

  private map: MapWithCamera | null = null;
  private routeLine: google.maps.Polyline | null = null;
  private trackLine: google.maps.Polyline | null = null;
  private returnLine: google.maps.Polyline | null = null;
  private trackPath: google.maps.LatLngLiteral[] = [];
  private placeMarkers: google.maps.Marker[] = [];
  private userMarker: google.maps.Marker | null = null;
  private returnMarker: google.maps.Marker | null = null;
  private returnHalo: google.maps.Circle | null = null;
  private returnPulseTimer: number | null = null;
  private onSelectPlace: ((id: string) => void) | null = null;
  private onOpenPlaceDetail: ((id: string) => void) | null = null;
  private infoWindow: google.maps.InfoWindow | null = null;
  private places: PlaceItem[] = [];
  private routePoints: PlaceLocation[] = [];
  private selectedPlaceId: string | null = null;
  private returnPoint: PlaceLocation | null = null;
  private returnUser: PlaceLocation | null = null;
  private loopId: number | null = null;
  private lastCameraAt = 0;
  private lastRecenterId = -1;
  private dragPauseUntil = 0;
  private renderedLat: number | null = null;
  private renderedLng: number | null = null;
  private renderedHeading = 0;
  private committedHeading: number | null = null;
  private rotationStarted = false;
  private rotationHoldLogged = false;
  private lastRotationLogAt = 0;
  private unsubscribeStore: (() => void) | null = null;
  private moveCameraCount = 0;
  private moveCameraInvocationCount = 0;
  private rotationLogs: readonly RotationCameraLog[] = [];
  private rotationLogListeners = new Set<() => void>();
  private fitBoundsCount = 0;
  private fabRoot: HTMLDivElement | null = null;
  private locateBtn: HTMLButtonElement | null = null;
  private locateBadge: HTMLSpanElement | null = null;
  private onLocateMe: (() => void) | null = null;
  private onOpenSos: (() => void) | null = null;
  private locateBusy = false;
  private weakGps = false;
  private showMapFabs = false;
  /** 홈 여행지도: GPS 카메라/유저 마커를 끄고 setCenter만 씁니다. */
  private travelMode = false;
  private pendingCenter: { lat: number; lng: number; zoom: number } | null = null;

  private constructor() {}

  setTravelMode(on: boolean): void {
    this.travelMode = on;
    if (!on) return;
    this.disableMapFabs();
    this.stopCameraLoop();
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.userMarker?.setMap(null);
    this.userMarker = null;
    this.trackLine?.setMap(null);
    this.trackLine = null;
    this.trackPath = [];
    useLocationStore.getState().setFollowMode(false);
  }

  getMapCenter(): { lat: number; lng: number } | null {
    const center = this.map?.getCenter();
    if (center) return { lat: center.lat(), lng: center.lng() };
    if (this.renderedLat != null && this.renderedLng != null) {
      return { lat: this.renderedLat, lng: this.renderedLng };
    }
    return this.pendingCenter ? { lat: this.pendingCenter.lat, lng: this.pendingCenter.lng } : null;
  }

  /** 여행 장소 검색/불러오기용. moveCamera(내비)가 아니라 Map.setCenter를 호출합니다. */
  setMapCenter(lat: number, lng: number, zoom = 14): void {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    this.pendingCenter = { lat, lng, zoom };
    this.renderedLat = lat;
    this.renderedLng = lng;
    const map = this.map;
    if (!map) return;
    this.dragPauseUntil = Date.now() + 4000;
    this.lastCameraAt = Date.now();
    map.setHeading?.(0);
    map.setTilt?.(0);
    map.setCenter({ lat, lng });
    map.setZoom(zoom);
  }

  async attach(container: HTMLElement, initialCenter: PlaceLocation): Promise<void> {
    this.detach();
    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      v: 'weekly',
    });
    await importLibrary('maps');
    if (!container.isConnected) return;

    const startCenter = this.pendingCenter
      ? { lat: this.pendingCenter.lat, lng: this.pendingCenter.lng }
      : { lat: initialCenter.latitude, lng: initialCenter.longitude };
    const startZoom = this.pendingCenter?.zoom ?? 13;
    const options: google.maps.MapOptions = {
      center: startCenter,
      zoom: startZoom,
      heading: 0,
      tilt: 0,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
      rotateControl: !this.travelMode,
      rotateControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      gestureHandling: 'greedy',
    };
    const vector = google.maps.RenderingType?.VECTOR;
    if (vector && !this.travelMode) options.renderingType = vector;

    const map = new google.maps.Map(container, options) as MapWithCamera;
    map.addListener('dragstart', () => {
      this.dragPauseUntil = Date.now() + 8000;
    });
    this.map = map;
    this.lastCameraAt = 0;
    if (this.showMapFabs && !this.travelMode) this.mountFabControl();
    this.setPlaces(this.places);
    this.setRoute(this.routePoints);
    if (!this.travelMode) {
      this.setReturnPoint(this.returnPoint, this.returnUser);
      this.bindStore();
      this.startCameraLoop();
      const stored = useLocationStore.getState();
      if (stored.followMode && stored.lat != null && stored.lng != null) {
        this.moveCamera(stored.lat, stored.lng, 17);
      }
    }
    if (this.pendingCenter) {
      this.setMapCenter(this.pendingCenter.lat, this.pendingCenter.lng, this.pendingCenter.zoom);
    } else if (this.travelMode && this.places.length > 0) {
      this.fitPlacesBounds(this.places);
    }
  }

  detach(): void {
    this.removeFabControl();
    this.stopCameraLoop();
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.clearReturnGraphics();
    this.infoWindow?.close();
    this.infoWindow = null;
    this.placeMarkers.forEach((marker) => marker.setMap(null));
    this.placeMarkers = [];
    this.routeLine?.setMap(null);
    this.trackLine?.setMap(null);
    this.userMarker?.setMap(null);
    this.routeLine = null;
    this.trackLine = null;
    this.userMarker = null;
    this.trackPath = [];
    this.map = null;
  }

  setOnSelectPlace(handler: (id: string) => void): void {
    this.onSelectPlace = handler;
  }

  setOnOpenPlaceDetail(handler: (id: string) => void): void {
    this.onOpenPlaceDetail = handler;
  }

  private openPlaceInfo(place: PlaceItem, marker: google.maps.Marker): void {
    const map = this.map;
    if (!map || !window.google) return;
    const amenity = placeAmenity(place);
    const wrap = document.createElement('div');
    wrap.className = 'noeul-info';
    const title = document.createElement('p');
    title.className = 'noeul-info-title';
    title.textContent = place.name;
    const line = document.createElement('p');
    line.className = 'noeul-info-line';
    line.textContent = amenity.oneLiner;
    const meta = document.createElement('p');
    meta.className = 'noeul-info-meta';
    meta.textContent = `${parkingShort(amenity.parking)} · ${campingShort(amenity.carCamping)}`;
    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = 'noeul-info-btn';
    detailBtn.textContent = '상세보기';
    detailBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onOpenPlaceDetail?.(place.id);
    });
    wrap.append(title, line, meta, detailBtn);
    this.infoWindow?.close();
    this.infoWindow = new google.maps.InfoWindow({ content: wrap, maxWidth: 280 });
    this.infoWindow.open({ map, anchor: marker });
    window.google.maps.event.addListenerOnce(this.infoWindow, 'domready', () => {
      detailBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onOpenPlaceDetail?.(place.id);
      };
    });
  }

  setMapFabs(opts: {
    onLocateMe: () => void;
    onOpenSos: () => void;
    locateBusy: boolean;
    weakGps: boolean;
  }): void {
    this.showMapFabs = true;
    this.onLocateMe = opts.onLocateMe;
    this.onOpenSos = opts.onOpenSos;
    this.locateBusy = opts.locateBusy;
    this.weakGps = opts.weakGps;
    this.syncFabState();
    if (this.map && !this.fabRoot) this.mountFabControl();
  }

  disableMapFabs(): void {
    this.showMapFabs = false;
    this.onLocateMe = null;
    this.onOpenSos = null;
    this.removeFabControl();
  }

  private mountFabControl(): void {
    const map = this.map;
    if (!map || !window.google) return;

    const root = document.createElement('div');
    root.className = 'noeul-map-fabs';

    const locateBtn = document.createElement('button');
    locateBtn.type = 'button';
    locateBtn.className = 'noeul-map-fab-locate';
    locateBtn.setAttribute('aria-label', '현재 위치로 이동');
    locateBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      exitBrowserFullscreen();
      this.onLocateMe?.();
    });

    const icon = document.createElement('img');
    icon.src = '/icon-my-location.jpg';
    icon.alt = '';
    icon.width = 24;
    icon.height = 24;
    icon.draggable = false;
    locateBtn.appendChild(icon);

    const badge = document.createElement('span');
    badge.className = 'noeul-map-fab-badge';
    badge.textContent = '!';
    badge.hidden = true;
    locateBtn.appendChild(badge);

    const sosBtn = document.createElement('button');
    sosBtn.type = 'button';
    sosBtn.className = 'noeul-map-fab-sos';
    sosBtn.setAttribute('aria-label', '긴급 SOS');
    sosBtn.textContent = 'SOS';
    sosBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      exitBrowserFullscreen();
      this.onOpenSos?.();
    });

    root.appendChild(locateBtn);
    root.appendChild(sosBtn);

    this.fabRoot = root;
    this.locateBtn = locateBtn;
    this.locateBadge = badge;
    this.syncFabState();
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(root);
  }

  private syncFabState(): void {
    if (this.locateBtn) this.locateBtn.disabled = this.locateBusy;
    if (this.locateBadge) this.locateBadge.hidden = !this.weakGps;
  }

  private removeFabControl(): void {
    const map = this.map;
    if (map && this.fabRoot && window.google?.maps) {
      const controls = map.controls[google.maps.ControlPosition.TOP_LEFT];
      const idx = controls.getArray().indexOf(this.fabRoot);
      if (idx >= 0) controls.removeAt(idx);
    }
    this.fabRoot = null;
    this.locateBtn = null;
    this.locateBadge = null;
  }

  setPlaces(places: PlaceItem[]): void {
    this.places = places;
    const map = this.map;
    if (!map || !window.google) return;

    this.infoWindow?.close();
    this.placeMarkers.forEach((marker) => marker.setMap(null));
    this.placeMarkers = places.map((place, index) => {
      const marker = new google.maps.Marker({
        position: { lat: place.location.latitude, lng: place.location.longitude },
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
        this.openPlaceInfo(place, marker);
        this.onSelectPlace?.(place.id);
      });
      return marker;
    });
  }

  clickPlaceMarker(id: string): boolean {
    const index = this.places.findIndex((place) => place.id === id);
    const place = this.places[index];
    const marker = this.placeMarkers[index];
    if (!place || !marker) return false;
    this.openPlaceInfo(place, marker);
    this.onSelectPlace?.(place.id);
    return true;
  }

  setSelectedPlace(id: string | null): void {
    this.selectedPlaceId = id;
    const follow = useLocationStore.getState().followMode;
    if (follow || !id || !this.map) return;
    const place = this.places.find((item) => item.id === id);
    if (!place) return;
    if (this.travelMode) {
      this.setMapCenter(place.location.latitude, place.location.longitude, 15);
      return;
    }
    this.moveCameraOnce({
      lat: place.location.latitude,
      lng: place.location.longitude,
      heading: 0,
      zoom: 15,
    });
  }

  setRoute(points: PlaceLocation[]): void {
    this.routePoints = points;
    const map = this.map;
    if (!map || !window.google) return;
    this.routeLine?.setMap(null);
    this.routeLine = null;
    if (points.length < 2) return;
    this.routeLine = new google.maps.Polyline({
      path: points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
      geodesic: true,
      strokeColor: ROUTE_STROKE_COLOR,
      strokeOpacity: ROUTE_STROKE_OPACITY,
      strokeWeight: ROUTE_STROKE_WEIGHT,
      map,
      zIndex: 2,
    });
    if (!useLocationStore.getState().followMode) {
      this.fitRouteBounds();
    }
  }

  /** 따라가기가 꺼져 있을 때 현재 좌표로 지도를 옮깁니다. */
  moveCamera(lat: number, lng: number, zoom = 17): void {
    this.dragPauseUntil = 0;
    this.lastCameraAt = 0;
    this.renderedLat = lat;
    this.renderedLng = lng;
    const hasBearing = useLocationStore.getState().hasBearing;
    this.moveCameraOnce({
      lat,
      lng,
      heading: hasBearing ? 0 : null,
      zoom,
    });
  }

  /** 현재 장소 마커가 화면에 들어오게 맞춥니다. */
  fitPlacesBounds(places = this.places): void {
    const points = (places.length ? places : this.places).filter(
      (place) =>
        Number.isFinite(place.location?.latitude) && Number.isFinite(place.location?.longitude)
    );
    if (points.length === 0) return;
    if (points.length === 1) {
      this.setMapCenter(points[0].location.latitude, points[0].location.longitude, 14);
      return;
    }
    const map = this.map;
    if (!map || !window.google) {
      this.setMapCenter(points[0].location.latitude, points[0].location.longitude, 13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const place of points) {
      bounds.extend({ lat: place.location.latitude, lng: place.location.longitude });
    }
    map.setHeading?.(0);
    map.setTilt?.(0);
    map.fitBounds(bounds, 72);
    this.fitBoundsCount += 1;
  }

  /** 그린 루트 전체가 화면에 들어오게 맞춥니다. */
  fitRouteBounds(): void {
    const map = this.map;
    if (!map || !window.google || this.routePoints.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    for (const point of this.routePoints) {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
    }
    map.fitBounds(bounds, 56);
    this.fitBoundsCount += 1;
    const debug = useLocationStore.getState().cameraDebug;
    useLocationStore.getState().setCameraDebug({
      followMode: debug?.followMode ?? false,
      setCenterCount: debug?.setCenterCount ?? 0,
      panToCount: debug?.panToCount ?? 0,
      moveCameraCount: debug?.moveCameraCount ?? 0,
      fitBoundsCount: this.fitBoundsCount,
      lat: debug?.lat ?? this.routePoints[0].latitude,
      lng: debug?.lng ?? this.routePoints[0].longitude,
      mapCenterLat: debug?.mapCenterLat ?? null,
      mapCenterLng: debug?.mapCenterLng ?? null,
      centerDeltaM: debug?.centerDeltaM ?? null,
      heading: debug?.heading ?? null,
      arrowApplied: debug?.arrowApplied ?? null,
      arrowOffset: debug?.arrowOffset ?? 0,
    });
  }

  setReturnPoint(point: PlaceLocation | null, user: PlaceLocation | null): void {
    this.returnPoint = point;
    this.returnUser = user;
    const map = this.map;
    if (!map || !window.google) return;
    if (!point || !user) {
      this.clearReturnGraphics();
      return;
    }

    const returnPos = { lat: point.latitude, lng: point.longitude };
    const userPos = { lat: user.latitude, lng: user.longitude };

    if (!this.returnMarker) {
      this.returnMarker = new google.maps.Marker({
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
      this.returnMarker.setPosition(returnPos);
      this.returnMarker.setMap(map);
    }

    if (!this.returnHalo) {
      this.returnHalo = new google.maps.Circle({
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
      this.returnHalo.setCenter(returnPos);
      this.returnHalo.setMap(map);
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
    if (!this.returnLine) this.returnLine = new google.maps.Polyline(lineOptions);
    else this.returnLine.setOptions(lineOptions);

    if (this.returnPulseTimer == null) {
      let tick = 0;
      this.returnPulseTimer = window.setInterval(() => {
        tick += 1;
        const wave = (Math.sin(tick / 8) + 1) / 2;
        this.returnMarker?.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: RETURN_MARKER_SCALE - 1.5 + wave * 3,
          fillColor: RETURN_STROKE_COLOR,
          fillOpacity: 0.85 + wave * 0.15,
          strokeColor: '#003322',
          strokeWeight: 3,
        });
        this.returnHalo?.setOptions({
          radius: 6 + wave * 5,
          fillOpacity: 0.12 + wave * 0.18,
          strokeOpacity: 0.45 + wave * 0.25,
        });
      }, 180);
    }
  }

  private bindStore(): void {
    if (this.travelMode) return;
    this.unsubscribeStore?.();
    const current = useLocationStore.getState();
    this.lastRecenterId = current.recenterId;
    if (current.lat != null && current.lng != null) {
      this.syncUserMarker(current.lat, current.lng);
    }

    this.unsubscribeStore = useLocationStore.subscribe(
      (s) => ({
        lat: s.lat,
        lng: s.lng,
        bearing: s.bearing,
        fromGps: s.fromGps,
        followMode: s.followMode,
        recenterId: s.recenterId,
      }),
      (slice, prev) => {
        if (slice.lat != null && slice.lng != null) {
          this.syncUserMarker(slice.lat, slice.lng);
          if (slice.fromGps && slice.followMode) {
            this.appendTrackPoint({ lat: slice.lat, lng: slice.lng });
          }
        }
        if (slice.followMode && !prev.followMode) {
          this.trackPath = [];
          this.trackLine?.setPath([]);
          this.moveCameraCount = 0;
          this.moveCameraInvocationCount = 0;
          this.rotationLogs = [];
          this.notifyRotationLogListeners();
          this.fitBoundsCount = 0;
          this.dragPauseUntil = 0;
          this.lastCameraAt = 0;
          this.rotationStarted = false;
          this.rotationHoldLogged = false;
          const startState = useLocationStore.getState();
          const startBearing = startState.bearing;
          this.committedHeading =
            startState.hasBearing && startBearing != null && Number.isFinite(startBearing)
              ? startBearing
              : null;
          if (this.committedHeading != null) this.renderedHeading = this.committedHeading;
        }
        if (!slice.followMode && prev.followMode) {
          this.resetNorthUp();
        }
        if (slice.recenterId !== this.lastRecenterId) {
          this.lastRecenterId = slice.recenterId;
          this.dragPauseUntil = 0;
          this.lastCameraAt = 0;
        }
      }
    );
  }

  private startCameraLoop(): void {
    if (this.loopId != null) return;
    const tick = (now: number) => {
      this.loopId = window.requestAnimationFrame(tick);
      if (now - this.lastCameraAt < CAMERA_MIN_INTERVAL_MS) return;
      this.lastCameraAt = now;
      this.tickCamera();
    };
    this.loopId = window.requestAnimationFrame(tick);
  }

  private stopCameraLoop(): void {
    if (this.loopId != null) {
      window.cancelAnimationFrame(this.loopId);
      this.loopId = null;
    }
  }

  private tickCamera(): void {
    const map = this.map;
    if (!map || this.travelMode) return;
    const state = useLocationStore.getState();
    if (!state.followMode || state.lat == null || state.lng == null) return;
    if (Date.now() < this.dragPauseUntil) return;

    const user: PlaceLocation = { latitude: state.lat, longitude: state.lng };
    const travel =
      state.hasBearing && state.bearing != null && Number.isFinite(state.bearing)
        ? state.bearing
        : null;
    let headingForCamera: number | null = null;
    if (travel == null) {
      if (!this.rotationHoldLogged) {
        this.rotationHoldLogged = true;
        console.info('[회전 보류]', {
          bearing: null,
          timestamp: Date.now(),
        });
      }
    } else {
      if (!this.rotationStarted) {
        this.rotationStarted = true;
        console.info('[회전 시작]', {
          bearing: travel,
          timestamp: Date.now(),
        });
      }
      if (state.headingUp) {
        // 거리·속도·각도 판정은 worker에서 끝났습니다. 카메라는 중복 차단하지 않습니다.
        this.committedHeading = travel;
      } else {
        this.committedHeading = 0;
      }

      const headingTarget = this.committedHeading ?? this.renderedHeading;
      this.renderedHeading = lerpHeading(this.renderedHeading, headingTarget, CAMERA_HEADING_LERP);
      headingForCamera = this.renderedHeading;
    }

    const mapH = map.getDiv()?.clientHeight || 640;
    const target =
      state.headingUp && this.committedHeading != null
        ? lookAhead(user, this.renderedHeading, mapH, WALK_ZOOM)
        : { lat: user.latitude, lng: user.longitude };

    if (this.renderedLat == null || this.renderedLng == null) {
      this.renderedLat = target.lat;
      this.renderedLng = target.lng;
      if (this.committedHeading != null) this.renderedHeading = this.committedHeading;
    } else {
      this.renderedLat = lerp(this.renderedLat, target.lat, CAMERA_POSITION_LERP);
      this.renderedLng = lerp(this.renderedLng, target.lng, CAMERA_POSITION_LERP);
    }

    const moved = this.moveCameraOnce({
      lat: this.renderedLat,
      lng: this.renderedLng,
      heading: headingForCamera,
      zoom: WALK_ZOOM,
    });
    if (!moved) return;

    const now = Date.now();
    if (now - this.lastRotationLogAt >= 5000) {
      this.lastRotationLogAt = now;
      console.info('[노을-회전/camera]', {
        followMode: state.followMode,
        headingUpMode: state.headingUp,
        workerBearing: travel,
        cameraTargetBearing: this.committedHeading,
        renderedBearing: Math.round(this.renderedHeading * 10) / 10,
        speedMps: state.speedKmh == null ? null : Math.round((state.speedKmh / 3.6) * 100) / 100,
      });
    }

    const center = map.getCenter();
    const mapCenterLat = center?.lat() ?? this.renderedLat;
    const mapCenterLng = center?.lng() ?? this.renderedLng;
    const debug: FollowCameraDebug = {
      followMode: true,
      setCenterCount: 0,
      panToCount: 0,
      moveCameraCount: this.moveCameraCount,
      fitBoundsCount: this.fitBoundsCount,
      lat: user.latitude,
      lng: user.longitude,
      mapCenterLat,
      mapCenterLng,
      centerDeltaM: Math.round(
        metersBetween(
          { lat: user.latitude, lng: user.longitude },
          { lat: mapCenterLat, lng: mapCenterLng }
        )
      ),
      heading: state.bearing,
      arrowApplied: null,
      arrowOffset: 0,
    };
    useLocationStore.getState().setCameraDebug(debug);
  }

  private moveCameraOnce(opts: {
    lat: number;
    lng: number;
    heading: number | null;
    zoom: number;
  }): boolean {
    const map = this.map;
    const state = useLocationStore.getState();
    const logBase = {
      gps: { lat: state.lat, lng: state.lng },
      heading: opts.heading,
      followMode: state.followMode,
    };
    if (!map) {
      console.warn('[노을-moveCamera/after]', {
        timestamp: new Date().toISOString(),
        ...logBase,
        moveCameraCalled: false,
        success: false,
        error: 'map is not attached',
      });
      return false;
    }
    const moveCamera =
      typeof map.moveCamera === 'function'
        ? map.moveCamera.bind(map)
        : (google.maps.Map.prototype as MapWithCamera).moveCamera?.bind(map);
    if (typeof moveCamera !== 'function') {
      console.warn('[노을-moveCamera/after]', {
        timestamp: new Date().toISOString(),
        ...logBase,
        moveCameraCalled: false,
        success: false,
        error: 'moveCamera is not available',
      });
      return false;
    }
    console.info('[노을-moveCamera/before]', {
      timestamp: new Date().toISOString(),
      ...logBase,
      moveCameraCalled: false,
      success: null,
      error: null,
    });
    try {
      const cameraOptions: {
        center: google.maps.LatLngLiteral;
        zoom: number;
        heading?: number;
        tilt: number;
      } = {
        center: { lat: opts.lat, lng: opts.lng },
        zoom: opts.zoom,
        tilt: 0,
      };
      if (state.hasBearing && opts.heading != null) cameraOptions.heading = opts.heading;
      this.moveCameraInvocationCount += 1;
      console.info('[노을-moveCamera/rotation]', {
        headingBeforeCall: opts.heading,
        headingAtCall: cameraOptions.heading ?? null,
        moveCameraCallCount: this.moveCameraInvocationCount,
      });
      moveCamera(cameraOptions);
      try {
        const mapHeadingAfterCall = map.getHeading() ?? null;
        const mapTiltAfterCall = map.getTilt() ?? null;
        const renderingType = map.getRenderingType();
        const renderingTypeAfterCall = renderingType == null ? null : String(renderingType);
        console.info('[노을-moveCamera/map-state]', {
          requestedHeading: cameraOptions.heading,
          mapHeadingAfterCall,
          mapTiltAfterCall,
          renderingTypeAfterCall,
        });
        this.appendRotationLog({
          timestamp: Date.now(),
          headingBeforeCall: opts.heading,
          headingAtCall: cameraOptions.heading ?? null,
          moveCameraCallCount: this.moveCameraInvocationCount,
          gpsBearing: state.bearing,
          renderedHeading: this.renderedHeading,
          mapHeadingAfterCall,
          mapTiltAfterCall,
          renderingTypeAfterCall,
        });
      } catch (diagnosticError) {
        console.error('[노을-moveCamera/map-state]', diagnosticError);
      }
      console.info('[노을-moveCamera/after]', {
        timestamp: new Date().toISOString(),
        ...logBase,
        moveCameraCalled: true,
        success: true,
        error: null,
      });
      this.moveCameraCount += 1;
      return true;
    } catch (error) {
      console.error('[노을-moveCamera/after]', {
        timestamp: new Date().toISOString(),
        ...logBase,
        moveCameraCalled: true,
        success: false,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : String(error),
      });
      return false;
    }
  }

  private appendRotationLog(log: RotationCameraLog): void {
    this.rotationLogs = [...this.rotationLogs, log].slice(-20);
    this.notifyRotationLogListeners();
  }

  private notifyRotationLogListeners(): void {
    for (const listener of this.rotationLogListeners) {
      try {
        listener();
      } catch (error) {
        console.error('[노을-moveCamera/panel]', error);
      }
    }
  }

  private resetNorthUp(): void {
    const center = this.map?.getCenter();
    if (!center) return;
    this.moveCameraOnce({
      lat: center.lat(),
      lng: center.lng(),
      heading: 0,
      zoom: this.map?.getZoom() ?? 13,
    });
    this.renderedLat = null;
    this.renderedLng = null;
    this.renderedHeading = 0;
    this.committedHeading = null;
    useLocationStore.getState().setCameraDebug(null);
  }

  private syncUserMarker(lat: number, lng: number): void {
    const map = this.map;
    if (!map || !window.google) return;
    const position = { lat, lng };

    if (!this.userMarker) {
      this.userMarker = new google.maps.Marker({
        position,
        map,
        title: '현재 위치',
        zIndex: 10,
        clickable: false,
        icon: userDotIcon(),
      });
      return;
    }
    this.userMarker.setPosition(position);
    this.userMarker.setMap(map);
  }

  private appendTrackPoint(point: google.maps.LatLngLiteral): void {
    const map = this.map;
    if (!map || !window.google) return;
    const last = this.trackPath[this.trackPath.length - 1];
    if (last && metersBetween(last, point) < TRACK_MIN_STEP_M) return;

    this.trackPath.push(point);
    if (this.trackPath.length > MAX_TRACK_POINTS) {
      this.trackPath.splice(0, this.trackPath.length - MAX_TRACK_POINTS);
    }

    if (!this.trackLine) {
      this.trackLine = new google.maps.Polyline({
        path: this.trackPath,
        geodesic: true,
        strokeColor: TRACK_STROKE_COLOR,
        strokeOpacity: 0.85,
        strokeWeight: TRACK_STROKE_WEIGHT,
        map,
        zIndex: 3,
      });
    } else {
      this.trackLine.setPath(this.trackPath);
    }
  }

  private clearReturnGraphics(): void {
    if (this.returnPulseTimer != null) {
      window.clearInterval(this.returnPulseTimer);
      this.returnPulseTimer = null;
    }
    this.returnMarker?.setMap(null);
    this.returnHalo?.setMap(null);
    this.returnLine?.setMap(null);
    this.returnMarker = null;
    this.returnHalo = null;
    this.returnLine = null;
  }
}
