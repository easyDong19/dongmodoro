import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v7 as uuidv7 } from 'uuid'
import type { UnitOfWork } from '../../services/ports'
import {
  listToday,
  addDirect,
  pullTask,
  removeTask,
  toggleTaskComplete
} from '../../services/today'
import { localKeys } from '../../../shared/time'
import { weekItems } from '../schema'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

/**
 * 오늘 목록 유스케이스(Task 7) 테스트 — ADR-023 §3 대역: 인메모리 실 SQLite.
 * `today.ts` 는 서비스라 drizzle 을 직접 import 하지 않으므로(DB_IMPORT_PATTERN),
 * 이 파일은 baseline.test.ts 와 같은 이유로 `db/repositories/` 아래 둔다.
 */
function drizzleUowOnMemoryDb(): { uow: UnitOfWork; db: ReturnType<typeof drizzle> } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  return { uow: makeDrizzleUow(db), db }
}

/** 임의의 (시스템이 아닌) 주간 항목을 특정 주에 직접 심는다 — 지난 주 케이스 재현용.
 * 포트에는 일반 weekItems 생성 메서드가 없으므로(ADR-015 §1 — 유스케이스 단위),
 * 이 파일은 db/repositories 아래라 스키마를 직접 다룰 수 있다. */
function seedWeekItem(db: ReturnType<typeof drizzle>, week: string, title: string): string {
  const id = uuidv7()
  db.insert(weekItems)
    .values({ id, week, title, estPomos: 1, days: '[]', originWeek: week, isSystem: 0 })
    .run()
  return id
}

describe('today.list (today-tasks R4)', () => {
  it('sorts incomplete first, then by pull order within each group', () => {
    const { uow, db } = drizzleUowOnMemoryDb()
    const weekItemId = seedWeekItem(db, '2026-08-03', 'source')

    const a = uuidv7()
    const b = uuidv7()
    const c = uuidv7()
    uow.run((r) => r.tasks.create({ id: a, weekItemId, title: 'a' }))
    uow.run((r) => r.tasks.create({ id: b, weekItemId, title: 'b' }))
    uow.run((r) => r.tasks.create({ id: c, weekItemId, title: 'c' }))

    // pull order: a, b, c
    const { localDate } = localKeys()
    uow.run((r) => r.today.pull(a, localDate))
    uow.run((r) => r.today.pull(b, localDate))
    uow.run((r) => r.today.pull(c, localDate))
    // complete a — should move to the end despite being pulled first
    uow.run((r) => r.tasks.toggleComplete(a))

    const result = listToday(uow)
    expect(result.rows.map((row) => row.taskId)).toEqual([b, c, a])
  })
})

describe('addDirect (today-tasks R9)', () => {
  it('creates a task under the system 기타 item and pulls it today, in one tx', () => {
    const { uow } = drizzleUowOnMemoryDb()
    const result = addDirect(uow, '테스트')
    const { rows } = listToday(uow)
    expect(rows).toHaveLength(1)
    expect(rows[0].sourceTitle).toBeNull() // 기타 항목
    expect(rows[0].title).toBe('테스트')
    expect(result.itemWeek).toBe(rows[0].sourceWeek)
  })

  it('trims the title and rejects an empty (or whitespace-only) title', () => {
    const { uow } = drizzleUowOnMemoryDb()
    expect(() => addDirect(uow, '   ')).toThrow()
    expect(() => addDirect(uow, '')).toThrow()

    addDirect(uow, '  spaced  ')
    const { rows } = listToday(uow)
    expect(rows[0].title).toBe('spaced')
  })
})

describe('pullTask (today-tasks R7)', () => {
  it('rejects pulling a completed task', () => {
    const { uow, db } = drizzleUowOnMemoryDb()
    const weekItemId = seedWeekItem(db, '2026-08-03', 'source')
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))
    uow.run((r) => r.tasks.toggleComplete(taskId))

    expect(() => pullTask(uow, taskId)).toThrow()
  })

  it('rejects a duplicate pull when the task is already active in today', () => {
    const { uow, db } = drizzleUowOnMemoryDb()
    const weekItemId = seedWeekItem(db, '2026-08-03', 'source')
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))

    pullTask(uow, taskId)
    expect(() => pullTask(uow, taskId)).toThrow()
  })

  it('returns the parent item week as itemWeek', () => {
    const { uow, db } = drizzleUowOnMemoryDb()
    const week = '2026-07-27' // a past monday
    const weekItemId = seedWeekItem(db, week, 'old source')
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))

    const result = pullTask(uow, taskId)
    expect(result.itemWeek).toBe(week)
  })
})

describe('removeTask (today-tasks R13)', () => {
  it('returns the parent item week', () => {
    const { uow, db } = drizzleUowOnMemoryDb()
    const week = '2026-07-27'
    const weekItemId = seedWeekItem(db, week, 'old source')
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))
    pullTask(uow, taskId)

    const result = removeTask(uow, taskId)
    expect(result.itemWeek).toBe(week)
    expect(listToday(uow).rows).toHaveLength(0)
  })
})

describe('toggleTaskComplete (ADR-025 사건 5)', () => {
  it('parentWeek reflects the parent item week even when it is a past week', () => {
    const { uow, db } = drizzleUowOnMemoryDb()
    const week = '2026-07-27' // last week relative to any 'today' in these tests
    const weekItemId = seedWeekItem(db, week, 'old source')
    const taskId = uuidv7()
    uow.run((r) => r.tasks.create({ id: taskId, weekItemId, title: 'x' }))

    const first = toggleTaskComplete(uow, taskId)
    expect(first.parentWeek).toBe(week)
    expect(first.completedAt).not.toBeNull()

    const second = toggleTaskComplete(uow, taskId)
    expect(second.parentWeek).toBe(week)
    expect(second.completedAt).toBeNull()
  })
})
