export type TimerMode = 'focus' | 'short' | 'long'
export type TimerPhase = 'idle' | 'running' | 'paused'

/**
 * 스냅샷형(`{remainingSec}`)이 아니라 타임스탬프형이다 (ADR-005).
 * running 의 남은 시간은 매번 wall-clock 산술로 파생한다 — 이벤트가 밀려도
 * 다시 그리는 순간 자동 복구되고 누적 오차가 구조적으로 불가능하다.
 */
export type TimerSnapshot = {
  mode: TimerMode
  phase: TimerPhase
  /** epoch ms. running 일 때만 non-null. */
  startedAt: number | null
  /** 현재 세션 전체 길이(초). idle 이면 기준 길이. */
  durationSec: number
  /** paused 일 때만 non-null — 일시정지 순간 박제된 남은 초. */
  pausedRemainingSec: number | null
  taskId: string | null
  /** 집중 대상 제목 (renderer 표시용 — ux-spec §1). */
  taskTitle: string | null
  /** 오늘의 focus 세션 수 — 세션 라벨 `N번째 집중`(ux-spec §4)용. main 이 계산해 싣는다. */
  focusCountToday: number
  /**
   * 마지막 long 이후의 focus 완료 수 (자정에 리셋되지 않는다 — `sessions.focusCountSinceLastLong()`,
   * drizzle.ts 의 포트 주석). long 4회차 판정은 이 필드로만 한다 — `focusCountToday` 는
   * 자정에 끊겨서 4회차 판정에 쓰면 틀린다 (ux-spec §3, 리뷰 finding I-1).
   */
  focusSinceLastLong: number
}

export function remainingSec(s: TimerSnapshot, nowMs: number): number {
  if (s.phase === 'paused') return s.pausedRemainingSec ?? 0
  if (s.phase === 'idle' || s.startedAt === null) return s.durationSec
  return Math.max(0, s.durationSec - Math.floor((nowMs - s.startedAt) / 1000))
}
