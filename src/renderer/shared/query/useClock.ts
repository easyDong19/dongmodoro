import { useQuery } from '@tanstack/react-query'
import type { ClockBoundary } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from './keys'

/**
 * 앱 전역의 "오늘이 언제인지" 단일 출처 (ADR-025 §2). staleTime: Infinity — 값은
 * 재요청이 아니라 clock:boundary 이벤트(events.ts)가 setQueryData 로만 갱신한다.
 *
 * queryFn 이 부르는 `api.clock.now()` 채널은 Task 5 에서 main 핸들러가 등록된다.
 * 그 전까지는 이 훅을 아무도 호출하지 않는다 — 지금은 타입·시그니처만 맞춰둔다.
 * 앱 부트스트랩(Task 5+)이 최초 데이터를 채워둔 뒤에만 이 훅의 소비자가 마운트되므로
 * 반환 타입은 `ClockBoundary` (undefined 아님) — loading 중 렌더되지 않는 화면 전용이다.
 */
export function useClock(): ClockBoundary {
  const { data } = useQuery({
    queryKey: keys.clock(),
    queryFn: () => api.clock.now(),
    staleTime: Infinity
  })
  return data as ClockBoundary
}
