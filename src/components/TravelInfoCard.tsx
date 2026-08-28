'use client';

import type { TravelPlaceInfo } from '@/types/travelInfo';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-slate-50 rounded-xl">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-base font-medium leading-relaxed text-slate-900">{value?.trim() || '확인 불가'}</p>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] | undefined }) {
  const list = (items ?? []).filter(Boolean);
  return (
    <div className="p-3 bg-slate-50 rounded-xl">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      {list.length ? (
        <ul className="mt-2 space-y-1">
          {list.map((item) => (
            <li key={item} className="text-base font-medium text-slate-900">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-base text-slate-500">확인 불가</p>
      )}
    </div>
  );
}

type TravelInfoCardProps = {
  infos?: TravelPlaceInfo[] | null;
  error?: string | null;
};

export default function TravelInfoCard({ infos, error }: TravelInfoCardProps) {
  if (error) {
    return (
      <section className="p-4 mt-4 bg-white border border-red-200 shadow-md rounded-2xl">
        <h3 className="text-lg font-black text-red-800">여행 정보를 만들지 못했습니다</h3>
        <p className="mt-2 leading-relaxed text-red-700">{error}</p>
      </section>
    );
  }

  if (!infos?.length) return null;

  return (
    <section className="mt-0 space-y-3">
      {infos.map((info) => (
        <article key={info.placeName} className="p-4 bg-white shadow-md rounded-2xl sm:p-5">
          <p className="text-sm font-bold text-sky-700">여행 정보</p>
          <h3 className="mt-1 text-xl font-black text-slate-900">{info.placeName || '장소 미확인'}</h3>
          <div className="grid grid-cols-1 gap-2 mt-3 sm:grid-cols-2">
            <Row label="주차 가능 여부" value={info.parking} />
            <Row label="화장실 여부" value={info.toilet} />
            <Row label="차박 가능 여부" value={info.carCamping} />
            <Row label="난이도" value={info.difficulty} />
            <Row label="시니어 추천도" value={info.seniorRecommend} />
          </div>
          <div className="grid grid-cols-1 gap-2 mt-2 sm:grid-cols-2">
            <Chips label="추천 맛집" items={info.restaurants} />
            <Chips label="추천 카페" items={info.cafes} />
          </div>
        </article>
      ))}
    </section>
  );
}
