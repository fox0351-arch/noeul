import type { NextConfig } from "next";

if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_ENABLE_LOCATION_SIM === "true"
) {
  throw new Error(
    "운영 빌드에서는 NEXT_PUBLIC_ENABLE_LOCATION_SIM=true 를 쓸 수 없습니다. 변수를 빼거나 false 로 두고 다시 빌드하세요."
  );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.30.1.17', '172.30.1.*'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
