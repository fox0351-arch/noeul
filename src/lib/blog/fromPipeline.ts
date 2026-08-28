import { parseGeminiAnalysisResult } from '@/lib/geminiAnalysis';
import type { PhotoAnalysis } from '@/types/blog';
import type { GeminiAnalysisResult } from '@/types/geminiAnalysis';
import type { PhotoPipelineResult } from '@/types/photoPipeline';

export function photoAnalysisFromGemini(
  gemini: GeminiAnalysisResult | null | undefined,
  meta: { driveFileId: string; fileName: string; capturedAt?: string; lastModified?: number }
): PhotoAnalysis {
  return {
    driveFileId: meta.driveFileId,
    fileName: meta.fileName,
    place: gemini?.placeName?.trim() || '',
    description: gemini?.caption?.trim() || '',
    objects: Array.isArray(gemini?.objects) ? gemini.objects.filter(Boolean) : [],
    mood: gemini?.mood?.trim() || '',
    keywords: Array.isArray(gemini?.blogKeywords) && gemini.blogKeywords.length
      ? gemini.blogKeywords.filter(Boolean)
      : Array.isArray(gemini?.tags)
        ? gemini.tags.filter(Boolean)
        : [],
    status: 'analyzed',
    capturedAt: meta.capturedAt,
    lastModified: meta.lastModified,
  };
}

export function photoAnalysisFromPipeline(
  pipeline: PhotoPipelineResult | null | undefined,
  meta: { driveFileId: string; fileName: string; capturedAt?: string; lastModified?: number }
): PhotoAnalysis {
  const gemini =
    pipeline?.geminiAnalysis ??
    (pipeline?.analysis ? parseGeminiAnalysisResult(pipeline.analysis) : null);
  return photoAnalysisFromGemini(gemini, meta);
}
