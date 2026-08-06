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
