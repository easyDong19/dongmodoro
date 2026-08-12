/**
 * 쿼리 키 리터럴의 유일한 출처 (ADR-025 §1-4). 여기서 만들지 않은 키를
 * useQuery/invalidateQueries 에 직접 쓰지 않는다 — 오타·불일치는 캐시가 조용히
 * 어긋나는 버그로 이어진다.
 *
 * ADR-025 §2. 달력 키 인자는 useClock() 또는 이벤트 payload 저장값만 — 직접 계산 금지.
 */
export const keys = {
  appInfo: () => ['system', 'appInfo'] as const,
  settings: () => ['settings'] as const,
  /**
   * 전역 분모 편집 폼. **일부러 `settings()` 아래에 둔다** — 두 쿼리가 같은 키를 쓰면
   * 응답 모양이 다른데도 캐시가 하나로 합쳐져, 먼저 마운트된 쪽의 데이터가 다른 쪽에
   * 그대로 흘러든다. 접두사로 두면 그 충돌 없이 `settings()` 한 번이 둘을 함께 턴다.
   */
  baseline: () => ['settings', 'baseline'] as const,
  timer: () => ['timer'] as const,
  clock: () => ['clock'] as const,
  reviewPending: () => ['review', 'pending'] as const,
  /**
   * 정산 패널 데이터. **일부러 `reviewPending()` 아래에 둔다** — 확정과 자정 경계가 그
   * 키를 털면 배너와 열려 있는 패널이 접두사로 함께 잡힌다. 별도 최상위 키로 두면
   * 확정 후 배너만 사라지고 패널은 낡은 목록을 계속 보여준다.
   */
  reviewPanel: () => ['review', 'pending', 'panel'] as const,
  today: (dayKey: string) => ['today', dayKey] as const,
  day: (dayKey: string) => ['day', dayKey] as const,
  /**
   * 주간 카드 한 화면 (summary). `['week', weekKey]` 이며 `weekAll()` prefix 에 걸린다.
   *
   * M2 의 `weekItems(weekKey)` = `['week', weekKey, 'items']` 를 대체한다. 그 키는 어떤
   * 쿼리도 쓰지 않는 상태였고, 더 긴 키로는 이 카드 쿼리를 무효화할 수 없었다 —
   * 무효화는 "주어진 키를 접두사로 갖는 쿼리"를 잡으므로 방향이 반대다.
   */
  week: (weekKey: string) => ['week', weekKey] as const,
  /**
   * 열린 드로어 하나. **일부러 `week(weekKey)` 아래에 둔다** — 무효화는 접두사로 잡으므로
   * `keys.week(w)` 한 번이 그 주의 카드와 열려 있는 드로어를 함께 턴다. 드로어를 별도
   * 최상위 키로 두면 pull 후 카드만 갱신되고 드로어는 옛 목록을 보여준다.
   */
  weekItemDrawer: (weekKey: string, weekItemId: string) =>
    ['week', weekKey, 'drawer', weekItemId] as const,
  /** 플래너 초안. 드로어와 같은 이유로 `week(weekKey)` 아래에 둔다. */
  weekPlanDraft: (weekKey: string) => ['week', weekKey, 'planDraft'] as const,
  monthCalendar: (monthKey: string) => ['month', monthKey, 'calendar'] as const,
  /**
   * 마일스톤 카드 한 화면. `monthCalendar` 와 나란히 `monthAll()` prefix 아래에 둔다 —
   * 세션 완료·자정 경계는 두 카드를 함께 털어야 하고, 마일스톤 편집은 이 키 하나만 턴다.
   */
  monthMilestones: (monthKey: string) => ['month', monthKey, 'milestones'] as const,
  /** 캡처 바 대기 상태 (Task 10) — 이벤트 리스너가 쓰고 CaptureBar 가 읽는다. */
  capturePending: () => ['capture', 'pending'] as const,
  // prefix 무효화 전용 (쿼리 키로 직접 쓰지 않는다)
  todayAll: () => ['today'] as const,
  dayAll: () => ['day'] as const,
  weekAll: () => ['week'] as const,
  monthAll: () => ['month'] as const
} as const
