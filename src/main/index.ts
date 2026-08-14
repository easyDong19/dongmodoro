import { app, dialog, shell, Menu } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerSystemHandlers } from './ipc/system'
import { registerClockHandlers } from './ipc/clock'
import { registerTodayHandlers } from './ipc/today'
import { registerTimerHandlers } from './ipc/timer'
import { registerWeekHandlers } from './ipc/week'
import { registerReviewHandlers } from './ipc/review'
import { registerCalendarHandlers } from './ipc/calendar'
import { registerMilestoneHandlers } from './ipc/milestones'
import { registerSettingsHandlers } from './ipc/settings'
import { startClock } from './services/clock'
import { applyTheme, readTheme } from './services/theme'
import { bootstrapWatermark } from './services/review'
import { calendarKeys, nowMs } from '@shared/time'
import { startTimerHost } from './services/timer-host'
import { openDb, closeDb } from './db/open'
import { migrateDb } from './db/migrate'
import { makeDrizzleUow } from './db/repositories/drizzle'
import { seedSettings } from './services/seed'
import { CorruptError, DowngradeError, MigrationError } from './db/errors'
import { acquireSingleInstanceLock, focusExistingWindow } from './single-instance'
import { resetAllData } from './db/reset'
import { buildAppMenu } from './menu'
import type { UnitOfWork } from './services/ports'
import type { TimerEngine } from './services/timer-engine'

/**
 * 마이그레이션 폴더의 자리는 **패키징 여부로 갈린다.** 한 경로로는 둘 다 맞출 수 없다.
 *
 * - 개발·`out/` 실행: 이 파일은 `out/main/index.js` 한 덩어리로 번들되므로 `../../` 가
 *   저장소 루트다. `migrate.ts` 가 자기 위치에서 유도하지 않고 인자로 받는 이유가 이것이다 —
 *   소스(`src/main/db/`)와 산출물(`out/main/`)의 깊이가 다르다. `import.meta.url` 을 쓰는
 *   것은 `"type": "module"` 이라 `__dirname` 이 없기 때문이다.
 * - 패키징: 코드가 asar 아카이브 안으로 들어가므로 같은 상대 경로가 **아카이브 내부의
 *   존재하지 않는 자리**를 가리킨다. `.sql` 은 `extraResources` 로 아카이브 밖에 실려
 *   있고(electron-builder.yml), 그 자리는 `process.resourcesPath` 아래다.
 *
 * 이 분기가 없으면 설치본이 **첫 실행에서만** 죽는다 — 개발 모드에서는 영영 재현되지
 * 않으므로, 검증은 반드시 설치본으로 해야 한다.
 */
const MIGRATIONS_DIR = app.isPackaged
  ? join(process.resourcesPath, 'drizzle')
  : join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')

let closeDatabase: (() => void) | undefined
let mainWindow: BrowserWindow | null = null
let stopClock: (() => void) | undefined
let stopTimerHost: (() => void) | undefined
/**
 * 초기화가 시작되면 종료 확인을 건너뛴다. 아래 `confirmAndResetAllData` 가 `close()` 가
 * 아니라 `destroy()` 를 쓰므로 실제로는 확인 경로가 돌지 않지만, 누군가 그것을 `close()`
 * 로 바꾸는 순간 사용자가 `계속 집중` 을 골라 **데이터를 이미 지운 뒤에 종료가 취소되는**
 * 상태가 만들어진다. 그 리팩터를 무해하게 만드는 값이다.
 */
let resetInProgress = false

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

/**
 * `sqlite` 와 `dbPath` 까지 돌려주는 이유: 전체 초기화가 백업을 뜨려면 **열린 원시 핸들**이
 * 필요하다 (체크포인트 없는 복사는 빈 파일이 된다 — db/migrate.ts). `closeDatabase` 클로저
 * 안에만 두면 꺼낼 방법이 없다.
 */
