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
/**
 * 자정 경계 payload 스키마 (ADR-026 §1). `contracts.clock.now`(invoke 응답)와
 * `eventContracts.clockBoundary`(이벤트 payload)가 같은 모양을 공유하므로 위에서 한 번만
 * 선언한다 — 두 곳에 따로 쓰면 어긋날 여지가 생긴다.
 */
const clockBoundarySchema = z.strictObject({
  dayKey: z.string(),
  weekKey: z.string(),
  monthKey: z.string()
})

/** `TodayRow`(main/services/ports.ts) 를 그대로 미러링한다 — 필드·nullable 이 어긋나면
 * 여기가 먼저 깨져야 한다 (choke-point payload, ADR-025 §3). */
const todayRowSchema = z.strictObject({
  taskId: z.string(),
  title: z.string(),
  sourceTitle: z.string().nullable(),
  sourceWeek: z.string(),
  estPomos: z.int().nullable(),
  spentPomos: z.int(),
  completedAt: z.string().nullable(),
  pulledAt: z.string()
})

export const contracts = {
  system: {
    getAppInfo: {
      req: z.tuple([]), // 인자 없음 — 여분 인자는 거부된다
      res: z.strictObject({
        appVersion: z.string(),
        schemaVersion: z.int()
      })
    }
  },
  clock: {
    now: {
      req: z.tuple([]),
      res: clockBoundarySchema
    }
  },
  today: {
    list: {
      req: z.tuple([]),
      res: z.strictObject({
        dayKey: z.string(),
        rows: z.array(todayRowSchema)
      })
    },
    addDirect: {
      req: z.tuple([z.string()]),
      res: z.strictObject({ itemWeek: z.string() })
    },
    pull: {
      req: z.tuple([z.string()]),
      res: z.strictObject({ itemWeek: z.string() })
    },
    remove: {
      req: z.tuple([z.string()]),
      res: z.strictObject({ itemWeek: z.string() })
    },
    toggleComplete: {
      req: z.tuple([z.string()]),
      res: z.strictObject({
        parentWeek: z.string(),
        completedAt: z.string().nullable()
      })
    }
  }
} as const

export type AppInfo = z.infer<typeof contracts.system.getAppInfo.res>

export const timerSnapshotSchema = z.strictObject({
  mode: z.enum(['focus', 'short', 'long']),
  phase: z.enum(['idle', 'running', 'paused']),
  startedAt: z.number().nullable(),
  durationSec: z.int().min(0),
  pausedRemainingSec: z.int().min(0).nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  focusCountToday: z.int().min(0)
})

/** main 발 이벤트의 payload 계약. 발송 직전·수신 직후 양쪽에서 parse 한다. */
export const eventContracts = {
  timerTransition: timerSnapshotSchema,
  /**
   * 커밋 후 발송 (ADR-026 §2). localDate·localWeek 는 저장값 그대로 —
   * renderer 는 재계산하지 않는다 (ADR-025 §1-2). sessionId·kind·taskId·
   * durationSec 는 캡처 바 판정용(자유 focus 만 캡처 대상 — timer R8).
   */
  sessionRecorded: z.strictObject({
    sessionId: z.string(),
    kind: z.enum(['focus', 'short', 'long']),
    taskId: z.string().nullable(),
    durationSec: z.int().min(0),
    localDate: z.string(),
    localWeek: z.string()
  }),
  /** 전이 후 값. 자정 정각 알람 + powerMonitor resume 보정 (ADR-026 §1). */
  clockBoundary: clockBoundarySchema
} as const

export type TimerSnapshotWire = z.infer<typeof timerSnapshotSchema>
export type SessionRecorded = z.infer<typeof eventContracts.sessionRecorded>
export type ClockBoundary = z.infer<typeof eventContracts.clockBoundary>
