// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { keys } from '@renderer/shared/query/keys'
import { TodayList } from './TodayList'

const clock = { dayKey: '2026-08-07', weekKey: '2026-08-03', monthKey: '2026-08', weekdayIndex: 4 }

const idleFocusSnapshot: TimerSnapshotWire = {
  mode: 'focus',
  phase: 'idle',
  startedAt: null,
  durationSec: 1500,
  pausedRemainingSec: null,
  taskId: null,
  taskTitle: null,
  focusCountToday: 0,
  focusSinceLastLong: 0
}

type TodayRow = Awaited<ReturnType<Api['today']['list']>>['rows'][number]

function makeRow(overrides: Partial<TodayRow> = {}): TodayRow {
  return {
    taskId: 't1',
    title: '제목',
    sourceTitle: null,
    sourceWeek: '2026-08-03',
    measuredSec: 1500,
    completedAt: null,
    pulledAt: '2026-08-07T00:00:00.000Z',
    ...overrides
  }
}

function setup({
  rows,
  timer,
  listPromise
}: {
  rows: TodayRow[]
  timer: TimerSnapshotWire
  /** 브리프의 "지연/미해결 프로미스로 pending 상태를 목킹" 요청용 — 주면 rows 대신 이걸 쓴다. */
  listPromise?: Promise<{ dayKey: string; rows: TodayRow[] }>
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  qc.setQueryData(keys.clock(), clock)

  window.api = {
    system: { getAppInfo: vi.fn() },
    clock: { now: vi.fn().mockResolvedValue(clock) },
    today: {
      list: vi.fn(() => listPromise ?? Promise.resolve({ dayKey: clock.dayKey, rows })),
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

  it('제목과 메타(출처·측정 시간)가 다른 줄에 있다 — 제목이 먼저 잘리지 않는다', async () => {
    setup({
      rows: [makeRow({ title: '문서 작성', sourceTitle: '인수인계자료 만들기' })],
      timer: idleFocusSnapshot
    })

    const title = await screen.findByTestId('today-row-title')
    const source = screen.getByText('인수인계자료 만들기')
    // 같은 줄에 있으면 둘의 부모가 같다. 2단이면 다르다.
    expect(source.parentElement).not.toBe(title.parentElement)
    // 폭이 모자랄 때 줄어드는 쪽은 출처다.
    expect(source.className).toContain('truncate')
  })

  it('직접 추가한 항목은 출처 자리를 그리지 않는다 (`기타` 를 라벨로 쓰지 않는다)', async () => {
    setup({ rows: [makeRow({ sourceTitle: null })], timer: idleFocusSnapshot })

    await screen.findByTestId('today-row-title')
    expect(screen.queryByText('기타')).not.toBeInTheDocument()
  })

  it('완료 행은 행 전체를 흐리지 않고 제목만 취소선으로 표시한다', async () => {
    setup({
      rows: [makeRow({ completedAt: '2026-08-07T01:00:00.000Z' })],
      timer: idleFocusSnapshot
    })

    const title = await screen.findByTestId('today-row-title')
    expect(title.className).toContain('line-through')
    // 아직 눌러야 하는 체크박스와 읽어야 하는 측정 시간이 같이 흐려지면 안 된다.
    expect(title.closest('li')?.className ?? '').not.toContain('opacity')
  })

  it('완료 토글은 네이티브 체크박스가 아니라 토큰 스킨 컴포넌트다', async () => {
    setup({ rows: [makeRow({ title: '문서 작성' })], timer: idleFocusSnapshot })

    const box = await screen.findByRole('checkbox', { name: '문서 작성 완료 토글' })
    expect(box.tagName).not.toBe('INPUT')
    expect(box.querySelector('span')?.className).toContain('border-control-border')
  })

  it('타이머가 running 이면 치우기 버튼이 하나도 없다', async () => {
    setup({
      rows: [makeRow({ taskId: 'todo', completedAt: null })],
      timer: { ...idleFocusSnapshot, phase: 'running' }
    })

    await screen.findAllByTestId('today-row-title')
    expect(screen.queryByRole('button', { name: '치우기' })).not.toBeInTheDocument()
  })

  it('타이머가 paused 여도 치우기 버튼이 없다', async () => {
    setup({
      rows: [makeRow({ taskId: 'todo', completedAt: null })],
      timer: { ...idleFocusSnapshot, phase: 'paused', pausedRemainingSec: 300 }
    })

    await screen.findAllByTestId('today-row-title')
    expect(screen.queryByRole('button', { name: '치우기' })).not.toBeInTheDocument()
  })

  it('타이머가 idle 이면 치우기 버튼이 렌더된다', async () => {
    setup({
      rows: [makeRow({ taskId: 'todo', completedAt: null })],
      timer: idleFocusSnapshot
    })

    await screen.findAllByTestId('today-row-title')
    expect(screen.getByRole('button', { name: '치우기' })).toBeInTheDocument()
  })

  it('조회가 아직 끝나지 않았으면 빈 상태 카피를 보여주지 않는다 (로딩 ≠ 0건)', () => {
    // 절대 resolve 되지 않는 프로미스 — "아직 모른다"를 고정한 채 동기적으로 단언한다.
    const neverResolves = new Promise<{ dayKey: string; rows: TodayRow[] }>(() => {})
    setup({ rows: [], timer: idleFocusSnapshot, listPromise: neverResolves })

    expect(screen.queryByText('오늘 몫이 비어 있어요')).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-row-title')).not.toBeInTheDocument()
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
