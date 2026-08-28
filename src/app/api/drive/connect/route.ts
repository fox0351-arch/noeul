import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { createDriveAuthorization } from '@/lib/googleDrive/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    const authorizationUrl = await createDriveAuthorization(user.uid);
    return NextResponse.json({ authorizationUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 연결을 시작하지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
