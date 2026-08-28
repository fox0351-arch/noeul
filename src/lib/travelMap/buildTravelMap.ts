import { galmaetgilGps } from '@/lib/travelInfo/catalogMatch';
import type { TravelMapData, TravelMapDestination, TravelMapMarker, TravelMapMarkerKind } from '@/types/travelMapOverlay';

type NearbyHit = { name: string; lat: number; lng: number };

function placesKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result.slice(0, 8);
}

async function textSearch(query: string): Promise<NearbyHit | null> {
  const apiKey = placesKey();
  if (!apiKey) return null;
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'ko',
      maxResultCount: 3,
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    places?: { displayName?: { text?: string }; location?: { latitude?: number; longitude?: number } }[];
  };
  const first = payload.places?.[0];
  const lat = first?.location?.latitude;
  const lng = first?.location?.longitude;
  if (lat == null || lng == null) return null;
  return { name: first?.displayName?.text || query, lat, lng };
}

async function nearbySearch(
  lat: number,
  lng: number,
  includedType: string,
  textFallback: string
): Promise<NearbyHit[]> {
  const apiKey = placesKey();
  if (!apiKey) return [];
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      languageCode: 'ko',
      maxResultCount: 4,
      includedTypes: [includedType],
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 1500 },
      },
    }),
  });
  if (response.ok) {
    const payload = (await response.json()) as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        location?: { latitude?: number; longitude?: number };
      }[];
    };
    const hits = (payload.places ?? [])
      .map((place) => ({
        name: place.displayName?.text || includedType,
        lat: place.location?.latitude ?? 0,
        lng: place.location?.longitude ?? 0,
      }))
      .filter((place) => place.lat && place.lng);
    if (hits.length) return hits;
  }

  const fallback = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: textFallback,
      languageCode: 'ko',
      maxResultCount: 4,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 1500 },
      },
    }),
  });
  if (!fallback.ok) return [];
  const payload = (await fallback.json()) as {
    places?: { displayName?: { text?: string }; location?: { latitude?: number; longitude?: number } }[];
  };
  return (payload.places ?? [])
    .map((place) => ({
      name: place.displayName?.text || textFallback,
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
    }))
    .filter((place) => place.lat && place.lng);
}

export async function resolveDestination(placeName: string): Promise<TravelMapDestination | null> {
  const fromDb = galmaetgilGps(placeName);
  if (fromDb) {
    return { name: placeName, lat: fromDb.lat, lng: fromDb.lng, source: 'galmaetgil' };
  }
  const fromPlaces = await textSearch(`${placeName} 대한민국`);
  if (!fromPlaces) return null;
  return { name: placeName, lat: fromPlaces.lat, lng: fromPlaces.lng, source: 'places' };
}

function toMarkers(
  kind: TravelMapMarkerKind,
  hits: NearbyHit[],
  prefix: string
): TravelMapMarker[] {
  return hits.slice(0, 4).map((hit, index) => ({
    id: `${prefix}-${kind}-${index}`,
    kind,
    name: hit.name,
    lat: hit.lat,
    lng: hit.lng,
  }));
}

export async function buildTravelMap(placeNames: string[]): Promise<TravelMapData> {
  const names = uniqueNames(placeNames);
  const destinations: TravelMapDestination[] = [];
  for (const name of names) {
    const dest = await resolveDestination(name);
    if (dest) destinations.push(dest);
  }
  if (destinations.length === 0) {
    throw new Error('장소 좌표를 찾지 못했습니다. 갈맷길 GPS와 Google Places 검색을 모두 확인하세요.');
  }

  const markers: TravelMapMarker[] = destinations.map((dest, index) => ({
    id: `destination-${index}`,
    kind: 'destination',
    name: dest.name,
    lat: dest.lat,
    lng: dest.lng,
  }));

  for (const [index, dest] of destinations.slice(0, 3).entries()) {
    const [parking, toilets, restaurants, cafes] = await Promise.all([
      nearbySearch(dest.lat, dest.lng, 'parking', `${dest.name} 주차장`),
      nearbySearch(dest.lat, dest.lng, 'restroom', `${dest.name} 화장실`),
      nearbySearch(dest.lat, dest.lng, 'restaurant', `${dest.name} 맛집`),
      nearbySearch(dest.lat, dest.lng, 'cafe', `${dest.name} 카페`),
    ]);
    markers.push(
      ...toMarkers('parking', parking, `${index}`),
      ...toMarkers('toilet', toilets, `${index}`),
      ...toMarkers('restaurant', restaurants, `${index}`),
      ...toMarkers('cafe', cafes, `${index}`)
    );
  }

  return {
    center: { lat: destinations[0].lat, lng: destinations[0].lng },
    destinations,
    markers,
  };
}
