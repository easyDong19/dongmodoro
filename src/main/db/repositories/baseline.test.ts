import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork } from '../../services/ports'
import { globalBaseline, lengthOf, writeModeLength } from '../../services/baseline'
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

describe('writeModeLength — 한 모드의 길이만 쓴다', () => {
  it('focus 를 30 으로 쓰면 나머지 두 값은 그대로다', () => {
    const uow = seededUow()

    writeModeLength(uow, 'focus', 30)

    expect(uow.run(globalBaseline)).toEqual({
      focusMin: 30,
      shortBreakMin: 5,
      longBreakMin: 15
    })
  })

  it('short 와 long 도 각자의 키에 쓴다', () => {
    const uow = seededUow()

    writeModeLength(uow, 'short', 7)
    writeModeLength(uow, 'long', 20)

    expect(uow.run(globalBaseline)).toEqual({
      focusMin: 25,
      shortBreakMin: 7,
      longBreakMin: 20
    })
  })
})

describe('lengthOf — 모드가 어느 값을 쓰는지 아는 단 하나의 함수', () => {
  it('세 모드가 각자의 값을 돌려준다', () => {
    const b = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

    expect(lengthOf(b, 'focus')).toBe(25)
    expect(lengthOf(b, 'short')).toBe(5)
    expect(lengthOf(b, 'long')).toBe(15)
  })
})
