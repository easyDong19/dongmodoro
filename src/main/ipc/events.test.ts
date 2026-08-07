import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { sendEvent } from './events'

const contract = z.strictObject({ dayKey: z.string() })
const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }

describe('sendEvent', () => {
  it('유효 payload 는 채널로 발송된다', () => {
    sendEvent(win as never, 'clock:boundary', contract, { dayKey: '2026-08-07' })
    expect(win.webContents.send).toHaveBeenCalledWith('clock:boundary', { dayKey: '2026-08-07' })
  })
  it('계약 위반 payload 는 던진다 — 조용히 나가지 않는다', () => {
    expect(() =>
      sendEvent(win as never, 'clock:boundary', contract, { dayKey: 7 } as never)
    ).toThrow(/clock:boundary/)
  })
  it('파괴된 창에는 보내지 않고 조용히 리턴한다', () => {
    const dead = { isDestroyed: () => true, webContents: { send: vi.fn() } }
    sendEvent(dead as never, 'clock:boundary', contract, { dayKey: '2026-08-07' })
    expect(dead.webContents.send).not.toHaveBeenCalled()
  })
})
