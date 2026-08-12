// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { Api } from '@shared/ipc/api'
import { CalendarCard } from './CalendarCard'
import { DisplayMonthProvider } from './DisplayMonthProvider'

const MONTH = '2026-08'
const TODAY = '2026-08-04' // 화요일
const WEEK = '2026-08-03'

type MonthRes = Awaited<ReturnType<Api['calendar']['month']>>
type DayRes = Awaited<ReturnType<Api['calendar']['day']>>
type CalendarDay = MonthRes['days'][number]

function blankDay(dayKey: string): CalendarDay {
  return { dayKey, hasRecord: false, focusCount: 0, dotLevel: 'basic' }
}

/** 2026-08-01 은 토요일이므로 월요일 시작 그리드의 앞 빈 칸은 5개다. */
function makeMonth(over: Partial<Record<string, Partial<CalendarDay>>> = {}): MonthRes {
  const days = Array.from({ length: 31 }, (_, i) => {
    const dayKey = `2026-08-${String(i + 1).padStart(2, '0')}`
    return { ...blankDay(dayKey), ...(over[dayKey] ?? {}) }
  })
  return { month: MONTH, leadingBlanks: 5, days }
}

function makeDay(over: Partial<DayRes> = {}): DayRes {
  return { dayKey: TODAY, hasRecord: false, focusCount: 0, tasks: [], ...over }
}

async function renderCard(o: {
  month?: MonthRes
  day?: DayRes
  dayByKey?: Record<string, DayRes>
  septemberMonth?: MonthRes
  timerPhase?: 'idle' | 'running'
  timerMode?: 'focus' | 'short' | 'long'
}) {
  const monthFn = vi.fn(async (m: string) =>
    m === '2026-09'
      ? (o.septemberMonth ?? { month: m, leadingBlanks: 1, days: [] })
      : (o.month ?? makeMonth())
  )
  const dayFn = vi.fn(async (d: string) => o.dayByKey?.[d] ?? o.day ?? makeDay({ dayKey: d }))

  window.api = {
    clock: {
      now: vi.fn().mockResolvedValue({
        dayKey: TODAY,
        weekKey: WEEK,
        monthKey: MONTH,
        weekdayIndex: 1
      })
    },
    calendar: { month: monthFn, day: dayFn, studyDays: vi.fn() },
    timer: {
      getState: vi.fn().mockResolvedValue({
        mode: o.timerMode ?? 'focus',
        phase: o.timerPhase ?? 'idle',
        startedAt: null,
        durationSec: 1500,
        pausedRemainingSec: null,
        taskId: null,
        taskTitle: null,
        focusCountToday: 0,
        focusSinceLastLong: 0
      }),
      start: vi.fn()
    }
  } as unknown as Api

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  qc.setQueryData(['clock'], {
    dayKey: TODAY,
    weekKey: WEEK,
    monthKey: MONTH,
    weekdayIndex: 1
  })

  const view = render(
    <QueryClientProvider client={qc}>
      <DisplayMonthProvider>
        <CalendarCard />
      </DisplayMonthProvider>
    </QueryClientProvider>
  )
  // 헤더는 컨텍스트에서 오므로 즉시 뜬다 — 두 쿼리가 도착할 때까지 기다려야 한다.
  await screen.findByTestId('month-grid')
  await screen.findByLabelText('날짜 기록')
  return { ...view, monthFn, dayFn }
}

function cell(dayKey: string): HTMLElement {
  const found = screen
    .getAllByTestId('day-cell')
    .find((el) => el.getAttribute('data-day') === dayKey)
  if (found === undefined) throw new Error(`no cell for ${dayKey}`)
  return found
}

describe('MonthGrid — 그리드 골격 (R7 · A4)', () => {
  it('요일 헤더가 월~일 순이다', async () => {
    await renderCard({})
    const headers = ['월', '화', '수', '목', '금', '토', '일']
    headers.forEach((h) => expect(screen.getByText(h)).toBeInTheDocument())
  })

  it('앞 빈 칸 수를 서버가 준 값 그대로 그린다 — 화면이 다시 세지 않는다', async () => {
    const { container } = await renderCard({})
    const grid = container.querySelector('[data-testid="month-grid"]')
    // 빈 칸 5 + 날짜 31
    expect(grid?.children).toHaveLength(36)
  })
})

