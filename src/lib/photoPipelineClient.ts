import type { User } from 'firebase/auth';
import type { BlogDraft, PhotoAnalysis, TravelStory } from '@/types/blog';
import type { PhotoPipelineInput, PhotoPipelineResult } from '@/types/photoPipeline';
import type { TravelPlaceInfo } from '@/types/travelInfo';
import type { TravelMapData } from '@/types/travelMapOverlay';
import type { TravelCourse } from '@/types/travelCourse';
import type { ContentPack } from '@/types/contentPack';
import type { ContentQualityScore } from '@/types/contentQuality';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

export async function requestPhotoPipeline(
  user: User,
  input: PhotoPipelineInput
): Promise<PhotoPipelineResult> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/photos/pipeline', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as PhotoPipelineResult & { error?: string };
  if (!response.ok) throw new Error(body.error || '사진 분석 파이프라인을 실행하지 못했습니다.');
  return body;
}

export async function requestTravelBlogDraft(
  user: User,
  photos: PhotoAnalysis[]
): Promise<{ story: TravelStory; draft: BlogDraft; quality?: ContentQualityScore }> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/photos/blog-draft', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photos }),
  });
  const body = (await response.json()) as {
    story: TravelStory;
    draft: BlogDraft;
    quality?: ContentQualityScore;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || '블로그 초안을 만들지 못했습니다.');
  return body;
}

export async function requestTravelPlaceInfo(
  user: User,
  places: string[]
): Promise<TravelPlaceInfo[]> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/photos/travel-info', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ places }),
  });
  const body = (await response.json()) as { infos?: TravelPlaceInfo[]; error?: string };
  if (!response.ok) throw new Error(body.error || '여행 정보를 만들지 못했습니다.');
  return body.infos ?? [];
}

export async function requestTravelMap(user: User, places: string[]): Promise<TravelMapData> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/photos/travel-map', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ places }),
  });
  const body = (await response.json()) as TravelMapData & { error?: string };
  if (!response.ok) throw new Error(body.error || '지도를 만들지 못했습니다.');
  return body;
}

export async function requestTravelCourse(
  user: User,
  photos: { place: string; fileName?: string; capturedAt?: string; lastModified?: number }[]
): Promise<TravelCourse> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/photos/travel-course', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photos }),
  });
  const body = (await response.json()) as TravelCourse & { error?: string };
  if (!response.ok) throw new Error(body.error || '여행 코스를 만들지 못했습니다.');
  return body;
}

export async function requestGalmaetgilMatch(
  user: User,
  places: string[]
): Promise<GalmaetgilPlaceMatch[]> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/photos/galmaetgil-match', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ places }),
  });
  const body = (await response.json()) as { matches?: GalmaetgilPlaceMatch[]; error?: string };
  if (!response.ok) throw new Error(body.error || '갈맷길 매칭에 실패했습니다.');
  return body.matches ?? [];
}

export async function requestContentPack(
  user: User,
  photos: PhotoAnalysis[],
  galmaetgil?: GalmaetgilPlaceMatch[]
): Promise<ContentPack> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/photos/content-pack', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photos, galmaetgil: galmaetgil ?? [] }),
  });
  const body = (await response.json()) as ContentPack & { error?: string };
  if (!response.ok) throw new Error(body.error || '콘텐츠를 만들지 못했습니다.');
  return body;
}
