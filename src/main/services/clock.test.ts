import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { msUntilNextMidnight, boundaryPayload, crossedBoundary } from './clock'

/**
 * electron 의 real powerMonitor 는 테스트 프로세스에 없다 — 최소한의 이벤트 에미터로
 * 대신하고 'resume' 이벤트만 흉내낸다 (브리프: "unit tests, inject fakes").
 * `vi.mock` 팩토리는 파일 맨 위로 호이스트되므로, 그 안에서 쓰는 값도 `vi.hoisted` 로
 * 같이 끌어올려야 한다 — 일반 import(EventEmitter)는 호이스트되지 않아 여기선 못 쓴다.
 */
const { fakePowerMonitor } = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>()
  return {
    fakePowerMonitor: {
      on: (event: string, cb: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(cb)
      },
      removeListener: (event: string, cb: () => void) => {
        listeners.get(event)?.delete(cb)
      },
      emit: (event: string) => {
        listeners.get(event)?.forEach((cb) => cb())
      }
    }
  }
})
vi.mock('electron', () => ({ powerMonitor: fakePowerMonitor }))

/**
 * 로컬 시각 문자열 → epoch ms. 이 파일은 lint 의 시간 초크포인트 예외 대상(테스트)이라
 * `new Date()` 를 직접 쓸 수 있다 (eslint.config.js TESTS 글롭).
 */
function localMs(iso: string): number {
  const [datePart, timePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm, ss] = timePart.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, ss ?? 0).getTime()
}

describe('clock — 자정 경계 (ADR-026 §1)', () => {
  it('다음 자정까지의 ms 를 계산한다', () => {
    // 2026-08-07 23:59:00 로컬 → 60초 뒤
    expect(msUntilNextMidnight(localMs('2026-08-07T23:59:00'))).toBe(60_000)
  })
  it('경계 발화 시 전이 후 키 3종을 payload 로 만든다', () => {
    const p = boundaryPayload(localMs('2026-08-10T00:00:00'))
    expect(p).toEqual({
      dayKey: '2026-08-10',
      weekKey: '2026-08-10',
      monthKey: '2026-08',
      weekdayIndex: 0
    })
  })
  it('resume 보정: 잠든 사이 자정이 지났으면 즉시 발화 대상이다', () => {
    expect(crossedBoundary('2026-08-07', localMs('2026-08-08T07:00:00'))).toBe(true)
    expect(crossedBoundary('2026-08-08', localMs('2026-08-08T07:00:00'))).toBe(false)
  })
})

describe('startClock — 알람 + resume 보정 (ADR-026 §1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 7, 7, 23, 59, 0) })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('자정에 정확히 한 번 발화하고 다음 자정으로 재예약한다', async () => {
    const { startClock } = await import('./clock')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    const stop = startClock(() => win as never)

    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(60_000) // → 2026-08-08 00:00:00

    expect(win.webContents.send).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith('clock:boundary', {
      dayKey: '2026-08-08',
      weekKey: '2026-08-03',
      monthKey: '2026-08',
      weekdayIndex: 5
    })
    // 재예약되어 다음 자정까지 다시 타이머가 걸려 있다
    expect(vi.getTimerCount()).toBe(1)

    stop()
  })

  it('powerMonitor resume 시 자정을 건넜으면 즉시 보정 발화한다', async () => {
    const { startClock } = await import('./clock')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    const stop = startClock(() => win as never)

    // 잠자기: 시계를 다음날 아침으로 점프 (자정 타이머는 실제 기기에서 얼어붙는 상황을 흉내)
    vi.setSystemTime(new Date(2026, 7, 8, 7, 0, 0))
    fakePowerMonitor.emit('resume')

    expect(win.webContents.send).toHaveBeenCalledWith('clock:boundary', {
      dayKey: '2026-08-08',
      weekKey: '2026-08-03',
      monthKey: '2026-08',
      weekdayIndex: 5
    })

    stop()
  })

  it('resume 시 자정을 건너지 않았으면 발화하지 않는다', async () => {
    const { startClock } = await import('./clock')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    const stop = startClock(() => win as never)

    vi.setSystemTime(new Date(2026, 7, 7, 23, 59, 30))
    fakePowerMonitor.emit('resume')

    expect(win.webContents.send).not.toHaveBeenCalled()
    stop()
  })
})
