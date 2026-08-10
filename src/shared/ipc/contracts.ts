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
  monthKey: z.string(),
  /** 0 = 월요일 … 6 = 일요일 (ADR-010 §1). renderer 가 요일을 계산할 수 없어 실어 보낸다. */
  weekdayIndex: z.int().min(0).max(6)
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

/** `WeekItemRow`(main/services/ports.ts) 미러링 — 일반 뷰 한 행. */
const weekItemRowSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  estPomos: z.int(),
  days: z.array(z.int().min(0).max(6)),
  originWeek: z.string(),
  completedAt: z.string().nullable(),
  spentPomos: z.int(),
  childTotal: z.int(),
  childDone: z.int()
})

// 사용자가 만드는 항목의 est 하한은 1 이다 (R6). 기타 항목은 이 경로를 거치지 않는다.
const planDraftItemSchema = z.strictObject({
  id: z.string().nullable(),
  title: z.string().min(1).max(40),
  estPomos: z.int().min(1),
  days: z.array(z.int().min(0).max(6))
})

/** `ChildTaskRow`(main/services/ports.ts) 미러링 — 드로어 한 행. */
const childTaskSchema = z.strictObject({
  taskId: z.string(),
  title: z.string(),
  estPomos: z.int().nullable(),
  spentPomos: z.int(),
  completedAt: z.string().nullable(),
  inToday: z.boolean()
})

export const timerSnapshotSchema = z.strictObject({
  mode: z.enum(['focus', 'short', 'long']),
  phase: z.enum(['idle', 'running', 'paused']),
  startedAt: z.number().nullable(),
  durationSec: z.int().min(0),
  pausedRemainingSec: z.int().min(0).nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  focusCountToday: z.int().min(0),
  focusSinceLastLong: z.int().min(0)
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
  },
  /**
   * 상태 변경 명령의 응답은 전부 전이 후 스냅샷이다. 다만 renderer 는 이 invoke 응답을
   * 그대로 캐시에 쓰지 않는다 — `['timer']` 캐시를 채우는 유일한 쓰기는 main 이 뒤이어
   * 보내는 `timer:transition` push 뿐이다(events.ts 초크포인트). invoke 응답은 호출부가
   * 필요하면 직접 쓰되, 캐시 동기화는 그 push 이벤트가 책임진다.
   */
  timer: {
    getState: { req: z.tuple([]), res: timerSnapshotSchema },
    start: { req: z.tuple([]), res: timerSnapshotSchema },
    startWithTask: { req: z.tuple([z.string()]), res: timerSnapshotSchema },
    pause: { req: z.tuple([]), res: timerSnapshotSchema },
    resume: { req: z.tuple([]), res: timerSnapshotSchema },
    reset: { req: z.tuple([]), res: timerSnapshotSchema },
    adjust: { req: z.tuple([z.number()]), res: timerSnapshotSchema },
    completeEarly: { req: z.tuple([]), res: timerSnapshotSchema },
    setMode: { req: z.tuple([z.enum(['focus', 'short', 'long'])]), res: timerSnapshotSchema }
  },
  sessions: {
    /** 사후 캡처 (timer R8). 응답은 세션의 저장 달력 키 — 초크포인트 payload (ADR-025 §3 사건 2). */
    capture: {
      req: z.tuple([z.string(), z.string()]),
      res: z.strictObject({ localDate: z.string(), localWeek: z.string() })
    }
  },
  /**
   * 조작 응답이 하나같이 `itemWeek` 를 싣는 이유: 화면은 그 주의 캐시를 무효화해야 하는데,
   * 항목이 어느 주 소속인지는 main 만 안다 (폐기·이월 항목은 보고 있는 주와 다를 수 있다).
   */
  week: {
    summary: {
      req: z.tuple([z.string()]),
      res: z.strictObject({
        week: z.string(),
        budget: z.int().nullable(),
        totalSpent: z.int(),
        items: z.array(weekItemRowSchema),
        otherRow: z.strictObject({ visible: z.boolean(), spentPomos: z.int() })
      })
    },
    planDraft: {
      req: z.tuple([z.string()]),
      res: z.strictObject({
        week: z.string(),
        budget: z.int().nullable(),
        prefill: z.int().nullable(),
        items: z.array(planDraftItemSchema)
      })
    },
    confirmPlan: {
      req: z.tuple([
        z.strictObject({
          week: z.string(),
          budget: z.int().min(0).nullable(),
          items: z.array(planDraftItemSchema)
        })
      ]),
      res: z.strictObject({ week: z.string(), droppedCount: z.int() })
    },
    drawer: {
      req: z.tuple([z.string()]),
      res: z.strictObject({
        itemWeek: z.string(),
        completedAt: z.string().nullable(),
        tasks: z.array(childTaskSchema)
      })
    },
    pullNext: {
      req: z.tuple([z.string()]),
      res: z.strictObject({
        itemWeek: z.string(),
        pulled: z.strictObject({ taskId: z.string(), title: z.string() }).nullable()
      })
    },
    pullFromDrawer: {
      req: z.tuple([
        z.strictObject({
          weekItemId: z.string(),
          taskIds: z.array(z.string()),
          newTask: z
            .strictObject({ title: z.string().min(1).max(40), estPomos: z.int().min(1).nullable() })
            .nullable()
        })
      ]),
      res: z.strictObject({ itemWeek: z.string() })
    },
    complete: {
      req: z.tuple([z.string()]),
      res: z.strictObject({ itemWeek: z.string(), completedAt: z.string().nullable() })
    },
    uncomplete: {
      req: z.tuple([z.string()]),
      res: z.strictObject({ itemWeek: z.string(), completedAt: z.string().nullable() })
    },
    drop: { req: z.tuple([z.string()]), res: z.strictObject({ itemWeek: z.string() }) }
  },
  review: {
    /**
     * 배너용 판정. 읽기 전용이며 어떤 저장값도 바꾸지 않는다 (weekly-review R27).
     *
     * `discriminatedUnion` 인 이유: 빈 범위에는 `from`·`to` 가 **없다.** 두 필드를
     * nullable 로 두면 "정산 대기인데 범위가 null" 이라는 표현 불가능한 상태가 계약에
     * 생기고, 화면이 매번 그것을 방어해야 한다.
     *
     * `pendingItemCount` 는 0 일 수 있고 그래도 `needed` 는 참이다 — 워터마크를
     * 전진시키는 것 자체가 확정의 일이다 (R5). 이 값은 배너 문구만 가른다.
     */
    getStatus: {
      req: z.tuple([]),
      res: z.discriminatedUnion('needed', [
        z.strictObject({ needed: z.literal(false), targetWeek: z.string() }),
        z.strictObject({
          needed: z.literal(true),
          targetWeek: z.string(),
          from: z.string(),
          to: z.string(),
          weekCount: z.int().min(1),
          pendingItemCount: z.int().min(0)
        })
      ])
    }
  }
} as const

export type AppInfo = z.infer<typeof contracts.system.getAppInfo.res>

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
