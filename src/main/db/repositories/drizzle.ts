import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
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

      // 행이 없을 때만 만든다 (weekly-review R37 — 있는 행의 길이 스냅샷은 덮지 않는다).
      ensure: (week, baseline) => {
        tx.insert(weeks)
          .values({
            week,
            focusMin: baseline.focusMin,
            shortBreakMin: baseline.shortBreakMin,
            longBreakMin: baseline.longBreakMin
          })
          .onConflictDoNothing({ target: weeks.week })
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
          .get()?.week ?? null
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
        null
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
    }
  }
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