describe('셀 상태 3채널 (R15 · A19)', () => {
  /**
   * A19 가 이 테스트다. 선택을 숫자 색으로 칠하는 구현이었다면 오늘 강조가 지워지고,
   * 점 색으로 칠했다면 기록이 지워진다. 세 정보가 **동시에** 남아 있어야 한다.
   */
  it('오늘 + 선택 + 진한 점이 겹친 셀에서 셋이 모두 보인다 (A19)', async () => {
    await renderCard({
      month: makeMonth({ [TODAY]: { hasRecord: true, focusCount: 5, dotLevel: 'strong' } })
    })
    const today = cell(TODAY)

    expect(today).toHaveAttribute('data-today', 'true')
    expect(today).toHaveAttribute('data-selected', 'true') // 기본 선택이 오늘이다 (R16)
    expect(within(today).getByTestId('study-dot-strong')).toBeInTheDocument()
    // 오늘 숫자는 --amber 를 유지한다 — 선택 배경이 숫자 채널을 덮지 않는다.
    expect(within(today).getByText('4')).toHaveClass('text-amber')
  })

  it('선택은 배경·보더로만 표현한다 — 오늘이 아닌 날의 숫자 색이 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    await renderCard({})
    await user.click(cell('2026-08-06'))

    const selected = cell('2026-08-06')
    expect(selected).toHaveClass('bg-glass-strong')
    expect(within(selected).getByText('6')).toHaveClass('text-ink-dim')
  })

  it('기록 없는 날에는 점이 없다 (A6)', async () => {
    await renderCard({})
    expect(within(cell('2026-08-06')).queryByTestId('study-dot-basic')).not.toBeInTheDocument()
  })

  it('focus 3회는 기본 점, 4회는 진한 점 (A6)', async () => {
    await renderCard({
      month: makeMonth({
        '2026-08-05': { hasRecord: true, focusCount: 3, dotLevel: 'basic' },
        '2026-08-06': { hasRecord: true, focusCount: 4, dotLevel: 'strong' }
      })
    })
    expect(within(cell('2026-08-05')).getByTestId('study-dot-basic')).toBeInTheDocument()
    expect(within(cell('2026-08-06')).getByTestId('study-dot-strong')).toBeInTheDocument()
  })
})

describe('월 이동 (R8·R9 · A16·A17)', () => {
  it('다음 달로 이동해도 선택 날짜와 패널 내용이 유지되고 그리드에 선택 강조가 없다 (A16)', async () => {
    const user = userEvent.setup()
    await renderCard({
      septemberMonth: {
        month: '2026-09',
        leadingBlanks: 1,
        days: [blankDay('2026-09-01'), blankDay('2026-09-02')]
      },
      dayByKey: { [TODAY]: makeDay({ hasRecord: true, focusCount: 2 }) }
    })

    await user.click(screen.getByLabelText('다음 달'))
    await screen.findByText('2026년 9월')

    // 패널은 선택 날짜(8/4)를 그대로 보여준다 — 연도를 포함한 라벨이다 (R17).
    expect(screen.getByText('2026년 8월 4일')).toBeInTheDocument()
    expect(screen.getByText('집중 2회')).toBeInTheDocument()
    // 9월 그리드에는 선택 강조가 없다 — 선택 날짜가 그 달에 없기 때문이며 정상 상태다.
    expect(screen.queryAllByTestId('day-cell').some((c) => c.dataset.selected === 'true')).toBe(
      false
    )
  })

  it('기록 없는 달로 이동해도 막히지 않고 점 없는 그리드가 뜬다 (A17)', async () => {
    const user = userEvent.setup()
    const { monthFn } = await renderCard({
      septemberMonth: { month: '2026-09', leadingBlanks: 1, days: [blankDay('2026-09-01')] }
    })

    await user.click(screen.getByLabelText('다음 달'))
    await screen.findByText('2026년 9월')

    expect(monthFn).toHaveBeenCalledWith('2026-09')
    expect(screen.queryByTestId('study-dot-basic')).not.toBeInTheDocument()
  })

  it('이전 달로도 이동한다 — 하한을 두지 않는다 (R9)', async () => {
    const user = userEvent.setup()
    const { monthFn } = await renderCard({})
    await user.click(screen.getByLabelText('이전 달'))
    await screen.findByText('2026년 7월')
    expect(monthFn).toHaveBeenCalledWith('2026-07')
  })
})

