// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/ipc/api'
import { StudyDaysLine } from './StudyDaysLine'

const WEEK = '2026-08-03'

async function renderLine(days: number) {
  const studyDays = vi.fn().mockResolvedValue({ week: WEEK, days })
  window.api = {
    clock: {
      now: vi
        .fn()
        .mockResolvedValue({
          dayKey: '2026-08-04',
          weekKey: WEEK,
          monthKey: '2026-08',
          weekdayIndex: 1
        })
    },
    calendar: { studyDays }
  } as unknown as Api

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['clock'], {
    dayKey: '2026-08-04',
    weekKey: WEEK,
    monthKey: '2026-08',
    weekdayIndex: 1
  })

  const view = render(
    <QueryClientProvider client={qc}>
      <StudyDaysLine />
    </QueryClientProvider>
  )
  await screen.findByTestId('study-days')
  return { ...view, studyDays }
}

describe('StudyDaysLine (calendar-records R24·R25 · A21·A22)', () => {
  it('세션이 0인 새 DB 에서 `오늘부터 기록이 쌓여요` (A22)', async () => {
    await renderLine(0)
    expect(screen.getByTestId('study-days')).toHaveTextContent('오늘부터 기록이 쌓여요')
  })

  /**
   * A21 — 사이가 비어도 각각 센다. 이 줄은 연속 일수가 아니므로 끊김에 대한 경고 문구가
   * 없어야 한다 (R25 — 실패 프레이밍 금지).
   */
  it('사이가 비어도 각각 세고 끊김 경고가 없다 (A21 · R25)', async () => {
    const { container } = await renderLine(2)
    expect(screen.getByTestId('study-days')).toHaveTextContent('이번 주 2일 공부 중')
    expect(container.textContent ?? '').not.toMatch(/끊|연속|놓친|아쉬/)
  })

  it('이번 주 키로 조회한다 — 화면이 주를 계산하지 않는다', async () => {
    const { studyDays } = await renderLine(1)
    expect(studyDays).toHaveBeenCalledWith(WEEK)
  })

  it('이모지가 없다 (A25)', async () => {
    const { container } = await renderLine(3)
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
