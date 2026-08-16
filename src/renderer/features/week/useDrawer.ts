import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { useClock } from '@renderer/shared/query/useClock'
import type { PullInput } from './ItemDrawer'

/**
 * 열려 있는 드로어 하나의 데이터 + `오늘로 가져오기` (ux-spec §6.3).
 *
 * `weekItemId` 가 null 이면 쿼리를 끈다 (`enabled`) — 닫혀 있을 때 서버를 부르지 않는다.
 * 훅은 조건부로 호출할 수 없으므로(React 규칙) 스위치를 여기에 둔다.
 *
 * **무효화를 직접 하지 않는다.** 드로어 키가 `keys.week(weekKey)` 의 하위라서, pull 이
 * `item-changed` 로 그 주를 털면 드로어도 함께 갱신된다 — 초크포인트 하나로 끝난다
 * (ADR-025 §5).
 */
export function useDrawer(weekKey: string, weekItemId: string | null) {
  const { dayKey } = useClock()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.weekItemDrawer(weekKey, weekItemId ?? ''),
    queryFn: () => api.week.drawer(weekItemId as string),
    enabled: weekItemId !== null
  })

  const pull = useMutation({
    mutationFn: (input: PullInput) =>
      api.week.pullFromDrawer({ weekItemId: weekItemId as string, ...input }),
    onSuccess: (r) =>
      dispatchInvalidation(qc, {
        type: 'item-changed',
        payload: { itemWeek: r.itemWeek },
        currentDayKey: dayKey
      })
  })

  /**
   * `새 조각 추가` — 조각 생성만 한다 (쪼개기·가져오기 분리). 무효화는 pull 과 같은
   * 초크포인트다: item-changed 가 그 주를 털면 열려 있는 드로어도 함께 갱신되어
   * 방금 만든 조각이 목록에 나타난다.
   */
  const addTask = useMutation({
    mutationFn: (title: string) => api.week.addTask({ weekItemId: weekItemId as string, title }),
    onSuccess: (r) =>
      dispatchInvalidation(qc, {
        type: 'item-changed',
        payload: { itemWeek: r.itemWeek },
        currentDayKey: dayKey
      })
  })

  return { query, pull, addTask }
}
