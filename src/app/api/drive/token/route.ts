import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { getDriveAccessToken } from '@/lib/googleDrive/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    const accessToken = await getDriveAccessToken(user.uid);
    return NextResponse.json({ accessToken, expiresInSeconds: 3000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 접근 권한을 받지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
