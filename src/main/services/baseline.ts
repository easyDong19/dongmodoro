import type { Baseline, Repositories, UnitOfWork, WeekSnapshot } from './ports'

/** settings 값은 JSON 문자열이다 (ADR-018 §5) — `'25'` 를 파싱해 정수로 되돌린다. */
function readIntSetting(repos: Repositories, key: string): number {
  const raw = repos.settings.get(key)
  if (raw === null) {
    throw new Error(`globalBaseline: missing required setting '${key}'`)
  }
  return JSON.parse(raw) as number
}

/**
 * 길이 3종의 **유일한 저장소**는 `settings` 전역값이다 (ADR-029 §2).
 *
 * 주 스냅샷 폴백(`유효 베이스라인(week)` 계약, 옛 `effectiveBaseline`)은 폐기됐다 —
 * 저장이 즉시 효력을 갖고, 적용 시점은 다음 세션 시작이다 (ADR-029 §1). 여기에 주를
 * 받는 인자를 되살리면 "저장이 안 된다"로 읽혔던 그 동작이 그대로 돌아온다.
 *
 * 소비자는 타이머 호스트(세션 시작·idle 진입마다 재조회, timer R1)와 정산 패널의 길이
 * 표시, 그리고 편집 폼이다.
 */
export function globalBaseline(repos: Repositories): Baseline {
  return {
    focusMin: readIntSetting(repos, 'focus_min'),
    shortBreakMin: readIntSetting(repos, 'short_break_min'),
    longBreakMin: readIntSetting(repos, 'long_break_min')
  }
}

/**
 * 길이 3종을 갱신한다 (ADR-029 §1). **`weeks` 에 접근하지 않는다.**
 *
 * 접근할 이유가 없어졌다 — 길이의 저장소는 전역값 하나뿐이고 스냅샷을 읽는 경로가
 * 없다. 여기서 `weeks` 를 건드리면 아무도 읽지 않는 컬럼에 쓰는 코드가 될 뿐이다.
 *
 * `weekly_capacity` 쓰기 경로는 제거했다 (ADR-030 — 가용량은 폐기된 통화다).
 * `settings` 의 그 행 자체는 스키마 정리 단계가 지운다.
 */
export function writeBaseline(uow: UnitOfWork, form: Baseline): Baseline {
  return uow.run((repos) => {
    repos.settings.set('focus_min', JSON.stringify(form.focusMin))
    repos.settings.set('short_break_min', JSON.stringify(form.shortBreakMin))
    repos.settings.set('long_break_min', JSON.stringify(form.longBreakMin))
    return globalBaseline(repos)
  })
}

/**
 * `weeks` 행을 처음 만들 때 박제할 값 (weekly-review R37).
 *
 * **축소된 함수다.** 길이 스냅샷은 아무도 읽지 않고(ADR-029 §2), `capacity`·`budget` 은
 * 폐기된 통화라 항상 `null` 이다 (ADR-030). 그럼에도 행 생성 경로가 남아 있는 이유는
 * `sessions.local_week` 가 `weeks.week` 를 FK 로 참조하기 때문이다 (ADR-019 §6) —
 * 그 FK 를 걷는 마이그레이션이 오기 전까지 행은 계속 생겨야 한다.
 */
export function weekSnapshot(repos: Repositories): WeekSnapshot {
  return { ...globalBaseline(repos), capacity: null, budget: null }
}
