import type { TimerMode, TimerPhase, TimerSnapshot } from '@shared/timer/snapshot'
import { remainingSec } from '@shared/timer/snapshot'
import type { Baseline } from './ports'
import { lengthOf } from './baseline'

/**
 * 타이머 상태 기계 (ux-spec §2, ADR-005). main 이 소유하는 유일한 시간 권위다 —
 * renderer 의 표시 계산이 0에 도달해도 아무 사실도 만들지 않는다 (R12).
 *
 * 이 파일은 electron·DB 를 import 하지 않는다. 시계·스케줄러·기록·이벤트·알림이 전부
 * 주입이라 페이크 타이머 없이 순수하게 테스트된다. Electron 접착은 timer-host.ts 한 곳.
 *
 * wall-clock 이 유일한 기준이다 (ADR-005 §1): setTimeout 은 "언제 다시 확인할까"의
 * 힌트일 뿐이고, 만료 판정은 발화 시점에 `now()` 로 재검증한다 — 잠자기로 늦게
 * 발화해도 실제 경과 기준으로 완료되고, 이르게 발화하면 남은 시간으로 재예약한다.
 */

export type CompletionReason = 'expire' | 'completeEarly'

/** 완료된 세션의 기록 재료. 값 정책(이론 만료 vs 실제 경과 — 브리프 Step 3)은 엔진이 정한다. */
export type CompletionRecord = {
  mode: TimerMode
  reason: CompletionReason
  /** 진짜 세션 시작 시각 — resume 보정 앵커가 아니다. 귀속은 이 값 기준 (R7). */
  startedAtMs: number
  /** expire: 이론 만료 시각(시작+길이). completeEarly: now. */
  endedAtMs: number
  /** expire: 세션 길이 그대로(온전한 1뽀모). completeEarly: 실제 경과 초 (R4). */
  durationSec: number
  taskId: string | null
}

export type TimerEngineDeps = {
  now: () => number
  schedule: (fn: () => void, ms: number) => unknown
  cancel: (timer: unknown) => void
  /** 모든 전이 직후 호출 — 호스트가 `timer:transition` 을 발송한다. */
  onTransition: (snapshot: TimerSnapshot) => void
  /**
   * 완료 사실의 처리를 위임한다: 커밋(uow) → `session:recorded` 발송까지 마친 뒤
   * **다음 모드를 돌려준다** (R10 — 자동 전환 판정은 기록 후의 DB 를 읽어야 하므로
   * 반환값으로 받는다). better-sqlite3 가 동기라 반환 시점 = 커밋 후가 보장된다.
   */
  onComplete: (record: CompletionRecord) => TimerMode
  /** 완료 알림 — 전이 발송 뒤에 호출된다 (ADR-026 §2 시퀀스의 마지막 자리). */
  notify: (completedMode: TimerMode) => void
  /** 유효 베이스라인 — 세션 시작·idle 진입 시점마다 새로 읽는다 (timer R1). */
  getBaseline: () => Baseline
  /**
   * 한 모드의 기준 길이를 쓴다 — 조절이 곧 기준이기 때문이다 (설계 R2).
   * 엔진은 이것이 DB 인지 모른다. 던지면 조절은 실패로 끝나고 상태는 그대로다.
   */
  saveModeLength: (mode: TimerMode, minutes: number) => void
  /** 오늘 focus 세션 수 — 스냅샷마다 새로 읽는다 (세션 라벨 `N번째 집중`). */
  getFocusCountToday: () => number
  /** 마지막 long 이후 focus 완료 수 — 스냅샷마다 새로 읽는다 (long 4회차 판정, I-1). */
  getFocusSinceLastLong: () => number
  getTaskTitle: (taskId: string) => string | null
}

const MIN_REMAINING_SEC = 60 // 조절 하한 1분 (설계 R4)

export class TimerEngine {
  private mode: TimerMode = 'focus'
  private phase: TimerPhase = 'idle'
  /** 표시 산술 앵커 (스냅샷의 startedAt). resume 때 `now - 경과` 로 보정된다. */
  private startedAt: number | null = null
  /** 기록용 진짜 시작 시각 — 자정을 걸친 세션의 귀속이 이 값에서 나온다 (R7·A4). */
  private sessionStartedAtMs: number | null = null
  private durationSec: number
  private pausedRemainingSec: number | null = null
  private taskId: string | null = null
  private taskTitle: string | null = null
  private expiryTimer: unknown = null

  constructor(private readonly deps: TimerEngineDeps) {
    this.durationSec = this.baselineSec('focus')
  }

