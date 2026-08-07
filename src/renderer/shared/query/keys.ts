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
  weekItems: (weekKey: string) => ['week', weekKey, 'items'] as const,
  monthCalendar: (monthKey: string) => ['month', monthKey, 'calendar'] as const,
  /** 캡처 바 대기 상태 (Task 10) — 이벤트 리스너가 쓰고 CaptureBar 가 읽는다. */
  capturePending: () => ['capture', 'pending'] as const,
  // prefix 무효화 전용 (쿼리 키로 직접 쓰지 않는다)
  todayAll: () => ['today'] as const,
  dayAll: () => ['day'] as const,
  weekAll: () => ['week'] as const,
  monthAll: () => ['month'] as const
} as const
