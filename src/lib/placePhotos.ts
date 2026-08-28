import { PlacePhoto } from '@/types/place';

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
      const dataUrl = await compressImageFile(file);
      photos.push({ id: createPlacePhotoId(), dataUrl });
    } catch {
      // skip files the browser cannot decode (e.g. some HEIC)
    }
  }

  return photos;
}

async function compressImageFile(file: File): Promise<string> {
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
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: number };
  return err.name === 'QuotaExceededError' || err.code === 22;
}
