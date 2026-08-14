import type Database from 'better-sqlite3'
import { rmSync } from 'node:fs'
import { backupDbFile } from './migrate'

/**
 * 전체 데이터 초기화의 부작용 묶음. `electron` 을 import 하지 않는 것이 이 모듈의 규칙이다 —
 * 그래야 기본 node 환경에서 목 없이 진짜 DB 를 열어 순서까지 단언할 수 있다. 창을 부수고
 * 프로세스를 재시작하는 부분은 호출부(main/index.ts)에 남는다.
 *
 * `services/` 가 아니라 `db/` 에 있는 이유는 ADR-015 §2 다 — 이 모듈은 리포지토리 포트가
 * 아니라 **DB 파일 자체**를 다룬다(원시 핸들, WAL 사이드카, 파일 삭제). 서비스 계층이
 * 그것을 만지면 안 되고, 여기서는 그것이 일의 내용 전부다.
 */
export type ResetDeps = {
  /** 열려 있는 핸들. 백업이 체크포인트를 걸어야 하므로 닫힌 것을 넘기면 안 된다. */
  sqlite: Database.Database
  dbPath: string
  /** 백업 파일이 놓일 폴더. 실제로는 `app.getPath('userData')`. */
  backupDir: string
  /**
   * 창을 부수고, 타이머 엔진을 리셋하고, 시계를 멈춘다. **DB 는 닫지 않는다** —
   * 리셋된 엔진이 idle 로 들어가며 baseline 을 읽고, 그때 DB 가 살아 있어야 한다.
   */
  quiesce: () => void
  /** `closeDb`. 멱등이므로 두 번 불려도 된다. */
  closeDatabase: () => void
}

/**
 * `app.db` 와 WAL 사이드카 두 개를 지운다.
 *
 * **세 파일을 모두 지워야 한다.** `closeDb` 가 `wal_checkpoint(TRUNCATE)` 후 닫으므로 보통
 * `-wal`·`-shm` 은 사라지지만, 체크포인트 실패는 `open.ts` 가 의도적으로 삼킨다(그쪽에서
 * 던지면 손상된 DB 를 닫는 경로가 막힌다). 새로 만들어진 `app.db` 옆에 낡은 `-wal` 이 남으면
 * SQLite 가 그것을 남의 저널로 재생하려 든다 — 손상 경로다.
 *
 * `force: true` 는 "없으면 조용히 넘어간다" 는 뜻이다. 사이드카는 정상 종료 뒤엔 없는 것이
 * 정상이므로 부재가 오류가 아니다.
 */
export function removeDatabaseFiles(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${dbPath}${suffix}`, { force: true })
  }
}

/**
 * 모든 데이터를 지운다 — 되돌릴 백업을 하나 남기고.
 *
 * **행을 지우지 않고 파일을 지운다.** `DELETE FROM` 으로는 첫 실행 상태에 도달할 수 없다:
 * `user_version` 이 그대로 남고, `__drizzle_migrations` 의 이력이 남고, `sqlite_sequence` 가
 * 살아남는다. 게다가 테이블 목록을 어디엔가 적어 두면 `schema.ts` 에 테이블이 하나 추가되는
 * 순간 조용히 어긋난다. 파일을 지우면 다음 부팅이 이미 검증된 첫 실행 경로를 그대로 탄다 —
 * `openDb` 가 파일을 만들고, `migrateDb` 가 `user_version` 0 을 보고 (`dbVersion > 0` 가드
 * 덕에 빈 백업도 만들지 않고) 마이그레이션을 적용하고, `seedSettings` 가 기본값을 다시 넣는다.
 *
 * 순서가 이 함수의 내용 전부다:
 * 1. `quiesce` — 창과 타이머를 먼저 잠재운다. 살아 있는 집중 세션의 만료가 나중에 발동하면
 *    닫힌 DB 에 기록을 시도하다 메인에서 던지고, 그 에러 박스가 종료를 막아 앱이 멈춘다.
 * 2. 백업 — **핸들이 열린 채로.** 체크포인트 없는 복사는 빈 파일이 된다(migrate.ts 참조).
 * 3. `closeDatabase` — 그다음에야 닫는다.
 * 4. 파일 삭제 — Windows 는 열린 파일을 unlink 하지 못하므로 3번 뒤여야 한다.
 *
 * 재시작은 여기서 하지 않는다. 호출부가 이 함수가 끝난 뒤에 `app.relaunch()` 를 부른다.
 */
export function resetAllData(deps: ResetDeps): void {
  deps.quiesce()
  backupDbFile(deps.sqlite, deps.dbPath, deps.backupDir)
  deps.closeDatabase()
  removeDatabaseFiles(deps.dbPath)
}