function startDb(): {
  schemaVersion: number
  uow: UnitOfWork
  sqlite: ReturnType<typeof openDb>['sqlite']
  dbPath: string
} {
  const userData = app.getPath('userData')
  const dbPath = join(userData, 'app.db')
  const { db, sqlite } = openDb(dbPath)
  closeDatabase = () => closeDb(sqlite)
  const { schemaVersion } = migrateDb(sqlite, db, userData, MIGRATIONS_DIR)
  const uow = makeDrizzleUow(db)
  // Seed static settings after migration — ADR-018 §4
  seedSettings(uow)
  // The watermark is computed, not seeded, so it comes after seeding and before any
  // window exists (weekly-review technical-spec 0.2). This is the ONLY write path into
  // it besides confirming a settlement: the read path must never initialise it, or a
  // lost key would be silently re-established on the next focus and quietly skip every
  // unsettled past week.
  bootstrapWatermark(uow, calendarKeys(nowMs()).dayKey)
  return { schemaVersion, uow, sqlite, dbPath }
}

/**
 * 도는 것들만 멈춘다 — **DB 는 열어 둔다.**
 *
 * 이 경계가 초기화의 전제다. 백업은 열린 핸들을 요구하는데(체크포인트 후 복사),
 * 여기서 DB 까지 닫으면 백업이 `The database connection is not open` 으로 죽고
 * 사용자는 되돌릴 지점 없이 데이터를 잃는다.
 */
function stopRuntimeTimers(): void {
  stopClock?.()
  stopClock = undefined
  stopTimerHost?.()
  stopTimerHost = undefined
}

/**
 * 정리 전체. `will-quit` 의 몸통이다.
 *
 * 훅을 `undefined` 로 비우는 것이 멱등성의 전부다 — 초기화가 여기를 한 번 지난 뒤
 * `will-quit` 이 다시 불려도 두 번 실행되지 않는다.
 */
function shutdownRuntime(): void {
  stopRuntimeTimers()
  closeDatabase?.()
  closeDatabase = undefined
}

/**
 * 모든 데이터를 지우고 앱을 다시 켠다.
 *
 * 순서가 위험한 부분 전부다. 특히 두 가지:
 *
 * **`close()` 가 아니라 `destroy()`.** `app.quit()` 은 창을 닫으며 window.ts 의 종료 확인
 * 다이얼로그를 친다. 거기서 사용자가 `계속 집중` 을 고르면 close 가 취소되는데, 그때는
 * 이미 DB 를 지운 뒤다 — 앱이 없는 파일 위에서 계속 돈다. `destroy()` 는 `close` 를
 * 발생시키지 않으므로 그 갈림길 자체가 생기지 않는다. 렌더러도 함께 죽어서 진행 중인
 * `invoke` 가 닫히는 DB 를 칠 일도 없다.
 *
 * **`engine.reset()` 이 `stopTimerHost()` 로 대체되지 않는다.** 후자는 `powerMonitor` 의
 * resume 리스너만 떼고 엔진에 걸린 만료 타이머는 그대로 둔다. 집중 세션이 살아 있는 채로
 * 초기화하면 그 만료가 나중에 발동해 닫힌 DB 에 기록을 시도하고, main 의 예외는 Electron 이
 * 에러 박스로 띄우므로 그 모달이 종료를 붙잡아 앱이 멈춘다. `reset()` 이 만료를 지운다.
 * 이 시점에 DB 는 아직 열려 있어야 한다 — idle 복귀가 baseline 을 읽는다.
 */
