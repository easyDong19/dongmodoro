import { describe, it, expect } from 'vitest'
import type { TimerMode } from '@shared/timer/snapshot'
import { createSessionSignals, type SessionSignalPorts } from './session-signals'

/**
 * electron 이 등장하지 않는다 — session-signals 가 알림·Dock·포커스를 전부 주입으로
 * 받으므로 `vi.mock('electron')` 이 필요 없다 (theme.test.ts 가 어쩔 수 없이 쓰는 대역과
 * 대비되는 지점이고, 그 구조를 만든 이유가 이 테스트다).
 */
type Recorded = {
  titles: string[]
  bounced: ('critical' | 'informational')[]
  cancelled: number[]
}

function fakePorts(options: { focused?: boolean; bounceIds?: (number | null)[] } = {}): {
  ports: SessionSignalPorts
  rec: Recorded
  setFocused: (value: boolean) => void
} {
  const rec: Recorded = { titles: [], bounced: [], cancelled: [] }
  // 호출 순서대로 소진한다. 다 쓰면 마지막 값을 계속 돌려준다.
  const ids = options.bounceIds ?? [1]
  let focused = options.focused ?? false
  let nth = 0

  return {
    rec,
    setFocused: (value) => {
      focused = value
    },
    ports: {
      notify: (title) => rec.titles.push(title),
      isWindowFocused: () => focused,
      bounce: (type) => {
        rec.bounced.push(type)
        const id = ids[Math.min(nth, ids.length - 1)]
        nth += 1
        return id
      },
      cancelBounce: (id) => rec.cancelled.push(id)
    }
  }
}

const MODES: TimerMode[] = ['focus', 'short', 'long']

describe('알림 (ux-spec §6)', () => {
  it('집중 완료와 휴식 완료의 문구가 다르다', () => {
    const { ports, rec } = fakePorts()
    const signals = createSessionSignals(ports)

    signals.signalCompletion('focus')
    signals.signalCompletion('short')
    signals.signalCompletion('long')

    expect(rec.titles).toEqual([
      '집중 완료 — 쉬어가요',
      '휴식 끝 — 준비되면 시작하세요',
      '휴식 끝 — 준비되면 시작하세요'
    ])
  })

  /**
   * 창을 보고 있어도 알림은 남긴다. 이 규칙이 없으면 다른 카드를 읽는 중에 끝난 세션이
   * 아무 기록도 남기지 않는다 — 2.2.0 에서 바운스를 얹으면서 기존 동작을 잃지 않았다는
   * 증거가 이 테스트다.
   */
  it('창이 포커스여도 알림은 보낸다', () => {
    const { ports, rec } = fakePorts({ focused: true })
    createSessionSignals(ports).signalCompletion('focus')

    expect(rec.titles).toEqual(['집중 완료 — 쉬어가요'])
  })
})

describe('주의 신호 — 포커스가 아닐 때만', () => {
  it('창이 포커스가 아니면 critical 로 튄다', () => {
    const { ports, rec } = fakePorts({ focused: false })
    createSessionSignals(ports).signalCompletion('focus')

    expect(rec.bounced).toEqual(['critical'])
  })

  it('창이 포커스면 튀지 않는다', () => {
    const { ports, rec } = fakePorts({ focused: true })
    createSessionSignals(ports).signalCompletion('focus')

    expect(rec.bounced).toEqual([])
  })

  it('집중·짧은 휴식·긴 휴식을 같은 강도로 다룬다', () => {
    for (const mode of MODES) {
      const { ports, rec } = fakePorts({ focused: false })
      createSessionSignals(ports).signalCompletion(mode)
      expect(rec.bounced).toEqual(['critical'])
    }
  })
})

describe('취소 — 사용자가 신호를 본 시점', () => {
  it('창이 포커스되면 튀던 신호를 그 id 로 끊는다', () => {
    const { ports, rec } = fakePorts({ focused: false, bounceIds: [7] })
    const signals = createSessionSignals(ports)

    signals.signalCompletion('focus')
    signals.onWindowFocus()

    expect(rec.cancelled).toEqual([7])
  })

  /**
   * `critical` 은 포커스할 때까지 계속 튀므로 취소가 이 기능의 절반이다. 두 번째 포커스에서
   * 같은 id 를 또 넘기면 이미 끝난 신호를 취소하는 셈이라, 상태를 비웠는지 여기서 잡는다.
   */
  it('포커스가 여러 번 와도 취소는 한 번이다', () => {
    const { ports, rec } = fakePorts({ focused: false, bounceIds: [7] })
    const signals = createSessionSignals(ports)

    signals.signalCompletion('focus')
    signals.onWindowFocus()
    signals.onWindowFocus()

    expect(rec.cancelled).toEqual([7])
  })

  it('튀던 신호가 없으면 취소를 시도하지 않는다', () => {
    const { ports, rec } = fakePorts({ focused: true })
    const signals = createSessionSignals(ports)

    signals.signalCompletion('focus') // 포커스 상태였으니 튀지 않았다
    signals.onWindowFocus()

    expect(rec.cancelled).toEqual([])
  })

  /**
   * 지원하지 않는 플랫폼에서 호스트가 `null` 을 돌려준다. 그 값을 id 로 착각해 넘기면
   * electron 쪽에서 타입 오류가 나므로, 취소 경로가 아예 열리지 않아야 한다.
   */
  it('플랫폼이 지원하지 않으면(null) 취소 경로가 열리지 않는다', () => {
    const { ports, rec } = fakePorts({ focused: false, bounceIds: [null] })
    const signals = createSessionSignals(ports)

    signals.signalCompletion('focus')
    signals.onWindowFocus()

    expect(rec.bounced).toEqual(['critical'])
    expect(rec.cancelled).toEqual([])
  })

  /**
   * 사용자가 앱을 한 번도 포커스하지 않은 채 다음 세션이 끝나는 경우다 — 자동 시작은
   * 없으므로 흔하지 않지만, 앞 신호를 남겨두면 취소되지 않는 바운스가 하나 새어 나간다.
   */
  it('포커스 없이 다음 완료가 오면 앞 신호를 끊고 새로 튄다', () => {
    const { ports, rec } = fakePorts({ focused: false, bounceIds: [7, 8] })
    const signals = createSessionSignals(ports)

    signals.signalCompletion('focus')
    signals.signalCompletion('short')

    expect(rec.bounced).toEqual(['critical', 'critical'])
    expect(rec.cancelled).toEqual([7])

    signals.onWindowFocus()
    expect(rec.cancelled).toEqual([7, 8])
  })
})
