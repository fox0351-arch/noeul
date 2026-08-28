import { generateGeminiJsonObject, parseDataUrl } from '@/lib/photoAi';
import type { PhotoAiAnalysis } from '@/types/place';
import type { PlaceEstimate, PlaceEstimateSource } from '@/types/photoPipeline';

type NearbyPlace = { name: string; address: string; lat: number; lng: number };

function placesKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

async function searchNearby(lat: number, lng: number): Promise<NearbyPlace | null> {
  const apiKey = placesKey();
  if (!apiKey) return null;
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      languageCode: 'ko',
      maxResultCount: 5,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 1200 },
      },
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }[];
  };
  const first = payload.places?.[0];
  if (!first?.location?.latitude || !first.location.longitude) return null;
  return {
    name: first.displayName?.text || '근처 장소',
    address: first.formattedAddress || '',
    lat: first.location.latitude,
    lng: first.location.longitude,
  };
}

async function reverseGeocode(lat: number, lng: number): Promise<NearbyPlace | null> {
  const apiKey = placesKey();
  if (!apiKey) return null;
  const search = new URLSearchParams({
    latlng: `${lat},${lng}`,
    language: 'ko',
    key: apiKey,
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${search}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: string;
    results?: { formatted_address?: string; address_components?: { long_name?: string }[] }[];
  };
  const first = payload.results?.[0];
  if (!first?.formatted_address) return null;
  const name = first.address_components?.[0]?.long_name || first.formatted_address.split(' ')[0];
  return { name, address: first.formatted_address, lat, lng };
}

async function textSearchPlace(query: string): Promise<NearbyPlace | null> {
  const apiKey = placesKey();
  if (!apiKey || !query.trim()) return null;
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: `${query.trim()} 부산`,
      languageCode: 'ko',
      maxResultCount: 3,
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }[];
  };
  const first = payload.places?.[0];
  if (!first?.location?.latitude || !first.location.longitude) return null;
  return {
    name: first.displayName?.text || query,
    address: first.formattedAddress || '',
    lat: first.location.latitude,
    lng: first.location.longitude,
  };
}

function toEstimate(
  place: NearbyPlace,
  source: PlaceEstimateSource,
  confidence: number
): PlaceEstimate {
  return {
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    source,
    confidence,
  };
}

async function geminiLandmarkPlace(
  dataUrl: string,
  analysis: PhotoAiAnalysis | null
): Promise<NearbyPlace | null> {
  const parsed = parseDataUrl(dataUrl);
  const json = await generateGeminiJsonObject({
    prompt: `부산·갈맷길 여행 사진으로 장소를 추정하라. JSON만 출력.
이미 아는 단서: ${analysis?.landmark || analysis?.subjects?.join(', ') || '없음'}
형식: {"name":"광안리해수욕장","address":"부산 수영구","lat":35.153,"lng":129.118,"confidence":0.6}
모르면 name을 빈 문자열로 둔다.`,
    parsed: parsed ?? undefined,
    maxOutputTokens: 512,
  });
  if (!json || typeof json !== 'object') return null;
  const record = json as { name?: unknown; address?: unknown; lat?: unknown; lng?: unknown };
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  const lat = Number(record.lat);
  const lng = Number(record.lng);
  return {
    name: record.name.trim(),
    address: typeof record.address === 'string' ? record.address : '',
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
  };
}

export async function estimatePhotoPlace(input: {
  dataUrl: string;
  gps?: { lat: number; lng: number } | null;
  analysis: PhotoAiAnalysis | null;
}): Promise<PlaceEstimate | null> {
  if (input.gps) {
    const nearby = await searchNearby(input.gps.lat, input.gps.lng);
    if (nearby) return toEstimate(nearby, 'places_nearby', 0.86);
    const geo = await reverseGeocode(input.gps.lat, input.gps.lng);
    if (geo) return toEstimate(geo, 'reverse_geocode', 0.72);
    return {
      name: '사진 촬영 위치',
      address: '',
      lat: input.gps.lat,
      lng: input.gps.lng,
      source: 'exif',
      confidence: 0.6,
    };
  }

  const hint = input.analysis?.landmark || input.analysis?.subjects?.[0];
  if (hint) {
    const fromText = await textSearchPlace(hint);
    if (fromText) return toEstimate(fromText, 'gemini_landmark', 0.58);
  }

  const fromGemini = await geminiLandmarkPlace(input.dataUrl, input.analysis);
  if (!fromGemini) return null;
  if (fromGemini.lat && fromGemini.lng) {
    const nearby = await searchNearby(fromGemini.lat, fromGemini.lng);
    if (nearby) return toEstimate(nearby, 'gemini_landmark', 0.5);
    const named = await textSearchPlace(fromGemini.name);
    if (named) return toEstimate(named, 'gemini_landmark', 0.48);
  }
  const named = await textSearchPlace(fromGemini.name);
  if (named) return toEstimate(named, 'gemini_landmark', 0.45);
  if (!fromGemini.lat || !fromGemini.lng) return null;
  return toEstimate(fromGemini, 'gemini_landmark', 0.32);
}
