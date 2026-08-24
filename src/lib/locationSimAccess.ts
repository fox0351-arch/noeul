/**
 * 위치 시뮬은 개발(`next dev`)에서만 켤 수 있습니다.
 * 운영 빌드(`next build`)는 NEXT_PUBLIC_ENABLE_LOCATION_SIM=true 이면 중단됩니다.
 */
export function isLocationSimAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.NEXT_PUBLIC_ENABLE_LOCATION_SIM === 'false') return false;
  return true;
}
