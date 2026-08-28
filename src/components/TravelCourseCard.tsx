import type { TravelCourse } from '@/types/travelCourse';

type TravelCourseCardProps = {
  course?: TravelCourse | null;
  error?: string | null;
};

export default function TravelCourseCard({ course, error }: TravelCourseCardProps) {
  if (error) {
    return (
      <section className="p-4 mt-4 bg-white border border-red-200 shadow-md rounded-2xl">
        <h3 className="text-lg font-black text-red-800">여행 코스를 만들지 못했습니다</h3>
        <p className="mt-2 leading-relaxed text-red-700">{error}</p>
      </section>
    );
  }

  if (!course) return null;

  const orderLabel =
    course.orderSource === 'exif' ? '촬영 시각 순' : course.orderSource === 'file' ? '파일 시간 순' : '업로드 순';

  return (
    <section className="p-4 mt-4 bg-white shadow-md rounded-2xl sm:p-5">
      <p className="text-sm font-bold text-violet-700">여행 코스</p>
      <h3 className="mt-1 text-xl font-black text-slate-900">여행 코스 요약</h3>
      <p className="mt-2 text-base leading-relaxed text-slate-700">{course.summary}</p>
      <p className="mt-1 text-sm text-slate-500">{orderLabel} · 도보 이동 + 장소당 체류 20분</p>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="p-3 bg-slate-50 rounded-xl">
          <p className="text-xs font-bold text-slate-500">총 거리</p>
          <p className="mt-1 text-lg font-black text-slate-900">{course.distanceLabel}</p>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <p className="text-xs font-bold text-slate-500">총 시간</p>
          <p className="mt-1 text-lg font-black text-slate-900">{course.durationLabel}</p>
        </div>
      </div>

      <p className="mt-4 text-sm font-bold text-slate-500">방문 순서</p>
      <ol className="mt-2 space-y-2">
        {(course.stops ?? []).map((stop) => (
          <li key={`${stop.order}-${stop.name}`} className="flex gap-3 items-start">
            <span className="flex shrink-0 justify-center items-center w-8 h-8 font-black text-white bg-violet-700 rounded-full">
              {stop.order}
            </span>
            <div>
              <p className="font-bold text-slate-900">{stop.name}</p>
              <p className="text-xs text-slate-500">
                {stop.source === 'galmaetgil' ? '갈맷길 GPS' : 'Google Places'}
                {stop.capturedAt ? ` · ${stop.capturedAt.replace('T', ' ')}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
