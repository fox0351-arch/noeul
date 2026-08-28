import { GALMAETGIL_SECTIONS, type GalmaetgilSection } from './catalog';
import type { TrailMatch } from '@/types/photoPipeline';

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const earth = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointToSegmentM(
  point: { lat: number; lng: number },
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): number {
  const x = point.lng;
  const y = point.lat;
  const x1 = start.lng;
  const y1 = start.lat;
  const x2 = end.lng;
  const y2 = end.lat;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return distanceM(point, start);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return distanceM(point, { lat: y1 + t * dy, lng: x1 + t * dx });
}

function sectionDistanceM(point: { lat: number; lng: number }, section: GalmaetgilSection): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < section.geometry.length - 1; index += 1) {
    nearest = Math.min(nearest, pointToSegmentM(point, section.geometry[index], section.geometry[index + 1]));
  }
  return nearest;
}

function confidenceFromDistance(distance: number): number {
  if (distance <= 80) return 0.92;
  if (distance <= 300) return 0.74;
  if (distance <= 1200) return 0.45;
  if (distance <= 4000) return 0.22;
  return 0.08;
}

export function sectionPathLengthM(section: GalmaetgilSection): number {
  let total = 0;
  for (let index = 0; index < section.geometry.length - 1; index += 1) {
    total += distanceM(section.geometry[index], section.geometry[index + 1]);
  }
  return total;
}

export function matchGalmaetgilTrail(point: { lat: number; lng: number }): TrailMatch & {
  section: GalmaetgilSection;
} {
  let best = GALMAETGIL_SECTIONS[0];
  let bestDistance = sectionDistanceM(point, best);
  for (const section of GALMAETGIL_SECTIONS.slice(1)) {
    const distance = sectionDistanceM(point, section);
    if (distance < bestDistance) {
      best = section;
      bestDistance = distance;
    }
  }
  return {
    courseId: best.courseId,
    sectionId: best.sectionId,
    sectionName: best.sectionName,
    distanceM: Math.round(bestDistance),
    confidence: confidenceFromDistance(bestDistance),
    section: best,
  };
}
