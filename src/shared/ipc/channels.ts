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
    /** 조각 생성만 한다 — 오늘로 보내는 것은 pullFromDrawer 의 몫이다 (쪼개기·가져오기 분리). */
    addTask: 'week:addTask',
    pullFromDrawer: 'week:pullFromDrawer',
    complete: 'week:complete',
    uncomplete: 'week:uncomplete',
    drop: 'week:drop',
    /** 할당 ↔ 마일스톤 연결 (R13·R14). `null` 은 **연결 해제**이며 오류가 아니다. */
    setMilestone: 'week:setMilestone'
  },
  /** 캘린더 열람 (calendar-records). 전부 조회이며 쓰기 채널이 없다 (R23). */
  calendar: {
    month: 'calendar:month',
    day: 'calendar:day',
    studyDays: 'calendar:studyDays'
  },
  /** 월 마일스톤 (milestones). 삭제 확인은 화면이 받고 채널은 id 만 안다 (R8). */
  milestones: {
    forMonth: 'milestones:forMonth',
    create: 'milestones:create',
    rename: 'milestones:rename',
    setCompleted: 'milestones:setCompleted',
    setArchived: 'milestones:setArchived',
    remove: 'milestones:remove',
    carryTitles: 'milestones:carryTitles'
  },
  review: {
    getStatus: 'review:getStatus',
    getPending: 'review:getPending',
    settle: 'review:settle'
  },
  /**
   * 설정 도메인. 키마다 전용 채널을 두고 **범용 `get(key)`/`set(key, value)` 를 만들지
   * 않는다** — 값이 `string` 이 되면 `theme` 에 `'purple'` 이 들어가도 계약을 통과해,
   * 그 채널에서만 ADR-007 의 규율이 무력해진다. 설정이 늘면 쌍이 늘어나는 비용은 수용한다.
   */
  settings: {
    getTheme: 'settings:getTheme',
    setTheme: 'settings:setTheme'
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
