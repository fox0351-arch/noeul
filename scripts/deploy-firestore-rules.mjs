import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

function parseEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value.replace(/\\n/g, '\n');
  }
  return values;
}

const env = parseEnv(await readFile(resolve(process.cwd(), '.env.local'), 'utf8'));
const projectId = env.FIREBASE_ADMIN_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Firebase Admin 환경변수가 없습니다.');
}

const source = await readFile(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const auth = new GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  projectId,
  scopes: ['https://www.googleapis.com/auth/firebase'],
});
const client = await auth.getClient();
const token = await client.getAccessToken();
if (!token.token) throw new Error('Firebase Rules 배포 토큰을 받지 못했습니다.');

const headers = {
  Authorization: `Bearer ${token.token}`,
  'Content-Type': 'application/json',
};

const created = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source: { files: [{ name: 'firestore.rules', content: source }] },
  }),
});
const createdBody = await created.json();
if (!created.ok) {
  throw new Error(createdBody.error?.message || 'Firestore ruleset 생성에 실패했습니다.');
}

const releaseName = `projects/${projectId}/releases/cloud.firestore`;
const released = await fetch(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    release: {
      name: releaseName,
      rulesetName: createdBody.name,
    },
    updateMask: 'rulesetName',
  }),
});
if (released.status === 404) {
  const createdRelease = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: releaseName,
      rulesetName: createdBody.name,
    }),
  });
  const releaseBody = await createdRelease.json();
  if (!createdRelease.ok) {
    throw new Error(releaseBody.error?.message || 'Firestore rules 릴리스 생성에 실패했습니다.');
  }
} else if (!released.ok) {
  const releaseBody = await released.json();
  throw new Error(releaseBody.error?.message || 'Firestore rules 릴리스 갱신에 실패했습니다.');
}

console.log('Firestore security rules deployed.');
