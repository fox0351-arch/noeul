import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { readSelectedDriveFolder, saveSelectedDriveFolder } from '@/lib/googleDrive/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    return NextResponse.json({ folder: await readSelectedDriveFolder(user.uid) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '저장 폴더를 읽지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    const body = (await request.json()) as { id?: unknown; name?: unknown };
    if (typeof body.id !== 'string' || typeof body.name !== 'string' || !body.id || !body.name.trim()) {
      return NextResponse.json({ error: '폴더 정보가 올바르지 않습니다.' }, { status: 400 });
    }
    await saveSelectedDriveFolder(user.uid, { id: body.id, name: body.name.trim() });
    return NextResponse.json({ ok: true, folder: { id: body.id, name: body.name.trim() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '저장 폴더를 기록하지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
