import type { PhotoAiAnalysis } from './place';
import type { GeminiAnalysisResult } from './geminiAnalysis';

export type PhotoPipelineStatus =
  | 'uploaded'
  | 'analyzing'
  | 'analyzed'
  | 'estimated'
  | 'matched'
  | 'drafted'
  | 'needs_review';

export type PlaceEstimateSource = 'exif' | 'places_nearby' | 'reverse_geocode' | 'gemini_landmark';

export interface PlaceEstimate {
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: PlaceEstimateSource;
  confidence: number;
}

export interface TrailMatch {
  courseId: string;
  sectionId: string;
  sectionName: string;
  distanceM: number;
  confidence: number;
}

export interface PhotoPipelineDraft {
  id: string;
  title: string;
  content: string;
  hashtags: string[];
}

export interface PhotoPipelineResult {
  status: PhotoPipelineStatus;
  analysis: PhotoAiAnalysis | null;
  geminiAnalysis: GeminiAnalysisResult | null;
  rawGeminiJson?: unknown;
  placeEstimate: PlaceEstimate | null;
  trailMatch: TrailMatch | null;
  draft: PhotoPipelineDraft | null;
  error?: string;
}

export interface PhotoPipelineInput {
  driveFileId: string;
}
