import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { useClock } from '@renderer/shared/query/useClock'

/**
 * 주간 카드 조회 + 항목 mutation 4종. 무효화는 전부 dispatchInvalidation 초크포인트로만
 * 한다 (ADR-025 §5, eslint no-restricted-syntax 가 강제).
 *
 * 네 mutation 이 같은 `invalidateItem` 을 쓰는 이유: 완료·완료 해제·폐기·pull 이 더럽히는
 * 캐시 집합이 같다. 무효화할 주는 응답의 `itemWeek` 에서 온다 — 보고 있는 주와 다를 수
 * 있으므로(폐기·이월 항목) renderer 가 현재 주로 넘겨짚지 않는다.
 */
export function useWeek() {
  const { weekKey, dayKey, weekdayIndex } = useClock()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.week(weekKey),
    queryFn: () => api.week.summary(weekKey)
  })

  const invalidateItem = (r: { itemWeek: string }) =>
    dispatchInvalidation(qc, {
      type: 'item-changed',
      payload: { itemWeek: r.itemWeek },
      currentDayKey: dayKey
    })

  const pullNext = useMutation({ mutationFn: api.week.pullNext, onSuccess: invalidateItem })
  const complete = useMutation({ mutationFn: api.week.complete, onSuccess: invalidateItem })
  const uncomplete = useMutation({ mutationFn: api.week.uncomplete, onSuccess: invalidateItem })
  const drop = useMutation({ mutationFn: api.week.drop, onSuccess: invalidateItem })

  /**
   * 일반 뷰는 **항상 오늘이 속한 주**를 보여주므로(PRD R4) 여기서는 늘 값이 있다.
   * `WeekItemRow` 쪽이 `null` 을 받을 수 있게 열어 둔 것은 다른 주를 그리는 소비자를
   * 위한 것이고(그때는 지난/오늘/다가올이 성립하지 않는다), 이 훅은 그 소비자가 아니다.
   */
  return { weekKey, dayKey, todayIndex: weekdayIndex, query, pullNext, complete, uncomplete, drop }
}
