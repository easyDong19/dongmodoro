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
    registerSystemHandlers(() => 1)

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
