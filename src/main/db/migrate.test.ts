import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  statSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, closeDb } from './open'
import { migrateDb } from './migrate'
import { CorruptError, DowngradeError, MigrationError } from './errors'

/** 저장소의 실제 마이그레이션 폴더. 테스트는 경로를 명시적으로 넘긴다. */
const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../drizzle')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dongmodoro-'))
})

function setup(migrationsDir = REPO_MIGRATIONS) {
  const { db, sqlite } = openDb(join(dir, 'app.db'))
  return { db, sqlite, version: migrateDb(sqlite, db, dir, migrationsDir).schemaVersion }
}

/**
 * 세대가 둘인 합성 마이그레이션 폴더. 백업은 `0 < dbVersion < appVersion` 일 때만
 * 만들어지는데(ADR-020 §2), 실제 폴더는 마이그레이션이 하나뿐이라 그 구간이 없다.
 * `generations` 로 저널에 노출할 세대 수를 조절해 업그레이드를 재현한다.
 */
function fixtureMigrations(generations: 1 | 2): string {
  const md = mkdtempSync(join(tmpdir(), 'dongmodoro-mig-'))
  mkdirSync(join(md, 'meta'), { recursive: true })
  writeFileSync(join(md, '0000_first.sql'), 'CREATE TABLE a (id text primary key);')
  if (generations === 2) {
    writeFileSync(join(md, '0001_second.sql'), 'CREATE TABLE b (id text primary key);')
  }
  const entries = [
    { idx: 0, version: '6', when: 1, tag: '0000_first', breakpoints: true },
    { idx: 1, version: '6', when: 2, tag: '0001_second', breakpoints: true }
  ].slice(0, generations)
  writeFileSync(
    join(md, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries })
  )
  return md
}

const backups = (): string[] => readdirSync(dir).filter((f) => f.startsWith('app.db.backup-'))

describe('openDb — PRAGMA 세트 (ADR-011 §7)', () => {
  it('enables foreign keys, WAL and the tuned durability settings', () => {
    const { sqlite } = setup()
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(sqlite.pragma('synchronous', { simple: true })).toBe(1) // NORMAL
    expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(5000)
  })

  it('actually enforces a foreign key', () => {
    const { sqlite } = setup()
    const orphan = (): unknown =>
      sqlite
        .prepare(
          `INSERT INTO sessions (id,started_at,ended_at,duration_sec,kind,local_date,local_week,updated_at)
           VALUES ('s1','2026-08-04T01:00:00.000Z','2026-08-04T01:25:00.000Z',1500,'focus','2026-08-04','2026-08-03','2026-08-04T01:00:00.000Z')`
        )
        .run()
    // weeks 행이 없으므로 sessions.local_week FK 가 걸려야 한다 (ADR-019 §4).
    expect(orphan).toThrow(/FOREIGN KEY/)
  })
})

describe('migrateDb — 적용', () => {
  it('creates all 7 tables and reports the bundled schema version', () => {
    const { sqlite, version } = setup()
    const names = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%drizzle%' AND name NOT LIKE 'sqlite_%'"
      )
      .all()
      .map((r) => (r as { name: string }).name)
      .sort()
    expect(names).toEqual([
      'milestones',
      'sessions',
      'settings',
      'task_pulls',
      'tasks',
      'week_items',
      'weeks'
    ])
    const sqlFiles = readdirSync(REPO_MIGRATIONS).filter((f) => f.endsWith('.sql')).length
    expect(version).toBe(sqlFiles)
    expect(version).toBeGreaterThanOrEqual(1)
  })

  it('records the version in user_version (ADR-020 §6)', () => {
    const { sqlite, version } = setup()
    expect(sqlite.pragma('user_version', { simple: true })).toBe(version)
  })

  it('is a no-op on a second run', () => {
    const { sqlite, db, version } = setup()
    expect(migrateDb(sqlite, db, dir, REPO_MIGRATIONS).schemaVersion).toBe(version)
  })
})

