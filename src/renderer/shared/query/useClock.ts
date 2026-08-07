import { useQuery } from '@tanstack/react-query'
import type { ClockBoundary } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from './keys'

/**
 * 앱 전역의 "오늘이 언제인지" 단일 출처 (ADR-025 §2). staleTime: Infinity — 값은
 * 재요청이 아니라 clock:boundary 이벤트(events.ts)가 setQueryData 로만 갱신한다.
 *
 * 반환 타입이 `ClockBoundary`(undefined 아님)인 건 실제 게이트가 있어서다:
 * `src/renderer/app/ClockGate.tsx` 가 App 최상단에서 이 쿼리를 선점해 부르고,
 * `api.clock.now()` 가 resolve 되기 전에는 자식(TimerCard·TodayList 등)을 마운트하지
 * 않는다. 이 훅의 소비자는 전부 그 게이트 안쪽에서만 마운트되므로, 여기서 다시
 * 부르면 이미 채워진 캐시를 그대로 읽는다 — 이 훅 자체가 loading 을 기다리지는 않는다.
 * 게이트 밖에서 이 훅을 새로 쓰는 소비자를 추가한다면 이 단언이 깨지므로, 그때는
 * 반환 타입을 `ClockBoundary | undefined` 로 바꾸고 해당 소비자에서 처리해야 한다.
 */
export function useClock(): ClockBoundary {
  const { data } = useQuery({
    queryKey: keys.clock(),
    queryFn: () => api.clock.now(),
    staleTime: Infinity
  })
  return data as ClockBoundary
}
