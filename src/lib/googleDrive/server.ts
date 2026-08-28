import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { getFirebaseAdminServices } from '@/lib/firebase/admin';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const STATE_TTL_MS = 10 * 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return value;
}

function encryptionKey(): Buffer {
  return createHash('sha256').update(requiredEnv('GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY')).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decrypt(value: string): string {
  const [ivPart, tagPart, encryptedPart] = value.split('.');
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('저장된 Drive 인증 정보가 올바르지 않습니다.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivPart, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function createDriveOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    requiredEnv('GOOGLE_DRIVE_CLIENT_ID'),
    requiredEnv('GOOGLE_DRIVE_CLIENT_SECRET'),
    requiredEnv('GOOGLE_DRIVE_REDIRECT_URI')
  );
}

export async function createDriveAuthorization(uid: string): Promise<string> {
  const state = randomBytes(32).toString('base64url');
  const { db } = getFirebaseAdminServices();
  await db.collection('driveOAuthStates').doc(state).set({
    uid,
    expiresAtMs: Date.now() + STATE_TTL_MS,
  });
  return createDriveOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [DRIVE_SCOPE],
    state,
  });
}

export async function consumeDriveAuthorizationState(state: string): Promise<string> {
  const { db } = getFirebaseAdminServices();
  const reference = db.collection('driveOAuthStates').doc(state);
  const snapshot = await reference.get();
  await reference.delete();
  const data = snapshot.data() as { uid?: unknown; expiresAtMs?: unknown } | undefined;
  if (
    !snapshot.exists ||
    typeof data?.uid !== 'string' ||
    typeof data.expiresAtMs !== 'number' ||
    data.expiresAtMs < Date.now()
  ) {
    throw new Error('Drive 연결 요청이 만료되었거나 올바르지 않습니다.');
  }
  return data.uid;
}

export async function saveDriveRefreshToken(uid: string, refreshToken: string): Promise<void> {
  const { db } = getFirebaseAdminServices();
  await db.collection('driveCredentials').doc(uid).set(
    {
      encryptedRefreshToken: encrypt(refreshToken),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );
  await db.doc(`users/${uid}/integrations/drive`).set(
    {
      connected: true,
      connectedAtMs: Date.now(),
    },
    { merge: true }
  );
}

async function readRefreshToken(uid: string): Promise<string | null> {
  const snapshot = await getFirebaseAdminServices().db.collection('driveCredentials').doc(uid).get();
  const encrypted = snapshot.get('encryptedRefreshToken');
  return typeof encrypted === 'string' ? decrypt(encrypted) : null;
}

export async function saveSelectedDriveFolder(
  uid: string,
  folder: { id: string; name: string }
): Promise<void> {
  const { db } = getFirebaseAdminServices();
  await db.doc(`users/${uid}/integrations/drive`).set(
    {
      connected: true,
      selectedFolderId: folder.id,
      selectedFolderName: folder.name,
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );
}

export async function readSelectedDriveFolder(
  uid: string
): Promise<{ id: string; name: string } | null> {
  const snapshot = await getFirebaseAdminServices().db.doc(`users/${uid}/integrations/drive`).get();
  const id = snapshot.get('selectedFolderId');
  const name = snapshot.get('selectedFolderName');
  return typeof id === 'string' && typeof name === 'string' ? { id, name } : null;
}

export async function hasDriveConnection(uid: string): Promise<boolean> {
  return (await readRefreshToken(uid)) != null;
}

export async function getDriveAccessToken(uid: string): Promise<string> {
  const refreshToken = await readRefreshToken(uid);
  if (!refreshToken) throw new Error('Google Drive가 연결되지 않았습니다.');
  const client = createDriveOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const response = await client.getAccessToken();
  if (!response.token) throw new Error('Google Drive 접근 권한을 갱신하지 못했습니다.');
  return response.token;
}

export async function downloadDrivePhoto(
  uid: string,
  fileId: string
): Promise<{
  mimeType: string;
  base64: string;
  name: string;
  webViewLink: string;
  downloadUrl: string;
}> {
  const accessToken = await getDriveAccessToken(uid);
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name,size,webViewLink`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const metaResponse = await fetch(metaUrl, { headers });
  if (!metaResponse.ok) {
    throw new Error('Google Drive에서 사진 정보를 읽지 못했습니다.');
  }
  const meta = (await metaResponse.json()) as {
    mimeType?: string;
    name?: string;
    size?: string;
    webViewLink?: string;
  };
  const mimeType = meta.mimeType || 'image/jpeg';
  if (!mimeType.startsWith('image/')) {
    throw new Error('이미지 파일만 분석할 수 있습니다.');
  }
  const size = Number(meta.size ?? 0);
  if (size > 15 * 1024 * 1024) {
    throw new Error('사진이 너무 커서 Gemini로 분석하지 못했습니다.');
  }

  const mediaResponse = await fetch(downloadUrl, { headers });
  if (!mediaResponse.ok) {
    throw new Error('Google Drive에서 사진을 내려받지 못했습니다.');
  }
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());
  if (bytes.length < 32) {
    throw new Error('Google Drive에서 받은 사진 데이터가 비어 있습니다.');
  }

  return {
    mimeType,
    base64: bytes.toString('base64'),
    name: meta.name || fileId,
    webViewLink: meta.webViewLink || '',
    downloadUrl,
  };
}
