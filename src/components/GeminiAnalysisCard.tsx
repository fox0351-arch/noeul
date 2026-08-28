'use client';

import { useState } from 'react';
import { displayGeminiField } from '@/lib/geminiAnalysis';
import type { GeminiAnalysisResult } from '@/types/geminiAnalysis';

type GeminiAnalysisCardProps = {
  analysis: GeminiAnalysisResult | null | undefined;
  rawJson?: unknown;
  heading?: string;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 border-b border-slate-100 last:border-0 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="text-base font-medium leading-relaxed whitespace-pre-wrap text-slate-900">{value}</p>
    </div>
  );
}

function safeJsonText(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return 'JSON을 표시할 수 없습니다.';
  }
}

export default function GeminiAnalysisCard({ analysis, rawJson, heading }: GeminiAnalysisCardProps) {
  const [showJson, setShowJson] = useState(false);
  if (!analysis && rawJson == null) return null;

  return (
    <section className="p-4 mt-4 bg-white shadow-md rounded-2xl sm:p-5">
      <h3 className="text-lg font-black text-slate-900">{heading || 'Gemini 분석 결과'}</h3>
      <div className="mt-2">
        <Row label="장소" value={displayGeminiField(analysis?.placeName)} />
        <Row label="설명" value={displayGeminiField(analysis?.caption)} />
        <Row label="인물 수" value={displayGeminiField(analysis?.peopleCount)} />
        <Row label="분위기" value={displayGeminiField(analysis?.mood)} />
        <Row label="촬영 추정 위치" value={displayGeminiField(analysis?.estimatedLocation)} />
        <Row label="주요 객체" value={displayGeminiField(analysis?.objects)} />
        <Row label="추천 태그" value={displayGeminiField(analysis?.tags)} />
        <Row label="블로그용 키워드" value={displayGeminiField(analysis?.blogKeywords)} />
        <Row label="카드뉴스용 문구" value={displayGeminiField(analysis?.cardNewsCopy)} />
      </div>
      <button
        type="button"
        onClick={() => setShowJson((open) => !open)}
        className="px-3 mt-4 font-bold bg-slate-100 rounded-lg min-h-11 text-slate-800"
      >
        {showJson ? 'JSON 원본 닫기' : 'JSON 원본 보기'}
      </button>
      {showJson && (
        <pre className="p-3 mt-3 overflow-x-auto text-xs whitespace-pre-wrap break-all bg-slate-50 rounded-xl text-slate-700">
          {safeJsonText(rawJson ?? analysis)}
        </pre>
      )}
    </section>
  );
}
