import { describe, it, expect } from 'vitest'
import type { TimerMode, TimerSnapshot } from '@shared/timer/snapshot'
import { remainingSec } from '@shared/timer/snapshot'
import { TimerEngine, type CompletionRecord, type TimerEngineDeps } from './timer-engine'

/**
 * 엔진은 시계·스케줄러·기록·알림을 전부 주입받으므로 페이크 타이머 없이 순수하게
 * 테스트한다. `advance` 는 시계만 옮기고, `firePending` 이 만기 도달한 예약을 발화한다 —
 * 발화 시점의 재검증(now() 기준)이 엔진의 몫임을 그대로 검증할 수 있다.
 */
type Scheduled = { fn: () => void; at: number; cancelled: boolean }

function makeHarness(overrides: Partial<TimerEngineDeps> = {}): {
  engine: TimerEngine
  advance: (ms: number) => void
  firePending: () => void
  activeTimers: () => Scheduled[]
  transitions: TimerSnapshot[]
  completions: CompletionRecord[]
  notified: TimerMode[]
  log: string[]
  saved: { mode: TimerMode; minutes: number }[]
  setNextFocusMode: (m: 'short' | 'long') => void
  clock: () => number
} {
  let clock = 1_000_000_000
  const scheduled: Scheduled[] = []
  const transitions: TimerSnapshot[] = []
  const completions: CompletionRecord[] = []
  const notified: TimerMode[] = []
  const log: string[] = []
  const saved: { mode: TimerMode; minutes: number }[] = []
  const lengths: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 }
  let nextFocusMode: 'short' | 'long' = 'short'

  const deps: TimerEngineDeps = {
    now: () => clock,
    schedule: (fn, ms) => {
      const t: Scheduled = { fn, at: clock + ms, cancelled: false }
      scheduled.push(t)
      return t
    },
    cancel: (t) => {
      ;(t as Scheduled).cancelled = true
    },
    onTransition: (snap) => {
      transitions.push(snap)
      log.push('transition')
    },
    onComplete: (record) => {
      completions.push(record)
      log.push('complete')
      return record.mode === 'focus' ? nextFocusMode : 'focus'
    },
    notify: (mode) => {
      notified.push(mode)
      log.push(`notify:${mode}`)
    },
    getBaseline: () => ({
      focusMin: lengths.focus,
      shortBreakMin: lengths.short,
      longBreakMin: lengths.long
    }),
    saveModeLength: (mode, minutes) => {
      saved.push({ mode, minutes })
      // 저장된 값이 곧 기준이므로, 이후의 getBaseline 도 그 값을 돌려줘야 한다.
      lengths[mode] = minutes
    },
    getFocusCountToday: () => completions.filter((c) => c.mode === 'focus').length,
    // 실제 리포지토리(focusCountSinceLastLong)와 같은 규칙: 마지막 long 완료 이후의 focus 수.
    getFocusSinceLastLong: () => {
      const lastLongIndex = completions.map((c) => c.mode).lastIndexOf('long')
      return completions.filter((c, i) => c.mode === 'focus' && i > lastLongIndex).length
    },
    getTaskTitle: (id) => (id === 't1' ? '보고서 쓰기' : null),
    ...overrides
  }

  return {
    engine: new TimerEngine(deps),
    advance: (ms) => {
      clock += ms
    },
    firePending: () => {
      // 발화 중 재예약될 수 있으므로 스냅샷을 뜬 뒤 순회한다.
      for (const t of [...scheduled]) {
        if (!t.cancelled && t.at <= clock) {
          t.cancelled = true
          t.fn()
        }
      }
    },
    activeTimers: () => scheduled.filter((t) => !t.cancelled),
    transitions,
    completions,
    notified,
    log,
    saved,
    setNextFocusMode: (m) => {
      nextFocusMode = m
    },
    clock: () => clock
  }
}

