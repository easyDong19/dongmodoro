import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { now } from '@shared/time'
import { CorruptError, DowngradeError, MigrationError } from './errors'

const BACKUP_KEEP = 5

/**
 * 스키마 버전은 번들된 `.sql` 개수다 (ADR-020 §6).
 *
 * Drizzle 은 `__drizzle_migrations` 테이블로 이력을 관리하고 `user_version` 을 쓰지 않는다.
 * `user_version` 은 **앱이 자기 스키마 세대를 표시하기 위한 별도 표식**이며, 두 장부의
 * 역할이 다르다. 파일 개수를 세는 방식은 무관한 `.sql` 이 섞이면 어긋나므로 마이그레이션
 * 디렉토리에는 생성물 외에 아무것도 두지 않는다.
 */
function bundledMigrationCount(migrationsDir: string): number {
  return readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).length
}

/** 백업 파일명은 시각이 ISO 라 사전순 정렬 = 시간순 정렬이다. */
const isBackup =
  (dbFile: string) =>
  (f: string): boolean =>
    f.startsWith(`${dbFile}.backup-`)

/**
 * WAL 을 포함한 일관 스냅샷을 뜬다 (ADR-020 §1).
 *
 * 체크포인트 없이 `copyFileSync` 하면 **빈 파일이 나온다** — WAL 모드에서 커밋된 데이터는
 * `-wal` 에 살고 메인 파일은 헤더뿐이며, `synchronous = NORMAL` 이라 체크포인트도 지연된다.
 * 실측에서 200행짜리 DB 의 백업이 `no such table` 이었다.
 *
 * 파일명에 `basename()` 을 쓰는 이유: `dbPath.split('/')` 는 Windows 경로를 쪼개지 못해
 * 경로 전체가 파일명이 된다 (app-shell R1 이 Windows 를 지원 대상으로 확정).
 *
 * export 인 이유: 마이그레이션 직전 말고도 되돌릴 지점을 찍어야 하는 곳이 하나 더 있다 —
 * 전체 데이터 초기화(services/reset.ts). 백업이 "핸들이 열려 있는 동안 체크포인트 후 복사"
 * 라는 조건을 요구하므로, 그 조건을 아는 이 함수를 재사용하는 편이 옳다.
 */
export function backupDbFile(sqlite: Database.Database, dbPath: string, backupDir: string): void {
  sqlite.pragma('wal_checkpoint(TRUNCATE)')
  const dbFile = basename(dbPath)
  copyFileSync(dbPath, join(backupDir, `${dbFile}.backup-${now().replace(/[:.]/g, '-')}`))

  // 정리 실패는 앱 시작을 막지 않는다 (ADR-020 §3) — 부팅의 필수 조건이 아니다.
  try {
    readdirSync(backupDir)
      .filter(isBackup(dbFile))
      .sort()
      .slice(0, -BACKUP_KEEP)
      .forEach((f) => rmSync(join(backupDir, f), { force: true }))
  } catch (e) {
    console.warn('[db] backup cleanup failed, continuing:', e)
  }
}

/**
 * 스키마 버전을 판정하고, 필요하면 백업한 뒤 마이그레이션을 적용한다.
 *
 * 순서에 이유가 있다 (ADR-020 §4):
 * 1. 무결성 검사가 **마이그레이션보다 먼저** — 깨진 파일 위에서 스키마를 바꾸면 손상이 번진다.
 * 2. 버전 비교가 **백업보다 먼저** — 다운그레이드면 아무것도 건드리지 않고 멈춘다.
 * 3. 백업이 **마이그레이션 직전** — 데이터를 바꾸는 유일한 순간 앞에 되돌릴 지점을 찍는다.
 * 4. `foreign_key_check` 가 **`user_version` 갱신보다 먼저** (ADR-032 §2) — 무결성이
 *    깨졌으면 버전을 올리지 않아 다음 실행이 같은 마이그레이션을 다시 시도한다.
 *
 * `migrationsDir` 를 인자로 받는 이유: 번들 산출물(`out/main/index.js`)과 소스(`src/main/db/`)의
 * 상대 깊이가 달라 이 파일이 자기 위치에서 폴더를 유도할 수 없다. 호출부가 자기 환경에서
 * 계산해 넘긴다.
 */
