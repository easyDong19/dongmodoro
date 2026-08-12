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

/**
 * 테마 저장값 (design-system ADR-010 §1). **`system` 은 없다** — 앱이 테마를 소유하고
 * OS 선호를 따르지 않는다. 기본값 `dark` 는 시딩이 정한다 (architecture ADR-018 §4).
 *
 * 범용 key-value 채널(`settings.get(key)`)을 만들지 않은 이유가 이 스키마다. 값이
 * `string` 이면 `theme` 에 `'purple'` 이 들어가도 계약을 통과해, 그 채널에서만
 * ADR-007 의 규율이 무력해진다.
 */
const themeSchema = z.enum(['light', 'dark'])

/**
 * 분모의 전역값 — 편집 폼이 주고받는 모든 것 (pomo-baseline R5·R7·R8).
 *
 * 하한이 여기 있는 것이 **첫 번째 거부 지점**이다 (두 번째는 SQLite CHECK, ADR-011 §6).
 * 길이는 1분 이상 정수이며 0·음수·비정수·빈 값은 경계에서 막힌다 (A5).
 *
 * `capacity` 의 `null` 은 **"미설정을 유지한다"** 이지 **"설정을 지운다"가 아니다.**
 * 해제는 v1 범위 밖이고, 이 구분이 없으면 다음 사람이 null 을 삭제 신호로 읽어 R8 이
 * 지키려던 "미설정 ≠ 예산 0"이 흐려진다. 인덱스 0 은 월요일이다 (R7 · ADR-010 §1).
 */
