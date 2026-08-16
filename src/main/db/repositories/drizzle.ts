import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { v7 as uuidv7 } from 'uuid'
import { settings, weekItems, tasks, taskPulls, sessions, milestones } from '../schema'
import { now } from '../../../shared/time'
import type { Repositories, SessionRow, UnitOfWork } from '../../services/ports'

/** Drizzle 의 트랜잭션 핸들. `db` 와 같은 질의 API 를 갖지만 타입이 다르다. */
type Tx = Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0]

function makeRepos(tx: Tx): Repositories {
  return {
    settings: {
      get: (key) =>
        tx.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
          ?.value ?? null,

      set: (key, value) => {
        // updated_at 은 스키마의 $onUpdate 가 갱신하지만, 그것은 UPDATE 경로에만 걸린다.
        // upsert 의 INSERT 분기와 충돌 분기 양쪽에서 값을 주어야 두 경로가 같아진다.
        tx.insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } })
          .run()
      },

      updatedAt: (key) =>
        tx
          .select({ updatedAt: settings.updatedAt })
          .from(settings)
          .where(eq(settings.key, key))
          .get()?.updatedAt ?? null
    },

    weekItems: {
      ensureSystemItem: (week) => {
        const existing = tx
          .select({ id: weekItems.id })
          .from(weekItems)
          .where(
            and(eq(weekItems.week, week), eq(weekItems.isSystem, 1), isNull(weekItems.deletedAt))
          )
          .get()
        if (existing) return existing.id

        const id = uuidv7()
        tx.insert(weekItems)
          .values({
            id,
            week,
            title: '기타',
            days: '[]',
            originWeek: week,
            isSystem: 1
          })
          .run()
        return id
      },

      weekOf: (weekItemId) =>
        tx
          .select({ week: weekItems.week })
          .from(weekItems)
          .where(eq(weekItems.id, weekItemId))
          .get()?.week ?? null,

      listForWeek: (week) => {
        const rows = tx
          .select({
            id: weekItems.id,
            title: weekItems.title,
            days: weekItems.days,
            originWeek: weekItems.originWeek,
            completedAt: weekItems.completedAt
          })
          .from(weekItems)
          .where(
            and(
              eq(weekItems.week, week),
              eq(weekItems.isSystem, 0),
              isNull(weekItems.droppedAt),
              isNull(weekItems.deletedAt)
            )
          )
          .orderBy(asc(weekItems.createdAt), sql`week_items.rowid`)
          .all()

        return rows.map((r) => {
          /**
           * week-plan R8 의 집계 술어. `s.local_week = <항목의 week>` 조건이 핵심이다 —
           * 빠뜨리면 주 경계를 넘긴 세션이 두 주에서 세어지고, 에러 없이 숫자만 틀린다.
           * 이 술어는 이 파일 안에만 존재한다.
           *
           * **`tasks.deleted_at` 을 일부러 거르지 않는다.** 바로 아래 `counts` 는 거른다 —
           * 두 질의가 서로 다른 질문에 답하기 때문이다:
           *   · `measuredSec` = "이 항목 몫으로 실제로 한 집중" → 조각을 지워도 집중은 있었다
           *   · `counts`      = "지금 남아 있는 조각 중 몇 개를 끝냈나" → 완료 제안의 재료
           * 여기에 `deleted_at` 필터를 더하면 삭제된 조각의 시간이 항목에서 사라지는데
           * `weekTotalMeasuredSec` 는 그대로라, 차액이 조용히 기타 행으로 새어 A24 가 깨진다.
           * 비대칭이 버그로 보여도 고치지 말 것 — 차액 항등식이 이것에 의존한다 (ADR-027 §2).
           */
          const totals = tx
            .select({
              /** 0행이면 SQLite 의 sum() 이 NULL 이라 `coalesce` 로 0 을 만든다. */
              sec: sql<number>`coalesce(sum(${sessions.durationSec}), 0)`
            })
            .from(sessions)
            .innerJoin(tasks, eq(sessions.taskId, tasks.id))
            .where(
              and(
                eq(tasks.weekItemId, r.id),
                eq(sessions.kind, 'focus'),
                eq(sessions.localWeek, week)
              )
            )
            .get()
          const measuredSec = totals?.sec ?? 0

          // 자식 0행이면 SQLite 의 sum() 은 NULL 을 돌려준다 — count 는 0 이므로 total 만으로
          // 판정하지 않고 done 쪽에 폴백을 둔다.
          const counts = tx
            .select({
              total: sql<number>`count(*)`,
              done: sql<
                number | null
              >`sum(case when ${tasks.completedAt} is not null then 1 else 0 end)`
            })
            .from(tasks)
            .where(and(eq(tasks.weekItemId, r.id), isNull(tasks.deletedAt)))
            .get()

          return {
            id: r.id,
            title: r.title,
            days: JSON.parse(r.days) as number[],
            originWeek: r.originWeek,
            completedAt: r.completedAt,
            measuredSec,
            childTotal: counts?.total ?? 0,
            childDone: counts?.done ?? 0
          }
        })
      },

      /**
       * 주 총 측정 시간(초). `task_id` 를 거르지 않으므로 미분류 집중이 들어오고, 항목의
       * 폐기·삭제가 이 값을 줄이지 않는다 (ADR-027 §2). 기타 행 차액의 피감수이므로 이
       * 정의역이 어긋나면 차액이 틀린다.
       */
      weekTotalMeasuredSec: (week) =>
        tx
          .select({ sec: sql<number>`coalesce(sum(${sessions.durationSec}), 0)` })
          .from(sessions)
          .where(and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus')))
          .get()?.sec ?? 0,

      hasUnplannedActivity: (week) => {
        const looseSession = tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus'), isNull(sessions.taskId))
          )
          .get()
        if (looseSession) return true

        const orphanTask = tx
          .select({ id: tasks.id })
          .from(tasks)
          .innerJoin(weekItems, eq(tasks.weekItemId, weekItems.id))
          .where(and(eq(weekItems.week, week), eq(weekItems.isSystem, 1), isNull(tasks.deletedAt)))
          .get()
        return orphanTask !== undefined
      },

      /**
       * 기타 행 표시 조건 ③ — 그 주 focus 세션 중 **목록에 보이는 항목으로 설명되지 않는
       * 것**의 존재 판정 (week-plan ux-spec §3.4).
       *
       * `NOT EXISTS` 의 안쪽 술어가 `listForWeek` 의 정의역과 **같아야 한다** — 갈리면
       * 차액이 0 이 아닌데 행이 숨거나, 차액이 0 인데 행이 뜬다. 미분류 세션
       * (`task_id IS NULL`)도 여기 걸리는데, 그 갈래는 `hasUnplannedActivity` 가 이미
       * 보므로 중복이지 모순이 아니다.
       *
       * **크기가 아니라 존재를 본다.** `duration_sec = 0` 인 세션(시작 직후 완료 처리)만
       * 붙은 항목을 폐기하면 차액이 0 초라 크기 판정으로는 행이 사라지고, 실재한 집중이
       * 화면에서 증발한다 (PRD A24).
       */
      hasHiddenFocus: (week) =>
        tx.all<{ hit: number }>(sql`
            SELECT 1 AS hit FROM sessions s
             WHERE s.local_week = ${week}
               AND s.kind = 'focus'
               AND NOT EXISTS (
                 SELECT 1 FROM tasks t
                   JOIN week_items wi ON t.week_item_id = wi.id
                  WHERE t.id = s.task_id
                    AND wi.week = ${week}
                    AND wi.is_system = 0
                    AND wi.dropped_at IS NULL
                    AND wi.deleted_at IS NULL
               )
             LIMIT 1
          `).length > 0,

      confirmPlan: ({ week, items }) => {
        const existing = tx
          .select({ id: weekItems.id })
          .from(weekItems)
          .where(
            and(
              eq(weekItems.week, week),
              eq(weekItems.isSystem, 0),
              isNull(weekItems.droppedAt),
              isNull(weekItems.deletedAt)
            )
          )
          .all()
          .map((r) => r.id)

        const createdIds: string[] = []
        const kept = new Set<string>()

        for (const item of items) {
          const days = JSON.stringify(item.days)
          if (item.id === null) {
            const id = uuidv7()
            tx.insert(weekItems)
              .values({
                id,
                week,
                title: item.title,
                days,
                // 신규는 이 주가 최초 생성 주다. 이월만 원본 값을 승계한다 (R11) — 그 경로는
                // 정산(M3b)이 별도로 만든다. 이 메서드를 이월에 재사용하면 배지가 1 로 리셋된다.
                originWeek: week,
                isSystem: 0
              })
              .run()
            createdIds.push(id)
            continue
          }
          if (!existing.includes(item.id)) {
            throw new Error(`confirmPlan: item '${item.id}' does not belong to week ${week}`)
          }
          // origin_week·carry_from_id·milestone_id 는 건드리지 않는다 — 이력이 끊긴다 (R23).
          tx.update(weekItems)
            .set({ title: item.title, days })
            .where(eq(weekItems.id, item.id))
            .run()
          kept.add(item.id)
        }

        const droppedIds = existing.filter((id) => !kept.has(id))
        for (const id of droppedIds) {
          // 폐기는 삭제가 아니다 (ADR-014 §1) — 자식 조각·세션은 손대지 않는다.
          tx.update(weekItems).set({ droppedAt: now() }).where(eq(weekItems.id, id)).run()
        }

        return { createdIds, droppedIds }
      },

      header: (weekItemId) =>
        tx
          .select({ week: weekItems.week, completedAt: weekItems.completedAt })
          .from(weekItems)
          .where(eq(weekItems.id, weekItemId))
          .get() ?? null,

      childTasks: (weekItemId, dayKey) => {
        const rows = tx
          .select({ taskId: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
          .from(tasks)
          .where(and(eq(tasks.weekItemId, weekItemId), isNull(tasks.deletedAt)))
          .orderBy(asc(tasks.createdAt), sql`tasks.rowid`)
          .all()

        return rows.map((r) => {
          // 조각 단위 합산에는 주 조건을 걸지 않는다 — 이 숫자가 답하는 질문은 "이 조각으로
          // 얼마나 했나"이지 "이 주에 얼마나 했나"가 아니다. 주 조건은 항목 소진(R8)의 것이다.
          // 이 비대칭은 의도된 것이며 근거·대가는 today-tasks R3-3 이 소유한다.
          const totals = tx
            .select({ sec: sql<number>`coalesce(sum(${sessions.durationSec}), 0)` })
            .from(sessions)
            .where(and(eq(sessions.taskId, r.taskId), eq(sessions.kind, 'focus')))
            .get()
          const measuredSec = totals?.sec ?? 0

          const active = tx
            .select({ taskId: taskPulls.taskId })
            .from(taskPulls)
            .where(
              and(
                eq(taskPulls.taskId, r.taskId),
                eq(taskPulls.pullDate, dayKey),
                isNull(taskPulls.removedAt)
              )
            )
            .get()

          return { ...r, measuredSec, inToday: active !== undefined }
        })
      },

      complete: (weekItemId, at) => {
        tx.update(weekItems).set({ completedAt: at }).where(eq(weekItems.id, weekItemId)).run()
      },

      uncomplete: (weekItemId) => {
        tx.update(weekItems).set({ completedAt: null }).where(eq(weekItems.id, weekItemId)).run()
      },

      drop: (weekItemId) => {
        tx.update(weekItems).set({ droppedAt: now() }).where(eq(weekItems.id, weekItemId)).run()
      }
    },

    today: {
      list: (dayKey) => {
        const rows = tx
          .select({
            taskId: tasks.id,
            title: tasks.title,
            sourceTitle: weekItems.title,
            isSystem: weekItems.isSystem,
            sourceWeek: weekItems.week,
            completedAt: tasks.completedAt,
            pulledAt: taskPulls.createdAt
          })
          .from(taskPulls)
          .innerJoin(tasks, eq(taskPulls.taskId, tasks.id))
          .innerJoin(weekItems, eq(tasks.weekItemId, weekItems.id))
          .where(
            and(
              eq(taskPulls.pullDate, dayKey),
              isNull(taskPulls.removedAt),
              isNull(tasks.deletedAt)
            )
          )
          // pulledAt(created_at) 은 ms 정밀도라 빠른 연속 pull 은 값이 같을 수 있다.
          // rowid(삽입 순서)를 2차 정렬키로 세워 R4 의 "pull 순서"를 결정적으로 만든다 —
          // 컬럼 추가 없이 SQLite 의 암묵 rowid 를 쓴다. 서비스의 안정 정렬이 이 순서를
          // 그룹(완료/미완료) 안에서 그대로 보존한다.
          .orderBy(asc(taskPulls.createdAt), sql`task_pulls.rowid`)
          .all()

        return rows.map((r) => {
          // 조각 단위 합산이라 주 조건이 없다 (today-tasks R3-3).
          const totals = tx
            .select({ sec: sql<number>`coalesce(sum(${sessions.durationSec}), 0)` })
            .from(sessions)
            .where(and(eq(sessions.taskId, r.taskId), eq(sessions.kind, 'focus')))
            .get()

          return {
            taskId: r.taskId,
            title: r.title,
            sourceTitle: r.isSystem === 1 ? null : r.sourceTitle,
            sourceWeek: r.sourceWeek,
            measuredSec: totals?.sec ?? 0,
            completedAt: r.completedAt,
            pulledAt: r.pulledAt
          }
        })
      },

      // 재-pull 은 removed_at 을 되살린다 (R14). "이미 활성"인 경우의 거부는 서비스가 한다.
      pull: (taskId, dayKey) => {
        tx.insert(taskPulls)
          .values({ taskId, pullDate: dayKey })
          .onConflictDoUpdate({
            target: [taskPulls.taskId, taskPulls.pullDate],
            set: { removedAt: null }
          })
          .run()
      },

      // today-tasks R13: 그날 그 task 의 focus 세션 유무로 분기.
      remove: (taskId, dayKey) => {
        const sessionCount =
          tx
            .select({ n: sql<number>`count(*)` })
            .from(sessions)
            .where(
              and(
                eq(sessions.taskId, taskId),
                eq(sessions.localDate, dayKey),
                eq(sessions.kind, 'focus')
              )
            )
            .get()?.n ?? 0

        if (sessionCount >= 1) {
          tx.update(taskPulls)
            .set({ removedAt: now() })
            .where(and(eq(taskPulls.taskId, taskId), eq(taskPulls.pullDate, dayKey)))
            .run()
          return 'marked'
        }

        tx.delete(taskPulls)
          .where(and(eq(taskPulls.taskId, taskId), eq(taskPulls.pullDate, dayKey)))
          .run()
        return 'deleted'
      }
    },

    tasks: {
      create: (t) => {
        tx.insert(tasks)
          .values({
            id: t.id,
            weekItemId: t.weekItemId,
            title: t.title,
            completedAt: t.completedAt ?? null
          })
          .run()
      },

      toggleComplete: (taskId) => {
        const row = tx
          .select({ completedAt: tasks.completedAt })
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .get()
        if (!row) {
          throw new Error(`tasks.toggleComplete: task '${taskId}' not found`)
        }
        const next = row.completedAt === null ? now() : null
        tx.update(tasks).set({ completedAt: next }).where(eq(tasks.id, taskId)).run()
        return next
      },

      titleOf: (taskId) =>
        tx.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).get()?.title ??
        null,

      get: (taskId) => {
        const row = tx
          .select({ weekItemId: tasks.weekItemId, completedAt: tasks.completedAt })
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .get()
        return row ?? null
      }
    },

    sessions: {
      insert: (row) => {
        tx.insert(sessions)
          .values({
            id: row.id,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            durationSec: row.durationSec,
            kind: row.kind,
            taskId: row.taskId,
            localDate: row.localDate,
            localWeek: row.localWeek
          })
          .run()
      },

      attachTask: (sessionId, taskId, note) => {
        tx.update(sessions).set({ taskId, note }).where(eq(sessions.id, sessionId)).run()
      },

      get: (sessionId) => {
        const row = tx
          .select({
            id: sessions.id,
            startedAt: sessions.startedAt,
            endedAt: sessions.endedAt,
            durationSec: sessions.durationSec,
            kind: sessions.kind,
            taskId: sessions.taskId,
            localDate: sessions.localDate,
            localWeek: sessions.localWeek
          })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .get()
        return (row as SessionRow | undefined) ?? null
      },

      countFocusOn: (dayKey) =>
        tx
          .select({ n: sql<number>`count(*)` })
          .from(sessions)
          .where(and(eq(sessions.localDate, dayKey), eq(sessions.kind, 'focus')))
          .get()?.n ?? 0,

      focusCountSinceLastLong: () => {
        const lastLong = tx
          .select({ startedAt: sessions.startedAt })
          .from(sessions)
          .where(eq(sessions.kind, 'long'))
          .orderBy(desc(sessions.startedAt))
          .limit(1)
          .get()

        if (!lastLong) {
          return (
            tx
              .select({ n: sql<number>`count(*)` })
              .from(sessions)
              .where(eq(sessions.kind, 'focus'))
              .get()?.n ?? 0
          )
        }

        return (
          tx
            .select({ n: sql<number>`count(*)` })
            .from(sessions)
            .where(and(eq(sessions.kind, 'focus'), gt(sessions.startedAt, lastLong.startedAt)))
            .get()?.n ?? 0
        )
      }
    },

    /**
     * 캘린더 열람 (calendar-records R3 · A3).
     *
     * **이 블록의 모든 where 절은 `local_date` 범위 조건이거나 등치 비교뿐이다.**
     * `strftime()`·`date()` 를 씌우는 순간 `idx_sessions_local_date` 가 죽고, 더 나쁘게는
     * 조회 시점에 날짜를 파생하게 되어 타임존을 바꾼 사용자의 과거 점이 이동한다
     * (ADR-009 §2 가 금지한 것). A3 가 검사하는 것이 정확히 이것이다.
     */
    calendar: {
      focusCountsByDate: (from, to) =>
        tx
          .select({ dayKey: sessions.localDate, focusCount: sql<number>`count(*)` })
          .from(sessions)
          .where(
            and(
              gte(sessions.localDate, from),
              lte(sessions.localDate, to),
              // 휴식은 점 집계에 들어가지 않는다 (R12). 미분류 집중은 들어간다 (R13) —
              // task_id 를 거르지 않는 것이 그 요구사항의 구현이다.
              eq(sessions.kind, 'focus')
            )
          )
          .groupBy(sessions.localDate)
          .all(),

      pullDatesIn: (from, to) =>
        tx
          .selectDistinct({ pullDate: taskPulls.pullDate })
          .from(taskPulls)
          .where(and(gte(taskPulls.pullDate, from), lte(taskPulls.pullDate, to)))
          .all()
          .map((r) => r.pullDate),

      /**
       * `removed_at` 을 거르지 않는다 (R18 · A11). 치움 표시는 "지금 오늘 목록에 없다"는
       * 사실이지 "그날 목록에 없었다"가 아니다 — 거르면 그날 세션이 있는 조각을 × 로 뺀
       * 뒤 그 날짜 패널에서 사라진다.
       *
       * `idx_task_pulls_date` 를 탄다 (ADR-019 §8). PK 가 `(task_id, pull_date)` 순이라
       * 그 인덱스가 없으면 이 조회는 스캔이다.
       */
      pulledTasksOn: (dayKey) =>
        tx
          .select({ taskId: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
          .from(taskPulls)
          .innerJoin(tasks, eq(taskPulls.taskId, tasks.id))
          .where(and(eq(taskPulls.pullDate, dayKey), isNull(tasks.deletedAt)))
          .all(),

      sessionTasksOn: (dayKey) =>
        tx
          .selectDistinct({ taskId: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
          .from(sessions)
          .innerJoin(tasks, eq(sessions.taskId, tasks.id))
          .where(
            and(eq(sessions.localDate, dayKey), eq(sessions.kind, 'focus'), isNull(tasks.deletedAt))
          )
          .all(),

      studiedDayCount: (week) =>
        tx
          .select({ n: sql<number>`count(distinct ${sessions.localDate})` })
          .from(sessions)
          .where(and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus')))
          .get()?.n ?? 0
    },

    /**
     * 월 마일스톤 (milestones). 판정·순서는 서비스가 갖고 여기는 조회·실행만 한다.
     *
     * **`badgeCounts` 가 `archived_at` 을 거르지 않는 것이 이 블록의 핵심 규율이다**
     * (R21 · A21). 한 줄만 더하면 보관으로 달성률을 조작할 수 있게 된다.
     */
    milestones: {
      listForMonth: (month) =>
        tx
          .select({
            id: milestones.id,
            month: milestones.month,
            title: milestones.title,
            completedAt: milestones.completedAt,
            archivedAt: milestones.archivedAt
          })
          .from(milestones)
          .where(and(eq(milestones.month, month), isNull(milestones.archivedAt)))
          .orderBy(asc(milestones.sortOrder), asc(milestones.id))
          .all(),

      listArchivedForMonth: (month) =>
        tx
          .select({
            id: milestones.id,
            month: milestones.month,
            title: milestones.title,
            completedAt: milestones.completedAt,
            archivedAt: milestones.archivedAt
          })
          .from(milestones)
          .where(and(eq(milestones.month, month), isNotNull(milestones.archivedAt)))
          .orderBy(asc(milestones.sortOrder), asc(milestones.id))
          .all(),

      badgeCounts: (month) =>
        tx
          .select({
            // 보관을 거르지 않는다 (R21) — 분모는 "그 달에 존재했던" 수다.
            total: sql<number>`count(*)`,
            // 0행이면 SQLite 의 sum() 은 NULL 이다 — coalesce 없이는 `completed: null` 이
            // 계약을 통과하지 못한다 (listForWeek 의 `counts.done` 이 같은 함정을 밟았다).
            completed: sql<number>`coalesce(sum(case when ${milestones.completedAt} is not null then 1 else 0 end), 0)`,
            archivedCount: sql<number>`coalesce(sum(case when ${milestones.archivedAt} is not null then 1 else 0 end), 0)`
          })
          .from(milestones)
          .where(eq(milestones.month, month))
          .get() ?? { total: 0, completed: 0, archivedCount: 0 },

      carryCandidates: (month) =>
        tx
          .select({
            id: milestones.id,
            month: milestones.month,
            title: milestones.title,
            completedAt: milestones.completedAt,
            archivedAt: milestones.archivedAt
          })
          .from(milestones)
          // 보관 여부와 무관하게 후보로 낸다 (R22) — 고르는 것은 사용자다.
          .where(and(eq(milestones.month, month), isNull(milestones.completedAt)))
          .orderBy(asc(milestones.sortOrder), asc(milestones.id))
          .all(),

      nextSortOrder: (month) =>
        (tx
          .select({ maxOrder: sql<number | null>`max(${milestones.sortOrder})` })
          .from(milestones)
          .where(eq(milestones.month, month))
          .get()?.maxOrder ?? -1) + 1,

      create: (m) => {
        tx.insert(milestones)
          .values({ id: m.id, month: m.month, title: m.title, sortOrder: m.sortOrder })
          .run()
      },

      rename: (id, title) => {
        tx.update(milestones).set({ title }).where(eq(milestones.id, id)).run()
      },

      complete: (id, at) => {
        tx.update(milestones).set({ completedAt: at }).where(eq(milestones.id, id)).run()
      },

      uncomplete: (id) => {
        tx.update(milestones).set({ completedAt: null }).where(eq(milestones.id, id)).run()
      },

      archive: (id, at) => {
        tx.update(milestones).set({ archivedAt: at }).where(eq(milestones.id, id)).run()
      },

      unarchive: (id) => {
        tx.update(milestones).set({ archivedAt: null }).where(eq(milestones.id, id)).run()
      },

      /**
       * 물리 삭제 (ADR-014 §3). `week_items.milestone_id` FK 가 `ON DELETE SET NULL`
       * 이므로 연결돼 있던 할당은 사라지지 않고 미연결("기타")이 된다 — 조각·세션과 그
       * 소진 기록은 그대로다 (R8 · A8).
       */
      remove: (id) => {
        tx.delete(milestones).where(eq(milestones.id, id)).run()
      },

      /**
       * 롤업 (R16·R17). 마일스톤 → 할당 → 조각 → 세션 사슬을 탄다. 측정 시간은
       * `itemMeasuredSec()` 와 **같은 술어**여야 마일스톤 롤업과 주간 카드의 항목 시간이
       * 어긋나지 않는다 (성공 지표).
       *
       * **분모가 없다** — `sum(est_pomos)` 로 세던 `plannedPomos` 는 폐기된 통화와 함께
       * 죽었다 (ADR-030 §3). 롤업은 분수가 아니라 측정 시간 하나다.
       *
       * 폐기·삭제된 할당은 뺀다 — 화면에서 사라진 할당의 소진이 롤업에만 남으면 그 숫자를
       * 설명할 자리가 없다.
       */
      rollup: (month, week) =>
        tx
          .select({
            milestoneId: milestones.id,
            measuredSec: sql<number>`coalesce(sum(${itemMeasuredSec()}), 0)`
          })
          .from(milestones)
          .innerJoin(
            weekItems,
            and(
              eq(weekItems.milestoneId, milestones.id),
              eq(weekItems.week, week),
              isNull(weekItems.droppedAt),
              isNull(weekItems.deletedAt)
            )
          )
          .where(eq(milestones.month, month))
          .groupBy(milestones.id)
          .all(),

      linkedMilestone: (weekItemId) =>
        tx
          .select({
            id: milestones.id,
            month: milestones.month,
            title: milestones.title,
            completedAt: milestones.completedAt,
            archivedAt: milestones.archivedAt
          })
          .from(weekItems)
          .innerJoin(milestones, eq(weekItems.milestoneId, milestones.id))
          .where(eq(weekItems.id, weekItemId))
          .get() ?? null,

      setWeekItemMilestone: (weekItemId, milestoneId) => {
        tx.update(weekItems).set({ milestoneId }).where(eq(weekItems.id, weekItemId)).run()
      }
    },

    review: {
      /**
       * 두 테이블의 최소 주 키. 달력 키는 사전순 = 시간순이라 `MIN()` 이 곧 가장 이른
       * 주다 (ADR-009 §1). UNION 이 아니라 스칼라 2개의 최소를 쓰는 이유는, 두 컬럼의
       * 의미가 서로 다르고("세션이 있었다"·"계획이 있었다") 어느 하나만 있어도
       * "기록이 있다"로 쳐야 하기 때문이다 (R28).
       *
       * **세 번째 후보였던 `weeks.week` 는 테이블과 함께 사라졌다** (ADR-030 §4). 잃는
       * 것은 "계획만 있고 세션도 항목도 없는 주"가 최초 기록인 경우인데, 계획 확정은
       * 항목을 만들거나 이미 있는 항목을 그 주에 두므로 `week_items` 가 그 자리를
       * 대신한다. 남는 공백은 항목 0개로 확정한 주뿐이고, 폴백이 좁아지는 방향이라
       * 정산 범위가 그만큼 늦게 시작된다.
       */
      earliestRecordedWeek: () => {
        const min = (value: string | null | undefined): string | null => value ?? null
        const candidates = [
          min(
            tx
              .select({ w: sql<string | null>`min(${sessions.localWeek})` })
              .from(sessions)
              .get()?.w
          ),
          min(
            tx
              .select({ w: sql<string | null>`min(${weekItems.week})` })
              .from(weekItems)
              .get()?.w
          )
        ].filter((w): w is string => w !== null)

        return candidates.length === 0 ? null : candidates.reduce((a, b) => (a < b ? a : b))
      },

      /**
       * 술어는 `listPending` 과 **한 글자도 다르면 안 된다** — 배너가 말한 건수와 패널이
       * 보여주는 목록이 갈리기 때문이다. 그래서 조건을 아래 `pendingPredicate` 하나로
       * 뽑아 두 곳이 같은 것을 쓴다.
       */
      countPending: (from, to) =>
        tx
          .select({ n: sql<number>`count(*)` })
          .from(weekItems)
          .where(pendingPredicate(from, to))
          .get()?.n ?? 0,

      weekFacts: (from, to) => {
        /**
         * "기록이 있는 주" = 세션 1건 이상 **또는** 주간 항목 1건 이상 (technical-spec).
         * 완전히 빈 주는 행이 없어야 하므로 범위를 채우지 않고 실제 기록에서 길어 올린다.
         *
         * 항목 쪽에서 `deleted_at` 만 거른다. 삭제는 "없던 일"이지만(ADR-014 §1) 폐기는
         * 이력으로 남는 사실이라, 폐기 항목만 있는 주도 요약에 나타나야 한다.
         */
        const recorded = tx.all<{ w: string }>(sql`
            SELECT ${sessions.localWeek} AS w FROM ${sessions}
             WHERE ${sessions.localWeek} BETWEEN ${from} AND ${to}
            UNION
            SELECT ${weekItems.week} AS w FROM ${weekItems}
             WHERE ${weekItems.week} BETWEEN ${from} AND ${to}
               AND ${weekItems.deletedAt} IS NULL
            ORDER BY w
          `)

        return recorded.map(({ w }) => {
          const totals = tx
            .select({
              /** 0행이면 sum() 이 NULL 이므로 `coalesce` 로 0 을 만든다. */
              sec: sql<number>`coalesce(sum(${sessions.durationSec}), 0)`,
              days: sql<number>`count(distinct ${sessions.localDate})`
            })
            .from(sessions)
            .where(and(eq(sessions.localWeek, w), eq(sessions.kind, 'focus')))
            .get()

          /**
           * Σ 의 정의역은 **그 주에 화면 목록으로 표시되는 항목**이다 (ADR-027 §1) —
           * ADR-012 §4 수식의 `is_system = 0` 을 그렇게 읽는다. 폐기·삭제 항목을 Σ 에
           * 넣으면 그 소진이 요약의 어느 숫자에도 안 들어가 화면에서 증발한다.
           *
           * `tasks.deleted_at` 은 일부러 거르지 않는다 — `listForWeek` 의 항목 측정 시간과
           * 같은 술어여야 차액 항등식이 성립한다 (ADR-027 §2).
           */
          const planned = tx
            .select({ sec: sql<number>`coalesce(sum(${sessions.durationSec}), 0)` })
            .from(sessions)
            .innerJoin(tasks, eq(sessions.taskId, tasks.id))
            .innerJoin(weekItems, eq(tasks.weekItemId, weekItems.id))
            .where(
              and(
                eq(sessions.localWeek, w),
                eq(sessions.kind, 'focus'),
                eq(weekItems.week, w),
                eq(weekItems.isSystem, 0),
                isNull(weekItems.droppedAt),
                isNull(weekItems.deletedAt)
              )
            )
            .get()

          const measuredSec = totals?.sec ?? 0
          return {
            week: w,
            studiedDays: totals?.days ?? 0,
            measuredSec,
            /**
             * 차액은 **초 단계에서** 낸다 (ADR-031 §2) — 분으로 접은 값끼리 빼면 항목이
             * 여럿일 때 차액이 음수로 뒤집힌다. 클램프하지 않는 이유도 주간 카드 기타
             * 행과 같다: 음수는 감출 값이 아니라 드러나야 할 술어 버그다.
             */
            unplannedMeasuredSec: measuredSec - (planned?.sec ?? 0)
          }
        })
      },

      lastStudied: () => {
        const row = tx
          .select({
            week: sessions.localWeek,
            measuredSec: sql<number>`coalesce(sum(${sessions.durationSec}), 0)`
          })
          .from(sessions)
          .where(eq(sessions.kind, 'focus'))
          .groupBy(sessions.localWeek)
          .orderBy(desc(sessions.localWeek))
          .limit(1)
          .get()
        return row ?? null
      },

      listPending: (from, to) =>
        tx
          .select({
            id: weekItems.id,
            week: weekItems.week,
            title: weekItems.title,
            originWeek: weekItems.originWeek,
            milestoneId: weekItems.milestoneId,
            measuredSec: itemMeasuredSec()
          })
          .from(weekItems)
          .where(pendingPredicate(from, to))
          .orderBy(asc(weekItems.week), asc(weekItems.createdAt), sql`week_items.rowid`)
          .all(),

      listCompleted: (from, to) =>
        tx
          .select({
            id: weekItems.id,
            week: weekItems.week,
            title: weekItems.title,
            measuredSec: itemMeasuredSec()
          })
          .from(weekItems)
          .where(
            and(
              gte(weekItems.week, from),
              lte(weekItems.week, to),
              isNotNull(weekItems.completedAt),
              isNull(weekItems.droppedAt),
              isNull(weekItems.deletedAt),
              eq(weekItems.isSystem, 0)
            )
          )
          .orderBy(asc(weekItems.week), asc(weekItems.createdAt), sql`week_items.rowid`)
          .all(),

      applySettlement: ({ targetWeek, drops, carries, at }) => {
        // 4. 폐기 — soft. 원본 행은 남는다 (ADR-014 §1).
        for (const id of drops) {
          tx.update(weekItems)
            .set({ droppedAt: at, updatedAt: at })
            .where(eq(weekItems.id, id))
            .run()
        }

        // 5. 이월 — 계획 대상 주에 **행을 새로 만든다** (UPDATE 아님).
        //    원본을 옮기면 origin_week 박제와 "그 주에 무엇이 남았는가"라는 과거 사실이
        //    동시에 파괴된다 (Q12).
        const carried: { sourceItemId: string; newItemId: string }[] = []
        for (const { sourceId } of carries) {
          const src = tx
            .select({
              title: weekItems.title,
              milestoneId: weekItems.milestoneId,
              originWeek: weekItems.originWeek
            })
            .from(weekItems)
            .where(eq(weekItems.id, sourceId))
            .get()
          if (!src) continue

          const newId = uuidv7()
          tx.insert(weekItems)
            .values({
              id: newId,
              week: targetWeek,
              title: src.title,
              milestoneId: src.milestoneId, // 마일스톤 승계 (ADR-012 §3)
              days: '[]', // 요일 배치는 플래너에서 다시 (week-plan)
              originWeek: src.originWeek, // 박제 승계 — 배지의 근거 (Q12)
              carryFromId: sourceId, // 직전 원본. 이력 전용
              isSystem: 0,
              createdAt: at,
              updatedAt: at
            })
            .run()

          /**
           * 5b. 미완료 조각 재부모화 (ADR-012 §3). 이것이 있어야 "지난 주 미완료 조각을
           * 이번 주에 재개"가 성립한다. 항목은 "그 주의 계획이었다"는 사실이라 옮기지
           * 않지만, 조각은 "무엇을 할 것인가"라서 옮긴다.
           *
           * 이미 붙은 세션의 귀속은 움직이지 않는다 — 항목 소진이 주 조건으로 집계되므로
           * 과거 주의 숫자가 소급해 변하지 않는다.
           */
          tx.update(tasks)
            .set({ weekItemId: newId, updatedAt: at })
            .where(
              and(
                eq(tasks.weekItemId, sourceId),
                isNull(tasks.completedAt),
                isNull(tasks.deletedAt)
              )
            )
            .run()

          carried.push({ sourceItemId: sourceId, newItemId: newId })
        }

        /**
         * **6단계가 없다.** 예전에는 정산 범위의 각 주와 계획 대상 주에 `weeks` 행을
         * 만들고 `settled_at` 을 찍었다. 박제하던 것(예산·가용량·길이)이 전부 폐기된
         * 통화이고(ADR-030 §4), `settled_at` 은 어떤 화면도 읽지 않는다 — 정산 필요
         * 판정은 `settings.last_settled_week` 워터마크 단독이다. 그 행을 요구하던
         * FK(`sessions.local_week` → `weeks.week`)도 테이블과 함께 사라졌다.
         */
        return { carried }
      }
    }
  }
}

/**
 * 정산 3택 대상의 술어 (technical-spec "3택 대상 조회 조건").
 *
 * 완료는 3택 대상이 아니고(Q14), 폐기·삭제된 항목은 이미 처분됐으며(ADR-014 §1),
 * 시스템 "기타" 항목은 제외된다(Q7). 주 범위 비교가 문자열 비교인 것은 달력 키가
 * 사전순 = 시간순이기 때문이다 (ADR-009 §1).
 */
/**
 * 항목 측정 시간(초)의 상관 서브쿼리 (ADR-012 §1). `listForWeek` 은 항목 목록을 이미
 * 주 하나로 좁혀 놓고 합하지만, 정산·마일스톤 롤업은 **여러 주의 항목을 한 목록에**
 * 담으므로 행마다 자기 주를 조건으로 써야 한다 — `week_items.week` 를 상관 참조하는
 * 것이 그 차이다.
 *
 * 주 조건이 빠지면 주 경계를 넘긴 세션이 두 항목에서 세어지고 에러 없이 숫자만 틀린다.
 * `listForWeek` 의 술어와 한 글자도 다르면 안 된다 — 갈리면 마일스톤 롤업과 주간 카드가
 * 같은 사실에 다른 숫자를 말한다 (milestones 성공 지표). `tasks.deleted_at` 을 거르지
 * 않는 것도 같은 이유다 (ADR-027 §2).
 *
 * 서브쿼리 전체를 raw SQL 로 쓴다. drizzle 의 컬럼 참조(`${weekItems.id}`)는 select
 * 필드의 `sql` 템플릿 안에서 **테이블 접두사 없이** `"id"` 로 렌더되고(실측), 그러면
 * 서브쿼리의 `tasks.id` 와 겹쳐 `ambiguous column name: id` 로 죽는다. 상관 참조는
 * 반드시 테이블명으로 수식해야 한다.
 */
function itemMeasuredSec(): SQL<number> {
  return sql<number>`(
    SELECT coalesce(sum(s.duration_sec), 0) FROM sessions s
      JOIN tasks t ON s.task_id = t.id
     WHERE t.week_item_id = week_items.id
       AND s.kind = 'focus'
       AND s.local_week = week_items.week
  )`
}

function pendingPredicate(from: string, to: string) {
  return and(
    gte(weekItems.week, from),
    lte(weekItems.week, to),
    isNull(weekItems.completedAt),
    isNull(weekItems.droppedAt),
    isNull(weekItems.deletedAt),
    eq(weekItems.isSystem, 0)
  )
}

/**
 * Drizzle/better-sqlite3 위의 UnitOfWork 구현체 (ADR-015 §3).
 *
 * `db.transaction()` 에 넘기는 콜백은 동기다 — async 콜백은 `drizzle-orm#2275` 때문에
 * 트랜잭션이 커밋된 뒤에 실행된다. 포트가 동기인 이유가 이것이다.
 *
 * 중첩은 막는다. better-sqlite3 는 savepoint 로 중첩을 지원하지만, 유스케이스 하나가
 * 트랜잭션 하나(ADR-007)이므로 중첩은 호출 실수를 뜻한다. 조용히 동작하게 두면 안쪽
 * `run` 이 끝날 때 커밋된 것으로 오해하기 쉽다.
 */
export function makeDrizzleUow(db: BetterSQLite3Database): UnitOfWork {
  let inTransaction = false
  return {
    run: (work) => {
      if (inTransaction) {
        throw new Error(
          'UnitOfWork.run cannot nest — one use case is one transaction (ADR-007). ' +
            'Pass the existing repos down instead of opening another unit of work.'
        )
      }
      inTransaction = true
      try {
        return db.transaction((tx) => work(makeRepos(tx)))
      } finally {
        inTransaction = false
      }
    }
  }
}
