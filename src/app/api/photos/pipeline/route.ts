import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase/verifyRequest';
import { runPhotoPipeline } from '@/lib/photoPipeline/run';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const geminiEnvName = 'GEMINI_API_KEY';
  const geminiKeyPresent = Boolean(process.env[geminiEnvName]?.trim());
  console.log('[노을-gemini] env name:', geminiEnvName, 'present:', geminiKeyPresent);

  try {
    const user = await verifyRequestUser(request);
    const body = (await request.json()) as { driveFileId?: unknown };
    if (typeof body.driveFileId !== 'string' || !body.driveFileId) {
      return NextResponse.json({ error: '사진 파일 ID가 필요합니다.' }, { status: 400 });
    }
    const result = await runPhotoPipeline(user.uid, { driveFileId: body.driveFileId });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '사진 분석을 실행하지 못했습니다.';
    const status = message.includes('로그인') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
