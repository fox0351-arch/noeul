import { NextResponse } from 'next/server';

/** 예전 GPX 공유 대상. 홈으로만 돌립니다. */
export async function POST(request: Request) {
  return NextResponse.redirect(new URL('/', request.url), 303);
}
