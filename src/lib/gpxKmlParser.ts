import { PlaceItem } from '@/types/place';
import { RoutePoint, TravelRoute } from '@/types/route';

export interface ParsedTrailFile {
  route: TravelRoute;
  places: PlaceItem[];
}

function localName(node: Element): string {
  return (node.localName || node.nodeName).toLowerCase();
}

function textContent(node: Element | null): string {
  return node?.textContent?.trim() ?? '';
}

function parseCoordinatePairs(raw: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  const tokens = raw.trim().split(/[\s\n\r]+/).filter(Boolean);
  for (const token of tokens) {
    const parts = token.split(',');
    if (parts.length < 2) continue;
    const longitude = Number(parts[0]);
    const latitude = Number(parts[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    points.push({ latitude, longitude });
  }
  return points;
}

function parseGxCoord(raw: string): RoutePoint | null {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function collectByLocalName(root: ParentNode, name: string): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(
    (el) => el instanceof Element && localName(el) === name
  );
}

function uniquePoints(points: RoutePoint[]): RoutePoint[] {
  const next: RoutePoint[] = [];
  for (const point of points) {
    const prev = next[next.length - 1];
    if (
      prev &&
      prev.latitude.toFixed(6) === point.latitude.toFixed(6) &&
      prev.longitude.toFixed(6) === point.longitude.toFixed(6)
    ) {
      continue;
    }
    next.push(point);
  }
  return next;
}

function downsample(points: RoutePoint[], maxPoints = 4000): RoutePoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }
  const last = points[points.length - 1];
  const prev = sampled[sampled.length - 1];
  if (!prev || prev.latitude !== last.latitude || prev.longitude !== last.longitude) {
    sampled.push(last);
  }
  return sampled;
}

function fileStem(fileName: string): string {
  return fileName.replace(/\.(gpx|kml)$/i, '').trim() || '가져온 루트';
}

function makePlace(id: string, name: string, point: RoutePoint, address: string): PlaceItem {
  return {
    id,
    name,
    address,
    location: { latitude: point.latitude, longitude: point.longitude },
    addedManually: true,
  };
}

function parseGpx(doc: Document, fileName: string): ParsedTrailFile {
  const name = fileStem(fileName);
  const trackPoints: RoutePoint[] = [];
  for (const pt of collectByLocalName(doc, 'trkpt')) {
    const latitude = Number(pt.getAttribute('lat'));
    const longitude = Number(pt.getAttribute('lon'));
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      trackPoints.push({ latitude, longitude });
    }
  }

  const routePoints: RoutePoint[] = [];
  for (const pt of collectByLocalName(doc, 'rtept')) {
    const latitude = Number(pt.getAttribute('lat'));
    const longitude = Number(pt.getAttribute('lon'));
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      routePoints.push({ latitude, longitude });
    }
  }

  const waypoints: PlaceItem[] = [];
  collectByLocalName(doc, 'wpt').forEach((pt, index) => {
    const latitude = Number(pt.getAttribute('lat'));
    const longitude = Number(pt.getAttribute('lon'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const wptName =
      textContent(collectByLocalName(pt, 'name')[0] ?? null) || `경유지 ${index + 1}`;
    waypoints.push(
      makePlace(`gpx_wpt_${index}_${latitude}_${longitude}`, wptName, { latitude, longitude }, name)
    );
  });

  const line = downsample(
    uniquePoints(trackPoints.length >= 2 ? trackPoints : routePoints.length >= 2 ? routePoints : waypoints.map((p) => ({
      latitude: p.location.latitude,
      longitude: p.location.longitude,
    })))
  );

  if (line.length < 2) {
    throw new Error('파일에서 걸을 수 있는 경로를 찾지 못했습니다.');
  }

  const places =
    waypoints.length > 0
      ? waypoints
      : [
          makePlace(`gpx_start_${line[0].latitude}`, '출발', line[0], name),
          makePlace(`gpx_end_${line[line.length - 1].latitude}`, '도착', line[line.length - 1], name),
        ];

  return {
    route: {
      name,
      sourceFileName: fileName,
      createdAt: new Date().toISOString(),
      points: line,
    },
    places,
  };
}

function parseKml(doc: Document, fileName: string): ParsedTrailFile {
  const name =
    textContent(collectByLocalName(doc, 'name')[0] ?? null) || fileStem(fileName);

  const linePoints: RoutePoint[] = [];
  for (const line of collectByLocalName(doc, 'linestring')) {
    for (const coords of collectByLocalName(line, 'coordinates')) {
      linePoints.push(...parseCoordinatePairs(textContent(coords)));
    }
  }

  for (const coord of collectByLocalName(doc, 'coord')) {
    const parsed = parseGxCoord(textContent(coord));
    if (parsed) linePoints.push(parsed);
  }

  const placemarks: PlaceItem[] = [];
  collectByLocalName(doc, 'placemark').forEach((mark, index) => {
    const hasLine = collectByLocalName(mark, 'linestring').length > 0;
    const points = collectByLocalName(mark, 'point');
    if (hasLine || points.length === 0) return;
    const coords = collectByLocalName(points[0], 'coordinates')[0];
    const parsed = parseCoordinatePairs(textContent(coords));
    if (parsed.length === 0) return;
    const placeName = textContent(collectByLocalName(mark, 'name')[0] ?? null) || `경유지 ${index + 1}`;
    placemarks.push(makePlace(`kml_pm_${index}_${parsed[0].latitude}`, placeName, parsed[0], name));
  });

  const fallbackLine = placemarks.map((place) => ({
    latitude: place.location.latitude,
    longitude: place.location.longitude,
  }));

  const line = downsample(uniquePoints(linePoints.length >= 2 ? linePoints : fallbackLine));
  if (line.length < 2) {
    throw new Error('파일에서 걸을 수 있는 경로를 찾지 못했습니다.');
  }

  const places =
    placemarks.length > 0
      ? placemarks
      : [
          makePlace(`kml_start_${line[0].latitude}`, '출발', line[0], name),
          makePlace(`kml_end_${line[line.length - 1].latitude}`, '도착', line[line.length - 1], name),
        ];

  return {
    route: {
      name,
      sourceFileName: fileName,
      createdAt: new Date().toISOString(),
      points: line,
    },
    places,
  };
}

export async function parseTrailFile(file: File): Promise<ParsedTrailFile> {
  try {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.gpx') && !lower.endsWith('.kml')) {
      throw new Error('GPX 또는 KML 파일만 가져올 수 있습니다.');
    }

    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('파일을 읽지 못했습니다. 다른 GPX/KML을 선택해 주세요.');
    }

    if (lower.endsWith('.gpx') || collectByLocalName(doc, 'gpx').length > 0) {
      if (collectByLocalName(doc, 'gpx').length > 0 || collectByLocalName(doc, 'trkpt').length > 0) {
        return parseGpx(doc, file.name);
      }
    }

    return parseKml(doc, file.name);
  } catch (error) {
    console.error('[노을-gpx] parse failed', file.name, error);
    throw error instanceof Error ? error : new Error('루트 파일을 읽지 못했습니다.');
  }
}
