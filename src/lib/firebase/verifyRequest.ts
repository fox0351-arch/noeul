import type { NextRequest } from 'next/server';
import { getFirebaseAdminServices } from './admin';

export async function verifyRequestUser(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('로그인이 필요합니다.');
  }
  const idToken = authorization.slice('Bearer '.length);
  return getFirebaseAdminServices().auth.verifyIdToken(idToken);
}