describe('TimerEngine — ux-spec §2 상태 기계', () => {
  it('start: idle→running, 만료 예약', () => {
    const h = makeHarness()
    const snap = h.engine.start()

    expect(snap.mode).toBe('focus')
    expect(snap.phase).toBe('running')
    expect(snap.startedAt).toBe(h.clock())
    expect(snap.durationSec).toBe(25 * 60)
    expect(h.activeTimers()).toHaveLength(1)
    expect(h.activeTimers()[0].at).toBe(h.clock() + 25 * 60 * 1000)
    expect(h.transitions).toHaveLength(1)
  })

  /**
   * 길이 편집은 저장 즉시 효력을 갖고, 적용 시점은 **다음 세션 시작**이다 (ADR-029 §1).
   * 그 규칙을 만드는 것이 이 재조회다 — 진행 중인 세션은 시작할 때 읽은 길이로 끝까지
   * 돌고, 바로 다음 세션이 새 길이로 시작한다.
   */
  it('start: 세션 시작 시점에 베이스라인을 다시 읽는다 (timer R1)', () => {
    let focusMin = 25
    const h = makeHarness({
      getBaseline: () => ({ focusMin, shortBreakMin: 5, longBreakMin: 15 })
    })

    expect(h.engine.start().durationSec).toBe(25 * 60)

    focusMin = 50 // 진행 중에 저장된 길이가 바뀌었다고 가정한다 (getBaseline mock 직접 갱신)
    expect(h.engine.getSnapshot().durationSec).toBe(25 * 60) // 진행 중인 세션은 그대로

    h.advance(25 * 60 * 1000)
    h.firePending() // 자연 만료 → 휴식 idle
    h.engine.setMode('focus')

    expect(h.engine.start().durationSec).toBe(50 * 60) // 다음 세션부터 새 길이
  })

  it('pause: 남은 초 박제, resume: 그 값으로 재시작', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(60_000)

    const paused = h.engine.pause()
    expect(paused.phase).toBe('paused')
    expect(paused.startedAt).toBeNull()
    expect(paused.pausedRemainingSec).toBe(24 * 60)
    expect(h.activeTimers()).toHaveLength(0) // 만료 예약 취소

    h.advance(10 * 60_000) // 멈춰 있는 동안 시간이 흘러도
    const resumed = h.engine.resume()
    expect(resumed.phase).toBe('running')
    expect(resumed.pausedRemainingSec).toBeNull()
    expect(remainingSec(resumed, h.clock())).toBe(24 * 60) // 남은 초 그대로
    expect(h.activeTimers()).toHaveLength(1)
    expect(h.activeTimers()[0].at).toBe(h.clock() + 24 * 60 * 1000)
  })

  it('reset: 기준 길이로 idle, 기록 없음', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(120_000)

    const snap = h.engine.reset()
    expect(snap.phase).toBe('idle')
    expect(snap.durationSec).toBe(25 * 60) // 기준 길이 복귀
    expect(snap.taskId).toBeNull()
    expect(h.completions).toHaveLength(0)
    expect(h.activeTimers()).toHaveLength(0)
  })

  it('setMode: 실행 중 전환은 확인 없이 세션 폐기 (§2 표)', () => {
    const h = makeHarness()
    h.engine.startWithTask('t1')
    h.advance(300_000)

    const snap = h.engine.setMode('short')
    expect(snap.mode).toBe('short')
    expect(snap.phase).toBe('idle')
    expect(snap.durationSec).toBe(5 * 60)
    expect(snap.taskId).toBeNull() // 대상도 함께 해제 (§1.1 수명)
    expect(h.completions).toHaveLength(0) // 기록 없음
    expect(h.activeTimers()).toHaveLength(0)
  })

  it('만료: onComplete(mode, 실제경과) 호출 후 자동 전환된 모드의 idle', () => {
    const h = makeHarness()
    h.setNextFocusMode('long')
    h.engine.start()
    const startedAt = h.clock()
    h.advance(25 * 60_000)
    h.firePending()

    expect(h.completions).toHaveLength(1)
    const c = h.completions[0]
    expect(c.mode).toBe('focus')
    expect(c.reason).toBe('expire')
    expect(c.durationSec).toBe(25 * 60) // 만료 = 세션 길이 그대로
    expect(c.startedAtMs).toBe(startedAt)
    expect(c.endedAtMs).toBe(startedAt + 25 * 60_000) // 이론 만료 시각

    const snap = h.engine.getSnapshot()
    expect(snap.mode).toBe('long') // 기록 후 onComplete 가 정한 모드
    expect(snap.phase).toBe('idle')
    expect(snap.durationSec).toBe(15 * 60)
    expect(snap.focusCountToday).toBe(1) // 전이 발송 시점에 갱신
    expect(snap.focusSinceLastLong).toBe(1) // 아직 long 완료 전 — focusCountToday 와 일치

    // ADR-026 §2 불변식: 기록(커밋+recorded) → transition → 알림
    expect(h.log.slice(-3)).toEqual(['complete', 'transition', 'notify:focus'])
  })

  it('만료: 잠자기로 늦게 발화해도 완료된다, 기록값은 이론 만료 기준', () => {
    const h = makeHarness()
    h.engine.start()
    const startedAt = h.clock()
    h.advance(25 * 60_000 + 3 * 3600_000) // 3시간 늦게 발화
    h.firePending()

    expect(h.completions).toHaveLength(1)
    expect(h.completions[0].endedAtMs).toBe(startedAt + 25 * 60_000)
    expect(h.completions[0].durationSec).toBe(25 * 60)
  })

  it('만료 예약이 이르게 발화하면 완료하지 않고 재예약한다 (wall-clock 재검증)', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(10 * 60_000)
    // 만기 전인데 발화된 상황을 흉내 — at 을 현재로 끌어와 강제 발화
    h.activeTimers()[0].at = h.clock()
    h.firePending()

    expect(h.completions).toHaveLength(0)
    expect(h.engine.getSnapshot().phase).toBe('running')
    expect(h.activeTimers()).toHaveLength(1) // 남은 시간으로 재예약
    expect(h.activeTimers()[0].at).toBe(h.clock() + 15 * 60_000)
  })

  it('reverify: resume 보정 — 자는 사이 만기가 지났으면 그 자리에서 완료한다', () => {
    const h = makeHarness()
    h.engine.start()

    h.advance(10 * 60_000)
    h.engine.reverify() // 아직 만기 전 — 아무 일 없음
    expect(h.completions).toHaveLength(0)

    h.advance(20 * 60_000) // 총 30분 경과 (25분 세션)
    h.engine.reverify()
    expect(h.completions).toHaveLength(1)
    expect(h.engine.getSnapshot().phase).toBe('idle')
  })

  it('completeEarly: focus 에서 남은 시간 무관 완료, durationSec = 실제 경과 (R4)', () => {
    const h = makeHarness()
    h.engine.startWithTask('t1')
    const startedAt = h.clock()
    h.advance(600_000) // 10분 경과

    h.engine.completeEarly()
    expect(h.completions).toHaveLength(1)
    const c = h.completions[0]
    expect(c.mode).toBe('focus')
    expect(c.reason).toBe('completeEarly')
    expect(c.durationSec).toBe(600) // 실제 경과
    expect(c.startedAtMs).toBe(startedAt)
    expect(c.endedAtMs).toBe(h.clock()) // ended_at = now
    expect(c.taskId).toBe('t1')

    const snap = h.engine.getSnapshot()
    expect(snap.mode).toBe('short')
    expect(snap.phase).toBe('idle')
  })

  it('completeEarly: paused 에서도 동작, 경과는 멈춘 시간 제외', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(600_000)
    h.engine.pause()
    h.advance(3600_000) // 1시간 멈춰 있어도

    h.engine.completeEarly()
    expect(h.completions[0].durationSec).toBe(600)
  })

  it('휴식 완료 → focus idle 로 복귀, 알림 문구 분기용 모드 전달', () => {
    const h = makeHarness()
    h.engine.setMode('short')
    h.engine.start()
    h.advance(5 * 60_000)
    h.firePending()

    expect(h.completions).toHaveLength(1)
    expect(h.completions[0].mode).toBe('short') // 휴식도 기록 (R9)
    expect(h.notified).toEqual(['short'])
    const snap = h.engine.getSnapshot()
    expect(snap.mode).toBe('focus')
    expect(snap.phase).toBe('idle')
  })

  it('세션이 끝나면 대상은 자유 집중으로 돌아간다 (ux-spec §1.1 수명)', () => {
    const h = makeHarness()
    h.engine.startWithTask('t1')
    h.advance(25 * 60_000)
    h.firePending()

    const snap = h.engine.getSnapshot()
    expect(snap.taskId).toBeNull()
    expect(snap.taskTitle).toBeNull()
    expect(h.completions[0].taskId).toBe('t1') // 기록에는 남는다
  })

  it('startWithTask: 대상 설정 + focus 시작이 한 동작 (R3-1)', () => {
    const h = makeHarness()
    h.engine.setMode('short') // 휴식 idle 에서 재생을 눌러도
    const snap = h.engine.startWithTask('t1')

    expect(snap.mode).toBe('focus')
    expect(snap.phase).toBe('running')
    expect(snap.durationSec).toBe(25 * 60) // focus 기준 길이
    expect(snap.taskId).toBe('t1')
    expect(snap.taskTitle).toBe('보고서 쓰기')
  })

  it('focusSinceLastLong 은 long 완료 후 리셋되지만 focusCountToday 는 계속 누적된다 (I-1)', () => {
    const h = makeHarness()
    h.setNextFocusMode('long')
    h.engine.start()
    h.advance(25 * 60_000)
    h.firePending() // focus #1 완료 → long 전환

    h.engine.start() // long 세션 시작
    h.engine.completeEarly() // long 완료 → focus idle 복귀
    h.setNextFocusMode('short')

    h.engine.start()
    h.advance(25 * 60_000)
    h.firePending() // long 이후 focus #1

    const snap = h.engine.getSnapshot()
    expect(snap.focusCountToday).toBe(2) // 오늘 전체 focus 는 2번째
    expect(snap.focusSinceLastLong).toBe(1) // long 이후로는 1번째 — 두 필드가 갈린다
  })

  it('idle 이 아닌 상태의 start/startWithTask, running 이 아닌 pause 는 거부한다', () => {
    const h = makeHarness()
    h.engine.start()
    expect(() => h.engine.start()).toThrow(/start/)
    expect(() => h.engine.startWithTask('t1')).toThrow(/start/)
    expect(() => h.engine.resume()).toThrow(/resume/)
    h.engine.pause()
    expect(() => h.engine.pause()).toThrow(/pause/)
    h.engine.reset()
    expect(() => h.engine.completeEarly()).toThrow(/complete/)
  })
})

