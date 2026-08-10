// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { App } from './App'

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

function setup({ clockNow }: { clockNow: () => Promise<typeof clock> }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })

  window.api = {
    system: { getAppInfo: vi.fn() },
    clock: { now: vi.fn(clockNow) },
    today: {
      list: vi.fn().mockResolvedValue({ dayKey: clock.dayKey, rows: [] }),
      addDirect: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      pull: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      remove: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      toggleComplete: vi.fn().mockResolvedValue({ parentWeek: clock.weekKey, completedAt: null })
    },
    timer: {
      getState: vi.fn().mockResolvedValue(idleFocusSnapshot),
      start: vi.fn(),
      startWithTask: vi.fn().mockResolvedValue(idleFocusSnapshot),
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      adjust: vi.fn(),
      completeEarly: vi.fn(),
      setMode: vi.fn()
    },
    sessions: { capture: vi.fn() },
    // 9종을 전부 채운다 — `api` 는 접근 시점에 Reflect.get 하는 Proxy 이고,
    // useMutation({ mutationFn: api.week.pullNext }) 는 **렌더 도중** 프로퍼티를 읽는다.
    // queryFn 과 달리 React Query 가 삼켜주지 않아 하나만 빠져도 렌더가 죽는다.
    week: {
      summary: vi.fn().mockResolvedValue({
        week: clock.weekKey,
        budget: null,
        totalSpent: 0,
        items: [],
        otherRow: { visible: false, spentPomos: 0 }
      }),
      planDraft: vi.fn(),
      confirmPlan: vi.fn(),
      drawer: vi.fn(),
      pullNext: vi.fn(),
      pullFromDrawer: vi.fn(),
      complete: vi.fn(),
      uncomplete: vi.fn(),
      drop: vi.fn()
    },
    events: {
      onTimerTransition: vi.fn(() => () => {}),
      onSessionRecorded: vi.fn(() => () => {}),
      onClockBoundary: vi.fn(() => () => {})
    }
  } as unknown as Api & { events: Api['events'] }

  render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  )
  return qc
}

describe('App — clock 게이트 (콜드 스타트 크래시 회귀)', () => {
  it('clock:now 가 아직 resolve 되지 않았으면 던지지 않고, 카드도 렌더하지 않는다', () => {
    // 절대 resolve 되지 않는 프로미스 — 콜드 스타트의 "아직 모른다" 구간을 고정한다.
    const neverResolves = new Promise<typeof clock>(() => {})
    expect(() => setup({ clockNow: () => neverResolves })).not.toThrow()

    expect(screen.queryByLabelText('타이머')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('오늘 목록')).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-row-title')).not.toBeInTheDocument()
  })

  it('clock:now 가 resolve 되면 타이머 카드와 오늘 목록이 렌더된다', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })

    expect(await screen.findByLabelText('타이머')).toBeInTheDocument()
    expect(screen.getByLabelText('오늘 목록')).toBeInTheDocument()
  })

  it('clock:now 가 거부되면 던지지 않고 중립 안내만 보여준다 (ADR-024 — 재시도 없음)', async () => {
    setup({ clockNow: () => Promise.reject(new Error('offline')) })

    expect(await screen.findByText('잠시 후 다시 열어 주세요')).toBeInTheDocument()
    expect(screen.queryByLabelText('타이머')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('오늘 목록')).not.toBeInTheDocument()
  })
})

describe('App — 카드 표면 (design-system ADR-002)', () => {
  it('세 카드가 유리 표면 클래스를 쓴다 — 인라인 배경으로 때우지 않는다', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })
    await screen.findByLabelText('타이머')

    for (const label of ['타이머', '주간 계획', '오늘 목록']) {
      const section = screen.getByLabelText(label)
      expect(section.className).toContain('card')
      // 인라인 background 는 backdrop-filter·shadow 를 못 데려온다. 그래서 이 검사가 있다.
      expect(section.getAttribute('style') ?? '').not.toContain('background')
    }
  })
})