  getSnapshot(): TimerSnapshot {
    return {
      mode: this.mode,
      phase: this.phase,
      startedAt: this.phase === 'running' ? this.startedAt : null,
      durationSec: this.durationSec,
      pausedRemainingSec: this.phase === 'paused' ? this.pausedRemainingSec : null,
      taskId: this.taskId,
      taskTitle: this.taskTitle,
      focusCountToday: this.deps.getFocusCountToday(),
      focusSinceLastLong: this.deps.getFocusSinceLastLong()
    }
  }

  /** idle → running. 항상 자유 집중 — 대상은 startWithTask 로만 잡힌다 (ux-spec §1.1). */
  start(): TimerSnapshot {
    if (this.phase !== 'idle') {
      throw new Error(`timer.start: cannot start from '${this.phase}'`)
    }
    // 세션 시작 시점의 유효 베이스라인 (R1). 조절이 곧 기준이므로 값이 이미 반영돼 있다 (설계 R2).
    this.durationSec = this.baselineSec(this.mode)
    const at = this.deps.now()
    this.startedAt = at
    this.sessionStartedAtMs = at
    this.phase = 'running'
    this.scheduleExpiry(this.durationSec * 1000)
    return this.emit()
  }

  /** 대상 설정 + focus 시작이 한 동작 (today-tasks R3-1). */
  startWithTask(taskId: string): TimerSnapshot {
    if (this.phase !== 'idle') {
      throw new Error(`timer.startWithTask: cannot start from '${this.phase}'`)
    }
    if (this.mode !== 'focus') {
      this.mode = 'focus'
    }
    this.taskId = taskId
    this.taskTitle = this.deps.getTaskTitle(taskId)
    return this.start()
  }

  pause(): TimerSnapshot {
    if (this.phase !== 'running') {
      throw new Error(`timer.pause: cannot pause from '${this.phase}'`)
    }
    this.pausedRemainingSec = this.remaining()
    this.phase = 'paused'
    this.startedAt = null
    this.clearExpiry()
    return this.emit()
  }

  resume(): TimerSnapshot {
    if (this.phase !== 'paused') {
      throw new Error(`timer.resume: cannot resume from '${this.phase}'`)
    }
    const rem = this.pausedRemainingSec ?? 0
    this.phase = 'running'
    // 앵커 보정: durationSec 은 세션 전체 길이로 유지하고, 경과분만큼 시작점을 당긴다.
    this.startedAt = this.deps.now() - (this.durationSec - rem) * 1000
    this.pausedRemainingSec = null
    this.scheduleExpiry(rem * 1000)
    return this.emit()
  }

  /** 현재 모드 기준 길이로 idle 복귀. 기록 없음, 대상 해제 (ux-spec §2). */
  reset(): TimerSnapshot {
    this.clearExpiry()
    this.enterIdle()
    return this.emit()
  }

  /** 모드 탭 클릭 — 실행 중이어도 확인 없이 현재 세션 폐기, 기록 없음 (ux-spec §2 표). */
  setMode(mode: TimerMode): TimerSnapshot {
    this.clearExpiry()
    this.mode = mode
    this.enterIdle()
    return this.emit()
  }

  /**
   * ±분 조절 — **대기 중에만** 동작하고, 새 길이는 그 즉시 그 모드의 기준이 된다
   * (설계 R2·R3). 하한 1분.
   *
   * 저장이 상태보다 **먼저**다. 저장이 던지면 durationSec 은 옛 값 그대로이고 전이도
   * 나가지 않는다 — 다이얼과 저장값이 어긋난 상태를 만들지 않기 위해서다.
   *
   * 실행·일시정지에서는 아무 일도 하지 않고 현재 스냅샷을 돌려준다. 예외를 던지지
   * 않는 이유: 칩이 비활성이라 정상 경로로는 도달하지 않고, IPC 계약의 응답이
   * 스냅샷이라 무시가 곧 정직한 응답이다.
   */
  adjust(deltaMin: number): TimerSnapshot {
    if (this.phase !== 'idle') return this.getSnapshot()

    const deltaSec = Math.round(deltaMin * 60)
    const nextSec = Math.max(MIN_REMAINING_SEC, this.durationSec + deltaSec)

    this.deps.saveModeLength(this.mode, nextSec / 60)
    this.durationSec = nextSec
    return this.emit()
  }

  /** 남은 시간 무관 완료 (R4): 온전한 1뽀모, durationSec 은 실제 경과. */
  completeEarly(): TimerSnapshot {
    if (this.phase !== 'running' && this.phase !== 'paused') {
      throw new Error(`timer.completeEarly: cannot complete from '${this.phase}'`)
    }
    return this.complete('completeEarly')
  }

  /**
   * powerMonitor resume 보정 — 자는 동안 setTimeout 이 얼어붙어도 wall-clock 기준으로
   * 만기가 지났으면 그 자리에서 완료한다. 예약 발화와 같은 재검증 경로다.
   */
  reverify(): void {
    if (this.phase !== 'running') return
    if (this.remaining() > 0) return
    this.complete('expire')
  }