function confirmAndResetAllData(deps: {
  sqlite: ReturnType<typeof openDb>['sqlite']
  dbPath: string
  engine: TimerEngine
}): void {
  const userData = app.getPath('userData')
  const snap = deps.engine.getSnapshot()
  const sessionRunning =
    snap.mode === 'focus' && (snap.phase === 'running' || snap.phase === 'paused')

  // macOS 는 title 을 렌더하지 않는다 — 헤드라인을 message 에, 본문을 detail 에 둔다
  // (window.ts 의 종료 확인과 같은 이유). 파괴적 동작은 기본 버튼이 아니다.
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: '모든 데이터를 지울까요?',
    message: '모든 데이터를 지울까요?',
    detail:
      '주간 할당, 할 일, 집중 기록, 마일스톤, 설정이 모두 사라지고 앱이 처음 상태로 다시 시작해요.\n' +
      (sessionRunning ? '진행 중인 이 세션도 기록되지 않아요.\n' : '') +
      `지우기 직전 상태는 백업으로 남겨 둬요: ${userData}`,
    buttons: ['취소', '초기화'],
    defaultId: 0,
    cancelId: 0
  })
  if (choice === 0) return

  resetInProgress = true
  resetAllData({
    sqlite: deps.sqlite,
    dbPath: deps.dbPath,
    backupDir: userData,
    quiesce: () => {
      mainWindow?.destroy()
      mainWindow = null
      deps.engine.reset()
      // DB 를 닫지 않는 `stopRuntimeTimers` 다 — 백업이 아직 열린 핸들을 써야 한다.
      stopRuntimeTimers()
    },
    closeDatabase: () => {
      closeDatabase?.()
      closeDatabase = undefined
    }
  })

  app.relaunch()
  app.quit()
}

/**
 * 잠금이 **DB 열기보다 먼저다** (app-shell PRD R19). 이 순서가 규칙의 전부다 —
 * 뒤집으면 두 번째 프로세스가 이미 `app.db` 를 만진 뒤에 물러난다.
 */
if (acquireSingleInstanceLock()) {
  app.on('second-instance', () => focusExistingWindow(mainWindow))
  boot()
}

