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
  /**
   * 그 주에서 오늘이 몇 번째 날인가. **0 = 월요일** … 6 = 일요일 (ADR-010 §1).
   * `Date.getDay()`(0=일)와 기준이 다르다 — 우리 주는 월요일에 시작한다.
   *
   * 이 필드가 여기 있는 이유는 renderer 가 요일을 **계산할 수 없기 때문**이다.
   * ESLint 의 `TIME_SELECTORS` 가 이 모듈 밖의 `new Date()`·`Date.now()` 를 막으므로,
   * 요일 핍의 지난/오늘/앞으로 구분과 "오늘 배정된 항목" 정렬은 이 값이 유일한 통로다.
   * dayKey·weekKey 와 **한 번의 시계 읽기에서 함께** 나오므로 자정을 걸쳐 갈라지지 않는다.
   */
  readonly weekdayIndex: number
}

export function calendarKeys(atEpochMs?: number): CalendarKeys {
  const at = atEpochMs === undefined ? new Date() : new Date(atEpochMs)
  return {
    dayKey: dayKey(at),
    weekKey: weekKey(at),
    monthKey: monthKey(at),
    weekdayIndex: (at.getDay() + 6) % 7 // 0=일 … 6=토  →  0=월 … 6=일
  }
}

/**
 * 달력 키 → epoch day. DST 를 타지 않도록 UTC 로만 센다 — 로컬 자정 산술은 전환일에
 * ±1시간 어긋나 나눗셈이 한 칸 밀린다.
 *
 * 아래 두 함수는 **이미 고정된 달력 키끼리의 산술**만 한다. 이 파일 상단이 금지하는
 * "저장된 순간(UTC)을 파싱해 달력 키를 재파생"하는 것이 아니므로 규칙 안이다.
 */
function dayNumber(calendarKey: string): number {
  const [y, m, d] = calendarKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/**
 * 이월 배지 `N주째` (week-plan R11). 두 주 키의 차이 ÷ 7 + 1.
 * 항목이 만들어진 주가 곧 1주째다 — 0 주째는 없다. 이월 **사슬 길이로 세지 않는다**
 * (중간에 한 주를 건너뛰어도 경과한 주 수가 답이다).
 */
export function weeksSince(originWeek: string, week: string): number {
  return Math.floor((dayNumber(week) - dayNumber(originWeek)) / 7) + 1
}

/** epoch day → `8/3`. `dayNumber` 의 역이며 UTC 로만 읽어 DST 를 타지 않는다. */
function monthDayLabel(atMs: number): string {
  const d = new Date(atMs)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/** 카드 헤더의 주 범위 `8/3 – 8/9` (ux-spec §2). 구분자는 en dash 이고 앞뒤에 공백이 있다. */
export function weekRangeLabel(week: string): string {
  const startMs = dayNumber(week) * 86_400_000
  return `${monthDayLabel(startMs)} – ${monthDayLabel(startMs + 6 * 86_400_000)}`
}

/**
 * 좁은 자리용 주 라벨 `8/3` — 정산 목록의 출처 주처럼 `weekRangeLabel` 이 들어가지 않는 곳.
 *
 * **ISO 주 번호(`W35`)를 쓰지 않는다.** ux-spec 초안이 그 표기를 썼지만, 주 번호 산술은
 * 53주 연도에서 깨지고(ADR-010 Context) 주간 카드 헤더가 이미 날짜 범위를 쓰고 있어
 * 같은 컬럼 안에 두 표기가 섞인다. 저장값이 아니라 렌더 전용 라벨이다 (ADR-010 §2).
 */
export function weekStartLabel(week: string): string {
  return monthDayLabel(dayNumber(week) * 86_400_000)
}

/**
 * 주 키를 n 주 앞뒤로 옮긴다 (`n` 은 음수 가능).
 *
 * 주 번호가 아니라 **날짜**를 더한다 — ISO 주 번호 산술은 53주 연도에서 깨지고 밀리초
 * 나눗셈은 DST 에서 한 칸 밀린다 (ADR-010 Context). 주 키는 언제나 월요일이므로
 * ±7n 일을 더해도 월요일이 유지된다.
 */
export function addWeeks(weekKeyValue: string, n: number): string {
  const at = new Date((dayNumber(weekKeyValue) + n * 7) * 86_400_000)
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
}

/**
 * `from … to` 사이의 주 키를 **양끝 포함**해 오름차순으로 준다 (정산 범위의 각 주).
 *
 * `from > to` 는 빈 배열이며 **이것이 정상 상태다** — 평일 정상 사용과 정산 확정 직후가
 * 모두 그 경로다 (weekly-review technical-spec §0.1).
 */
export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let w = from; w <= to; w = addWeeks(w, 1)) out.push(w)
  return out
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
