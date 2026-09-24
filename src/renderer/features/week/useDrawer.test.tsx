// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/ipc/api'
import { keys } from '@renderer/shared/query/keys'
import { useDrawer } from './useDrawer'

const DAY = '2026-08-06'
const WEEK = '2026-08-03'

/**
 * 드로어의 `오늘로 가져오기` 는 pull 이다. pull 은 캘린더 `기록 있음` 술어의 두 번째 항이라
 * (calendar-records R5) 오늘 칸의 점과 날짜 패널을 바꾼다 — 오늘 목록의 직접 추가·제거와
 * 같은 사건이다. 한때 `item-changed` 로 무효화해서 가져온 뒤에도 오늘 칸에 점이 뜨지 않다가
 * 달을 넘겼다 돌아와야 나타났다.
 */
describe('useDrawer — pull 무효화', () => {
  it('오늘로 가져오면 오늘의 캘린더·날짜 패널까지 다시 읽는다', async () => {
    window.api = {
      week: {
        drawer: vi.fn().mockResolvedValue({ tasks: [] }),
        pullFromDrawer: vi.fn().mockResolvedValue({ itemWeek: WEEK })
      }
    } as unknown as Api

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    qc.setQueryData(['clock'], { dayKey: DAY, weekKey: WEEK, monthKey: '2026-08', weekdayIndex: 3 })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useDrawer(WEEK, 'item-1'), { wrapper })
    result.current.pull.mutate({ taskIds: [], newTask: null })

    await waitFor(() => expect(spy).toHaveBeenCalled())
    const invalidated = spy.mock.calls.map(([f]) => f?.queryKey)
    expect(invalidated).toContainEqual(keys.monthCalendar('2026-08'))
    expect(invalidated).toContainEqual(keys.day(DAY))
    expect(invalidated).toContainEqual(keys.week(WEEK))
    expect(invalidated).toContainEqual(keys.today(DAY))
  })
})
