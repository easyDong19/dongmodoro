import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, closeDb } from './open'
import { migrateDb } from './migrate'
import { makeDrizzleUow } from './repositories/drizzle'
import { seedSettings } from '../services/seed'
import { resetAllData, removeDatabaseFiles } from './reset'

/** 저장소의 실제 마이그레이션 폴더 — migrate.test.ts 와 같은 방식으로 경로를 명시한다. */
const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../drizzle')

let dir: string
let dbPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dongmodoro-reset-'))
  dbPath = join(dir, 'app.db')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 첫 실행과 같은 순서로 DB 를 세운다 (main/index.ts 의 startDb 와 동일). */
function boot() {
  const { db, sqlite } = openDb(dbPath)
  migrateDb(sqlite, db, dir, REPO_MIGRATIONS)
  const uow = makeDrizzleUow(db)
  seedSettings(uow)
  return { db, sqlite, uow }
}

const backups = (): string[] => readdirSync(dir).filter((f) => f.startsWith('app.db.backup-'))

describe('resetAllData', () => {
  it('leaves a backup that actually contains the data it was taken from', () => {
    const { sqlite, uow } = boot()
    uow.run((repos) => repos.settings.set('weekly_capacity', '[1,2,3,4,5,6,7]'))

    resetAllData({
      sqlite,
      dbPath,
      backupDir: dir,
      quiesce: () => {},
      closeDatabase: () => closeDb(sqlite)
    })

    const [file] = backups()
    expect(file).toBeDefined()

    // 존재만 보지 않고 **열어서 읽는다.** WAL 모드에서 체크포인트 없이 복사하면 커밋된
    // 데이터가 `-wal` 에 남아 백업이 `no such table` 로 열린다 — migrate.ts 가 실측으로
    // 기록한 버그이고, 이 단언이 그것의 재발을 잡는다.
    const restored = new Database(join(dir, file))
    try {
      const row = restored
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('weekly_capacity') as { value: string } | undefined
      expect(row?.value).toBe('[1,2,3,4,5,6,7]')
    } finally {
      restored.close()
    }
  })

  it('removes the database and both WAL sidecars', () => {
    const { sqlite } = boot()

    // 사이드카가 정상 종료로 사라져 버리면 삭제를 검증할 수 없다. 삭제 후에 남는지를 보기
    // 위해 파일을 직접 만들어 둔다 — 체크포인트가 실패해 남는 상황의 대역이다.
    resetAllData({
      sqlite,
      dbPath,
      backupDir: dir,
      quiesce: () => {},
      closeDatabase: () => {
        closeDb(sqlite)
        writeFileSync(`${dbPath}-wal`, '')
        writeFileSync(`${dbPath}-shm`, '')
      }
    })

    expect(existsSync(dbPath)).toBe(false)
    expect(existsSync(`${dbPath}-wal`)).toBe(false)
    expect(existsSync(`${dbPath}-shm`)).toBe(false)
  })

  it('quiesces before backing up and closes before unlinking', () => {
    const { sqlite } = boot()
    const calls: string[] = []

    resetAllData({
      sqlite,
      dbPath,
      backupDir: dir,
      quiesce: () => {
        calls.push('quiesce')
        // quiesce 가 DB 까지 닫으면 바로 다음의 백업이 `The database connection is not
        // open` 으로 죽고, 사용자는 되돌릴 지점 없이 데이터를 잃는다. 실제로 배선을
        // 처음 붙였을 때 밟은 버그라 계약으로 못박는다.
        calls.push(sqlite.open ? 'handle-open' : 'handle-closed')
      },
      closeDatabase: () => {
        // 닫는 시점에 백업이 이미 있어야 한다 — 백업은 열린 핸들을 요구한다.
        calls.push(backups().length > 0 ? 'close-after-backup' : 'close-before-backup')
        closeDb(sqlite)
      }
    })

    expect(calls).toEqual(['quiesce', 'handle-open', 'close-after-backup'])
    expect(sqlite.open).toBe(false)
  })

  it('lets the next boot come up in first-run state', () => {
    const first = boot()
    first.uow.run((repos) => {
      repos.settings.set('theme', '"light"')
      repos.settings.set('weekly_capacity', '[1,2,3,4,5,6,7]')
    })

    resetAllData({
      sqlite: first.sqlite,
      dbPath,
      backupDir: dir,
      quiesce: () => {},
      closeDatabase: () => closeDb(first.sqlite)
    })

    const second = boot()
    try {
      second.uow.run((repos) => {
        // 시딩이 다시 돌아 기본값이 들어온다.
        expect(repos.settings.get('theme')).toBe('"dark"')
        // 시딩 대상이 아닌 키는 부재로 돌아간다 — 이것이 "첫 실행" 의 정의다.
        expect(repos.settings.get('weekly_capacity')).toBeNull()
      })
    } finally {
      closeDb(second.sqlite)
    }
  })

  it('does not swallow a backup failure — the user must not lose data silently', () => {
    const { sqlite } = boot()
    const closeDatabase = vi.fn()
    // 백업 폴더가 없으면 copyFileSync 가 던진다. 그 뒤 단계가 돌지 않아야 한다.
    expect(() =>
      resetAllData({
        sqlite,
        dbPath,
        backupDir: join(dir, 'does-not-exist'),
        quiesce: () => {},
        closeDatabase
      })
    ).toThrow()

    expect(closeDatabase).not.toHaveBeenCalled()
    expect(existsSync(dbPath)).toBe(true)
    closeDb(sqlite)
  })
})

describe('removeDatabaseFiles', () => {
  it('is silent when the files are already gone', () => {
    expect(() => removeDatabaseFiles(join(dir, 'never-existed.db'))).not.toThrow()
  })
})
