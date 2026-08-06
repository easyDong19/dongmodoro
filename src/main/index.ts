import { app, dialog, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWindow } from './window'
import { registerSystemHandlers } from './ipc/system'
import { openDb, closeDb } from './db/open'
import { migrateDb } from './db/migrate'
import { CorruptError, DowngradeError, MigrationError } from './db/errors'

/**
 * 마이그레이션 폴더는 **번들 산출물 기준**으로 푼다.
 *
 * 이 파일은 `out/main/index.js` 한 덩어리로 번들되므로 여기서의 `../../` 가 저장소
 * 루트다. `migrate.ts` 가 자기 위치에서 유도하지 않고 인자로 받는 이유가 이것이다 —
 * 소스(`src/main/db/`)와 산출물(`out/main/`)의 깊이가 달라 한 상대 경로로는 둘 다
 * 맞출 수 없다. `import.meta.url` 을 쓰는 것은 `"type": "module"` 이라 `__dirname` 이
 * 없기 때문이다.
 *
 * TODO(M4 패키징, ADR-004): asar 안에서는 이 경로가 성립하지 않는다. electron-builder
 * 의 `extraResources` 로 `drizzle/` 을 함께 실어 `process.resourcesPath` 로 풀어야 한다.
 */
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')

let closeDatabase: (() => void) | undefined

/**
 * 시작 실패를 안내하고 종료한다 (ADR-020 §4).
 *
 * `showErrorBox` 가 아니라 `showMessageBox` 인 이유는 **버튼을 둘 수 있기 때문**이다 —
 * 경로 문자열만 보여주고 끝내면 사용자가 무엇을 해야 할지 모른다. 결정권은 넘기되
 * 도달 비용은 낮춘다. 창은 띄우지 않는다 — DB 없이 뜬 창은 기능이 없는데 사용자는
 * 앱이 정상이라고 오해한다.
 */
function failStart(title: string, detail: string, backupDir: string): void {
  const buttons = ['백업 폴더 열기', '종료']
  const response = dialog.showMessageBoxSync({
    type: 'error',
    title,
    message: title,
    detail,
    buttons,
    defaultId: 1,
    cancelId: 1
  })
  if (response === 0) void shell.openPath(backupDir)
  app.quit()
}

function startDb(): number {
  const userData = app.getPath('userData')
  const { db, sqlite } = openDb(join(userData, 'app.db'))
  closeDatabase = () => closeDb(sqlite)
  return migrateDb(sqlite, db, userData, MIGRATIONS_DIR).schemaVersion
}

app
  .whenReady()
  .then(() => {
    // DB 가 먼저다 — 열지 못하면 창을 띄우지 않는다.
    const schemaVersion = startDb()
    // 핸들러를 창보다 먼저 등록한다 — renderer 가 뜨자마자 호출해도 받을 사람이 있어야 한다.
    registerSystemHandlers(() => schemaVersion)
    createWindow()
  })
  .catch((e: unknown) => {
    // 예상 못한 실패도 같은 경로로 보낸다 — 조용한 unhandled rejection 을 남기지 않는다.
    const backupDir = app.getPath('userData')
    const message = e instanceof Error ? e.message : String(e)
    if (e instanceof DowngradeError) {
      failStart(
        '더 새로운 버전에서 만든 데이터입니다',
        '이 앱보다 최신 버전이 만든 데이터라 열지 않았습니다. 데이터를 지키기 위해서입니다.\n' +
          `최신 버전을 다시 설치하거나 백업을 복원해 주세요.\n\n${message}`,
        backupDir
      )
    } else if (e instanceof CorruptError) {
      failStart(
        '데이터 파일이 손상되었습니다',
        '자동으로 되돌리지 않았습니다. 백업 파일을 직접 확인해 주세요.\n' +
          `백업 위치: ${backupDir}\n\n${message}`,
        backupDir
      )
    } else if (e instanceof MigrationError) {
      failStart(
        '데이터 구조를 갱신하지 못했습니다',
        '기존 데이터는 갱신 전 상태로 남아 있습니다. 자동으로 백업을 되돌리지 않았습니다.\n' +
          `백업 위치: ${backupDir}\n\n${message}`,
        backupDir
      )
    } else {
      failStart('앱을 시작하지 못했습니다', message, backupDir)
    }
  })

// 정상 종료 경로에서 WAL 을 접는다 (ADR-020 §5). 강제 종료는 막지 않는다 —
// WAL 저널이 그 경우를 위해 존재하며 다음 시작 시 SQLite 가 복구한다.
app.on('before-quit', () => {
  closeDatabase?.()
  closeDatabase = undefined
})

app.on('window-all-closed', () => {
  app.quit() // 트레이 도입(M1 후반, app-shell PRD R29) 전까지는 창 닫기 = 종료
})
