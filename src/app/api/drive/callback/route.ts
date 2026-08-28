import { NextRequest, NextResponse } from 'next/server';
import {
  consumeDriveAuthorizationState,
  createDriveOAuthClient,
  hasDriveConnection,
  saveDriveRefreshToken,
} from '@/lib/googleDrive/server';

export const runtime = 'nodejs';

function resultUrl(request: NextRequest, result: 'connected' | 'error'): URL {
  return new URL(`/admin/test/drive?drive=${result}`, request.url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const denied = request.nextUrl.searchParams.get('error');
  if (!code || !state || denied) {
    return NextResponse.redirect(resultUrl(request, 'error'));
  }

  try {
    const uid = await consumeDriveAuthorizationState(state);
    const client = createDriveOAuthClient();
    const { tokens } = await client.getToken(code);
    if (tokens.refresh_token) {
      await saveDriveRefreshToken(uid, tokens.refresh_token);
    } else if (!(await hasDriveConnection(uid))) {
      throw new Error('Google Drive 갱신 권한을 받지 못했습니다.');
    }
    return NextResponse.redirect(resultUrl(request, 'connected'));
  } catch (error) {
    console.error('[노을-drive] OAuth callback failed', error);
    return NextResponse.redirect(resultUrl(request, 'error'));
  }
}
