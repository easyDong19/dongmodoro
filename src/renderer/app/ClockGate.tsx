import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'

/**
 * `['clock']` 캐시 준비 게이트 (콜드 스타트 크래시 수정, M2 최종 검증).
 *
 * `useClock()` 은 `data as ClockBoundary` 로 단언한다 — 이 훅이 그 단언을 진짜로 만드는
 * 유일한 장치다. `api.clock.now()` 가 처음 resolve 되기 전에는 자식(TimerCard·TodayList,
 * 그리고 그 안에서 `useClock()` 을 부르는 useToday)을 마운트하지 않는다. App.tsx 는 이
 * 컴포넌트로만 콘텐츠를 감싼다 — 다른 진입 경로로 마운트되면 단언이 다시 거짓이 된다.
 *
 * ADR-024 에 따라 쿼리 재시도는 꺼져 있으므로, 실패는 로딩 상태로 영원히 남는다 —
 * placeholder 만 보여주면 이 화면은 그대로 멈춘 것처럼 보인다. 실패 시에는 §1 실패
 * 프레임 금지·§2 --danger 조건(파괴적 행위 전용)에 따라 경고색 없이 중립 안내 한 줄만
 * 보여준다.
 */
export function ClockGate({ children }: { children: ReactNode }) {
  const { data, isError } = useQuery({
    queryKey: keys.clock(),
    queryFn: () => api.clock.now(),
    staleTime: Infinity
  })

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-ink-dim">잠시 후 다시 열어 주세요</p>
      </main>
    )
  }

  if (data === undefined) {
    // 아직 조회 중 — TodayList 로딩 게이트(Task 9)와 같은 방식: 빈 상태 카피도,
    // 콘텐츠도 그리지 않는다 (있을지 없을지가 아니라 "아직 모른다"이므로).
    return <main className="min-h-screen p-6" aria-busy="true" />
  }

  return <>{children}</>
}
