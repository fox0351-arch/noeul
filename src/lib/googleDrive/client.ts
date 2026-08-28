import type { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseServices } from '@/lib/firebase/client';

export type DriveFolder = {
  id: string;
  name: string;
};

export type DriveUploadedFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  createdTime?: string;
};

export type SelectedDriveFolder = DriveFolder;

async function authenticatedRequest(user: User, url: string, init?: RequestInit): Promise<Response> {
  const idToken = await user.getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${idToken}`,
    },
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || '요청을 처리하지 못했습니다.');
  return body;
}

export async function beginDriveConnection(user: User): Promise<void> {
  const response = await authenticatedRequest(user, '/api/drive/connect', { method: 'POST' });
  const body = await readJson<{ authorizationUrl: string }>(response);
  window.location.assign(body.authorizationUrl);
}

export async function checkDriveConnection(user: User): Promise<boolean> {
  const response = await authenticatedRequest(user, '/api/drive/status');
  return (await readJson<{ connected: boolean }>(response)).connected;
}

export async function requestDriveAccessToken(user: User): Promise<string> {
  const response = await authenticatedRequest(user, '/api/drive/token', { method: 'POST' });
  return (await readJson<{ accessToken: string }>(response)).accessToken;
}

export async function saveSelectedDriveFolder(user: User, folder: DriveFolder): Promise<void> {
  const response = await authenticatedRequest(user, '/api/drive/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: folder.id, name: folder.name }),
  });
  await readJson(response);
}

export async function readSelectedDriveFolder(user: User): Promise<SelectedDriveFolder | null> {
  const response = await authenticatedRequest(user, '/api/drive/folder');
  return (await readJson<{ folder: SelectedDriveFolder | null }>(response)).folder;
}

async function driveJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || 'Google Drive 요청에 실패했습니다.');
  return body;
}

export async function listDriveFolders(
  accessToken: string,
  parentId = 'root'
): Promise<DriveFolder[]> {
  const query = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const search = new URLSearchParams({
    q: query,
    fields: 'files(id,name)',
    orderBy: 'name',
    pageSize: '100',
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${search}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await driveJson<{ files: DriveFolder[] }>(response)).files;
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId = 'root'
): Promise<DriveFolder> {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  return driveJson<DriveFolder>(response);
}

export async function uploadPhotoToDrive(
  accessToken: string,
  file: File,
  folderId: string
): Promise<DriveUploadedFile> {
  const boundary = `noeul_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    parents: [folderId],
  });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );
  const search = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,name,mimeType,size,webViewLink,createdTime',
  });
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${search}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  return driveJson<DriveUploadedFile>(response);
}

export async function uploadPlacePhotosToDrive(
  user: User,
  files: File[],
  context: { placeId: string; travelMapId?: string | null; photoIds?: string[] }
): Promise<DriveUploadedFile[]> {
  const folder = await readSelectedDriveFolder(user);
  if (!folder) throw new Error('Drive 시험 화면에서 사진 저장 폴더를 먼저 선택해 주세요.');
  const accessToken = await requestDriveAccessToken(user);
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase가 설정되지 않았습니다.');
  const results: DriveUploadedFile[] = [];
  const photos = files.filter((item) => item.type.startsWith('image/'));
  for (const [index, file] of photos.entries()) {
    const uploaded = await uploadPhotoToDrive(accessToken, file, folder.id);
    await setDoc(doc(services.db, 'users', user.uid, 'media', uploaded.id), {
      driveFileId: uploaded.id,
      driveFolderId: folder.id,
      localPhotoId: context.photoIds?.[index] ?? null,
      placeId: context.placeId,
      travelMapId: context.travelMapId ?? null,
      name: uploaded.name,
      mimeType: uploaded.mimeType,
      size: Number(uploaded.size ?? file.size),
      kind: 'photo',
      status: 'uploaded',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    results.push(uploaded);
  }
  return results;
}
