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
