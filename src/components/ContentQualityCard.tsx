import type { ContentQualityScore } from '@/types/contentQuality';

function Bar({ label, score }: { label: string; score: number }) {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const pass = value >= 80;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-bold text-slate-600">{label}</span>
        <span className={pass ? 'font-black text-emerald-700' : 'font-black text-amber-700'}>{value}점</span>
      </div>
      <div className="h-2 mt-1 bg-slate-100 rounded-full">
        <div
          className={`h-2 rounded-full ${pass ? 'bg-emerald-600' : 'bg-amber-500'}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function ContentQualityCard({ quality }: { quality?: ContentQualityScore | null }) {
  if (!quality) {
    return (
      <section className="p-4 mt-4 bg-white shadow-md rounded-2xl sm:p-5">
        <p className="text-sm font-bold text-amber-700">콘텐츠 품질 평가</p>
        <p className="mt-2 text-sm text-slate-500">블로그 초안이 준비되면 점수가 표시됩니다.</p>
      </section>
    );
  }
  const overall = quality.overall ?? 0;

  return (
    <section className="p-4 mt-4 bg-white shadow-md rounded-2xl sm:p-5">
      <p className="text-sm font-bold text-amber-700">콘텐츠 품질 평가</p>
      <div className="flex flex-wrap gap-2 items-end mt-2">
        <p className="text-3xl font-black text-slate-900">{overall}점</p>
        <p className="text-sm text-slate-500">100점 만점 · 기준 80점</p>
      </div>
      {quality.rewritten ? (
        <p className="px-3 py-2 mt-3 text-sm font-bold text-emerald-900 bg-emerald-50 rounded-xl">
          80점 미만이라 {quality.rewriteCount || 1}회 자동 재작성했습니다.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">첫 초안이 기준을 넘겨 재작성하지 않았습니다.</p>
      )}
      <div className="mt-4 space-y-3">
        <Bar label="SEO 점수" score={quality.seo} />
        <Bar label="가독성 점수" score={quality.readability} />
        <Bar label="감성 점수" score={quality.emotion} />
        <Bar label="여행 정보 충실도" score={quality.travelInfo} />
        <Bar label="갈맷길 정보 활용도" score={quality.galmaetgil} />
      </div>
      {(quality.reasons ?? []).length > 0 && (
        <div className="pt-3 mt-4 border-t border-slate-100">
          <p className="text-sm font-bold text-slate-500">개선 사유</p>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed list-disc list-inside text-slate-700">
            {quality.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
