'use client';

import { useState } from 'react';
import type { ContentPack } from '@/types/contentPack';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      className="px-3 mt-3 font-bold bg-slate-100 rounded-lg min-h-11 text-slate-800"
    >
      {copied ? '복사됨' : '복사'}
    </button>
  );
}

export default function ContentPackCards({ pack }: { pack?: ContentPack | null }) {
  if (!pack) return null;

  return (
    <div className="mt-4 space-y-4">
      <article className="p-4 bg-white shadow-md rounded-2xl sm:p-5">
        <p className="text-sm font-bold text-pink-700">인스타 카드뉴스 10장</p>
        <ol className="mt-3 space-y-3">
          {(pack.cardNews ?? []).slice(0, 10).map((slide) => (
            <li key={slide.index} className="p-3 bg-slate-50 rounded-xl">
              <p className="text-xs font-bold text-slate-500">{slide.index} / 10</p>
              <p className="mt-1 font-black text-slate-900">{slide.title}</p>
              <p className="mt-1 leading-relaxed text-slate-700">{slide.body}</p>
            </li>
          ))}
        </ol>
        <CopyButton
          text={(pack.cardNews ?? []).map((slide) => `${slide.index}. ${slide.title}\n${slide.body}`).join('\n\n')}
        />
      </article>

      <article className="p-4 bg-white shadow-md rounded-2xl sm:p-5">
        <p className="text-sm font-bold text-rose-700">쇼츠 60초 대본</p>
        <p className="mt-2 text-sm text-slate-500">총 {pack.shorts?.durationSec ?? 60}초 · 훅: {pack.shorts?.hook}</p>
        <ol className="mt-3 space-y-2">
          {(pack.shorts?.beats ?? []).map((beat) => (
            <li key={`${beat.startSec}-${beat.line}`} className="p-3 bg-slate-50 rounded-xl">
              <p className="text-xs font-bold text-slate-500">
                {beat.startSec}~{beat.endSec}초
              </p>
              <p className="mt-1 leading-relaxed text-slate-800">{beat.line}</p>
            </li>
          ))}
        </ol>
        <CopyButton text={pack.shorts?.fullScript || ''} />
      </article>

      <article className="p-4 bg-white shadow-md rounded-2xl sm:p-5">
        <p className="text-sm font-bold text-red-700">유튜브 설명문</p>
        <h3 className="mt-2 text-lg font-black text-slate-900">{pack.youtube?.title}</h3>
        <p className="mt-2 text-base leading-8 whitespace-pre-wrap text-slate-800">{pack.youtube?.description}</p>
        <CopyButton text={`${pack.youtube?.title || ''}\n\n${pack.youtube?.description || ''}`} />
      </article>

      <article className="p-4 bg-white shadow-md rounded-2xl sm:p-5">
        <p className="text-sm font-bold text-sky-700">SEO 키워드</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {(pack.seoKeywords ?? []).map((word) => (
            <span key={word} className="px-3 py-1 text-sm font-bold bg-sky-50 rounded-full text-sky-900">
              {word}
            </span>
          ))}
        </div>
        <CopyButton text={(pack.seoKeywords ?? []).join(', ')} />
      </article>

      <article className="p-4 bg-white shadow-md rounded-2xl sm:p-5">
        <p className="text-sm font-bold text-violet-700">해시태그 30개</p>
        <p className="mt-1 text-sm text-slate-500">{(pack.hashtags ?? []).length}개</p>
        <p className="mt-3 text-base leading-8 break-words text-slate-800">{(pack.hashtags ?? []).join(' ')}</p>
        <CopyButton text={(pack.hashtags ?? []).join(' ')} />
      </article>
    </div>
  );
}