describe('migrateDb — 실패 3갈래 (ADR-020 §4)', () => {
  it('throws DowngradeError when the db is newer than the app', () => {
    const { sqlite, db, version } = setup()
    sqlite.pragma(`user_version = ${version + 1}`)
    expect(() => migrateDb(sqlite, db, dir, REPO_MIGRATIONS)).toThrow(DowngradeError)
  })

  it('throws CorruptError from openDb when the file is damaged', () => {
    const dbPath = join(dir, 'app.db')
    const { sqlite, db } = openDb(dbPath)
    migrateDb(sqlite, db, dir, REPO_MIGRATIONS)
    const ins = sqlite.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)')
    sqlite.transaction(() => {
      for (let i = 0; i < 500; i++)
        ins.run(`k${i}`, JSON.stringify({ pad: 'x'.repeat(40) }), '2026-08-04T00:00:00.000Z')
    })()
    closeDb(sqlite)

    // 1페이지(파일 헤더)만 남기고 나머지를 전부 뭉갠다. 특정 페이지를 노리면 스키마가
    // 바뀔 때마다 레이아웃이 달라져 테스트가 조용히 무력해진다 — 실제로 페이지 2·3·5·12
    // 를 뭉개도 integrity_check 가 ok 를 내는 경우가 있었다.
    const size = statSync(dbPath).size
    const fd = openSync(dbPath, 'r+')
    writeSync(fd, Buffer.alloc(size - 4096, 0xa5), 0, size - 4096, 4096)
    closeSync(fd)

    // 이 정도로 손상되면 integrity_check 까지 가지 못하고 첫 PRAGMA 에서 터진다.
    expect(() => openDb(dbPath)).toThrow(CorruptError)
  })

  it('throws CorruptError from openDb when the file is not a database', () => {
    const dbPath = join(dir, 'app.db')
    writeFileSync(dbPath, 'this is definitely not a sqlite database file '.repeat(200))
    expect(() => openDb(dbPath)).toThrow(CorruptError)
  })

  it('throws CorruptError from migrateDb when integrity_check reports a violation', () => {
    const dbPath = join(dir, 'app.db')
    const { sqlite, db } = openDb(dbPath)
    migrateDb(sqlite, db, dir, REPO_MIGRATIONS)

    // integrity_check 는 CHECK 위반도 "손상"으로 보고한다 (SQLite 3.53.4, ADR-022
    // Consequences). 페이지를 뭉개는 것과 달리 결정적이고, 파일은 정상적으로 열린다.
    sqlite.pragma('ignore_check_constraints = ON')
    sqlite
      .prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)')
      .run('k', '{}', 'not-an-instant')
    sqlite.pragma('ignore_check_constraints = OFF')
    closeDb(sqlite)

    const reopened = openDb(dbPath)
    expect(() => migrateDb(reopened.sqlite, reopened.db, dir, REPO_MIGRATIONS)).toThrow(
      CorruptError
    )
  })

  it('throws MigrationError when a migration fails', () => {
    const bad = mkdtempSync(join(tmpdir(), 'dongmodoro-bad-'))
    mkdirSync(join(bad, 'meta'), { recursive: true })
    writeFileSync(join(bad, '0000_bad.sql'), 'THIS IS NOT SQL;')
    writeFileSync(
      join(bad, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [{ idx: 0, version: '6', when: 1, tag: '0000_bad', breakpoints: true }]
      })
    )
    const { db, sqlite } = openDb(join(dir, 'app.db'))
    expect(() => migrateDb(sqlite, db, dir, bad)).toThrow(MigrationError)
  })

  it('does not restore the backup automatically (ADR-020 §4)', () => {
    // gen1 로 만들고 데이터를 넣은 뒤, gen2 자리에 깨진 마이그레이션을 놓는다.
    const gen1 = fixtureMigrations(1)
    const dbPath = join(dir, 'app.db')
    const first = openDb(dbPath)
    migrateDb(first.sqlite, first.db, dir, gen1)
    first.sqlite.prepare("INSERT INTO a (id) VALUES ('keep-me')").run()
    closeDb(first.sqlite)

    writeFileSync(join(gen1, '0001_broken.sql'), 'NOT SQL AT ALL;')
    writeFileSync(
      join(gen1, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [
          { idx: 0, version: '6', when: 1, tag: '0000_first', breakpoints: true },
          { idx: 1, version: '6', when: 2, tag: '0001_broken', breakpoints: true }
        ]
      })
    )
    const second = openDb(dbPath)
    expect(() => migrateDb(second.sqlite, second.db, dir, gen1)).toThrow(MigrationError)

    // 백업은 떴지만 원본을 덮지 않았다 — 이전 세대 상태로 온전하다.
    expect(backups()).toHaveLength(1)
    expect(second.sqlite.prepare('SELECT count(*) c FROM a').get()).toEqual({ c: 1 })
  })
})

