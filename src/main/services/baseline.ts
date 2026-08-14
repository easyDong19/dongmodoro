import type { Baseline, Repositories, UnitOfWork } from './ports'
import type { TimerMode } from '@shared/timer/snapshot'

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
 * 소비자는 타이머 호스트(세션 시작·idle 진입마다 재조회, timer R1) 하나다 — 정산
 * 패널은 길이에 대해 아무것도 모른다 (ADR-033 §3).
 */
export function globalBaseline(repos: Repositories): Baseline {
  return {
    focusMin: readIntSetting(repos, 'focus_min'),
    shortBreakMin: readIntSetting(repos, 'short_break_min'),
    longBreakMin: readIntSetting(repos, 'long_break_min')
  }
}

/**
 * 모드 → 설정 키. **이 매핑의 소유자는 이 파일 하나다.**
 * 엔진도 화면도 자기 매핑을 갖지 않는다 — 세 곳에 흩어지면 한 곳만 고친 순간
 * 모드마다 다른 값을 읽는 상태가 만들어진다.
 */
const MODE_KEY: Record<TimerMode, string> = {
  focus: 'focus_min',
  short: 'short_break_min',
  long: 'long_break_min'
}

/** 분 단위. 길이를 모드로 고르는 유일한 함수다. */
export function lengthOf(baseline: Baseline, mode: TimerMode): number {
  return mode === 'focus'
    ? baseline.focusMin
    : mode === 'short'
      ? baseline.shortBreakMin
      : baseline.longBreakMin
}

/**
 * 한 모드의 길이만 갱신한다 — 조절이 곧 기준이므로 쓰기 단위가 모드 하나다
 * (설계 R2). 나머지 두 값은 읽지도 쓰지도 않는다.
 */
export function writeModeLength(uow: UnitOfWork, mode: TimerMode, minutes: number): void {
  uow.run((repos) => repos.settings.set(MODE_KEY[mode], JSON.stringify(minutes)))
}
