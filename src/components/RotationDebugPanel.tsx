'use client';

import { useSyncExternalStore } from 'react';
import { MapManager, type RotationCameraLog } from '@/services/MapManager';

const EMPTY_LOGS: readonly RotationCameraLog[] = [];

function formatHeading(value: number | null): string {
  return value == null ? 'null' : value.toFixed(1);
}

export default function RotationDebugPanel() {
  const manager = MapManager.getInstance();
  const logs = useSyncExternalStore(
    manager.subscribeRotationLogs,
    manager.getRotationLogs,
    () => EMPTY_LOGS
  );

  return (
    <div
      className="absolute bottom-2 left-2 z-30 max-h-40 w-[calc(100%-6rem)] overflow-y-auto rounded bg-black/85 px-2 py-1 font-mono text-[9px] leading-tight text-green-300 shadow"
      aria-label="회전 진단 로그"
    >
      {logs.length === 0 ? (
        <p>회전 로그 대기 중</p>
      ) : (
        logs.slice().reverse().map((log) => (
          <p key={`${log.timestamp}-${log.moveCameraCallCount}`} className="border-b border-white/15 py-0.5">
            headingBeforeCall:{formatHeading(log.headingBeforeCall)}{' '}
            headingAtCall:{formatHeading(log.headingAtCall)}{' '}
            moveCameraCallCount:{log.moveCameraCallCount} GPS bearing:
            {formatHeading(log.gpsBearing)} renderedHeading:{formatHeading(log.renderedHeading)}
          </p>
        ))
      )}
    </div>
  );
}
