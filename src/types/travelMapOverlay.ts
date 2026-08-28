export type TravelMapMarkerKind = 'destination' | 'parking' | 'toilet' | 'restaurant' | 'cafe';

export type TravelMapCoordSource = 'galmaetgil' | 'places';

export interface TravelMapMarker {
  id: string;
  kind: TravelMapMarkerKind;
  name: string;
  lat: number;
  lng: number;
}

export interface TravelMapDestination {
  name: string;
  lat: number;
  lng: number;
  source: TravelMapCoordSource;
}

export interface TravelMapData {
  center: { lat: number; lng: number };
  destinations: TravelMapDestination[];
  markers: TravelMapMarker[];
}
