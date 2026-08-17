import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  closeSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, closeDb } from './open'
import { migrateDb } from './migrate'
import { makeDrizzleUow } from './repositories/drizzle'
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
          `INSERT INTO tasks (id,week_item_id,title,created_at,updated_at)
           VALUES ('t1','no-such-item','x','2026-08-04T01:00:00.000Z','2026-08-04T01:00:00.000Z')`
        )
        .run()
    // 부모 week_items 행이 없으므로 tasks.week_item_id FK 가 걸려야 한다.
    expect(orphan).toThrow(/FOREIGN KEY/)
  })

  /**
   * 마이그레이션이 FK 를 껐다면 **되돌려 놓았어야 한다** (ADR-032 §1). `finally` 가
   * 빠지면 위 테스트만으로는 잡히지 않는다 — 같은 프로세스의 다음 쓰기부터 조용히
   * 무방비가 된다.
   */
  it('leaves foreign keys on after a migration ran', () => {
    const { sqlite } = setup()
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})

describe('migrateDb — 적용', () => {
  it('creates all 6 tables and reports the bundled schema version', () => {
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
      'week_items'
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

/**
 * 1.1.0 이 배포한 세대 = `.sql` 이 0000 하나뿐인 폴더. 저장소 폴더를 복사해 0001 을
 * 빼서 만든다 — 0000 의 내용과 저널의 `when` 이 원본 그대로라, 뒤이어 실제 폴더로 다시
 * 열면 drizzle 이 0001 만 새로 적용한다. 사용자 기기가 겪는 경로와 같다.
 */
function migrationsAt110(): string {
  const md = mkdtempSync(join(tmpdir(), 'dongmodoro-v110-'))
  cpSync(REPO_MIGRATIONS, md, { recursive: true })
  for (const f of readdirSync(md)) {
    if (!f.startsWith('0000') && f.endsWith('.sql')) rmSync(join(md, f))
  }
  for (const f of readdirSync(join(md, 'meta'))) {
    if (f.endsWith('_snapshot.json') && !f.startsWith('0000')) rmSync(join(md, 'meta', f))
  }
  const journalPath = join(md, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] }
  journal.entries = journal.entries.slice(0, 1)
  writeFileSync(journalPath, JSON.stringify(journal))
  return md
}

const W1 = '2026-07-27' // 월요일. 길이 50분짜리 비표준 주다
const W2 = '2026-08-03' // 그 다음 주 월요일
const T = (d: string): string => `${d}T01:00:00.000Z`

/**
 * 1.1.0 형태의 DB 에 행을 채운다. 조건은 ADR-032 §4 가 정한다 — **세션이 있어야**
 * `sessions.local_week` FK 가 실제로 걸려 결함이 재현되고, 비표준 길이의 주·이월
 * 항목·폐기 항목이 있어야 마이그레이션이 지우는 것과 지키는 것이 갈린다.
 */
function seed110(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO settings (key,value,updated_at) VALUES
      ('focus_min','25','${T(W2)}'),
      ('short_break_min','5','${T(W2)}'),
      ('long_break_min','15','${T(W2)}'),
      ('weekly_capacity','[4,4,4,4,4,0,0]','${T(W2)}'),
      ('last_settled_week','"${W1}"','${T(W2)}');

    -- 비표준 길이(50/10/30)로 박제된 주와 기본값 주가 섞여 있다
    INSERT INTO weeks (week,budget,capacity,focus_min,short_break_min,long_break_min,planned_at,settled_at,created_at,updated_at) VALUES
      ('${W1}',8,'[2,2,2,2,0,0,0]',50,10,30,'${T(W1)}','${T(W2)}','${T(W1)}','${T(W2)}'),
      ('${W2}',NULL,NULL,25,5,15,NULL,NULL,'${T(W2)}','${T(W2)}');

    INSERT INTO milestones (id,month,title,completed_at,sort_order,archived_at,created_at,updated_at)
      VALUES ('m1','2026-08','8월 결과물',NULL,0,NULL,'${T(W1)}','${T(W1)}');

    INSERT INTO week_items (id,week,title,est_pomos,milestone_id,days,carry_from_id,origin_week,is_system,completed_at,dropped_at,created_at,updated_at,deleted_at) VALUES
      ('wi1','${W1}','원본 항목',3,'m1','[0,1]',NULL,'${W1}',0,NULL,NULL,'${T(W1)}','${T(W1)}',NULL),
      ('wi-sys','${W1}','기타',0,NULL,'[]',NULL,'${W1}',1,NULL,NULL,'${T(W1)}','${T(W1)}',NULL),
      ('wi2','${W2}','이월된 항목',2,'m1','[]','wi1','${W1}',0,NULL,NULL,'${T(W2)}','${T(W2)}',NULL),
      ('wi3','${W2}','보내준 항목',5,NULL,'[]',NULL,'${W2}',0,NULL,'${T(W2)}','${T(W2)}','${T(W2)}',NULL);

    INSERT INTO tasks (id,week_item_id,title,est_pomos,completed_at,created_at,updated_at,deleted_at) VALUES
      ('t1','wi1','조각 하나',2,NULL,'${T(W1)}','${T(W1)}',NULL),
      ('t2','wi2','조각 둘',NULL,NULL,'${T(W2)}','${T(W2)}',NULL),
      ('t3','wi-sys','자유 집중',1,'${T(W1)}','${T(W1)}','${T(W1)}',NULL);

    INSERT INTO sessions (id,started_at,ended_at,duration_sec,kind,task_id,note,local_date,local_week,updated_at) VALUES
      ('s1','${T(W1)}','2026-07-27T01:50:00.000Z',3000,'focus','t1',NULL,'${W1}','${W1}','${T(W1)}'),
      ('s2','2026-07-29T01:00:00.000Z','2026-07-29T01:30:00.000Z',1800,'focus',NULL,'메모','2026-07-29','${W1}','${T(W1)}'),
      ('s3','2026-08-04T01:00:00.000Z','2026-08-04T01:25:00.000Z',1500,'focus','t2',NULL,'2026-08-04','${W2}','${T(W2)}'),
      ('s4','2026-08-04T01:25:00.000Z','2026-08-04T01:30:00.000Z',300,'short',NULL,NULL,'2026-08-04','${W2}','${T(W2)}');

    INSERT INTO task_pulls (task_id,pull_date,removed_at,created_at,updated_at)
      VALUES ('t1','${W1}',NULL,'${T(W1)}','${T(W1)}');
  `)
}

/**
 * ADR-032 §4 — **파괴적 마이그레이션은 데이터가 든 DB 로 테스트한다.**
 *
 * 빈 DB 에서는 이 마이그레이션이 그냥 성공한다. 착수 전 감사에서 생성물 그대로의
 * 마이그레이션이 데이터가 든 1.1.0 DB 에서 `FOREIGN KEY constraint failed` 로 죽었고,
 * 같은 SQL 이 빈 DB 에서는 통과했다 — 그 비대칭이 이 describe 가 존재하는 이유다.
 */
describe('migrateDb — 데이터가 든 1.1.0 DB (ADR-032 §4)', () => {
  function upgraded() {
    const dbPath = join(dir, 'app.db')
    const first = openDb(dbPath)
    expect(migrateDb(first.sqlite, first.db, dir, migrationsAt110()).schemaVersion).toBe(1)
    seed110(first.sqlite)
    closeDb(first.sqlite)

    const second = openDb(dbPath)
    const result = migrateDb(second.sqlite, second.db, dir, REPO_MIGRATIONS)
    return { ...second, ...result }
  }

  const count = (sqlite: Database.Database, table: string): number =>
    (sqlite.prepare(`SELECT count(*) c FROM ${table}`).get() as { c: number }).c

  it('applies on a database that holds sessions, and backs it up first', () => {
    const { sqlite, schemaVersion } = upgraded()
    expect(schemaVersion).toBe(3)
    expect(sqlite.pragma('user_version', { simple: true })).toBe(3)
    // 백업 조건은 `0 < dbVersion < appVersion` 이다 (ADR-020 §2) — 1 < 3 로 성립한다.
    expect(backups()).toHaveLength(1)
  })

  it('leaves no foreign key violations behind (ADR-032 §2)', () => {
    const { sqlite } = upgraded()
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
  })

  it('drops weeks and both est_pomos columns, and deletes the retired setting', () => {
    const { sqlite } = upgraded()
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%drizzle%' AND name NOT LIKE 'sqlite_%'"
      )
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).not.toContain('weeks')
    expect(tables.sort()).toEqual([
      'milestones',
      'sessions',
      'settings',
      'task_pulls',
      'tasks',
      'week_items'
    ])

    const columns = (t: string): string[] =>
      (sqlite.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name)
    expect(columns('week_items')).not.toContain('est_pomos')
    expect(columns('tasks')).not.toContain('est_pomos')

    const setting = (key: string): unknown =>
      sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    expect(setting('weekly_capacity')).toBeUndefined()
    // 시딩 목록은 손대지 않는다. 워터마크도 그대로다 — 지우면 R28 폴백이 되살아난다.
    expect(setting('focus_min')).toEqual({ value: '25' })
    expect(setting('last_settled_week')).toEqual({ value: `"${W1}"` })
  })

  it('keeps every session, item, task and milestone row', () => {
    const { sqlite } = upgraded()
    expect(count(sqlite, 'sessions')).toBe(4)
    expect(count(sqlite, 'week_items')).toBe(4)
    expect(count(sqlite, 'tasks')).toBe(3)
    expect(count(sqlite, 'milestones')).toBe(1)
    expect(count(sqlite, 'task_pulls')).toBe(1)

    // 관계도 살아 있다 — 이월 사슬·마일스톤 연결·세션의 조각 귀속.
    expect(sqlite.prepare("SELECT carry_from_id c FROM week_items WHERE id='wi2'").get()).toEqual({
      c: 'wi1'
    })
    expect(sqlite.prepare("SELECT milestone_id m FROM week_items WHERE id='wi2'").get()).toEqual({
      m: 'm1'
    })
    expect(sqlite.prepare("SELECT dropped_at d FROM week_items WHERE id='wi3'").get()).toEqual({
      d: T(W2)
    })
    expect(sqlite.prepare("SELECT task_id t FROM sessions WHERE id='s1'").get()).toEqual({
      t: 't1'
    })
  })

  it('shows the measured time of a past week retroactively', () => {
    const { db } = upgraded()
    const uow = makeDrizzleUow(db)
    // 비표준 길이(50분)로 계획됐던 주다. 개수 시절에는 그 주의 뽀모 수를 스냅샷으로
    // 해석해야 했지만, 측정 시간은 저장된 `duration_sec` 의 합이라 소급해 읽힌다.
    expect(uow.run((r) => r.weekItems.weekTotalMeasuredSec(W1))).toBe(3000 + 1800)
    // 휴식 세션(300초)은 들어오지 않는다.
    expect(uow.run((r) => r.weekItems.weekTotalMeasuredSec(W2))).toBe(1500)
    expect(uow.run((r) => r.weekItems.listForWeek(W2)).map((i) => i.measuredSec)).toEqual([1500])
  })
})

describe('migrateDb — 무결성 회귀 관문 (ADR-032 §2)', () => {
  /**
   * FK 를 끄고 도는 구간이 생긴 이상, 그 구간이 고아 행을 남겼는지 **사후에** 봐야
   * 한다. 여기서는 2세대가 부모 행을 지워 일부러 고아를 만든다 — FK 가 켜져 있었다면
   * 실패했을 DELETE 가, 꺼진 구간에서는 조용히 성공한다.
   */
  function orphanMakingMigrations(): string {
    const md = mkdtempSync(join(tmpdir(), 'dongmodoro-orphan-'))
    mkdirSync(join(md, 'meta'), { recursive: true })
    writeFileSync(
      join(md, '0000_first.sql'),
      'CREATE TABLE p (id text primary key);--> statement-breakpoint\n' +
        'CREATE TABLE c (id text primary key, pid text references p(id));'
    )
    writeFileSync(join(md, '0001_orphan.sql'), 'DELETE FROM p;')
    writeFileSync(
      join(md, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [
          { idx: 0, version: '6', when: 1, tag: '0000_first', breakpoints: true },
          { idx: 1, version: '6', when: 2, tag: '0001_orphan', breakpoints: true }
        ]
      })
    )
    return md
  }

  it('throws MigrationError and holds user_version back when orphans are left', () => {
    const md = orphanMakingMigrations()
    const gen1Journal = JSON.parse(readFileSync(join(md, 'meta', '_journal.json'), 'utf8')) as {
      entries: unknown[]
    }

    // 1세대만 노출한 상태로 만들고 데이터를 넣는다.
    const staged = mkdtempSync(join(tmpdir(), 'dongmodoro-orphan-gen1-'))
    cpSync(md, staged, { recursive: true })
    rmSync(join(staged, '0001_orphan.sql'))
    writeFileSync(
      join(staged, 'meta', '_journal.json'),
      JSON.stringify({ version: '7', dialect: 'sqlite', entries: gen1Journal.entries.slice(0, 1) })
    )

    const dbPath = join(dir, 'app.db')
    const first = openDb(dbPath)
    migrateDb(first.sqlite, first.db, dir, staged)
    first.sqlite.exec("INSERT INTO p (id) VALUES ('p1'); INSERT INTO c VALUES ('c1','p1');")
    closeDb(first.sqlite)

    const second = openDb(dbPath)
    expect(() => migrateDb(second.sqlite, second.db, dir, md)).toThrow(MigrationError)
    // 버전이 올라가지 않았다 — 다음 실행이 같은 마이그레이션을 다시 시도한다.
    expect(second.sqlite.pragma('user_version', { simple: true })).toBe(1)
    // FK 는 되돌려졌다 (ADR-032 §1 의 finally).
    expect(second.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})

describe('migrateDb — archived_at 드랍 (ADR-034)', () => {
  /**
   * 0002 적용 전 세대 = `.sql` 이 0000·0001 두 개뿐인 폴더. `migrationsAt110()` 과
   * 같은 방식으로 저장소 폴더를 복사해 0002 를 뺀다 — archived_at 이 아직 남아 있는
   * 스키마에 시드하기 위해서다.
   */
  function migrationsBefore0002(): string {
    const md = mkdtempSync(join(tmpdir(), 'dongmodoro-pre-0002-'))
    cpSync(REPO_MIGRATIONS, md, { recursive: true })
    for (const f of readdirSync(md)) {
      if (f.startsWith('0002') && f.endsWith('.sql')) rmSync(join(md, f))
    }
    rmSync(join(md, 'meta', '0002_snapshot.json'), { force: true })
    const journalPath = join(md, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] }
    journal.entries = journal.entries.slice(0, 2)
    writeFileSync(journalPath, JSON.stringify(journal))
    return md
  }

  it('archived_at 이 드랍되고 보관돼 있던 행은 데이터 손실 없이 남는다', () => {
    const dbPath = join(dir, 'app.db')
    const first = openDb(dbPath)
    migrateDb(first.sqlite, first.db, dir, migrationsBefore0002())
    first.sqlite.exec(`
      INSERT INTO milestones (id,month,title,completed_at,sort_order,archived_at,created_at,updated_at)
      VALUES ('m-a','2026-07','archived one',NULL,0,'2026-07-31T00:00:00.000Z','2026-07-01T00:00:00.000Z','2026-07-01T00:00:00.000Z')
    `)
    closeDb(first.sqlite)

    const second = openDb(dbPath)
    migrateDb(second.sqlite, second.db, dir, REPO_MIGRATIONS)
    const cols = second.sqlite.prepare(`SELECT name FROM pragma_table_info('milestones')`).all()
    expect(cols.map((c) => (c as { name: string }).name)).not.toContain('archived_at')
    const row = second.sqlite.prepare(`SELECT title FROM milestones WHERE id='m-a'`).get()
    expect(row).toEqual({ title: 'archived one' })
    closeDb(second.sqlite)
  })
})
