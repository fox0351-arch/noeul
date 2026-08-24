import Link from 'next/link';
import LocationSimPanel from './LocationSimPanel';
import { isLocationSimAllowed } from '@/lib/locationSimAccess';

export default function LocationSimPage() {
  if (!isLocationSimAllowed()) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-black">위치 시뮬이 꺼져 있습니다</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-700">
          운영 빌드에는 가상 GPS를 넣지 않습니다. 로컬 개발(`next dev`)에서만
          {' '}
          <code className="px-1 bg-slate-100">/admin/test/location-sim</code>
          을 쓸 수 있습니다. 개발에서도 끄려면
          {' '}
          <code className="px-1 bg-slate-100">NEXT_PUBLIC_ENABLE_LOCATION_SIM=false</code>
          를 넣으세요.
        </p>
        <Link href="/" className="inline-block mt-6 font-bold underline">홈으로</Link>
      </main>
    );
  }

  return <LocationSimPanel />;
}
