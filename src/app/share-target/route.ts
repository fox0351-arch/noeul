import { NextResponse } from 'next/server';

/** SW가 아직 없으면 POST가 여기로 옵니다. 파일은 전달되지 않으므로 홈으로만 돌립니다. */
export async function POST(request: Request) {
  return NextResponse.redirect(new URL('/?shared=gpx', request.url), 303);
}
