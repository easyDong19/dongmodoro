// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/ipc/api'
import { keys } from '@renderer/shared/query/keys'
import { useWeek } from './useWeek'

const DAY = '2026-09-24'
const WEEK = '2026-09-21'

/**
 * 연결이 어느 달의 Milestone 에나 걸리므로(ADR-035), 연결을 바꾸면 **옛 Milestone 의 달과 새
 * Milestone 의 달** 카드가 함께 달라진다. 주에서 달을 파생하던 시절에는 그 주의 달 하나만
 * 털어서, 10월 Milestone 으로 옮긴 시간이 10월 카드에 늦게 떴다.
 */
describe('useWeek — setMilestone 은 응답이 준 달을 전부 턴다', () => {
  it('옛 달과 새 달의 Milestone 카드를 모두 무효화한다', async () => {
    window.api = {
      week: {
        summary: vi.fn().mockResolvedValue({ items: [] }),
        setMilestone: vi.fn().mockResolvedValue({ itemWeek: WEEK, months: ['2026-08', '2026-10'] })
      }
    } as unknown as Api

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    qc.setQueryData(['clock'], { dayKey: DAY, weekKey: WEEK, monthKey: '2026-09', weekdayIndex: 3 })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useWeek(), { wrapper })
    result.current.setMilestone.mutate({ weekItemId: 'i1', milestoneId: 'm-oct' })

    await waitFor(() =>
      expect(spy.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(
        keys.monthMilestones('2026-10')
      )
    )
    const invalidated = spy.mock.calls.map(([f]) => f?.queryKey)
    expect(invalidated).toContainEqual(keys.monthMilestones('2026-08'))
    expect(invalidated).not.toContainEqual(keys.monthMilestones('2026-09'))
    expect(invalidated).toContainEqual(keys.week(WEEK))
  })
})
