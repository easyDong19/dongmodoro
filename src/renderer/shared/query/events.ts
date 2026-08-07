import type { QueryClient } from '@tanstack/react-query'
import { eventContracts } from '@shared/ipc/contracts'
import type { ClockBoundary } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from './keys'
import { dispatchInvalidation } from './invalidate'

/**
 * 캡처 바가 대기 캐시를 비우는 유일한 경로 (Task 10) — `기록`·`건너뛰기`·Esc 셋 다
 * 이걸 부른다. setQueryData 는 초크포인트 파일(events.ts·invalidate.ts)에서만 허용되므로
 * (ADR-025 §5), CaptureBar 는 이 함수를 통해서만 캐시를 비운다.
 */
export function clearCapturePending(qc: QueryClient): void {
  // setQueryData(key, undefined) 은 react-query 에서 무시된다(no-op) — 반드시 null 을 쓴다.
  qc.setQueryData(keys.capturePending(), null)
}

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
    // 자유 focus 완료(taskId 미지정)만 사후 캡처 대상이다 (ux-spec §5, Task 10).
    if (payload.kind === 'focus' && payload.taskId === null) {
      qc.setQueryData(keys.capturePending(), payload)
    }
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
    // M-4: 자정 경계로 focusCountToday 가 리셋되므로 `N번째 집중` 라벨이 다음 전이까지
    // 낡은 값을 보여준다 — 타이머 스냅샷도 여기서 함께 무효화해 queryFn 으로 다시 채운다.
    void qc.invalidateQueries({ queryKey: keys.timer() })
  })
  return () => {
    offTimer()
    offSession()
    offClock()
  }
}
