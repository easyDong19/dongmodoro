import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork, WeekSnapshot } from '../../services/ports'
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
    uow.run((repos) => repos.weeks.ensure(week, snapshot({ focusMin: 50 })))
    const result = uow.run((repos) => effectiveBaseline(repos, week))
    expect(result).toEqual({ focusMin: 50, shortBreakMin: 5, longBreakMin: 15 })
  })
})

function snapshot(over: Partial<WeekSnapshot> = {}): WeekSnapshot {
  return {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    capacity: null,
    budget: null,
    ...over
  }
}

describe('weeks.ensure — 스냅샷 5종 박제 (weekly-review R37 · ADR-013 §2)', () => {
  const WEEK = '2026-08-03'

  it('가용량·예산까지 함께 박제한다', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    uow.run((repos) => {
      repos.weeks.ensure(WEEK, snapshot({ capacity: [4, 4, 4, 4, 4, 0, 0], budget: 20 }))
      expect(repos.weeks.plan(WEEK)).toEqual({
        capacity: [4, 4, 4, 4, 4, 0, 0],
        budget: 20,
        plannedAt: null // 정한 것이 아니라 해석된 값이다 — 계획 확정 시각이 아니다
      })
    })
  })

  it('가용량이 미설정이면 두 컬럼을 NULL 로 둔다 (ADR-018 §1)', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    uow.run((repos) => {
      repos.weeks.ensure(WEEK, snapshot())
      expect(repos.weeks.plan(WEEK)).toEqual({ capacity: null, budget: null, plannedAt: null })
    })
  })

  /**
   * A17. 이 규칙 하나가 "지각 정산이 진행 중인 주의 단위를 바꾼다"는 결함을 스키마
   * 레벨에서 닫는다 (ADR-013 §3). 확정이 기존 행에서 건드리는 것은 `settled_at` 뿐이다.
   */
  it('이미 있는 행의 스냅샷 컬럼은 어떤 값으로도 덮어쓰지 않는다', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    uow.run((repos) => {
      repos.weeks.ensure(
        WEEK,
        snapshot({ focusMin: 25, capacity: [1, 1, 1, 1, 1, 1, 1], budget: 7 })
      )
      repos.weeks.ensure(
        WEEK,
        snapshot({ focusMin: 50, capacity: [9, 9, 9, 9, 9, 9, 9], budget: 63 })
      )

      expect(repos.weeks.baseline(WEEK)?.focusMin).toBe(25)
      expect(repos.weeks.plan(WEEK)).toMatchObject({ capacity: [1, 1, 1, 1, 1, 1, 1], budget: 7 })
    })
  })
})
