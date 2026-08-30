import { PlacePhoto } from '@/types/place';
import { readCaptureTimeFromImageFile } from '@/lib/photoExif';

const MAX_EDGE = 800;
const JPEG_QUALITY = 0.62;
export const MAX_PHOTOS_PER_PLACE = 24;

export function createPlacePhotoId(): string {
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function fileToCompressedDataUrl(file: File): Promise<string> {
  return compressImageFile(file);
}

export async function filesToPlacePhotos(files: FileList | File[]): Promise<PlacePhoto[]> {
  const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
  const photos: PlacePhoto[] = [];

  for (const file of list) {
    try {
      const takenAt = (await readCaptureTimeFromImageFile(file)) || undefined;
      const dataUrl = await compressImageFile(file);
      photos.push({ id: createPlacePhotoId(), dataUrl, ...(takenAt ? { takenAt } : {}) });
    } catch {
      // skip files the browser cannot decode (e.g. some HEIC)
    }
  }

  return photos;
}

async function compressImageFile(file: File): Promise<string> {
  console.log(
    `[base64-trace] file-read fileName=${file.name} fileType=${file.type} fileSize=${file.size}`
  );
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('canvas');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const comma = dataUrl.indexOf(',');
  const mimeMatch = dataUrl.slice(0, Math.max(comma, 0)).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64$/);
  const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  console.log(
    `[base64-trace] canvas.toDataURL mimeType=${mimeMatch?.[1] || 'unknown'} dataLength=${data.length} head50=${data.slice(0, 50)} tail50=${data.slice(-50)}`
  );
  return dataUrl;
}

export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: number };
  return err.name === 'QuotaExceededError' || err.code === 22;
}
