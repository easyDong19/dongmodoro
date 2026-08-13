import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork } from '../../services/ports'
import { globalBaseline, writeBaseline } from '../../services/baseline'
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

function seededUow(): UnitOfWork {
  const uow = drizzleUowOnMemoryDb()
  seedSettings(uow)
  return uow
}

describe('globalBaseline — 길이의 유일한 저장소 (ADR-029 §2)', () => {
  it('시딩된 전역값을 그대로 읽는다', () => {
    expect(seededUow().run(globalBaseline)).toEqual({
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15
    })
  })
})

describe('writeBaseline — 길이 3종만 갱신한다 (ADR-029 §1)', () => {
  const form = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

  it('저장된 값을 그대로 돌려준다 — 화면이 추측하지 않는다', () => {
    expect(writeBaseline(seededUow(), { ...form, focusMin: 50 })).toEqual({
      focusMin: 50,
      shortBreakMin: 5,
      longBreakMin: 15
    })
  })

  /**
   * 가용량은 폐기된 통화다 (ADR-030). 0001 마이그레이션이 `settings` 의 그 행을 지웠고,
   * 이 경로가 되살아나면 아무도 읽지 않는 키가 다시 생긴다.
   */
  it('`weekly_capacity` 를 쓰지 않는다', () => {
    const uow = seededUow()
    writeBaseline(uow, { ...form, focusMin: 50 })

    expect(uow.run((repos) => repos.settings.get('weekly_capacity'))).toBeNull()
  })

  /**
   * ADR-029 §1 의 본체 — 저장이 곧 효력이다. 다음에 읽히는 값은 방금 저장한 값
   * 하나뿐이며, 주를 가려 읽는 자리가 더는 없다.
   */
  it('바뀐 값이 즉시 읽힌다', () => {
    const uow = seededUow()
    writeBaseline(uow, { ...form, focusMin: 50 })

    expect(uow.run(globalBaseline).focusMin).toBe(50)
  })
})
