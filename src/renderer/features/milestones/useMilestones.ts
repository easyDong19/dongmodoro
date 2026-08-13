import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { useDisplayMonth } from '@renderer/features/calendar/DisplayMonthProvider'

/**
 * 마일스톤 카드 조회 + 조작 6종.
 *
 * 표시 대상 월은 **캘린더가 소유한다** (R26) — 여기서 자기 월 상태를 만들지 않고 구독만
 * 한다. 그래서 두 카드가 다른 달을 말하는 상태가 표현되지 않는다.
 *
 * 무효화 대상이 `monthMilestones(month)` 하나인 이유: 마일스톤은 캘린더 점에 영향을 주지
 * 않는다. 캘린더까지 털면 아무것도 안 바뀌는 재조회가 생기고, 그 재조회가 다음 사람에게
 * "마일스톤이 캘린더를 바꾼다"는 오해를 심는다.
 */
export function useMilestones() {
  const { month } = useDisplayMonth()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.monthMilestones(month),
    queryFn: () => api.milestones.forMonth(month),
    // 달 이동 시 카드가 null 로 무너졌다 다시 서지 않게 이전 달 데이터를 자리로 쓴다 —
    // 무너지는 한 커밋이 왼쪽 컬럼 전체를 주저앉히는 layout-shift 를 만든다 (실측 112px).
    placeholderData: keepPreviousData
  })

  const invalidate = () =>
    dispatchInvalidation(qc, { type: 'milestone-changed', payload: { month } })

  const create = useMutation({
    mutationFn: (title: string) => api.milestones.create({ month, title }),
    onSuccess: invalidate
  })
  const rename = useMutation({
    mutationFn: (input: { id: string; title: string }) => api.milestones.rename(input),
    onSuccess: invalidate
  })
  const setCompleted = useMutation({
    mutationFn: (input: { id: string; completed: boolean }) => api.milestones.setCompleted(input),
    onSuccess: invalidate
  })
  const setArchived = useMutation({
    mutationFn: (input: { id: string; archived: boolean }) => api.milestones.setArchived(input),
    onSuccess: invalidate
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.milestones.remove(id),
    onSuccess: invalidate
  })
  const carryTitles = useMutation({
    mutationFn: (titles: string[]) => api.milestones.carryTitles({ month, titles }),
    onSuccess: invalidate
  })

  return { month, query, create, rename, setCompleted, setArchived, remove, carryTitles }
}
