import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { remainingSec } from '@shared/timer/snapshot'
import { nowMs } from '@shared/time'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'

export type UseTimerResult = {
  snapshot: TimerSnapshotWire | undefined
  /** 매 렌더 시점 wall-clock 산술로 파생 — snapshot 이 없으면 null (ADR-005). */
  remaining: number | null
}

/**
 * `['timer']` 캐시 구독 + 1초 인터벌 리페인트 (Task 10, ADR-005 §3).
 *
 * 인터벌은 "언제 다시 그릴까"만 정한다 — 표시값 자체는 매 렌더 `remainingSec(snapshot,
 * nowMs())` 로 다시 계산한다. 캐시 자체는 이 훅이 쓰지 않는다 — `timer:transition` 이벤트
 * (초크포인트 events.ts)만 setQueryData 를 부른다.
 */
export function useTimer(): UseTimerResult {
  const query = useQuery({
    queryKey: keys.timer(),
    queryFn: () => api.timer.getState(),
    staleTime: Infinity
  })
  const snapshot = query.data
  const phase = snapshot?.phase
  const [, forceRepaint] = useState(0)

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => forceRepaint((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  const remaining = snapshot ? remainingSec(snapshot, nowMs()) : null
  return { snapshot, remaining }
}