export function migrateDb(
  sqlite: Database.Database,
  db: BetterSQLite3Database,
  backupDir: string,
  migrationsDir: string
): { schemaVersion: number } {
  const appVersion = bundledMigrationCount(migrationsDir)
  const dbVersion = sqlite.pragma('user_version', { simple: true }) as number

  if (dbVersion > appVersion) {
    throw new DowngradeError(
      `DB schema v${dbVersion} is newer than app schema v${appVersion}. ` +
        'Reinstall the newer version of the app, or restore a backup.'
    )
  }

  // 손상 정도에 따라 두 갈래로 나온다 — 가벼우면 진단 문자열을 **반환**하고
  // ("*** in database main *** Tree 2 page 3 cell 77: ..."), 페이지를 크게 잃으면
  // `database disk image is malformed` 로 **던진다.** 둘 다 CorruptError 로 모은다.
  let integrity: string
  try {
    integrity = sqlite.pragma('integrity_check', { simple: true }) as string
  } catch (e) {
    throw new CorruptError(
      `Database integrity check failed: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e }
    )
  }
  if (integrity !== 'ok') {
    throw new CorruptError(`Database integrity check failed: ${integrity}`)
  }

  const dbPath = sqlite.name
  // 백업은 적용할 것이 있을 때만 만든다 (ADR-020 §2). `dbVersion > 0` 을 함께 두는 것은
  // 한 번도 마이그레이션된 적 없는 파일에는 지킬 데이터가 없기 때문이다 — 첫 실행마다
  // 빈 백업이 쌓이는 것을 막는다.
  if (dbVersion > 0 && dbVersion < appVersion && existsSync(dbPath)) {
    backupDbFile(sqlite, dbPath, backupDir)
  }

  /**
   * FK 를 끄는 자리가 **트랜잭션 바깥**인 것이 이 블록의 전부다 (ADR-032 §1).
   *
   * 파괴적 마이그레이션은 SQLite 12단계 ALTER TABLE 절차를 따라 테이블을 재생성하는데,
   * 그 사이의 `DROP TABLE` 은 자식 행이 있으면 참조 위반으로 죽는다. 생성물이 넣는
   * `PRAGMA foreign_keys=OFF` 로는 못 막는다 — drizzle 의 마이그레이터가 전체를
   * `BEGIN`…`COMMIT` 으로 감싸고, 이 pragma 는 트랜잭션 안에서 **no-op** 이다.
   * `defer_foreign_keys` 도 안 된다: `DROP TABLE` 이 올린 지연 위반 카운터를 뒤이은
   * `RENAME TO` 가 내리지 않아 `COMMIT` 에서 터진다.
   *
   * `finally` 로 되돌리는 이유는 실패한 마이그레이션이 FK 없이 도는 세션을 남기지
   * 않기 위해서다. `open.ts` 가 시작 시 켜 둔 값을 여기서 잠깐 빌렸다가 갚는다.
   */
  sqlite.pragma('foreign_keys = OFF')
  try {
    migrate(db, { migrationsFolder: migrationsDir })
  } catch (e) {
    throw new MigrationError(`Migration failed: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e
    })
  } finally {
    sqlite.pragma('foreign_keys = ON')
  }

  /**
   * 무결성 회귀 검사 — ADR-020 §4 의 실패 3갈래에 붙는 네 번째 관문이다 (ADR-032 §2).
   *
   * FK 를 끄고 도는 구간이 생긴 이상 그 구간이 고아 행을 남기지 않았음을 증명해야
   * 한다. SQLite 는 꺼진 동안 아무것도 대신 막아주지 않는다.
   *
   * **`user_version` 을 올리기 전**에 두는 것이 핵심이다. 검사에 걸린 DB 는 다음
   * 실행에서 같은 마이그레이션을 다시 시도하며, 버전만 올라간 채 고아 행을 안고 사는
   * 상태가 되지 않는다. 마이그레이션 자체는 이미 커밋된 뒤라 이 검사가 되돌리지는
   * 못한다 — 그래서 복귀선은 백업 파일뿐이고, 자동 복원은 하지 않는다 (ADR-020 §4).
   */
  const violations = sqlite.pragma('foreign_key_check') as unknown[]
  if (violations.length > 0) {
    throw new MigrationError(
      `Migration left ${violations.length} foreign key violation(s): ${JSON.stringify(violations.slice(0, 5))}`
    )
  }

  sqlite.pragma(`user_version = ${appVersion}`)
  return { schemaVersion: appVersion }
}
