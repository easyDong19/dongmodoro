import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork } from '../../services/ports'
import { makeDrizzleUow } from './drizzle'
import { seedSettings } from '../../services/seed'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

/**
 * Test helper: in-memory SQLite DB with migrations applied.
 */
function drizzleUowOnMemoryDb(): UnitOfWork {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  return makeDrizzleUow(db)
}

describe('seedSettings — ADR-018 §4', () => {
  it('빈 DB 에 정적 시딩 4종을 넣는다 (weekly_capacity 는 넣지 않는다)', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    expect(uow.run((r) => r.settings.get('focus_min'))).toBe('25')
    expect(uow.run((r) => r.settings.get('short_break_min'))).toBe('5')
    expect(uow.run((r) => r.settings.get('long_break_min'))).toBe('15')
    expect(uow.run((r) => r.settings.get('plan_lead_days'))).toBe('1')
    expect(uow.run((r) => r.settings.get('theme'))).toBe('"dark"')
    expect(uow.run((r) => r.settings.get('weekly_capacity'))).toBeNull()
  })

  it('멱등 — 이미 있는 키는 건드리지 않는다', () => {
    const uow = drizzleUowOnMemoryDb()
    uow.run((r) => r.settings.set('focus_min', '50'))
    seedSettings(uow)
    expect(uow.run((r) => r.settings.get('focus_min'))).toBe('50')
  })
})