describe('조절이 곧 기준이다 (설계 R2·R3)', () => {
  it('회귀: 집중 30분으로 조절 → 짧은 휴식 → 집중 복귀가 30분이다', () => {
    const h = makeHarness()

    h.engine.adjust(5) // 25 → 30
    h.engine.setMode('short')
    const back = h.engine.setMode('focus')

    expect(back.durationSec).toBe(30 * 60)
  })

  it('대기 중 조절은 그 모드의 길이를 저장한다', () => {
    const h = makeHarness()

    h.engine.adjust(5)
    expect(h.saved).toEqual([{ mode: 'focus', minutes: 30 }])

    h.engine.setMode('short')
    h.engine.adjust(1) // 5 → 6
    expect(h.saved).toEqual([
      { mode: 'focus', minutes: 30 },
      { mode: 'short', minutes: 6 }
    ])
  })

  it('실행 중 조절은 저장하지도, 남은 시간을 바꾸지도 않는다', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(60_000)

    const before = h.engine.getSnapshot()
    const after = h.engine.adjust(10)

    expect(h.saved).toEqual([])
    expect(after.durationSec).toBe(before.durationSec)
    expect(h.transitions).toHaveLength(1) // start 의 전이 하나뿐 — 조절은 전이를 만들지 않는다
  })

  it('일시정지 중 조절도 아무 일도 하지 않는다', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(60_000)
    h.engine.pause()

    const before = h.engine.getSnapshot()
    h.engine.adjust(-5)

    expect(h.saved).toEqual([])
    expect(h.engine.getSnapshot().pausedRemainingSec).toBe(before.pausedRemainingSec)
  })

  it('하한 1분 — 더 줄여도 1분이고 저장 값도 1이다', () => {
    const h = makeHarness()

    h.engine.adjust(-100)

    expect(h.engine.getSnapshot().durationSec).toBe(60)
    expect(h.saved).toEqual([{ mode: 'focus', minutes: 1 }])
  })

  it('저장이 실패하면 상태를 바꾸지 않고 전이도 내보내지 않는다', () => {
    const h = makeHarness({
      saveModeLength: () => {
        throw new Error('disk full')
      }
    })

    expect(() => h.engine.adjust(5)).toThrow('disk full')
    expect(h.engine.getSnapshot().durationSec).toBe(25 * 60)
    expect(h.transitions).toHaveLength(0)
  })
})
