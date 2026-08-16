import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { useClock } from '@renderer/shared/query/useClock'
import { monthOfWeek } from '@shared/time'

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

  const complete = useMutation({ mutationFn: api.week.complete, onSuccess: invalidateItem })
  const uncomplete = useMutation({ mutationFn: api.week.uncomplete, onSuccess: invalidateItem })
  const drop = useMutation({ mutationFn: api.week.drop, onSuccess: invalidateItem })
  /**
   * 마일스톤 연결 (milestones R13·R14). 같은 `invalidateItem` 을 쓰되 **월 카드도 함께**
   * 턴다 — 연결이 바뀌면 그 마일스톤의 롤업이 달라진다. 무효화할 달은 `itemWeek` 에서
   * 파생하지 않고 `monthOfWeek` 로 구한다: 주는 쪼개지지 않으므로 8/31 주는 8월이다.
   */
  const setMilestone = useMutation({
    mutationFn: api.week.setMilestone,
    onSuccess: (r) => {
      invalidateItem(r)
      dispatchInvalidation(qc, {
        type: 'milestone-changed',
        payload: { month: monthOfWeek(r.itemWeek) }
      })
    }
  })

  /**
   * 일반 뷰는 **항상 오늘이 속한 주**를 보여주므로(PRD R4) 여기서는 늘 값이 있다.
   * `WeekItemRow` 쪽이 `null` 을 받을 수 있게 열어 둔 것은 다른 주를 그리는 소비자를
   * 위한 것이고(그때는 지난/오늘/다가올이 성립하지 않는다), 이 훅은 그 소비자가 아니다.
   */
  return {
    weekKey,
    dayKey,
    todayIndex: weekdayIndex,
    query,
    complete,
    uncomplete,
    drop,
    setMilestone
  }
}
