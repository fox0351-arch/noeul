import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminServices } from '@/lib/firebase/admin';
import { downloadDrivePhoto } from '@/lib/googleDrive/server';
import { analyzeDriveImageWithGemini } from '@/lib/photoAi';
import type { PhotoPipelineResult } from '@/types/photoPipeline';

function mediaRef(uid: string, driveFileId: string) {
  return getFirebaseAdminServices().db.doc(`users/${uid}/media/${driveFileId}`);
}

export async function runPhotoPipeline(
  uid: string,
  input: { driveFileId: string }
): Promise<PhotoPipelineResult> {
  const media = mediaRef(uid, input.driveFileId);
  const uploadedAt = new Date().toISOString();

  try {
    await media.set(
      {
        status: 'analyzing',
        uploadedAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const driveFile = await downloadDrivePhoto(uid, input.driveFileId);
    await media.set(
      {
        driveWebViewLink: driveFile.webViewLink,
        driveDownloadUrl: driveFile.downloadUrl,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const analysis = await analyzeDriveImageWithGemini({
      mimeType: driveFile.mimeType,
      data: driveFile.base64,
    });

    await media.set(
      {
        status: 'analyzed',
        scene: analysis.analysis.scene,
        caption: analysis.analysis.caption,
        subjects: analysis.analysis.subjects,
        keywords: analysis.analysis.keywords,
        confidence: analysis.analysis.confidence,
        landmark: analysis.analysis.landmark ?? '',
        analysis: analysis.analysis,
        geminiAnalysis: analysis.display,
        photoAnalysis: {
          place: analysis.display?.placeName ?? '',
          description: analysis.display?.caption ?? '',
          objects: analysis.display?.objects ?? [],
          mood: analysis.display?.mood ?? '',
          keywords: analysis.display?.blogKeywords ?? [],
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      status: 'analyzed',
      analysis: analysis.analysis,
      geminiAnalysis: analysis.display,
      rawGeminiJson: analysis.raw,
      placeEstimate: null,
      trailMatch: null,
      draft: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '사진 분석에 실패했습니다.';
    await media.set(
      {
        status: 'needs_review',
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new Error(message);
  }
}
