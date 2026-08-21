'use client';

import { PlaceDetails, PlaceItem } from '@/types/place';

interface PlaceDetailCardProps {
  place: PlaceItem;
  details: PlaceDetails | null;
  isLoading: boolean;
  error: string;
  onClose: () => void;
}

export default function PlaceDetailCard({
  place,
  details,
  isLoading,
  error,
  onClose,
}: PlaceDetailCardProps) {
  const name = details?.name || place.name;
  const address = details?.address || place.address;
  const rating = details?.rating ?? place.rating;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <button
        type="button"
        aria-label="상세 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <article className="relative z-10 flex flex-col w-full max-h-[88vh] overflow-hidden bg-white shadow-sm md:max-w-[440px] md:rounded-2xl rounded-t-2xl">
        <div className="relative shrink-0 bg-slate-100 aspect-[16/10] max-h-52">
          {details?.photoUrl ? (
            <img src={details.photoUrl} alt={name} className="object-cover w-full h-full" />
          ) : (
            <div className="flex items-center justify-center w-full h-full text-sm text-slate-400">
              {isLoading ? '사진을 불러오는 중...' : '대표 사진 없음'}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute flex items-center justify-center text-lg font-bold bg-white rounded-full top-3 right-3 w-11 h-11 text-slate-700"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 px-4 py-4 overflow-y-auto md:px-5">
          <h2 className="text-xl font-bold leading-snug text-slate-900">{name}</h2>
          <p className="mt-1 text-sm text-slate-500">{address}</p>
          <p className="mt-2 text-base font-semibold text-amber-500">
            ★ {rating ?? '평점 없음'}
            {details?.userRatingCount ? (
              <span className="ml-1 text-xs font-normal text-slate-400">({details.userRatingCount})</span>
            ) : null}
          </p>

          {isLoading && <p className="mt-4 text-sm text-slate-400">상세 정보를 불러오는 중...</p>}
          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

          {details?.blogSummary && (
            <section className="pt-4 mt-4 border-t border-slate-100">
              <h3 className="mb-2 text-sm font-bold text-slate-800">한눈에 보기</h3>
              <p className="text-[15px] leading-7 text-slate-700">{details.blogSummary}</p>
            </section>
          )}

          {details?.description && (
            <section className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-slate-800">장소 설명</h3>
              <p className="text-sm leading-6 text-slate-600">{details.description}</p>
            </section>
          )}

          {details && details.openingHours.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-slate-800">운영시간</h3>
              <ul className="space-y-1 text-sm text-slate-600">
                {details.openingHours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {(details?.phone || details?.website) && (
            <section className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-slate-800">연락처</h3>
              {details.phone && (
                <a href={`tel:${details.phone}`} className="block text-sm text-blue-600 min-h-11 leading-[44px]">
                  전화 {details.phone}
                </a>
              )}
              {details.website && (
                <a
                  href={details.website}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-blue-600 break-all min-h-11 leading-[44px]"
                >
                  홈페이지
                </a>
              )}
            </section>
          )}

          {details && details.reviews.length > 0 && (
            <section className="mt-4 mb-2">
              <h3 className="mb-2 text-sm font-bold text-slate-800">방문 후기</h3>
              <div className="space-y-3">
                {details.reviews.map((review, index) => (
                  <div key={`${review.author}-${index}`} className="p-3 rounded-xl bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{review.author}</span>
                      <span className="text-xs text-amber-500">★ {review.rating ?? '-'}</span>
                    </div>
                    {review.relativeTime && (
                      <p className="mt-0.5 text-xs text-slate-400">{review.relativeTime}</p>
                    )}
                    <p className="mt-2 text-sm leading-6 text-slate-600">{review.text}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </div>
  );
}
