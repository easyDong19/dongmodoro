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
  timer: () => ['timer'] as const,
  clock: () => ['clock'] as const,
  reviewPending: () => ['review', 'pending'] as const,
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
  monthCalendar: (monthKey: string) => ['month', monthKey, 'calendar'] as const,
  /** 캡처 바 대기 상태 (Task 10) — 이벤트 리스너가 쓰고 CaptureBar 가 읽는다. */
  capturePending: () => ['capture', 'pending'] as const,
  // prefix 무효화 전용 (쿼리 키로 직접 쓰지 않는다)
  todayAll: () => ['today'] as const,
  dayAll: () => ['day'] as const,
  weekAll: () => ['week'] as const,
  monthAll: () => ['month'] as const
} as const
