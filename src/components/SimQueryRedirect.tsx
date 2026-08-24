'use client';

import { useEffect } from 'react';

/** 예전 홈 주소 ?sim=1 을 관리자 시뮬 페이지로 보냅니다. */
export default function SimQueryRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const simOn =
      params.get('sim') === '1' ||
      params.get('sim') === '1' ||
      /(?:^|[?&])sim=1(?:&|$)/.test(window.location.search);
    if (simOn) {
      window.location.replace('/admin/test/location-sim');
    }
  }, []);
  return null;
}
