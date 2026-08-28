'use client';

import { useState } from 'react';
import type { BlogDraft } from '@/types/blog';

type BlogDraftCardProps = {
  draft?: BlogDraft | null;
  error?: string | null;
};

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
  const body = (draft.body || [draft.intro, draft.story, draft.places, draft.closing].filter(Boolean).join('\n\n')).trim();
  const tags = draft.seo?.hashtags ?? [];
  const keywords = draft.seo?.keywords ?? [];
  const paragraphs = body.split(/\n{2,}/).filter(Boolean);

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${summary}\n\n${body}`);
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
      <p className="mt-1 text-sm text-slate-400">본문 {draft.charCount || body.length}자</p>

      <div className="pt-4 mt-4 border-t border-slate-100">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="mt-4 text-base leading-8 whitespace-pre-wrap text-slate-800 first:mt-0">
            {paragraph}
          </p>
        ))}
      </div>

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
