'use client';

import { useEffect } from 'react';

/** 예전 홈 주소 ?sim=1 을 관리자 시뮬 페이지로 보냅니다. */
export default function SimQueryRedirect() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('sim') === '1') {
      window.location.replace('/admin/test/location-sim');
    }
  }, []);
  return null;
}
