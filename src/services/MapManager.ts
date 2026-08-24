import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { destinationPoint } from '@/lib/geo';
import { PlaceItem, PlaceLocation } from '@/types/place';
import { useLocationStore, type FollowCameraDebug } from '@/store/useLocationStore';

const WALK_ZOOM = 18;
const CAMERA_MIN_INTERVAL_MS = 200;
const MAX_TRACK_POINTS = 3000;
const TRACK_MIN_STEP_M = 2;
const USER_MARKER_SCALE = 12;
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

  private map: MapWithCamera | null = null;
  private routeLine: google.maps.Polyline | null = null;
  private trackLine: google.maps.Polyline | null = null;
  private returnLine: google.maps.Polyline | null = null;
  private trackPath: google.maps.LatLngLiteral[] = [];
  private placeMarkers: google.maps.Marker[] = [];
  private userMarker: google.maps.Marker | null = null;
  private headingMarker: google.maps.Marker | null = null;
  private returnMarker: google.maps.Marker | null = null;
  private returnHalo: google.maps.Circle | null = null;
  private returnPulseTimer: number | null = null;
  private onSelectPlace: ((id: string) => void) | null = null;
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
  private renderedMarkerHeading: number | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private moveCameraCount = 0;
  private fitBoundsCount = 0;

  private constructor() {}

  async attach(container: HTMLElement, initialCenter: PlaceLocation): Promise<void> {
    this.detach();
    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      v: 'weekly',
    });
    await importLibrary('maps');
    if (!container.isConnected) return;

    const options: google.maps.MapOptions = {
      center: { lat: initialCenter.latitude, lng: initialCenter.longitude },
      zoom: 13,
      heading: 0,
      tilt: 0,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
      rotateControl: true,
      rotateControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      gestureHandling: 'greedy',
    };
    const vector = google.maps.RenderingType?.VECTOR;
    if (vector) options.renderingType = vector;

    const map = new google.maps.Map(container, options) as MapWithCamera;
    map.addListener('dragstart', () => {
      this.dragPauseUntil = Date.now() + 8000;
    });
    this.map = map;
    this.lastCameraAt = 0;
    this.setPlaces(this.places);
    this.setRoute(this.routePoints);
    this.setReturnPoint(this.returnPoint, this.returnUser);
    this.bindStore();
    this.startCameraLoop();
    const stored = useLocationStore.getState();
    if (stored.lat != null && stored.lng != null) {
      this.moveCamera(stored.lat, stored.lng, 17);
    }
  }

  detach(): void {
    this.stopCameraLoop();
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.clearReturnGraphics();
    this.placeMarkers.forEach((marker) => marker.setMap(null));
    this.placeMarkers = [];
    this.routeLine?.setMap(null);
    this.trackLine?.setMap(null);
    this.userMarker?.setMap(null);
    this.headingMarker?.setMap(null);
    this.routeLine = null;
    this.trackLine = null;
    this.userMarker = null;
    this.headingMarker = null;
    this.trackPath = [];
    this.map = null;
  }

  setOnSelectPlace(handler: (id: string) => void): void {
    this.onSelectPlace = handler;
  }

  setPlaces(places: PlaceItem[]): void {
    this.places = places;
    const map = this.map;
    if (!map || !window.google) return;

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
      marker.addListener('click', () => this.onSelectPlace?.(place.id));
      return marker;
    });
  }

  setSelectedPlace(id: string | null): void {
    this.selectedPlaceId = id;
    const follow = useLocationStore.getState().followMode;
    if (follow || !id || !this.map) return;
    const place = this.places.find((item) => item.id === id);
    if (!place) return;
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
    this.moveCameraOnce({
      lat,
      lng,
      heading: 0,
      zoom,
    });
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
    this.unsubscribeStore?.();
    const current = useLocationStore.getState();
    this.lastRecenterId = current.recenterId;
    if (current.lat != null && current.lng != null) {
      this.syncUserMarker(current.lat, current.lng, current.bearing, current.arrowRotationOffset);
    }

    this.unsubscribeStore = useLocationStore.subscribe(
      (s) => ({
        lat: s.lat,
        lng: s.lng,
        bearing: s.bearing,
        fromGps: s.fromGps,
        followMode: s.followMode,
        arrowRotationOffset: s.arrowRotationOffset,
        recenterId: s.recenterId,
      }),
      (slice, prev) => {
        if (slice.lat != null && slice.lng != null) {
          this.syncUserMarker(slice.lat, slice.lng, slice.bearing, slice.arrowRotationOffset);
          if (slice.fromGps && slice.followMode) {
            this.appendTrackPoint({ lat: slice.lat, lng: slice.lng });
          }
        }
        if (slice.followMode && !prev.followMode) {
          this.trackPath = [];
          this.trackLine?.setPath([]);
          this.moveCameraCount = 0;
          this.fitBoundsCount = 0;
          this.dragPauseUntil = 0;
          this.lastCameraAt = 0;
          this.renderedLat = null;
          this.renderedLng = null;
          this.renderedMarkerHeading = null;
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
    if (!map) return;
    const state = useLocationStore.getState();
    if (!state.followMode || state.lat == null || state.lng == null) return;
    if (Date.now() < this.dragPauseUntil) return;

    const user: PlaceLocation = { latitude: state.lat, longitude: state.lng };
    const headingSource = state.headingUp ? (state.bearing ?? state.mapHeadingDeg) : 0;
    const heading =
      headingSource != null && Number.isFinite(headingSource) ? headingSource : 0;
    const mapH = map.getDiv()?.clientHeight || 640;
    const target = state.headingUp
      ? lookAhead(user, heading, mapH, WALK_ZOOM)
      : { lat: user.latitude, lng: user.longitude };

    if (this.renderedLat == null || this.renderedLng == null) {
      this.renderedLat = target.lat;
      this.renderedLng = target.lng;
      this.renderedHeading = heading;
    } else {
      this.renderedLat = lerp(this.renderedLat, target.lat, 0.35);
      this.renderedLng = lerp(this.renderedLng, target.lng, 0.35);
      this.renderedHeading = lerpHeading(this.renderedHeading, heading, 0.14);
    }

    const moved = this.moveCameraOnce({
      lat: this.renderedLat,
      lng: this.renderedLng,
      heading: this.renderedHeading,
      zoom: WALK_ZOOM,
    });
    if (!moved) return;

    const center = map.getCenter();
    const mapCenterLat = center?.lat() ?? this.renderedLat;
    const mapCenterLng = center?.lng() ?? this.renderedLng;
    const arrowApplied =
      state.bearing != null && Number.isFinite(state.bearing)
        ? (((state.bearing + state.arrowRotationOffset) % 360) + 360) % 360
        : null;

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
      arrowApplied,
      arrowOffset: state.arrowRotationOffset,
    };
    useLocationStore.getState().setCameraDebug(debug);
  }

  private moveCameraOnce(opts: {
    lat: number;
    lng: number;
    heading: number;
    zoom: number;
  }): boolean {
    const map = this.map;
    if (!map) return false;
    const moveCamera =
      typeof map.moveCamera === 'function'
        ? map.moveCamera.bind(map)
        : (google.maps.Map.prototype as MapWithCamera).moveCamera?.bind(map);
    if (typeof moveCamera !== 'function') return false;
    try {
      moveCamera({
        center: { lat: opts.lat, lng: opts.lng },
        zoom: opts.zoom,
        heading: opts.heading,
        tilt: 0,
      });
      this.moveCameraCount += 1;
      return true;
    } catch {
      return false;
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
    this.renderedMarkerHeading = null;
    useLocationStore.getState().setCameraDebug(null);
  }

  private syncUserMarker(
    lat: number,
    lng: number,
    bearing: number | null,
    arrowOffset: number
  ): void {
    const map = this.map;
    if (!map || !window.google) return;
    const position = { lat, lng };

    if (!this.userMarker) {
      this.userMarker = new google.maps.Marker({
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
      this.userMarker.setPosition(position);
      this.userMarker.setMap(map);
    }

    if (bearing == null || !Number.isFinite(bearing)) return;
    const headingUp = useLocationStore.getState().headingUp;
    // 헤딩업 VECTOR 지도에서 심볼을 지리 방위로 돌리면 카메라 헤딩과 겹쳐 뒤로/옆으로 갑니다.
    const target = headingUp
      ? (((arrowOffset % 360) + 360) % 360)
      : (((bearing + arrowOffset) % 360) + 360) % 360;
    if (this.renderedMarkerHeading == null) this.renderedMarkerHeading = target;
    else this.renderedMarkerHeading = lerpHeading(this.renderedMarkerHeading, target, 0.16);
    const arrowApplied = this.renderedMarkerHeading;
    if (!this.headingMarker) {
      this.headingMarker = new google.maps.Marker({
        position,
        map,
        clickable: false,
        optimized: false,
        zIndex: 11,
        icon: headingArrowIcon(arrowApplied),
      });
    } else {
      this.headingMarker.setPosition(position);
      this.headingMarker.setIcon(headingArrowIcon(arrowApplied));
      this.headingMarker.setMap(map);
    }
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
