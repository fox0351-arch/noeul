'use client';

import { PlaceDetails, PlaceItem } from '@/types/place';
import { campingShort, parkingShort, placeAmenity } from '@/lib/placeAmenity';

interface PlaceDetailCardProps {
  place: PlaceItem;
  details: PlaceDetails | null;
  isLoading: boolean;
  error: string;
  query?: string;
  onClose: () => void;
}

export default function PlaceDetailCard({
  place,
  details,
  isLoading,
  error,
  query,
  onClose,
}: PlaceDetailCardProps) {
  const amenity = placeAmenity(place, query);
  const name = details?.name || place.name;
  const address = details?.address || place.address;
  const intro = details?.description || details?.blogSummary || amenity.intro;
  const hours = details?.openingHours?.length ? details.openingHours : [];

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white">
      <header className="flex items-center gap-2 px-3 py-3 border-b shrink-0 border-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center text-2xl font-black rounded-xl shrink-0 w-14 h-14 bg-slate-100 text-slate-800"
          aria-label="뒤로가기"
        >
          ←
        </button>
        <h2 className="flex-1 min-w-0 text-xl font-black leading-snug text-slate-900">{name}</h2>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {details?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={details.photoUrl} alt={name} className="object-cover w-full h-48 bg-slate-100" />
        ) : (
          <div className="flex items-center justify-center h-28 text-lg text-slate-400 bg-slate-100">
            {isLoading ? '사진을 불러오는 중...' : '대표 사진 없음'}
          </div>
        )}

        <div className="px-5 py-5 space-y-6">
          {isLoading && <p className="text-lg text-slate-500">상세 정보를 불러오는 중...</p>}
          {error && <p className="text-lg font-semibold text-red-600">{error}</p>}

          <section>
            <h3 className="mb-2 text-xl font-black text-slate-800">관광지 소개</h3>
            <p className="text-lg leading-8 text-slate-700">{intro}</p>
          </section>

          <section>
            <h3 className="mb-2 text-xl font-black text-slate-800">주소</h3>
            <p className="text-lg leading-8 text-slate-700">{address || '주소 정보 없음'}</p>
          </section>

          <section>
            <h3 className="mb-2 text-xl font-black text-slate-800">운영시간</h3>
            {hours.length > 0 ? (
              <ul className="space-y-1 text-lg leading-8 text-slate-700">
                {hours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-lg leading-8 text-slate-700">운영시간은 현지 안내를 확인해 주세요.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xl font-black text-slate-800">주차</h3>
            <p className="text-lg font-bold text-amber-700">{parkingShort(amenity.parking)}</p>
            <p className="mt-1 text-lg leading-8 text-slate-700">{amenity.parking}</p>
          </section>

          <section>
            <h3 className="mb-2 text-xl font-black text-slate-800">차박</h3>
            <p className="text-lg font-bold text-amber-700">{campingShort(amenity.carCamping)}</p>
            <p className="mt-1 text-lg leading-8 text-slate-700">{amenity.carCamping}</p>
          </section>

          <section>
            <h3 className="mb-2 text-xl font-black text-slate-800">추천 방문 시간</h3>
            <p className="text-lg leading-8 text-slate-700">{amenity.visitTime}</p>
          </section>

          <section className="pb-8">
            <h3 className="mb-2 text-xl font-black text-slate-800">주변 맛집</h3>
            <ul className="space-y-2 text-lg leading-8 text-slate-700">
              {amenity.restaurants.slice(0, 3).map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="p-4 border-t shrink-0 border-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="w-full text-xl font-black text-white rounded-xl min-h-14 bg-amber-600"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
