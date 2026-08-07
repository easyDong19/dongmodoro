// ADR-009 §3: 이 모듈만 new Date() 를 호출한다 (ESLint 가 밖에서의 호출을 막는다).
// 저장된 순간(UTC)을 파싱해 달력 키를 재파생하는 함수를 이 모듈에 추가하지 말 것 —
// 달력 키는 쓰는 순간 1회 계산 후 불변이다 (ADR-009 §2).
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 순간 — 일이 벌어진 시각. UTC ISO 8601 `'...Z'` (ADR-009 §1). */
export function now(): string {
  return new Date().toISOString()
}

/** 달력 키 — 로컬 기준 날짜 `'YYYY-MM-DD'` (ADR-009 §1). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 달력 키 — 그 주 월요일 날짜 `'YYYY-MM-DD'`. 주 시작 = 월요일 (ADR-010). */
export function weekKey(d: Date = new Date()): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate()) // 시분초 소거
  const dow = monday.getDay() // 0=일 … 6=토
  monday.setDate(monday.getDate() - ((dow + 6) % 7)) // 월요일로 후진
  return dayKey(monday)
}

/** 달력 키 — 로컬 기준 월 `'YYYY-MM'` (ADR-009 §1). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** 한 순간에서 함께 파생되는 달력 키 짝. 따로 만들 수 없다 (ADR-022 §1). */
export type LocalKeys = {
  readonly localDate: string
  readonly localWeek: string
}

/**
 * `sessions.local_date`·`local_week` 를 **한 번의 시계 읽기로 함께** 만든다 (ADR-022 §1).
 *
 * `dayKey()` 와 `weekKey()` 를 따로 부르면 각자 `new Date()` 를 호출하므로, 자정을 걸친
 * 순간에 두 값이 서로 다른 주를 가리킬 수 있다 (일 23:59:59.999 → `2026-08-09` /
 * 월 00:00:00.000 → `2026-08-10`). 두 컬럼을 함께 쓰는 곳은 반드시 이 함수를 쓴다.
 *
 * `atEpochMs` 를 받는 이유: 런타임 시각은 epoch ms 이고 저장 경계에서 변환한다(ADR-009 §1).
 * lint 가 이 모듈 밖의 `new Date()` 를 막으므로(ADR-009 §3), 호출부는 `Date` 를 만들 수
 * 없고 epoch ms 만 넘길 수 있다. 생략하면 현재 시각이다.
 */
export function localKeys(atEpochMs?: number): LocalKeys {
  const at = atEpochMs === undefined ? new Date() : new Date(atEpochMs)
  return { localDate: dayKey(at), localWeek: weekKey(at) }
}

/** 현재 순간의 epoch ms (ADR-009 §3). 알람 스케줄링처럼 epoch 산술이 필요한 셸이 쓴다. */
export function nowMs(): number {
  return Date.now()
}

/**
 * epoch ms → 순간(UTC ISO). 이미 벌어진 순간(세션 시작·종료)을 저장 경계에서 문자열로
 * 변환할 때 쓴다 (ADR-009 §1 — 런타임은 epoch ms, 저장은 UTC ISO). 달력 키 재파생이
 * 아니다 — 그것은 이 파일 상단 주석대로 금지다.
 */
export function instantFromMs(atEpochMs: number): string {
  return new Date(atEpochMs).toISOString()
}

/** 자정 경계 이벤트의 달력 키 3종 (ADR-026 §1). 한 번의 시계 읽기에서 함께 파생한다 —
 * localKeys 와 같은 이유(ADR-022 §1)로, dayKey·weekKey·monthKey 가 자정을 걸쳐 갈라지면
 * 안 된다. 필드명은 `eventContracts.clockBoundary` 의 payload 모양을 그대로 따른다. */
export type CalendarKeys = {
  readonly dayKey: string
  readonly weekKey: string
  readonly monthKey: string
}

export function calendarKeys(atEpochMs?: number): CalendarKeys {
  const at = atEpochMs === undefined ? new Date() : new Date(atEpochMs)
  return { dayKey: dayKey(at), weekKey: weekKey(at), monthKey: monthKey(at) }
}

/**
 * 다음 자정(로컬)의 epoch ms. 자정 알람의 재예약 계산에 쓴다 (ADR-026 §1).
 * `new Date()` 생성자를 여기 안에 가둬서 호출부(main/services/clock.ts)가 epoch ms 만
 * 주고받게 한다 — ADR-009 §3 이 그 밖에서의 생성자 호출을 lint 로 막는다.
 */
export function startOfNextLocalDayMs(atEpochMs: number): number {
  const at = new Date(atEpochMs)
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1, 0, 0, 0, 0).getTime()
}
