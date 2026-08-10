import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v7 as uuidv7 } from 'uuid'
import type { UnitOfWork } from '../../services/ports'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

/** ADR-023 §3 — 인메모리 실 SQLite. settings.test.ts 와 같은 대역. */
function drizzleUowOnMemoryDb(): UnitOfWork {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  return makeDrizzleUow(db)
}

const LENGTHS = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }
/** `weeks.ensure` 는 길이뿐 아니라 계획 의사까지 받는다 (weekly-review R37). */
const BASELINE = { ...LENGTHS, capacity: null, budget: null }

describe('WeeksRepository', () => {
  it('ensure creates a row only when absent, and is idempotent', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    uow.run((r) => r.weeks.ensure(week, BASELINE))
    expect(uow.run((r) => r.weeks.baseline(week))).toEqual(LENGTHS)
    // 두 번째 ensure — 다른 길이를 넘겨도 기존 스냅샷을 덮지 않는다 (weekly-review R37).
    uow.run((r) =>
      r.weeks.ensure(week, { ...BASELINE, focusMin: 50, shortBreakMin: 10, longBreakMin: 30 })
    )
    expect(uow.run((r) => r.weeks.baseline(week))).toEqual(LENGTHS)
  })

  it('baseline returns null when the row is absent', () => {
    const uow = drizzleUowOnMemoryDb()
    expect(uow.run((r) => r.weeks.baseline('2026-08-03'))).toBeNull()
  })
})

describe('WeekItemsRepository', () => {
  it('ensureSystemItem creates at most one 기타 item per week, est=0', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    const id1 = uow.run((r) => r.weekItems.ensureSystemItem(week))
    const id2 = uow.run((r) => r.weekItems.ensureSystemItem(week))
    expect(id1).toBe(id2)
    expect(uow.run((r) => r.weekItems.weekOf(id1))).toBe(week)
  })

  it('weekOf returns null for a missing week item', () => {
    const uow = drizzleUowOnMemoryDb()
    expect(uow.run((r) => r.weekItems.weekOf('nope'))).toBeNull()
  })
})

describe('TodayRepository', () => {
  function seedTask(uow: UnitOfWork, week: string): string {
    const weekItemId = uow.run((r) => r.weekItems.ensureSystemItem(week))
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'a task' }))
    return taskId
  }

  it('list filters out removed pulls and deleted tasks', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    const day = '2026-08-03'
    const taskId = seedTask(uow, week)
    uow.run((r) => r.today.pull(taskId, day))

    const rows = uow.run((r) => r.today.list(day))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ taskId, sourceTitle: null, sourceWeek: week, spentPomos: 0 })

    // remove with 0 sessions -> deleted -> disappears from list
    uow.run((r) => r.today.remove(taskId, day))
    expect(uow.run((r) => r.today.list(day))).toHaveLength(0)
  })

  it('pull re-called on a removed row revives it (R14)', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    const day = '2026-08-03'
    const taskId = seedTask(uow, week)
    uow.run((r) => r.today.pull(taskId, day))
    uow.run((r) => r.today.remove(taskId, day)) // no sessions -> deleted
    uow.run((r) => r.today.pull(taskId, day)) // re-pull
    expect(uow.run((r) => r.today.list(day))).toHaveLength(1)
  })
})

describe('today.remove branch (today-tasks R13)', () => {
  it('deletes the pull row when there are 0 focus sessions that day', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    const day = '2026-08-03'
    const weekItemId = uow.run((r) => r.weekItems.ensureSystemItem(week))
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))
    uow.run((r) => r.today.pull(taskId, day))

    const result = uow.run((r) => r.today.remove(taskId, day))
    expect(result).toBe('deleted')
    expect(uow.run((r) => r.today.list(day))).toHaveLength(0)
  })

  it('marks removed_at (keeps the row) when there is >=1 focus session that day', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    const day = '2026-08-03'
    uow.run((r) => r.weeks.ensure(week, BASELINE))
    const weekItemId = uow.run((r) => r.weekItems.ensureSystemItem(week))
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))
    uow.run((r) => r.today.pull(taskId, day))
    uow.run((r) =>
      r.sessions.insert({
        id: uuidv7(),
        startedAt: '2026-08-03T09:00:00.000Z',
        endedAt: '2026-08-03T09:25:00.000Z',
        durationSec: 1500,
        kind: 'focus',
        taskId,
        localDate: day,
        localWeek: week
      })
    )

    const result = uow.run((r) => r.today.remove(taskId, day))
    expect(result).toBe('marked')
    // marked (removed_at set) -> list() 에서는 빠지지만 행은 살아있다 (재-pull 로 확인).
    expect(uow.run((r) => r.today.list(day))).toHaveLength(0)
    uow.run((r) => r.today.pull(taskId, day))
    expect(uow.run((r) => r.today.list(day))).toHaveLength(1)
  })
})