  // ── 내부 ────────────────────────────────────────────────────────────────

  /** 만료 예약의 발화. 발화 자체는 사실이 아니다 — now() 재검증이 사실을 정한다. */
  private fire(): void {
    if (this.phase !== 'running') return
    const rem = this.remaining()
    if (rem > 0) {
      // 이르게 발화 (시계 조정 등) — 완료하지 않고 남은 시간으로 재예약
      this.scheduleExpiry(rem * 1000)
      return
    }
    this.complete('expire')
  }

  /**
   * 완료 시퀀스 (ADR-026 §2 불변식): onComplete(커밋 + session:recorded) →
   * 자동 전환된 모드의 idle 로 전이(timer:transition) → notify. 자동 시작은 없다 (R10).
   */
  private complete(reason: CompletionReason): TimerSnapshot {
    const completedMode = this.mode
    const startedAtMs = this.sessionStartedAtMs ?? this.deps.now()
    const record: CompletionRecord =
      reason === 'expire'
        ? {
            mode: completedMode,
            reason,
            startedAtMs,
            endedAtMs: startedAtMs + this.durationSec * 1000,
            durationSec: this.durationSec,
            taskId: this.taskId
          }
        : {
            mode: completedMode,
            reason,
            startedAtMs,
            endedAtMs: this.deps.now(),
            durationSec: Math.max(0, this.durationSec - this.remaining()),
            taskId: this.taskId
          }
    this.clearExpiry()
    this.mode = this.deps.onComplete(record) // 기록 후에 다음 모드가 정해진다 (R10)
    this.enterIdle()
    const snap = this.emit()
    this.deps.notify(completedMode)
    return snap
  }

  /**
   * 전역 길이가 편집됐다 — **대기 중인 다이얼을 새 길이로 맞춘다** (ADR-029).
   *
   * 이것이 없으면 다이얼이 다음 세션 길이를 틀리게 말한다. 25분에서 40분으로 바꾼
   * 사용자가 `25:00` 을 보다가 시작을 누르는 순간 `40:00` 으로 튀는 것을 봤다.
   *
   * **1.x 에서는 이 구멍이 거의 보이지 않았다.** 그때 유효 베이스라인은 그 주 `weeks`
   * 스냅샷이었고, 행이 있는 주에서는 편집이 다음 주까지 효력이 없어 옛 길이를 그리는
   * 것이 오히려 사실과 맞았다. ADR-029 가 효력을 다음 세션으로 당기면서 "다이얼은
   * 그대로 둔다"는 전제가 죽었다.
   *
   * idle 이 아니면 아무것도 하지 않는다 — 진행 중·일시정지 세션의 길이는 그 세션이
   * 시작될 때 확정된 값이며, 편집이 그것을 건드리지 않는 것이 ADR-029 의 "적용은 다음
   * 세션부터"다.
   *
   * idle 에서 방금 조절했다면 어차피 여기서 다시 쓸 것이 없다 — 조절이 곧 기준을
   * 저장하므로(설계 R2) `getBaseline()` 이 그 값을 그대로 돌려주고, 아래의 "값이
   * 그대로면 전이 없음" 이 자연히 no-op 을 만든다. 별도의 우선순위 규칙이 아니다.
   *
   * 값이 그대로면 전이를 쏘지 않는다. 길이 외의 필드만 바꾼 저장이 renderer 를
   * 흔들지 않게 하려는 것이다.
   */
  refreshBaseline(): TimerSnapshot | null {
    if (this.phase !== 'idle') return null

    const next = this.baselineSec(this.mode)
    if (next === this.durationSec) return null

    this.durationSec = next
    return this.emit()
  }

  /** 세션의 끝 — 대상은 자유 집중으로 돌아가고(§1.1 수명) 길이는 베이스라인으로. */
  private enterIdle(): void {
    this.phase = 'idle'
    this.startedAt = null
    this.sessionStartedAtMs = null
    this.pausedRemainingSec = null
    this.taskId = null
    this.taskTitle = null
    this.durationSec = this.baselineSec(this.mode)
  }

  private remaining(): number {
    return remainingSec(this.getSnapshot(), this.deps.now())
  }

  private baselineSec(mode: TimerMode): number {
    return lengthOf(this.deps.getBaseline(), mode) * 60
  }

  private scheduleExpiry(ms: number): void {
    this.expiryTimer = this.deps.schedule(() => this.fire(), ms)
  }

  private clearExpiry(): void {
    if (this.expiryTimer !== null) {
      this.deps.cancel(this.expiryTimer)
      this.expiryTimer = null
    }
  }

  private emit(): TimerSnapshot {
    const snap = this.getSnapshot()
    this.deps.onTransition(snap)
    return snap
  }
}
