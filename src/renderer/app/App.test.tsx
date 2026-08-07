// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { App } from './App'

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
