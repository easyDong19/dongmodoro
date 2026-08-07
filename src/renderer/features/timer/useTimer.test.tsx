// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Api } from '@shared/ipc/api'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { useTimer } from './useTimer'

const runningSnapshot: TimerSnapshotWire = {
  mode: 'focus',
  phase: 'running',
  startedAt: 1_000_000,
  durationSec: 1500,
  pausedRemainingSec: null,
  taskId: null,
  taskTitle: null,
  focusCountToday: 0,
  focusSinceLastLong: 0
}

function setupApi(timer: TimerSnapshotWire) {
  window.api = {
    system: { getAppInfo: vi.fn() },
    clock: { now: vi.fn() },
    today: {
      list: vi.fn(),
      addDirect: vi.fn(),
      pull: vi.fn(),
      remove: vi.fn(),
      toggleComplete: vi.fn()
    },
    timer: {
      getState: vi.fn().mockResolvedValue(timer),
      start: vi.fn(),
      startWithTask: vi.fn(),
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
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useTimer — 1초 인터벌은 재계산 신호일 뿐이다 (ADR-005 §3, Task 10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_010_000 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('running 스냅샷에서 매 초 remaining 이 wall-clock 산술로 줄어든다', async () => {
    setupApi(runningSnapshot)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useTimer(), { wrapper: wrapper(qc) })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.snapshot).toBeDefined()
    // startedAt=1_000_000, now=1_010_000 → 경과 10s
    expect(result.current.remaining).toBe(1500 - 10)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(result.current.remaining).toBe(1500 - 11)
  })

  it('idle 스냅샷은 인터벌을 켜지 않고 durationSec 을 그대로 보여준다', async () => {
    const idle: TimerSnapshotWire = { ...runningSnapshot, phase: 'idle', startedAt: null }
    setupApi(idle)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useTimer(), { wrapper: wrapper(qc) })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.snapshot).toBeDefined()
    expect(result.current.remaining).toBe(1500)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(result.current.remaining).toBe(1500)
  })
})
