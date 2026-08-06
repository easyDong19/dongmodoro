import { z } from 'zod'

/**
 * IPC 계약의 단일 정의 (ADR-007 §2).
 *
 * IPC 는 직렬화 경계라 TS 타입은 경계를 넘는 순간 사라진다 — 실행 시점에 실제로 검사하는
 * 것은 이 스키마뿐이다. 그래서 **스키마가 원본이고 TS 타입은 z.infer 로 파생**한다.
 * 타입을 따로 선언하면 둘이 어긋나는 순간 계약이 거짓이 된다.
 *
 * 채널마다 요청(req)·응답(res) 쌍이 규칙이다. 응답은 strictObject 로 모르는 키를 거부한다 —
 * z.object() 는 조용히 버리기 때문에 계약이 어긋나도 아무도 모른다.
 */
export const contracts = {
  system: {
    getAppInfo: {
      req: z.tuple([]), // 인자 없음 — 여분 인자는 거부된다
      res: z.strictObject({
        appVersion: z.string(),
        schemaVersion: z.int()
      })
    }
  }
} as const

export type AppInfo = z.infer<typeof contracts.system.getAppInfo.res>
