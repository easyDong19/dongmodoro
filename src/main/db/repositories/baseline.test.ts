import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork } from '../../services/ports'
import { effectiveBaseline } from '../../services/baseline'
import { seedSettings } from '../../services/seed'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

function drizzleUowOnMemoryDb(): UnitOfWork {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  return makeDrizzleUow(db)
}

describe('effectiveBaseline (pomo-baseline R10·R13)', () => {
  it('falls back to settings (25/5/15) when there is no weeks snapshot', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    const result = uow.run((repos) => effectiveBaseline(repos, '2026-08-03'))
    expect(result).toEqual({ focusMin: 25, shortBreakMin: 5, longBreakMin: 15 })
  })

  it('uses the weeks snapshot when present, even if settings differ', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    const week = '2026-08-03'
    uow.run((repos) =>
      repos.weeks.ensure(week, { focusMin: 50, shortBreakMin: 10, longBreakMin: 30 })
    )
    const result = uow.run((repos) => effectiveBaseline(repos, week))
    expect(result).toEqual({ focusMin: 50, shortBreakMin: 10, longBreakMin: 30 })
  })
})
