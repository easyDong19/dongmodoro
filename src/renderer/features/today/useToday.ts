import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { useClock } from '@renderer/shared/query/useClock'

/**
 * 오늘 목록 조회 + mutation 4종 (Task 9). 무효화는 전부 dispatchInvalidation
 * 초크포인트로만 한다 — ADR-025 §5, eslint no-restricted-syntax 가 강제한다.
 */
export function useToday() {
  const { dayKey } = useClock()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.today(dayKey),
    queryFn: () => api.today.list()
  })

  const invalidatePull = (r: { itemWeek: string }) =>
    dispatchInvalidation(qc, {
      type: 'pull-changed',
      payload: { itemWeek: r.itemWeek },
      currentDayKey: dayKey
    })

  const addDirect = useMutation({
    mutationFn: api.today.addDirect,
    onSuccess: invalidatePull
  })

  const remove = useMutation({
    mutationFn: api.today.remove,
    onSuccess: invalidatePull
  })

  const toggle = useMutation({
    mutationFn: api.today.toggleComplete,
    onSuccess: (r) =>
      dispatchInvalidation(qc, {
        type: 'task-toggled',
        payload: { parentWeek: r.parentWeek },
        currentDayKey: dayKey
      })
  })

  return { query, addDirect, remove, toggle }
}
