import type { Baseline, Repositories } from './ports'

/** settings 값은 JSON 문자열이다 (ADR-018 §5) — `'25'` 를 파싱해 정수로 되돌린다. */
function readIntSetting(repos: Repositories, key: string): number {
  const raw = repos.settings.get(key)
  if (raw === null) {
    throw new Error(`effectiveBaseline: missing required setting '${key}'`)
  }
  return JSON.parse(raw) as number
}

/**
 * 유효 베이스라인(week) — 결정 순서는 이 함수에만 존재한다 (pomo-baseline R10·R13).
 *
 * `weeks` 에 그 주 스냅샷이 있으면 그것을 쓴다 (박제된 값, ADR-013 §2). 없으면 전역
 * `settings` 값으로 폴백한다 — 아직 그 주의 첫 세션·계획·정산이 일어나지 않아 스냅샷이
 * 생기지 않은 경우다. 폴백 여부는 `weeks.baseline()` 이 판정하지 않는다(그 포트의 주석
 * 참조) — 결정은 오직 여기서만 일어난다.
 */
export function effectiveBaseline(repos: Repositories, week: string): Baseline {
  const snap = repos.weeks.baseline(week)
  if (snap) return snap
  return {
    focusMin: readIntSetting(repos, 'focus_min'),
    shortBreakMin: readIntSetting(repos, 'short_break_min'),
    longBreakMin: readIntSetting(repos, 'long_break_min')
  }
}

/**
 * 유효 예산(week) 계약 (pomo-baseline R11). 반환 `null` 은 **"기록 없음"** 이며
 * "예산 0" 이 아니다 — 후자는 `0` 으로 돌아온다 (ADR-018 §1).
 *
 * **조회 시점에 `sum(weekly_capacity)` 로 예산을 파생하는 경로는 이 계약에 없다.**
 * capacity 는 입력 UI 의 프리필 재료일 뿐이다 (`budgetPrefill`). 여기에 폴백을 더하면
 * "정하지 않았다"와 "이만큼으로 정했다"가 화면에서 구분되지 않는다.
 *
 * `effectiveBaseline` 과 달리 폴백이 **없다는 것 자체가 계약**이다.
 */
export function effectiveBudget(repos: Repositories, week: string): number | null {
  return repos.weeks.plan(week)?.budget ?? null
}

/**
 * 예산 입력의 기본값 프리필 (pomo-baseline R12). **조회 계약이 아니라 입력 UI 의
 * 관심사다.** `weekly_capacity` 미설정이면 `null` 을 돌려 필드를 빈 채로 둔다 —
 * M3a 에는 capacity 편집 UI 가 없으므로 항상 이 경로다.
 */
export function budgetPrefill(repos: Repositories): number | null {
  const raw = repos.settings.get('weekly_capacity')
  if (raw === null) return null
  return (JSON.parse(raw) as number[]).reduce((sum, n) => sum + n, 0)
}
