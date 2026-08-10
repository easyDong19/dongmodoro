import { useQuery } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'

export type ReviewPending = Awaited<ReturnType<Api['review']['getPending']>>

/**
 * 정산 패널 데이터. 패널이 열려 있는 동안에만 조회한다 — 배너는 `useReviewStatus` 의
 * 가벼운 판정만으로 충분하고, 요약 집계는 패널을 열 때 치르면 된다.
 *
 * 키가 `keys.reviewPending()` 의 하위라 배너와 함께 무효화된다 (keys.ts). 확정 사건(`settled`)이
 * 그 키를 털므로 확정 직후 패널이 재조회하고, 범위가 비면 `needed: false` 를 받아
 * "지금 정산할 주가 없어요" 로 간다 (ux-spec §8).
 */
export function useReview(open: boolean) {
  return useQuery({
    queryKey: keys.reviewPanel(),
    queryFn: () => api.review.getPending(),
    enabled: open
  })
}