describe('migrateDb — 백업 (ADR-020 §1~§3)', () => {
  it('does not back up a fresh db', () => {
    setup()
    expect(backups()).toHaveLength(0)
  })

  it('does not back up when there is nothing to apply', () => {
    const { sqlite, db } = setup()
    migrateDb(sqlite, db, dir, REPO_MIGRATIONS)
    expect(backups()).toHaveLength(0)
  })

  it('backs up before applying a new migration, and the backup holds the data', () => {
    const dbPath = join(dir, 'app.db')
    const first = openDb(dbPath)
    migrateDb(first.sqlite, first.db, dir, fixtureMigrations(1))
    const ins = first.sqlite.prepare('INSERT INTO a (id) VALUES (?)')
    first.sqlite.transaction(() => {
      for (let i = 0; i < 200; i++) ins.run(`row-${i}`)
    })()
    // 체크포인트 없이 그대로 둔다 — WAL 에 데이터가 남은 상태가 백업의 실제 조건이다.
    first.sqlite.close()

    const second = openDb(dbPath)
    expect(migrateDb(second.sqlite, second.db, dir, fixtureMigrations(2)).schemaVersion).toBe(2)
    closeDb(second.sqlite)

    const files = backups()
    expect(files).toHaveLength(1)

    // ADR-020 §1 의 회귀 테스트 — 체크포인트 없이 복사하면 이 백업은 빈 파일이다.
    const restored = new Database(join(dir, files[0]!), { readonly: true })
    expect(restored.prepare('SELECT count(*) c FROM a').get()).toEqual({ c: 200 })
    expect(restored.prepare("SELECT count(*) c FROM sqlite_master WHERE name='b'").get()).toEqual({
      c: 0
    }) // 백업은 마이그레이션 이전 세대다
    restored.close()
  })

  it('keeps only the 5 most recent backups (ADR-020 §3)', () => {
    const dbPath = join(dir, 'app.db')
    const first = openDb(dbPath)
    migrateDb(first.sqlite, first.db, dir, fixtureMigrations(1))
    first.sqlite.prepare("INSERT INTO a (id) VALUES ('x')").run()
    closeDb(first.sqlite)

    // 이미 쌓여 있는 오래된 백업 6개
    for (let i = 1; i <= 6; i++) {
      writeFileSync(join(dir, `app.db.backup-2020-01-0${i}T00-00-00-000Z`), 'old')
    }

    const second = openDb(dbPath)
    migrateDb(second.sqlite, second.db, dir, fixtureMigrations(2))
    closeDb(second.sqlite)

    const files = backups().sort()
    expect(files).toHaveLength(5)
    // 새 백업은 남고, 가장 오래된 것부터 지워진다.
    expect(files.some((f) => f.includes('2020-01-01'))).toBe(false)
    expect(files.some((f) => f.includes('2020-01-02'))).toBe(false)
    expect(files.some((f) => f.includes('2020-01-06'))).toBe(true)
  })
})

describe('closeDb — 종료 시 체크포인트 (ADR-020 §5)', () => {
  it('truncates the WAL so the next start is clean', () => {
    const dbPath = join(dir, 'app.db')
    const { db, sqlite } = openDb(dbPath)
    migrateDb(sqlite, db, dir, REPO_MIGRATIONS)
    sqlite
      .prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)')
      .run('k', '{}', '2026-08-04T00:00:00.000Z')
    closeDb(sqlite)

    const reopened = new Database(dbPath, { readonly: true })
    expect(reopened.prepare('SELECT count(*) c FROM settings').get()).toEqual({ c: 1 })
    reopened.close()
  })

  it('is safe to call twice', () => {
    const { sqlite, db } = openDb(join(dir, 'app.db'))
    migrateDb(sqlite, db, dir, REPO_MIGRATIONS)
    closeDb(sqlite)
    expect(() => closeDb(sqlite)).not.toThrow()
  })
})
