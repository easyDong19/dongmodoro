import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

/**
 * Electron 보안 가이드: 모든 IPC 메시지의 발신자를 검증한다.
 * ipcMain.handle 은 누가 보냈든 처리하므로, 앱 안에서 외부 페이지가 열리는 경로가
 * 생기면 그 페이지가 우리 IPC 를 호출할 수 있다.
 * 허용 발신자 = 우리 앱 번들(file://) 또는 dev 서버(ELECTRON_RENDERER_URL)뿐.
 */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const trusted = url.startsWith('file://') || (devUrl != null && url.startsWith(devUrl))
  if (!trusted) throw new Error(`Untrusted IPC sender: ${url}`)
}

/**
 * 핸들러를 등록하는 **유일한 경로** (ADR-007). ipcMain.handle 을 직접 부르지 않는다.
 *
 * 세 가지를 강제한다:
 *   ① 발신자 검증  ② 요청 parse  ③ 응답 parse
 *
 * ③ 이 의외인데 — 내가 쓴 코드의 반환값도 검사한다. main 쪽 버그로 계약과 다른 값이
 * 나가면 renderer 가 조용히 깨지는 대신 여기서 터진다.
 *
 * parse 실패는 던진다. invoke 의 프로미스가 거부되어 renderer 가 알게 된다. 다만 zod 의
 * 원본 에러는 IPC 직렬화를 거치며 읽기 어려워지므로, 채널명을 앞에 붙여 다시 던진다.
 * 입력값 자체는 에러에 싣지 않는다 (zod 스킬 error-input-security).
 */
// Req 는 반드시 튜플이다 — invoke 의 인자 목록을 통째로 parse 하기 때문이다.
// z.ZodTypeAny 로 두면 z.infer<Req> 가 배열인지 컴파일러가 몰라 rest 파라미터에 못 쓴다.
export function handleIpc<Req extends z.ZodType<unknown[]>, Res extends z.ZodTypeAny>(
  channel: string,
  contract: { req: Req; res: Res },
  fn: (...args: z.infer<Req>) => z.infer<Res> | Promise<z.infer<Res>>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event)

    const input = contract.req.safeParse(args)
    if (!input.success) {
      throw new Error(`IPC request rejected on ${channel}: ${z.prettifyError(input.error)}`)
    }

    const output = contract.res.safeParse(await fn(...input.data))
    if (!output.success) {
      throw new Error(`IPC response rejected on ${channel}: ${z.prettifyError(output.error)}`)
    }
    return output.data
  })
}
