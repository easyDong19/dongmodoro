import type { Baseline, Repositories, WeekSnapshot } from './ports'

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
  return repos.weeks.baseline(week) ?? globalBaseline(repos)
}

/**
 * 전역 설정의 길이 3종 — **어느 주에도 매이지 않은 "지금 값"** 이다.
 *
 * 정산 패널의 길이 표시가 이것을 쓴다 (ux-spec §6). `effectiveBaseline` 을 쓰면 계획
 * 대상 주에 이미 행이 있을 때 박제된 값이 나오는데, 그 자리는 "앞으로 적용될 값"을
 * 말하는 자리라 다른 질문에 답하게 된다 (ADR-013 §3 — 편집 시점과 효력 시점의 분리).
 */
export function globalBaseline(repos: Repositories): Baseline {
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
  const capacity = capacitySetting(repos)
  return capacity === null ? null : capacity.reduce((sum, n) => sum + n, 0)
}

/** 요일별 가용 뽀모 설정. 정한 적 없으면 `null` — `[0,…]` 을 지어내지 않는다. */
function capacitySetting(repos: Repositories): number[] | null {
  const raw = repos.settings.get('weekly_capacity')
  return raw === null ? null : (JSON.parse(raw) as number[])
}

/**
 * `weeks` 행을 처음 만들 때 함께 박제할 값 전부 (weekly-review R37 · ADR-013 §1·§2).
 *
 * 길이는 `effectiveBaseline` 과 같은 결정 순서를 지난다. 예산은 **그 시점의 가용량 합을
 * 해석해 저장**하는데, 이것이 `effectiveBudget` 이 조회 시점에 파생하지 **않는** 것과
 * 모순되지 않는다: 저장은 한 번뿐이고 그 뒤로 불변이기 때문이다. 조회 때마다 파생하면
 * 가용량을 고치는 순간 지난 주들의 예산이 소급해 바뀐다.
 *
 * M3a 는 길이 3종만 넘겼다. capacity 가 항상 NULL 이라 결과가 같았지만, 그대로 두면
 * 가용량 편집이 생기는 순간 **플래너가 만든 주만 스냅샷이 비는** 비대칭이 생긴다.
 */
export function weekSnapshot(repos: Repositories, week: string): WeekSnapshot {
  const capacity = capacitySetting(repos)
  return {
    ...effectiveBaseline(repos, week),
    capacity,
    budget: capacity === null ? null : capacity.reduce((sum, n) => sum + n, 0)
  }
}
