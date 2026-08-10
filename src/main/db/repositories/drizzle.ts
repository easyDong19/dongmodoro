import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { v7 as uuidv7 } from 'uuid'
import { settings, weeks, weekItems, tasks, taskPulls, sessions } from '../schema'
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

    weeks: {
      baseline: (week) => {
        const row = tx
          .select({
            focusMin: weeks.focusMin,
            shortBreakMin: weeks.shortBreakMin,
            longBreakMin: weeks.longBreakMin
          })
          .from(weeks)
          .where(eq(weeks.week, week))
          .get()
        return row ?? null
      },

      /**
       * 행이 없을 때만 만든다. `onConflictDoNothing` 이 곧 "있는 행의 스냅샷은 덮지
       * 않는다"는 규칙의 구현이다 (ADR-013 §3) — `DoUpdate` 로 바꾸는 순간 지각 정산이
       * 진행 중인 주의 단위를 바꾸게 된다.
       *
       * capacity 는 JSON 문자열로 넣는다. 스키마의 `weeks_capacity_shape` CHECK 가
       * 길이 7 · 원소 전부 0 이상 정수를 재검증한다 (ADR-021 §3).
       */
      ensure: (week, snapshot) => {
        tx.insert(weeks)
          .values({
            week,
            focusMin: snapshot.focusMin,
            shortBreakMin: snapshot.shortBreakMin,
            longBreakMin: snapshot.longBreakMin,
            capacity: snapshot.capacity === null ? null : JSON.stringify(snapshot.capacity),
            budget: snapshot.budget
          })
          .onConflictDoNothing({ target: weeks.week })
          .run()
      },

      plan: (week) => {
        const row = tx
          .select({ budget: weeks.budget, capacity: weeks.capacity, plannedAt: weeks.plannedAt })
          .from(weeks)
          .where(eq(weeks.week, week))
          .get()
        if (!row) return null
        return {
          budget: row.budget,
          capacity: row.capacity === null ? null : (JSON.parse(row.capacity) as number[]),
          plannedAt: row.plannedAt
        }
      },

      // planned_at 은 최초 확정 시각만 담는다 (week-plan R23·A31). COALESCE 가 그 규칙이다 —
      // `set({ plannedAt: now() })` 로 쓰면 주중 재수정마다 갱신되어 "언제 계획했나"가
      // "마지막으로 손댄 시각"으로 변질된다.
      setPlan: (week, budget) => {
        tx.update(weeks)
          .set({ budget, plannedAt: sql`COALESCE(${weeks.plannedAt}, ${now()})` })
          .where(eq(weeks.week, week))
          .run()
      }
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
            estPomos: 0,
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
            estPomos: weekItems.estPomos,
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
           *   · `spentPomos` = "이 항목 몫으로 실제로 한 집중" → 조각을 지워도 집중은 있었다
           *   · `counts`     = "지금 남아 있는 조각 중 몇 개를 끝냈나" → 완료 제안의 재료
           * 여기에 `deleted_at` 필터를 더하면 삭제된 조각의 소진이 항목에서 사라지는데
           * `weekTotalSpent` 는 그대로라, 차액이 조용히 기타 행으로 새어 A24 가 깨진다.
           * 비대칭이 버그로 보여도 고치지 말 것 — 차액 항등식이 이것에 의존한다 (ADR-027 §2).
           */
          const spentPomos =
            tx
              .select({ n: sql<number>`count(*)` })
              .from(sessions)
              .innerJoin(tasks, eq(sessions.taskId, tasks.id))
              .where(
                and(
                  eq(tasks.weekItemId, r.id),
                  eq(sessions.kind, 'focus'),
                  eq(sessions.localWeek, week)
                )
              )
              .get()?.n ?? 0

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
            estPomos: r.estPomos,
            days: JSON.parse(r.days) as number[],
            originWeek: r.originWeek,
            completedAt: r.completedAt,
            spentPomos,
            childTotal: counts?.total ?? 0,
            childDone: counts?.done ?? 0
          }
        })
      },

      weekTotalSpent: (week) =>
        tx
          .select({ n: sql<number>`count(*)` })
          .from(sessions)
          .where(and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus')))
          .get()?.n ?? 0,

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
                estPomos: item.estPomos,
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
            .set({ title: item.title, estPomos: item.estPomos, days })
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
          .select({
            taskId: tasks.id,
            title: tasks.title,
            estPomos: tasks.estPomos,
            completedAt: tasks.completedAt
          })
          .from(tasks)
          .where(and(eq(tasks.weekItemId, weekItemId), isNull(tasks.deletedAt)))
          .orderBy(asc(tasks.createdAt), sql`tasks.rowid`)
          .all()

        return rows.map((r) => {
          // 조각 단위 소진에는 주 조건을 걸지 않는다 — 이 숫자가 답하는 질문은 "이 조각으로
          // 몇 뽀모 했나"이지 "이 주에 몇 뽀모 했나"가 아니다. 주 조건은 항목 소진(R8)의 것이다.
          const spentPomos =
            tx
              .select({ n: sql<number>`count(*)` })
              .from(sessions)
              .where(and(eq(sessions.taskId, r.taskId), eq(sessions.kind, 'focus')))
              .get()?.n ?? 0

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

          return { ...r, spentPomos, inToday: active !== undefined }
        })
      },

      // task_pulls 의 PK 가 (task_id, pull_date) 이고 조인 조건에 pullDate 가 고정돼 있으므로
      // task 당 조인 행은 최대 1개다 — 중복 행이 나오지 않는다.
      nextPullable: (weekItemId, dayKey) =>
        tx
          .select({ id: tasks.id })
          .from(tasks)
          .leftJoin(taskPulls, and(eq(taskPulls.taskId, tasks.id), eq(taskPulls.pullDate, dayKey)))
          .where(
            and(
              eq(tasks.weekItemId, weekItemId),
              isNull(tasks.deletedAt),
              isNull(tasks.completedAt),
              // 오늘 pull 행이 없거나, 있어도 치워진 행이면 다시 유자격이다 (R14).
              sql`(${taskPulls.taskId} IS NULL OR ${taskPulls.removedAt} IS NOT NULL)`
            )
          )
          .orderBy(asc(tasks.createdAt), sql`tasks.rowid`)
          .get()?.id ?? null,

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
            estPomos: tasks.estPomos,
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
          const spentPomos =
            tx
              .select({ n: sql<number>`count(*)` })
              .from(sessions)
              .where(and(eq(sessions.taskId, r.taskId), eq(sessions.kind, 'focus')))
              .get()?.n ?? 0

          return {
            taskId: r.taskId,
            title: r.title,
            sourceTitle: r.isSystem === 1 ? null : r.sourceTitle,
            sourceWeek: r.sourceWeek,
            estPomos: r.estPomos,
            spentPomos,
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
            estPomos: t.estPomos ?? null,
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

    review: {
      /**
       * 세 테이블의 최소 주 키. 달력 키는 사전순 = 시간순이라 `MIN()` 이 곧 가장 이른
       * 주다 (ADR-009 §1). UNION 이 아니라 스칼라 3개의 최소를 쓰는 이유는, 세 컬럼의
       * 의미가 서로 다르고("세션이 있었다"·"계획이 있었다"·"주 행이 생겼다") 어느
       * 하나만 있어도 "기록이 있다"로 쳐야 하기 때문이다 (R28).
       *
       * `week_items` 는 삭제된 행을 빼지 않는다 — 삭제됐어도 **그 주에 무언가 있었다는
       * 사실**은 남고, 폴백은 정산 범위를 넓히는 쪽이 안전하다.
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
          ),
          min(
            tx
              .select({ w: sql<string | null>`min(${weeks.week})` })
              .from(weeks)
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
              spent: sql<number>`count(*)`,
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
           * `tasks.deleted_at` 은 일부러 거르지 않는다 — `listForWeek` 의 항목 소진과
           * 같은 술어여야 차액 항등식이 성립한다 (ADR-027 §2).
           */
          const planned =
            tx
              .select({ n: sql<number>`count(*)` })
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
              .get()?.n ?? 0

          const spentPomos = totals?.spent ?? 0
          return {
            week: w,
            studiedDays: totals?.days ?? 0,
            spentPomos,
            budget:
              tx.select({ budget: weeks.budget }).from(weeks).where(eq(weeks.week, w)).get()
                ?.budget ?? null,
            unplannedPomos: spentPomos - planned
          }
        })
      },

      lastStudied: () => {
        const row = tx
          .select({ week: sessions.localWeek, spentPomos: sql<number>`count(*)` })
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
            estPomos: weekItems.estPomos,
            originWeek: weekItems.originWeek,
            milestoneId: weekItems.milestoneId,
            spentPomos: itemSpent()
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
            spentPomos: itemSpent()
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
          .all()
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
 * 항목 소진의 상관 서브쿼리 (ADR-012 §1). `listForWeek` 은 항목 목록을 이미 주 하나로
 * 좁혀 놓고 세지만, 정산은 **여러 주의 항목을 한 목록에** 담으므로 행마다 자기 주를
 * 조건으로 써야 한다 — `week_items.week` 를 상관 참조하는 것이 그 차이다.
 *
 * 주 조건이 빠지면 주 경계를 넘긴 세션이 두 항목에서 세어지고 에러 없이 숫자만 틀린다.
 * `tasks.deleted_at` 을 거르지 않는 것도 `listForWeek` 과 같다 (ADR-027 §2).
 */
function itemSpent(): SQL<number> {
  /**
   * 서브쿼리 전체를 raw SQL 로 쓴다. drizzle 의 컬럼 참조(`${weekItems.id}`)는 select
   * 필드의 `sql` 템플릿 안에서 **테이블 접두사 없이** `"id"` 로 렌더되고(실측), 그러면
   * 서브쿼리의 `tasks.id` 와 겹쳐 `ambiguous column name: id` 로 죽는다. 상관 참조는
   * 반드시 테이블명으로 수식해야 한다.
   */
  return sql<number>`(
    SELECT count(*) FROM sessions s
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
