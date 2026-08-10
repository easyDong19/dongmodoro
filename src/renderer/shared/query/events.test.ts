import { describe, it, expect, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import { subscribeMainEvents } from './events'
import { keys } from './keys'

/**
 * 초크포인트 이음매 테스트 (Test gaps 항목) — subscribeMainEvents 가 실제로
 * cancelQueries 를 setQueryData 보다 먼저 부르는지(ADR-026 §4 역전 방지), 그리고
 * session:recorded 가 dispatchInvalidation 을 거쳐 기대한 키들을 무효화하는지를
 * 지금까지 아무 테스트도 검증하지 않았다.
 */
function setupApi(): { api: Api; fire: Record<string, (payload: unknown) => void> } {
  const fire: Record<string, (payload: unknown) => void> = {}
  const api = {
    events: {
      onTimerTransition: (cb: (p: unknown) => void) => {
        fire.timer = cb
        return () => {}
      },
      onSessionRecorded: (cb: (p: unknown) => void) => {
        fire.session = cb
        return () => {}
      },
      onClockBoundary: (cb: (p: unknown) => void) => {
        fire.clock = cb
        return () => {}
      }
    }
  } as unknown as Api
  return { api, fire }
}

describe('subscribeMainEvents — 초크포인트 이음매', () => {
  it('timer:transition — cancelQueries 를 setQueryData 보다 먼저 부른다 (역전 방지, ADR-026 §4)', () => {
    const { api, fire } = setupApi()
    const qc = new QueryClient()
    const order: string[] = []
    const cancelSpy = vi.spyOn(qc, 'cancelQueries').mockImplementation(() => {
      order.push('cancelQueries')
      return Promise.resolve()
    })
    const setSpy = vi.spyOn(qc, 'setQueryData').mockImplementation(() => {
      order.push('setQueryData')
      return undefined
    })

    // events.ts imports `api` from '@renderer/shared/api' (Proxy over window.api) — inject via window.
    ;(globalThis as { window: { api: Api } }).window = { api } as unknown as { api: Api }

    subscribeMainEvents(qc)
    fire.timer({
      mode: 'focus',
      phase: 'idle',
      startedAt: null,
      durationSec: 1500,
      pausedRemainingSec: null,
      taskId: null,
      taskTitle: null,
      focusCountToday: 0,
      focusSinceLastLong: 0
    })

    expect(order).toEqual(['cancelQueries', 'setQueryData'])
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: keys.timer() })
    expect(setSpy).toHaveBeenCalledWith(keys.timer(), expect.any(Object))
  })

  it('session:recorded — 기대한 키들을 invalidateQueries 로 무효화한다', () => {
    const { api, fire } = setupApi()
    ;(globalThis as { window: { api: Api } }).window = { api } as unknown as { api: Api }
    const qc = new QueryClient()
    const invalidated: unknown[] = []
    vi.spyOn(qc, 'invalidateQueries').mockImplementation((opts) => {
      invalidated.push((opts as { queryKey: unknown }).queryKey)
      return Promise.resolve()
    })

    subscribeMainEvents(qc)
    fire.session({
      sessionId: 's1',
      kind: 'focus',
      taskId: 't1',
      durationSec: 1500,
      localDate: '2026-08-07',
      localWeek: '2026-08-03'
    })

    expect(invalidated).toContainEqual(keys.today('2026-08-07'))
    expect(invalidated).toContainEqual(keys.day('2026-08-07'))
    expect(invalidated).toContainEqual(keys.week('2026-08-03'))
    expect(invalidated).toContainEqual(keys.monthCalendar('2026-08'))
    expect(invalidated).toContainEqual(keys.monthAll())
  })

  it('clock:boundary — 경계 무효화와 함께 타이머 스냅샷도 무효화한다 (M-4)', () => {
    const { api, fire } = setupApi()
    ;(globalThis as { window: { api: Api } }).window = { api } as unknown as { api: Api }
    const qc = new QueryClient()
    const invalidated: unknown[] = []
    vi.spyOn(qc, 'invalidateQueries').mockImplementation((opts) => {
      invalidated.push((opts as { queryKey: unknown }).queryKey)
      return Promise.resolve()
    })

    subscribeMainEvents(qc)
    fire.clock({ dayKey: '2026-08-08', weekKey: '2026-08-03', monthKey: '2026-08' })

    expect(invalidated).toContainEqual(keys.timer())
  })
})
