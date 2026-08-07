import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { keys } from '@renderer/shared/query/keys'
import { TodayList } from './TodayList'

const clock = { dayKey: '2026-08-07', weekKey: '2026-08-03', monthKey: '2026-08' }

const idleFocusSnapshot: TimerSnapshotWire = {
  mode: 'focus',
  phase: 'idle',
  startedAt: null,
  durationSec: 1500,
  pausedRemainingSec: null,
  taskId: null,
  taskTitle: null,
  focusCountToday: 0
}

type TodayRow = Awaited<ReturnType<Api['today']['list']>>['rows'][number]

function makeRow(overrides: Partial<TodayRow> = {}): TodayRow {
  return {
    taskId: 't1',
    title: '제목',
    sourceTitle: null,
    sourceWeek: '2026-08-03',
    estPomos: 2,
    spentPomos: 1,
    completedAt: null,
    pulledAt: '2026-08-07T00:00:00.000Z',
    ...overrides
  }
}

function setup({ rows, timer }: { rows: TodayRow[]; timer: TimerSnapshotWire }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  qc.setQueryData(keys.clock(), clock)

  window.api = {
    system: { getAppInfo: vi.fn() },
    clock: { now: vi.fn().mockResolvedValue(clock) },
    today: {
      list: vi.fn().mockResolvedValue({ dayKey: clock.dayKey, rows }),
      addDirect: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      pull: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      remove: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      toggleComplete: vi.fn().mockResolvedValue({ parentWeek: clock.weekKey, completedAt: null })
    },
    timer: {
      getState: vi.fn().mockResolvedValue(timer),
      start: vi.fn(),
      startWithTask: vi.fn().mockResolvedValue(timer),
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      adjust: vi.fn(),
      completeEarly: vi.fn(),
      setMode: vi.fn()
    },
    sessions: { capture: vi.fn() },
    events: {
      onTimerTransition: vi.fn(() => () => {}),
      onSessionRecorded: vi.fn(() => () => {}),
      onClockBoundary: vi.fn(() => () => {})
    }
  } as unknown as Api & { events: Api['events'] }

  render(
    <QueryClientProvider client={qc}>
      <TodayList />
    </QueryClientProvider>
  )
  return qc
}

describe('TodayList — 렌더 계약 (Task 9)', () => {
  it('미완료 행이 완료 행보다 먼저 렌더된다 (R4)', async () => {
    setup({
      rows: [
        makeRow({ taskId: 'done', title: '완료된 항목', completedAt: '2026-08-07T01:00:00.000Z' }),
        makeRow({ taskId: 'todo', title: '미완료 항목', completedAt: null })
      ],
      timer: idleFocusSnapshot
    })

    const titles = await screen.findAllByTestId('today-row-title')
    expect(titles.map((el) => el.textContent)).toEqual(['미완료 항목', '완료된 항목'])
  })

  it('focus idle + 미완료 행에만 재생 버튼이 렌더된다 (R3-1)', async () => {
    setup({
      rows: [
        makeRow({ taskId: 'todo', title: '미완료 항목', completedAt: null }),
        makeRow({ taskId: 'done', title: '완료된 항목', completedAt: '2026-08-07T01:00:00.000Z' })
      ],
      timer: idleFocusSnapshot
    })

    await screen.findAllByTestId('today-row-title')
    const playButtons = screen.getAllByRole('button', { name: '타이머 시작' })
    expect(playButtons).toHaveLength(1)
  })

  it('타이머가 idle 이 아니면 재생 버튼이 하나도 없다', async () => {
    setup({
      rows: [makeRow({ taskId: 'todo', completedAt: null })],
      timer: { ...idleFocusSnapshot, phase: 'running' }
    })

    await screen.findAllByTestId('today-row-title')
    expect(screen.queryByRole('button', { name: '타이머 시작' })).not.toBeInTheDocument()
  })

  it('목록이 0건이면 M2 빈 상태 카피와 직접 입력 CTA 를 보여준다', async () => {
    setup({ rows: [], timer: idleFocusSnapshot })

    expect(await screen.findByText('오늘 몫이 비어 있어요')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByTestId('today-row-title')).not.toBeInTheDocument()
  })

  it('이모지 없이 lucide svg 아이콘으로만 렌더된다', async () => {
    setup({
      rows: [makeRow({ taskId: 'todo', completedAt: null })],
      timer: idleFocusSnapshot
    })

    const playButton = await screen.findByRole('button', { name: '타이머 시작' })
    expect(playButton.querySelector('svg')).toBeTruthy()
    const removeButton = screen.getByRole('button', { name: '치우기' })
    expect(removeButton.querySelector('svg')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
