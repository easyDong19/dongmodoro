import type { QueryClient } from '@tanstack/react-query'
import { eventContracts } from '@shared/ipc/contracts'
import type { ClockBoundary } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from './keys'
import { dispatchInvalidation } from './invalidate'

/**
 * 앱 최상단 구독 한 곳 (ADR-026 §4). main 이 보내는 이벤트를 수신 직후 parse 하고,
 * 캐시를 갱신한다. 여러 곳에서 구독하면 순서·중복 부수효과를 보장할 수 없어 여기 하나로
 * 모은다.
 */
export function subscribeMainEvents(qc: QueryClient): () => void {
  const offTimer = api.events.onTimerTransition((raw) => {
    const snapshot = eventContracts.timerTransition.parse(raw)
    // in-flight pull 이 push 를 덮는 역전을 막는다: cancel 먼저, set 나중 (ADR-026 §4).
    void qc.cancelQueries({ queryKey: keys.timer() })
    qc.setQueryData(keys.timer(), snapshot)
  })
  const offSession = api.events.onSessionRecorded((raw) => {
    const payload = eventContracts.sessionRecorded.parse(raw)
    const clock = qc.getQueryData<ClockBoundary>(keys.clock())
    dispatchInvalidation(qc, {
      type: 'session-recorded',
      payload,
      currentDayKey: clock?.dayKey ?? payload.localDate
    })
  })
  const offClock = api.events.onClockBoundary((raw) => {
    const payload = eventContracts.clockBoundary.parse(raw)
    const previous = qc.getQueryData<ClockBoundary>(keys.clock()) ?? payload
    qc.setQueryData(keys.clock(), payload)
    dispatchInvalidation(qc, {
      type: 'clock-boundary',
      payload,
      previous,
      currentDayKey: payload.dayKey
    })
  })
  return () => {
    offTimer()
    offSession()
    offClock()
  }
}
