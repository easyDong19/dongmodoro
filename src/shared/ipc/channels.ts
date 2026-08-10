/**
 * IPC 채널 이름. main·preload 가 같은 상수를 보게 해서 오타로 인한 무응답을 없앤다.
 * 새 유스케이스는 여기 → contracts.ts → handleIpc → preload 순으로 네 곳을 모두 채운다 (ADR-007).
 */
export const CHANNELS = {
  system: { getAppInfo: 'system:getAppInfo' },
  clock: { now: 'clock:now' },
  today: {
    list: 'today:list',
    addDirect: 'today:addDirect',
    pull: 'today:pull',
    remove: 'today:remove',
    toggleComplete: 'today:toggleComplete'
  },
  timer: {
    getState: 'timer:getState',
    start: 'timer:start',
    startWithTask: 'timer:startWithTask',
    pause: 'timer:pause',
    resume: 'timer:resume',
    reset: 'timer:reset',
    adjust: 'timer:adjust',
    completeEarly: 'timer:completeEarly',
    setMode: 'timer:setMode'
  },
  sessions: { capture: 'sessions:capture' },
  week: {
    summary: 'week:summary',
    planDraft: 'week:planDraft',
    confirmPlan: 'week:confirmPlan',
    drawer: 'week:drawer',
    pullNext: 'week:pullNext',
    pullFromDrawer: 'week:pullFromDrawer',
    complete: 'week:complete',
    uncomplete: 'week:uncomplete',
    drop: 'week:drop'
  },
  review: {
    getStatus: 'review:getStatus'
  }
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
