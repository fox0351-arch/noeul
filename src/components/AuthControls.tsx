'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';

export default function AuthControls() {
  const { configured, user, syncStatus, errorMessage, login, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!configured) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(login)}
          className="px-3 text-sm font-black text-white rounded-lg min-h-12 bg-blue-700 disabled:bg-slate-400"
        >
          구글 로그인
        </button>
        {errorMessage && <span className="max-w-56 text-xs font-bold text-red-700">{errorMessage}</span>}
      </div>
    );
  }

  const status =
    syncStatus === 'syncing'
      ? '저장 중'
      : syncStatus === 'offline'
        ? '연결되면 저장'
        : syncStatus === 'error'
          ? '저장 재시도 대기'
          : '클라우드 저장됨';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(logout)}
        className="px-3 text-sm font-black rounded-lg min-h-12 text-slate-800 bg-slate-100 border border-slate-300 disabled:text-slate-400"
      >
        로그아웃
      </button>
      <span className="max-w-44 truncate text-xs font-bold text-slate-600" title={user.email ?? undefined}>
        {status}
      </span>
      <a href="/admin/test/drive" className="text-xs font-bold text-blue-700 underline">
        Drive 설정
      </a>
      {errorMessage && <span className="max-w-56 text-xs font-bold text-red-700">{errorMessage}</span>}
    </div>
  );
}