describe('TasksRepository', () => {
  it('toggleComplete flips null <-> instant, throws when task is missing', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    const weekItemId = uow.run((r) => r.weekItems.ensureSystemItem(week))
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))

    const first = uow.run((r) => r.tasks.toggleComplete(taskId))
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const second = uow.run((r) => r.tasks.toggleComplete(taskId))
    expect(second).toBeNull()

    expect(() => uow.run((r) => r.tasks.toggleComplete('nope'))).toThrow()
  })

  it('titleOf returns null when the task is missing', () => {
    const uow = drizzleUowOnMemoryDb()
    expect(uow.run((r) => r.tasks.titleOf('nope'))).toBeNull()
  })
})

describe('SessionsRepository', () => {
  it('insert fails without a weeks row for local_week (FK, ADR-019 §4)', () => {
    const uow = drizzleUowOnMemoryDb()
    expect(() =>
      uow.run((r) =>
        r.sessions.insert({
          id: uuidv7(),
          startedAt: '2026-08-03T09:00:00.000Z',
          endedAt: '2026-08-03T09:25:00.000Z',
          durationSec: 1500,
          kind: 'focus',
          taskId: null,
          localDate: '2026-08-03',
          localWeek: '2026-08-03'
        })
      )
    ).toThrow()
  })

  it('insert succeeds once weeks.ensure has run, and get() round-trips', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    uow.run((r) => r.weeks.ensure(week, BASELINE))
    const id = uuidv7()
    const row = {
      id,
      startedAt: '2026-08-03T09:00:00.000Z',
      endedAt: '2026-08-03T09:25:00.000Z',
      durationSec: 1500,
      kind: 'focus' as const,
      taskId: null,
      localDate: '2026-08-03',
      localWeek: week
    }
    uow.run((r) => r.sessions.insert(row))
    expect(uow.run((r) => r.sessions.get(id))).toEqual(row)
  })

  it('countFocusOn counts only that date, and attachTask updates task_id', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    uow.run((r) => r.weeks.ensure(week, BASELINE))
    const weekItemId = uow.run((r) => r.weekItems.ensureSystemItem(week))
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))

    const sid = uuidv7()
    uow.run((r) =>
      r.sessions.insert({
        id: sid,
        startedAt: '2026-08-03T09:00:00.000Z',
        endedAt: '2026-08-03T09:25:00.000Z',
        durationSec: 1500,
        kind: 'focus',
        taskId: null,
        localDate: '2026-08-03',
        localWeek: week
      })
    )
    expect(uow.run((r) => r.sessions.countFocusOn('2026-08-03'))).toBe(1)
    expect(uow.run((r) => r.sessions.countFocusOn('2026-08-04'))).toBe(0)

    uow.run((r) => r.sessions.attachTask(sid, taskId, 'note'))
    expect(uow.run((r) => r.sessions.get(sid))?.taskId).toBe(taskId)
  })

  it('focusCountSinceLastLong counts focus sessions after the last long one', () => {
    const uow = drizzleUowOnMemoryDb()
    const week = '2026-08-03'
    uow.run((r) => r.weeks.ensure(week, BASELINE))

    const mk = (kind: 'focus' | 'long', minute: number) => ({
      id: uuidv7(),
      startedAt: `2026-08-03T0${minute}:00:00.000Z`,
      endedAt: `2026-08-03T0${minute}:25:00.000Z`,
      durationSec: 1500,
      kind,
      taskId: null,
      localDate: '2026-08-03',
      localWeek: week
    })

    uow.run((r) => r.sessions.insert(mk('focus', 1)))
    uow.run((r) => r.sessions.insert(mk('focus', 2)))
    uow.run((r) => r.sessions.insert(mk('focus', 3)))
    expect(uow.run((r) => r.sessions.focusCountSinceLastLong())).toBe(3)

    uow.run((r) => r.sessions.insert(mk('long', 4)))
    expect(uow.run((r) => r.sessions.focusCountSinceLastLong())).toBe(0)

    uow.run((r) => r.sessions.insert(mk('focus', 5)))
    expect(uow.run((r) => r.sessions.focusCountSinceLastLong())).toBe(1)
  })
})
