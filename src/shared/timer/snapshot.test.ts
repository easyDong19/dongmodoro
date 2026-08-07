import { describe, it, expect } from 'vitest'
import { remainingSec, type TimerSnapshot } from './snapshot'

const base: TimerSnapshot = {
  mode: 'focus',
  phase: 'running',
  startedAt: 1_000_000,
  durationSec: 1500,
  pausedRemainingSec: null,
  taskId: null,
  taskTitle: null,
  focusCountToday: 0
}

describe('remainingSec', () => {
  it('running: duration - 경과의 내림, 0 미만은 0', () => {
    expect(remainingSec(base, 1_000_000 + 10_000)).toBe(1490)
    expect(remainingSec(base, 1_000_000 + 1_500_000)).toBe(0)
    expect(remainingSec(base, 1_000_000 + 9_999_000)).toBe(0)
  })
  it('paused: 박제된 남은 초 그대로', () => {
    const s = { ...base, phase: 'paused' as const, pausedRemainingSec: 777 }
    expect(remainingSec(s, 9_999_999_999)).toBe(777)
  })
  it('idle: durationSec 전체', () => {
    const s = { ...base, phase: 'idle' as const, startedAt: null }
    expect(remainingSec(s, 5)).toBe(1500)
  })
})
