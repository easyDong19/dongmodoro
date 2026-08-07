import type { BrowserWindow } from 'electron'
import { z } from 'zod'

/**
 * main 발 이벤트의 유일한 발송 경로 (ADR-026 §3). raw `webContents.send` 금지.
 * 발송 직전 parse — main 쪽 버그로 계약과 다른 payload 가 나가면 renderer 가
 * 조용히 undefined 를 렌더하는 대신 여기서 터진다. handleIpc 의 응답 parse 와 대칭.
 */
export function sendEvent<S extends z.ZodTypeAny>(
  win: BrowserWindow,
  channel: string,
  contract: S,
  payload: z.infer<S>
): void {
  if (win.isDestroyed()) return
  const parsed = contract.safeParse(payload)
  if (!parsed.success) {
    throw new Error(`Event payload rejected on ${channel}: ${z.prettifyError(parsed.error)}`)
  }
  win.webContents.send(channel, parsed.data)
}
