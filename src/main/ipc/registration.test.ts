import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CHANNELS } from '@shared/ipc/channels'

/**
 * 채널을 추가할 때 고쳐야 할 곳은 네 군데다 — `channels.ts` · `contracts.ts` ·
 * preload · main 의 등록(ADR-007). 앞의 셋은 누락되면 컴파일러가 잡지만 **main 의 등록
 * 누락만 런타임 에러**다: 앱을 켜고 그 기능을 실제로 눌러야 발견된다.
 *
 * 이 테스트가 그 하나를 컴파일 타임 수준으로 끌어올린다 — `CHANNELS` 를 순회하며 전부
 * `ipcMain.handle` 에 걸렸는지 확인한다. (Task 3 구조 심사에서 이연된 관찰 지점 1)
 */
const handled = new Set<string>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string) => {
      handled.add(channel)
    }
  },
  app: { getVersion: () => '0.0.0-test' }
}))

/** `CHANNELS` 를 평탄화한다. 그룹이 늘어도 이 테스트는 그대로 따라간다. */
function allChannels(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => allChannels(v, out))
  return out
}

beforeEach(() => handled.clear())

describe('IPC 등록 완결성 (ADR-007)', () => {
  it('registers every channel declared in CHANNELS', async () => {
    const { registerSystemHandlers } = await import('./system')
    const { registerClockHandlers } = await import('./clock')
    const { registerTodayHandlers } = await import('./today')
    const { registerTimerHandlers } = await import('./timer')
    const { registerWeekHandlers } = await import('./week')
    const { registerReviewHandlers } = await import('./review')
    const { registerCalendarHandlers } = await import('./calendar')
    const { registerMilestoneHandlers } = await import('./milestones')
    const { registerSettingsHandlers } = await import('./settings')
    const { TimerEngine } = await import('../services/timer-engine')
    registerSystemHandlers(() => 1)
    registerClockHandlers()
    // handleIpc 만 걸면 되므로 fn 은 절대 호출되지 않는다 — uow 는 껍데기로 충분하다.
    const uow = {
      run: () => {
        throw new Error('not used in this registration test')
      }
    }
    registerTodayHandlers(uow)
    registerWeekHandlers(uow)
    registerReviewHandlers(uow)
    registerCalendarHandlers(uow)
    registerMilestoneHandlers(uow)
    // 엔진은 순수 클래스라 스텁 의존성으로 실물을 세운다 — 핸들러 fn 은 호출되지 않는다.
    const engine = new TimerEngine({
      now: () => 0,
      schedule: () => null,
      cancel: () => {},
      onTransition: () => {},
      onComplete: () => 'focus',
      notify: () => {},
      getBaseline: () => ({ focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }),
      saveModeLength: () => {},
      getFocusCountToday: () => 0,
      getFocusSinceLastLong: () => 0,
      getTaskTitle: () => null
    })
    registerTimerHandlers(engine, uow)
    // 창은 테마 변경 시에만 필요하고 fn 이 호출되지 않으므로 null 로 충분하다. 엔진은
    // index.ts 와 같은 순서로 넘긴다 — 길이 저장이 대기 중인 다이얼을 갱신한다.
    registerSettingsHandlers(uow, () => null, engine)

    const declared = allChannels(CHANNELS).sort()
    expect(declared.length).toBeGreaterThan(0)
    expect([...handled].sort()).toEqual(declared)
  })

  it('flattens nested channel groups', () => {
    expect(allChannels({ a: { b: 'x:b', c: 'x:c' }, d: 'y:d' }).sort()).toEqual([
      'x:b',
      'x:c',
      'y:d'
    ])
  })
})