function boot(): void {
  app
    .whenReady()
    .then(() => {
      // DB 가 먼저다 — 열지 못하면 창을 띄우지 않는다.
      const { schemaVersion, uow, sqlite, dbPath } = startDb()
      /**
       * **창보다 먼저 테마를 적용한다** (design-system ADR-010 §3).
       *
       * 이 순서가 "첫 페인트 깜빡임 0" 의 근거 전부다. `nativeTheme.themeSource` 는 렌더러의
       * `prefers-color-scheme` 까지 결정하므로, 창이 만들어지기 전에 값을 넣어 두면 첫 프레임이
       * 이미 올바른 테마다. 렌더러가 뜬 뒤 IPC 로 물어보는 구조였다면 왕복하는 동안 반대 테마가
       * 한 번 그려지고, 그 깜빡임은 배선으로 없앨 수 없다.
       *
       * `readTheme` 은 계약 밖의 저장값(기존 DB 의 `"system"`)을 여기서 정규화하고 되쓴다.
       */
      const initialTheme = readTheme(uow)
      applyTheme(initialTheme)
      // 핸들러를 창보다 먼저 등록한다 — renderer 가 뜨자마자 호출해도 받을 사람이 있어야 한다.
      registerSystemHandlers(() => schemaVersion)
      registerClockHandlers()
      registerTodayHandlers(uow)
      registerWeekHandlers(uow)
      registerReviewHandlers(uow)
      registerCalendarHandlers(uow)
      registerMilestoneHandlers(uow)
      // 타이머는 창보다 먼저 산다 — renderer 가 죽어도 main 의 타이머는 계속 돈다 (R12).
      const timerHost = startTimerHost(uow, () => mainWindow)
      stopTimerHost = timerHost.stop
      registerTimerHandlers(timerHost.engine, uow)
      registerSettingsHandlers(uow, () => mainWindow)
      // 종료 확인 조건 (timer R13): focus 가 running/paused 일 때만 묻는다.
      mainWindow = createWindow(initialTheme, () => {
        if (resetInProgress) return false
        const snap = timerHost.engine.getSnapshot()
        return snap.mode === 'focus' && (snap.phase === 'running' || snap.phase === 'paused')
      })
      // 자정 알람은 창이 있어야 보낼 대상이 있다 — 창 생성 후에 시작한다.
      stopClock = startClock(() => mainWindow)
      /**
       * 앱 메뉴는 창 뒤에 세운다 — 초기화가 창을 부숴야 하므로 그 대상이 이미 있어야 한다.
       *
       * 프레임리스 커스텀 타이틀바라 **Windows·Linux 에는 보이는 메뉴 자리가 없다.** 이
       * 메뉴는 사실상 macOS 전용이고, 그쪽에서 초기화에 도달할 경로가 아직 없다는 뜻이다
       * (트레이가 들어올 때 함께 볼 자리다). 그럼에도 setApplicationMenu 를 전 플랫폼에서
       * 부르는 이유는 편집 메뉴다 — 안 부르면 기본 메뉴가 남고, 부르면서 editMenu 를
       * 빠뜨리면 입력창의 복사·붙여넣기가 죽는다 (menu.ts).
       */
      Menu.setApplicationMenu(
        buildAppMenu({
          onResetAllData: () => confirmAndResetAllData({ sqlite, dbPath, engine: timerHost.engine })
        })
      )
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
}

/**
 * 정상 종료 경로에서 WAL 을 접는다 (ADR-020 §5). 강제 종료는 막지 않는다 —
 * WAL 저널이 그 경우를 위해 존재하며 다음 시작 시 SQLite 가 복구한다.
 *
 * **`before-quit` 이 아니라 `will-quit` 이다.** 두 종료 경로의 이벤트 순서가 반대이기
 * 때문이다:
 *
 * - 창을 닫아서 끄면 `close` → `window-all-closed` → `quit()` → `before-quit` → `will-quit`
 * - `app.quit()` 으로 끄면(Cmd+Q·자동화) `before-quit` 이 **먼저**, 그 다음 창이 닫힌다
 *
 * `before-quit` 에서 DB 를 닫으면 두 번째 경로에서 **닫힌 DB 를 창의 close 핸들러가 읽는다** —
 * 종료 확인 조건이 타이머 스냅샷을 읽고(index.ts 의 `createWindow` 인자), 그 스냅샷이
 * `getFocusCountToday()` 로 DB 를 친다. 실측된 예외가
 * `TypeError: The database connection is not open` 이고, main 의 예외는 Electron 이
 * **에러 박스**로 띄우므로 그 모달이 종료를 붙잡아 앱이 죽지 않는다.
 *
 * `will-quit` 은 **창이 모두 닫힌 뒤**에만 오고, 종료가 취소되면(사용자가 `계속 집중` 을
 * 골라 close 를 preventDefault 하면) **아예 오지 않는다.** 그래서 이 자리는 두 가지를
 * 동시에 고친다 — 닫힌 DB 를 읽는 일이 없고, 취소된 종료가 시계·타이머·DB 를 꺼 놓은 채
 * 앱을 반쯤 죽은 상태로 남기지도 않는다.
 */
app.on('will-quit', () => shutdownRuntime())

app.on('window-all-closed', () => {
  /**
   * 초기화 중에는 물러난다. 이 핸들러는 `destroy()` 안에서 **동기로** 불리므로, 그대로
   * `app.quit()` 을 부르면 `will-quit` 이 같은 틱에 DB 를 닫아 버리고 뒤이을 백업이
   * `The database connection is not open` 으로 죽는다 — 데이터를 지우면서 되돌릴 지점은
   * 남기지 못하는, 이 기능에서 가장 나쁜 결과다. 종료는 초기화가 끝난 뒤 자기가 부른다.
   */
  if (resetInProgress) return
  app.quit() // 트레이 도입(M1 후반, app-shell PRD R29) 전까지는 창 닫기 = 종료
})
