import { useQuery } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'

export type ReviewStatus = Awaited<ReturnType<Api['review']['getStatus']>>

/**
 * 정산 필요 판정 (weekly-review R1). 배너가 이 값으로 뜨고 사라진다.
 *
 * **`targetWeek` 은 어느 분기에서든 있다.** 정산 대기가 아니어도 "지금 계획하는 주가
 * 어디인가"는 답이 있어야 하고, 플래너의 편집 대상 주 기본값이 바로 그 값이다 —
 * `week_of(오늘 + plan_lead_days)` 를 renderer 가 다시 계산하지 않는 유일한 방법이다
 * (PRD R3, ADR-025 §2 시간 초크포인트).
 *
 * 무효화는 `keys.reviewPending()` 하나로 온다. 확정(`settled` 사건)과 자정 경계
 * (`clock-boundary`)가 둘 다 이 키를 턴다 — 판정이 날짜에서 파생되기 때문이다.
 */
export function useReviewStatus() {
  return useQuery({
    queryKey: keys.reviewPending(),
    queryFn: () => api.review.getStatus()
  })
}
