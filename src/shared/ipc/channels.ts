/**
 * IPC 채널 이름. main·preload 가 같은 상수를 보게 해서 오타로 인한 무응답을 없앤다.
 * 새 유스케이스는 여기 → contracts.ts → handleIpc → preload 순으로 네 곳을 모두 채운다 (ADR-007).
 */
export const CHANNELS = {
  system: { getAppInfo: 'system:getAppInfo' },
  clock: { now: 'clock:now' }
} as const

/**
 * main → renderer 이벤트 채널 (ADR-026). invoke 채널(CHANNELS)과 방향이 반대라
 * 따로 둔다 — 새 이벤트는 여기 → contracts.ts(eventContracts) → sendEvent 호출부 →
 * preload 구독 표면 순으로 네 곳을 모두 채운다.
 */
export const EVENT_CHANNELS = {
  timerTransition: 'timer:transition',
  sessionRecorded: 'session:recorded',
  clockBoundary: 'clock:boundary'
} as const
