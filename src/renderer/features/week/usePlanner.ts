import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { useClock } from '@renderer/shared/query/useClock'
import type { ConfirmInput } from './Planner'

/**
 * 플래너 초안 조회 + 확정. 확정은 `api.week.confirmPlan` **한 번**이다 — 예산·항목·폐기가
 * main 에서 한 트랜잭션으로 반영된다 (ADR-015).
 *
 * 초안 키를 주간 키 아래에 두는 이유는 드로어와 같다: 확정이 그 주를 털면 초안도 함께
 * 갱신되므로, 다시 열었을 때 방금 확정한 내용이 그대로 보인다.
 *
 * **편집 대상 주를 인자로 받는다** — 오늘이 속한 주로 고정하지 않는다. 일요일에는
 * 기본값이 다음 주이고(PRD R3), 사용자가 세그먼트로 바꿀 수도 있다 (ux-spec §5.0).
 */
export function usePlanner(open: boolean, week: string) {
  const { dayKey } = useClock()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.weekPlanDraft(week),
    queryFn: () => api.week.planDraft(week),
    enabled: open
  })

  const confirm = useMutation({
    mutationFn: (input: ConfirmInput) => api.week.confirmPlan({ week, ...input }),
    onSuccess: () =>
      dispatchInvalidation(qc, {
        type: 'plan-confirmed',
        payload: { week },
        currentDayKey: dayKey
      })
  })

  return { query, confirm }
}
