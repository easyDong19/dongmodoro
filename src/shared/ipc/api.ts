import type { z } from 'zod'
import type { contracts } from './contracts'

/**
 * preload 가 노출하는 API 의 표면을 **계약에서 기계적으로 파생**한다.
 *
 * 계획서 초안은 renderer 가 preload 파일의 typeof 를 import 하게 했는데, 그러면
 * renderer 타입 검사가 electron 을 import 하는 파일로 끌려 들어간다 (tsconfig.web 은
 * Node·Electron 타입을 일부러 뺐다 — ADR-008). 여기서 파생하면 그 결합이 사라지고,
 * 덤으로 preload 가 이 타입을 만족하는지 컴파일러가 검사해 준다.
 *
 * 채널을 추가하면 이 타입이 저절로 따라오므로 손댈 곳이 늘지 않는다.
 */
type Contracts = typeof contracts

// req 는 invoke 의 인자 목록이라 항상 튜플이다 (handle.ts 의 제약과 같은 이유).
type Invoker<C> = C extends {
  req: infer Req extends z.ZodType<unknown[]>
  res: infer Res extends z.ZodTypeAny
}
  ? (...args: z.infer<Req>) => Promise<z.infer<Res>>
  : never

export type Api = {
  [Group in keyof Contracts]: {
    [Channel in keyof Contracts[Group]]: Invoker<Contracts[Group][Channel]>
  }
} & {
  /**
   * main → renderer 이벤트 구독 표면 (ADR-026 §4). 구독 함수는 해제 함수를 반환한다.
   * 콜백은 payload 만 받는다 — Electron 의 `event` 는 넘기지 않는다. payload 의 수신 직후
   * parse 는 여기(preload)가 아니라 renderer 리스너가 한다.
   */
  events: {
    onTimerTransition: (cb: (payload: unknown) => void) => () => void
    onSessionRecorded: (cb: (payload: unknown) => void) => () => void
    onClockBoundary: (cb: (payload: unknown) => void) => () => void
  }
}
