'use client';

import { useState } from 'react';
import type { BlogDraft } from '@/types/blog';

type BlogDraftCardProps = {
  draft?: BlogDraft | null;
  error?: string | null;
};

function InfoBox({ text }: { text: string }) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const heading = lines[0] || '[여행 정보]';
  const items = lines.slice(1);
  return (
    <aside className="p-4 bg-slate-50 rounded-xl border border-slate-200">
      <p className="text-sm font-black text-slate-800">{heading.replace(/[\[\]]/g, '')}</p>
      <ul className="mt-3 space-y-1 text-sm leading-relaxed text-slate-700">
        {items.map((item) => (
          <li key={item}>{item.replace(/^- /, '')}</li>
        ))}
      </ul>
    </aside>
  );
}

export default function BlogDraftCard({ draft, error }: BlogDraftCardProps) {
  const [copied, setCopied] = useState(false);

  if (error) {
    return (
      <section className="p-4 mt-4 bg-white border border-red-200 shadow-md rounded-2xl sm:p-5">
        <h3 className="text-lg font-black text-red-800">블로그 초안을 만들지 못했습니다</h3>
        <p className="mt-2 text-base leading-relaxed whitespace-pre-wrap text-red-700">{error}</p>
      </section>
    );
  }

  if (!draft) return null;

  const title = draft.title?.trim() || '제목 없음';
  const summary = draft.summary?.trim() || '요약을 확인하지 못했습니다.';
  const tags = draft.seo?.hashtags ?? [];
  const keywords = draft.seo?.keywords ?? [];
  const sections = [
    { heading: '도입 · 코스 소개', text: draft.intro },
    { heading: '걷는 과정', text: draft.story },
    { heading: '추천 포인트', text: draft.places },
    { heading: '마무리', text: draft.closing },
  ].filter((section) => section.text?.trim());

  const rec = draft.recommendations;
  const copyBody = async () => {
    try {
      const recText = rec
        ? [
            `추천 포토존: ${(rec.photoSpots || []).join(', ')}`,
            `추천 맛집: ${(rec.restaurants || []).join(', ')}`,
            `추천 카페: ${(rec.cafes || []).join(', ')}`,
            `차박 정보: ${rec.carCamping || ''}`,
            `시니어 걷기 난이도: ${rec.seniorDifficulty || ''}`,
          ].join('\n')
        : '';
      await navigator.clipboard.writeText(
        `${title}\n\n${summary}\n\n${draft.infoBox || ''}\n\n${[draft.intro, draft.story, draft.places, draft.closing].filter(Boolean).join('\n\n')}\n\n${recText}`
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="p-5 mt-4 bg-white shadow-md rounded-2xl sm:p-6">
      <p className="text-sm font-bold text-emerald-700">네이버 블로그 초안</p>
      <h3 className="mt-2 text-2xl font-black leading-snug text-slate-900">{title}</h3>
      <p className="mt-2 text-base leading-relaxed text-slate-500">{summary}</p>
      <p className="mt-1 text-sm text-slate-400">본문 {draft.charCount || 0}자 (여행 정보 박스 제외)</p>

      {draft.infoBox ? (
        <div className="mt-4">
          <InfoBox text={draft.infoBox} />
        </div>
      ) : null}

      <div className="pt-4 mt-4 border-t border-slate-100">
        {sections.map((section) => (
          <section key={section.heading} className="mt-5 first:mt-0">
            <h4 className="text-sm font-black text-slate-500">{section.heading}</h4>
            {section.text.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => (
              <p key={index} className="mt-3 text-base leading-8 whitespace-pre-wrap text-slate-800">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      {rec ? (
        <div className="grid gap-3 p-4 mt-6 bg-slate-50 rounded-xl sm:grid-cols-2">
          <div>
            <p className="text-sm font-black text-slate-600">추천 포토존</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{rec.photoSpots?.length ? rec.photoSpots.join(' · ') : '확인 불가'}</p>
          </div>
          <div>
            <p className="text-sm font-black text-slate-600">추천 맛집</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{rec.restaurants?.length ? rec.restaurants.join(' · ') : '확인 불가'}</p>
          </div>
          <div>
            <p className="text-sm font-black text-slate-600">추천 카페</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{rec.cafes?.length ? rec.cafes.join(' · ') : '확인 불가'}</p>
          </div>
          <div>
            <p className="text-sm font-black text-slate-600">차박 정보</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{rec.carCamping || '확인 불가'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm font-black text-slate-600">시니어 걷기 난이도</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{rec.seniorDifficulty || '확인 불가'}</p>
          </div>
        </div>
      ) : null}

      <div className="pt-4 mt-6 border-t border-slate-100">
        <p className="text-sm font-bold text-slate-500">추천 태그</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {(tags.length ? tags : ['확인 불가']).map((tag) => (
            <span key={tag} className="px-3 py-1 text-sm font-bold bg-green-50 rounded-full text-green-800">
              {tag.startsWith('#') || tag === '확인 불가' ? tag : `#${tag}`}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm font-bold text-slate-500">SEO 키워드</p>
        <p className="mt-2 text-base text-slate-800">{keywords.length ? keywords.join(' · ') : '확인 불가'}</p>
      </div>

      <button
        type="button"
        onClick={() => void copyBody()}
        className="px-4 mt-5 font-bold bg-slate-100 rounded-lg min-h-11 text-slate-800"
      >
        {copied ? '복사됨' : '본문 복사'}
      </button>
    </article>
  );
}