const baselineFormSchema = z.strictObject({
  focusMin: z.int().min(1),
  shortBreakMin: z.int().min(1),
  longBreakMin: z.int().min(1),
  capacity: z.array(z.int().min(0)).length(7).nullable()
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

/** `ReviewWeekFact`(main/services/ports.ts) 미러링 — 정산 요약의 주별 한 줄. */
const reviewWeekFactSchema = z.strictObject({
  week: z.string(),
  studiedDays: z.int(),
  spentPomos: z.int(),
  /** NULL = "기록 없음". 0 은 "예산 0 으로 하겠다"는 별개 사실이다 (ADR-018 §1). */
  budget: z.int().nullable(),
  unplannedPomos: z.int()
})

/** 3택 한 행. `remaining`·`carryWeeks` 는 저장값이 아니라 서비스가 붙인 파생값이다. */
const pendingRowSchema = z.strictObject({
  id: z.string(),
  week: z.string(),
  title: z.string(),
  estPomos: z.int(),
  spentPomos: z.int(),
  /** 측정값이라 0 이 될 수 있다 (ADR-019 §1). 이월 est 의 하한 1 은 확정이 건다. */
  remaining: z.int().min(0),
  carryWeeks: z.int().min(1)
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

/**
 * 달력 키의 형식은 계약이 거른다 — 렌더러가 조립한 문자열이 여기서 처음 검증된다.
 * `'2026-8'`(zero-pad 없음)·`'26-08'` 은 CHECK 제약까지 가기 전에 거부되어야 한다
 * (ADR-011 §6 — 거부는 경계에서).
 */
const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be YYYY-MM-DD')

/**
 * 월 그리드 한 칸. **점 없음을 등급으로 표현하지 않는다** — `hasRecord: false` 가 그
 * 사실이며, `dotLevel: null` 을 두면 같은 사실을 두 필드가 말하게 되어 어긋날 수 있다.
 */
const calendarDaySchema = z.strictObject({
  dayKey: dayKeySchema,
  hasRecord: z.boolean(),
  focusCount: z.int().min(0),
  dotLevel: z.enum(['basic', 'strong'])
})

/**
 * 마일스톤 한 행. **수치 필드가 계약에 없다** (milestones R3 · A3) — 계약에 없으면
 * 화면이 만들 수 없다. 숫자가 처음 등장하는 레벨은 주다.
 */
const milestoneSchema = z.strictObject({
  id: z.string(),
  month: monthKeySchema,
  title: z.string(),
  completedAt: z.string().nullable(),
  archivedAt: z.string().nullable()
})

/** 제목 하나. 공백만 있는 제목은 여기서 거부된다 — 서비스의 trim 보다 앞선 방어선이다. */
const milestoneTitleSchema = z.string().trim().min(1).max(60)

/** 날짜 패널 한 행. `pulled`·`hadSession` 이 출처이며 둘 다 참일 수 있다 (R18). */
const dayTaskSchema = z.strictObject({
  taskId: z.string(),
  title: z.string(),
  /** **현재** 완료 상태다 (R19) — 그 날짜 시점의 완료 여부가 아니다. */
  completedAt: z.string().nullable(),
  pulled: z.boolean(),
  hadSession: z.boolean()
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

/**
 * 정산 확정이 실패할 수 있는 **유일한 정상 경로** — 보고 있던 범위가 실제로 달라졌다.
 *
 * main 이 던지고 renderer 가 알아봐야 하므로 계약 옆에 둔다. IPC 를 건너는 동안 Error 는
 * 메시지만 남으므로 renderer 는 `message.includes()` 로 판정한다 — 그래서 이 문자열이
 * 양쪽에서 같은 상수여야 한다.
 */
export const STALE_RANGE = 'STALE_RANGE'

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
        tasks: z.array(childTaskSchema),
        /** 지금 걸린 연결. **후보 밖일 수 있다** — 이월 승계의 타월 연결이다 (R15). */
        milestone: milestoneSchema.nullable(),
        /** 새로 연결할 수 있는 것들 — 그 주가 귀속된 달의 미보관 마일스톤 (R14 · A12). */
        milestoneCandidates: z.array(milestoneSchema)
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
    drop: { req: z.tuple([z.string()]), res: z.strictObject({ itemWeek: z.string() }) },
    /**
     * 할당 ↔ 마일스톤 연결 (R13·R14). `milestoneId: null` 은 **연결 해제**이며 오류가
     * 아니다 — 연결 없음은 정상 상태이고 UI 상 "기타"로 다뤄진다.
     */
    setMilestone: {
      req: z.tuple([
        z.strictObject({ weekItemId: z.string(), milestoneId: z.string().nullable() })
      ]),
      res: z.strictObject({ itemWeek: z.string() })
    }
  },
  /**
   * 월 마일스톤. **표시 모드·배지·롤업을 서버가 실어 보낸다** — 모드 판정을 렌더러가
   * 하면 R20 의 순서가 화면으로 새어나가고, 두 곳이 어긋나는 날이 온다.
   *
   * 조작 응답이 주간 항목처럼 소속 키를 싣지 않는 이유는 milestones.ts 주석에 있다 —
   * 카드가 한 달만 그리므로 무효화할 달을 화면이 이미 안다.
   */
  milestones: {
    forMonth: {
      req: z.tuple([monthKeySchema]),
      res: z.strictObject({
        month: monthKeySchema,
        mode: z.enum(['far-future', 'lead-edit', 'current-empty', 'edit', 'past', 'past-empty']),
        items: z.array(
          milestoneSchema.extend({
            /** `null` 은 "이 카드에 롤업이 없다"이며 0 과 다르다 (R17·R18). */
            rollup: z
              .strictObject({ spentPomos: z.int().min(0), plannedPomos: z.int().min(0) })
              .nullable()
          })
        ),
        /** `M === 0` 이면 `null` — `0/0 달성` 을 만들지 않는다 (R21 · A22). */
        badge: z
          .strictObject({
            total: z.int().min(0),
            completed: z.int().min(0),
            archivedCount: z.int().min(0)
          })
          .nullable(),
        /** 롤업의 **범위 라벨**을 그릴 주. `null` 이면 화면이 숫자 대신 사실 문구를 쓴다 (R17). */
        rollupWeek: dayKeySchema.nullable(),
        carryCandidates: z.array(milestoneSchema),
        /** `보관 K건` 뒤에서 펼치는 목록. 해제의 도달 경로다 (R11 · A20). */
        archivedItems: z.array(milestoneSchema)
      })
    },
    create: {
      req: z.tuple([z.strictObject({ month: monthKeySchema, title: milestoneTitleSchema })]),
      res: z.strictObject({ month: monthKeySchema, id: z.string() })
    },
    rename: {
      req: z.tuple([z.strictObject({ id: z.string(), title: milestoneTitleSchema })]),
      res: z.void()
    },
    setCompleted: {
      req: z.tuple([z.strictObject({ id: z.string(), completed: z.boolean() })]),
      res: z.strictObject({ completedAt: z.string().nullable() })
    },
    setArchived: {
      req: z.tuple([z.strictObject({ id: z.string(), archived: z.boolean() })]),
      res: z.strictObject({ archivedAt: z.string().nullable() })
    },
    remove: { req: z.tuple([z.string()]), res: z.void() },
    /**
     * 제목 복사 (R22). **제목 배열만** 받는다 — 원본 id 를 받으면 "원본을 건드릴 수도
     * 있다"는 여지가 계약에 남고, A23 이 지키려는 것이 정확히 그 부재다.
     */
    carryTitles: {
      req: z.tuple([
        z.strictObject({ month: monthKeySchema, titles: z.array(milestoneTitleSchema).min(1) })
      ]),
      res: z.strictObject({ month: monthKeySchema, created: z.int().min(0) })
    }
  },
  /**
   * 캘린더 열람. 화면 하나 = 응답 하나이며, 화면이 조각을 모아 조립하지 않는다.
   * **쓰기 채널이 없는 것이 계약이다** (R23 — 날짜 패널은 읽기 전용).
   */
  calendar: {
    month: {
      req: z.tuple([monthKeySchema]),
      res: z.strictObject({
        month: monthKeySchema,
        /** 1일 앞의 빈 칸 수. 월요일 시작 기준이다 (R7). */
        leadingBlanks: z.int().min(0).max(6),
        days: z.array(calendarDaySchema)
      })
    },
    day: {
      req: z.tuple([dayKeySchema]),
      res: z.strictObject({
        dayKey: dayKeySchema,
        hasRecord: z.boolean(),
        focusCount: z.int().min(0),
        tasks: z.array(dayTaskSchema)
      })
    },
    /** `이번 주 N일 공부 중`. 주 키를 받는다 — 이 값만 `기록 있음` 과 다른 조건을 쓴다 (R24). */
    studyDays: {
      req: z.tuple([dayKeySchema]),
      res: z.strictObject({ week: dayKeySchema, days: z.int().min(0) })
    }
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
    },
    /**
     * 정산 패널 데이터. `getStatus` 와 같은 이유로 판별 유니온이다 — 패널은 배너에서만
     * 열리지만 `STALE_RANGE` 후 재조회하면 범위가 사라져 있을 수 있고(다른 창에서 확정,
     * 자정 통과), 그때 던지거나 빈 목록으로 거짓말하는 대신 `needed: false` 로 답한다.
     */
    getPending: {
      req: z.tuple([]),
      res: z.discriminatedUnion('needed', [
        z.strictObject({ needed: z.literal(false), targetWeek: z.string() }),
        z.strictObject({
          needed: z.literal(true),
          targetWeek: z.string(),
          targetWeekIsCurrent: z.boolean(),
          from: z.string(),
          to: z.string(),
          summary: z.strictObject({
            weeks: z.array(reviewWeekFactSchema),
            idleWeekCount: z.int().min(0),
            lastStudiedWeek: z.string().nullable(),
            lastStudiedPomos: z.int().nullable()
          }),
          completed: z.array(
            z.strictObject({
              id: z.string(),
              week: z.string(),
              title: z.string(),
              spentPomos: z.int()
            })
          ),
          pending: z.array(pendingRowSchema),
          /**
           * **nullable 이다.** technical-spec 초안은 "스냅샷이 없으면 기본 예산(가용량 합)"
           * 이라고 했지만 `weekly_capacity` 를 시딩하지 않기로 한 이상 그 기본값이 없고,
           * 0 을 채우면 ADR-018 §1 이 구분하려던 "기록 없음"과 "예산 0"이 뭉개진다.
           */
          targetWeekBudget: z.int().nullable(),
          /**
           * 패널이 현재 값을 적는 **표시의 유일한 출처**다. 편집은 `settings.getBaseline`
           * 이 따로 읽는다 — 같은 사실을 두 경로로 그리면 저장 직후 한쪽만 갱신된
           * 순간이 화면에 보인다. 저장 후 이 값을 갱신하는 것은 `baseline-changed`
           * 무효화의 몫이다.
           */
          baseline: z.strictObject({
            focusMin: z.int(),
            shortBreakMin: z.int(),
            longBreakMin: z.int()
          })
        })
      ])
    },
    /**
     * 확정. **결정 전체가 아니라 예외만 보낸다** (R29) — 패널이 모달이 아니라 열어둔 채
     * 다른 화면에서 항목을 완료·삭제·추가하는 것이 정상 사용이고, 전 항목의 결정을
     * 보내 서버가 집합 일치를 요구하면 그 정상 사용이 확정을 롤백시킨다.
     *
     * 빈 배열은 누락이 아니라 **"전부 이월"이라는 완전한 의사 표시**다 (R13).
     */
    settle: {
      req: z.tuple([
        z.strictObject({
          expectedRange: z.strictObject({ from: z.string(), to: z.string() }),
          targetWeek: z.string(),
          exceptions: z.array(
            z.discriminatedUnion('kind', [
              z.strictObject({
                kind: z.literal('carry_reduced'),
                itemId: z.string(),
                // 형식 검증만 여기서 한다. 상한 클램프는 서버가 재조회한 남은 몫으로 하며
                // 거부하지 않는다 (규칙 4) — 열어둔 패널의 값은 언제든 낡을 수 있다.
                estPomos: z.int().min(1)
              }),
              z.strictObject({ kind: z.literal('drop'), itemId: z.string() })
            ])
          )
        })
      ]),
      res: z.strictObject({
        settledThrough: z.string(),
        carriedItemIds: z.array(z.string()),
        droppedItemIds: z.array(z.string()),
        carriedPomos: z.int(),
        /** 화면이 몰랐을 수 있는 이월. 건수를 숨기지 않는다 (R30). */
        autoCarried: z.array(
          z.strictObject({
            sourceItemId: z.string(),
            newItemId: z.string(),
            title: z.string(),
            estPomos: z.int()
          })
        ),
        ignoredExceptionIds: z.array(z.string()),
        clampedExceptionIds: z.array(z.string())
      })
    }
  },
  settings: {
    /**
     * 렌더러가 물어보는 것은 **사용자가 고른 값** 하나뿐이다. 해석된 결과(실제로 밝은지
     * 어두운지)는 CSS 가 이미 알고 있어 물어볼 필요가 없다 — main 이
     * `nativeTheme.themeSource` 를 설정하면 그것이 렌더러의 `prefers-color-scheme` 까지
     * 움직인다 (design-system ADR-010 §3).
     */
    getTheme: { req: z.tuple([]), res: z.strictObject({ theme: themeSchema }) },
    /**
     * 응답이 `void` 가 아니라 **저장된 값**인 이유: 화면이 낙관적 추측이 아니라 사실로
     * 갱신하게 하려는 것이다. 값 정규화가 main 에 있으므로(레거시 `system` → `dark`)
     * 보낸 값과 저장된 값이 다를 수 있는 경로가 실제로 존재한다.
     */
    setTheme: { req: z.tuple([themeSchema]), res: z.strictObject({ theme: themeSchema }) },
    /**
     * 분모의 전역값 조회 (pomo-baseline R6·R7). 응답에 붙는 `basisPomos` 는 저장값이
     * 아니라 **R26 의 시간 비교용 기준 개수**이며, 그 결정 순서(유효 예산 → 가용량 합 →
     * 없음)는 main 서비스에만 있다. 렌더러가 고르게 하면 순서가 화면으로 새어나간다.
     */
    getBaseline: {
      req: z.tuple([]),
      res: baselineFormSchema.extend({
        /** `null` 이면 시간 비교를 렌더하지 않는다. 오류가 아니다 (A25). */
        basisPomos: z.int().nullable(),
        /**
         * 기준 개수의 출처. `'capacity'` 면 폼에서 가용량을 고치는 순간 기준도 함께
         * 움직여야 하므로, 렌더러가 편집 중인 배열로 다시 합산한다 (A23).
         */
        basisSource: z.enum(['budget', 'capacity']).nullable()
      })
    },
    /**
     * 응답이 `void` 가 아니라 **저장된 값**인 이유는 `setTheme` 과 같다 — 화면이 낙관적
     * 추측이 아니라 사실로 갱신하게 한다.
     */
    setBaseline: { req: z.tuple([baselineFormSchema]), res: baselineFormSchema }
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

/** `'light' | 'dark'`. 스키마에서 파생하므로 둘이 어긋날 수 없다. */
export type Theme = z.infer<typeof themeSchema>

/** 편집 폼이 주고받는 전역 분모값. 같은 이유로 스키마에서 파생한다. */
export type BaselineForm = z.infer<typeof baselineFormSchema>

export type TimerSnapshotWire = z.infer<typeof timerSnapshotSchema>
export type SessionRecorded = z.infer<typeof eventContracts.sessionRecorded>
export type ClockBoundary = z.infer<typeof eventContracts.clockBoundary>
