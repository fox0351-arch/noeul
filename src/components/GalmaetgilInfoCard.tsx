import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-slate-50 rounded-xl">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-base font-medium leading-relaxed break-keep text-slate-900">{value?.trim() || '-'}</p>
    </div>
  );
}

type GalmaetgilInfoCardProps = {
  matches?: GalmaetgilPlaceMatch[] | null;
  error?: string | null;
};

export default function GalmaetgilInfoCard({ matches, error }: GalmaetgilInfoCardProps) {
  if (error) {
    return (
      <section className="p-4 bg-white border border-red-200 shadow-md rounded-2xl">
        <h3 className="text-lg font-black text-red-800">갈맷길 정보를 만들지 못했습니다</h3>
        <p className="mt-2 leading-relaxed text-red-700">{error}</p>
      </section>
    );
  }

  if (!matches?.length) return null;

  return (
    <section className="space-y-3">
      {matches.map((item) => (
        <article key={item.placeName} className="p-4 bg-white shadow-md rounded-2xl sm:p-5">
          <p className="text-sm font-bold text-emerald-700">갈맷길 정보</p>
          <h3 className="mt-1 text-xl font-black leading-snug text-slate-900">{item.placeName}</h3>
          {!item.matched ? (
            <p className="px-3 py-2 mt-3 font-bold text-amber-900 bg-amber-50 rounded-xl">갈맷길 구간 아님</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-500">
                {item.kind === 'nearby'
                  ? `근접 매칭 · 코스까지 ${item.distanceToCourseM ?? 0}m`
                  : '장소명 일치'}
              </p>
              <div className="grid grid-cols-1 gap-2 mt-3">
                <Row label="코스명" value={item.courseName} />
                <Row label="구간명" value={item.sectionName} />
                <div className="grid grid-cols-2 gap-2">
                  <Row label="거리" value={item.distanceLabel} />
                  <Row label="예상시간" value={item.durationLabel} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Row label="난이도" value={item.difficulty} />
                  <Row label="시니어 추천도" value={item.seniorRecommend} />
                </div>
                <Row label="주차정보" value={item.parking} />
                <Row label="화장실정보" value={item.toilet} />
                <Row label="차박가능여부" value={item.carCamping} />
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