describe('DayPanel (R17~R21)', () => {
  it('조각이 없으면 집중 횟수만 보여준다 (R20)', async () => {
    await renderCard({ day: makeDay({ hasRecord: true, focusCount: 3 }) })
    expect(screen.getByText('집중 3회')).toBeInTheDocument()
  })

  it('조각이 있으면 완료/전체를 함께 보여준다 (A5 · R20)', async () => {
    await renderCard({
      day: makeDay({
        hasRecord: true,
        focusCount: 0,
        tasks: [
          {
            taskId: 't1',
            title: 'a',
            completedAt: '2026-08-04T01:00:00.000Z',
            pulled: true,
            hadSession: false
          },
          {
            taskId: 't2',
            title: 'b',
            completedAt: '2026-08-04T02:00:00.000Z',
            pulled: true,
            hadSession: false
          },
          {
            taskId: 't3',
            title: 'c',
            completedAt: '2026-08-04T03:00:00.000Z',
            pulled: true,
            hadSession: false
          }
        ]
      })
    })
    expect(screen.getByText('집중 0회 · 할 일 3/3 완료')).toBeInTheDocument()
  })

  it('원천을 구분해 표시한다 (R18 · A10)', async () => {
    await renderCard({
      day: makeDay({
        hasRecord: true,
        focusCount: 2,
        tasks: [
          { taskId: 't1', title: '가져온 것', completedAt: null, pulled: true, hadSession: false },
          { taskId: 't2', title: '사후 캡처', completedAt: null, pulled: false, hadSession: true },
          { taskId: 't3', title: '둘 다', completedAt: null, pulled: true, hadSession: true }
        ]
      })
    })
    expect(screen.getByText('가져옴')).toBeInTheDocument()
    expect(screen.getByText('세션으로 생김')).toBeInTheDocument()
    expect(screen.getByText('가져와서 집중')).toBeInTheDocument()
  })

  it('기록이 없으면 빈 상태 문구를 보여준다 (A14)', async () => {
    await renderCard({})
    expect(screen.getByText('이날은 기록이 없어요')).toBeInTheDocument()
  })

  it('읽기 전용이다 — 완료 토글·삭제 버튼이 없다 (R23)', async () => {
    await renderCard({
      day: makeDay({
        hasRecord: true,
        focusCount: 1,
        tasks: [{ taskId: 't1', title: 'a', completedAt: null, pulled: true, hadSession: false }]
      })
    })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    // 남는 버튼은 월 이동 두 개뿐이다.
    expect(
      screen.getAllByRole('button').filter((b) => b.dataset.testid !== 'day-cell')
    ).toHaveLength(2)
  })
})

describe('자유 집중 시작 CTA (R21 · A14-1)', () => {
  it('기록 없는 오늘 + focus idle 이면 보인다', async () => {
    await renderCard({})
    expect(screen.getByTestId('free-focus-cta')).toBeInTheDocument()
  })

  it('기록 없는 과거 날짜에는 없다 — 지나간 날의 기록을 만들 방법이 없다', async () => {
    const user = userEvent.setup()
    await renderCard({})
    await user.click(cell('2026-08-03'))
    await screen.findByText('2026년 8월 3일')
    expect(screen.queryByTestId('free-focus-cta')).not.toBeInTheDocument()
  })

  it('기록 없는 미래 날짜에도 없다', async () => {
    const user = userEvent.setup()
    await renderCard({})
    await user.click(cell('2026-08-20'))
    await screen.findByText('2026년 8월 20일')
    expect(screen.queryByTestId('free-focus-cta')).not.toBeInTheDocument()
  })

  it('타이머가 idle 이 아니면 없다 — 진입점일 뿐 두 번째 시작 버튼이 아니다', async () => {
    await renderCard({ timerPhase: 'running' })
    expect(screen.queryByTestId('free-focus-cta')).not.toBeInTheDocument()
  })

  it('기록이 있는 오늘에는 없다 — 빈 상태의 문구를 바꿀 행동이라 빈 상태에만 있다', async () => {
    await renderCard({ day: makeDay({ hasRecord: true, focusCount: 1 }) })
    expect(screen.queryByTestId('free-focus-cta')).not.toBeInTheDocument()
  })
})

describe('미래 날짜 (R16 · A20)', () => {
  it('선택할 수 있고 과거와 같은 빈 상태 문구가 뜬다 — 미래 전용 문구가 없다', async () => {
    const user = userEvent.setup()
    await renderCard({})
    await user.click(cell('2026-08-25'))
    await screen.findByText('2026년 8월 25일')
    expect(screen.getByText('이날은 기록이 없어요')).toBeInTheDocument()
  })

  it('오늘보다 뒤인 셀에도 점이 찍힐 수 있다 (R10 · A18)', async () => {
    await renderCard({
      month: makeMonth({ '2026-08-28': { hasRecord: true, focusCount: 1, dotLevel: 'basic' } })
    })
    expect(within(cell('2026-08-28')).getByTestId('study-dot-basic')).toBeInTheDocument()
  })
})

describe('이모지 금지 (A25)', () => {
  it('카드의 렌더 텍스트에 이모지가 없다', async () => {
    const { container } = await renderCard({
      day: makeDay({ hasRecord: true, focusCount: 2 }),
      month: makeMonth({ [TODAY]: { hasRecord: true, focusCount: 5, dotLevel: 'strong' } })
    })
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
