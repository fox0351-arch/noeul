import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { hasDriveConnection } from '@/lib/googleDrive/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    return NextResponse.json({ connected: await hasDriveConnection(user.uid) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 연결 상태를 확인하지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
