import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// electron 은 런타임이 주입하는 모듈이라 테스트에서는 존재하지 않는다.
// ipcMain.handle 이 받아간 콜백을 붙잡아 직접 호출하는 방식으로 검사한다.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn)
    }
  }
}))

const { handleIpc } = await import('./handle')

const contract = {
  req: z.tuple([z.string()]),
  res: z.strictObject({ value: z.string() })
}

/** 신뢰할 수 있는 발신자 — 우리 앱 번들에서 온 것처럼 보이게 한다. */
const trusted = { senderFrame: { url: 'file:///app/out/renderer/index.html' } }

beforeEach(() => {
  handlers.clear()
  delete process.env.ELECTRON_RENDERER_URL
})

describe('handleIpc (ADR-007)', () => {
  it('passes parsed input through and returns parsed output', async () => {
    handleIpc('t:ok', contract, (name) => ({ value: `hi ${name}` }))
    await expect(handlers.get('t:ok')!(trusted, 'kim')).resolves.toEqual({ value: 'hi kim' })
  })

  // ipcMain.handle 은 누가 보냈든 처리한다. 앱 안에서 외부 페이지가 열리면
  // 그 페이지가 우리 IPC 를 호출할 수 있으므로 발신자를 확인해야 한다.
  it('rejects a sender that is not our app bundle or dev server', async () => {
    handleIpc('t:sender', contract, (name) => ({ value: name }))
    const evil = { senderFrame: { url: 'https://evil.example.com/' } }
    await expect(handlers.get('t:sender')!(evil, 'kim')).rejects.toThrow(/Untrusted IPC sender/)
  })

  it('accepts the dev server origin when it is configured', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    handleIpc('t:dev', contract, (name) => ({ value: name }))
    const dev = { senderFrame: { url: 'http://localhost:5173/index.html' } }
    await expect(handlers.get('t:dev')!(dev, 'kim')).resolves.toEqual({ value: 'kim' })
  })

  it('rejects arguments that violate the request contract', async () => {
    handleIpc('t:req', contract, (name) => ({ value: name }))
    await expect(handlers.get('t:req')!(trusted, 42)).rejects.toThrow(/IPC request rejected/)
    await expect(handlers.get('t:req')!(trusted, 'kim', 'extra')).rejects.toThrow(
      /IPC request rejected/
    )
  })

  // 내가 쓴 핸들러의 반환값도 검사한다 — main 쪽 버그로 계약과 다른 값이 나가면
  // renderer 가 조용히 깨지는 대신 여기서 터져야 한다.
  it('rejects a handler return value that violates the response contract', async () => {
    // @ts-expect-error 계약을 어기는 반환값을 일부러 넣는다
    handleIpc('t:res', contract, () => ({ wrong: true }))
    // 요청은 유효해야 응답 검사까지 도달한다
    await expect(handlers.get('t:res')!(trusted, 'kim')).rejects.toThrow(/IPC response rejected/)
  })

  // 검증 실패 메시지에 입력값이 실려 나가면 로그·모니터링에 그대로 남는다
  // (zod 스킬 error-input-security). 실패 사실만 알리고 값은 싣지 않는다.
  it('does not leak the offending input value in the error message', async () => {
    handleIpc('t:leak', contract, (name) => ({ value: name }))
    const rejection = await handlers.get('t:leak')!(trusted, { token: 'hunter2-secret' })
      .then(() => null)
      .catch((e: Error) => e)
    expect(rejection).toBeInstanceOf(Error)
    expect(rejection!.message).toMatch(/IPC request rejected/)
    expect(rejection!.message).not.toContain('hunter2-secret')
  })
})
