import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 앱을 띄우고 끄는 방법을 여기 한 곳에만 둔다. 스펙마다 `electron.launch` 를 부르면
 * 임시 디렉토리 정리나 종료 처리가 파일마다 갈린다.
 *
 * `__dirname` 을 쓰지 않는 이유는 package.json 이 `"type": "module"` 이기 때문이다 —
 * src/main/index.ts 가 마이그레이션 경로를 푸는 방식과 같다.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * **개발 서버가 아니라 빌드 산출물을 띄운다.** `electron-vite build` 가 만드는 번들이 실제
 * 배포 대상이고, main/index.ts 의 마이그레이션 폴더 계산이 `out/main/` 기준으로 짜여 있어
 * 소스를 직접 실행하면 그 경로가 성립하지 않는다.
 */
const MAIN_ENTRY = join(REPO_ROOT, 'out', 'main', 'index.js')

/**
 * 매 실행마다 빈 사용자 데이터 디렉토리를 만든다.
 *
 * Electron 은 Chromium 의 `--user-data-dir` 스위치를 그대로 존중하므로
 * `app.getPath('userData')` 가 이쪽을 가리킨다. **main 코드를 한 줄도 고치지 않고**
 * 모든 테스트가 순정 첫 실행이 되고, 개발용 DB(`~/Library/Application Support/...`)도
 * 오염되지 않는다. 시딩 기본값·첫 실행 동작을 그대로 검증할 수 있는 근거가 이것이다.
 */
export function makeUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'dongmodoro-e2e-'))
}

export function removeUserDataDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/**
 * 주어진 사용자 데이터 디렉토리로 앱을 띄운다.
 *
 * 픽스처와 따로 export 하는 이유는 **같은 디렉토리로 두 번 띄우는 테스트**가 필요하기
 * 때문이다 — "설정을 바꾸고 재시작해도 유지되는가" 같은 케이스는 앱을 닫았다가 같은
 * 프로필로 다시 열어야 성립한다 (테마 계획서 Task 9).
 */
export async function launchApp(userDataDir: string): Promise<ElectronApplication> {
  if (!existsSync(MAIN_ENTRY)) {
    // 없는 파일을 Electron 에 넘기면 나오는 오류가 원인을 말해주지 않는다.
    throw new Error(
      `빌드 산출물이 없습니다: ${MAIN_ENTRY}\n` +
        `E2E 는 개발 서버가 아니라 빌드된 앱을 띄웁니다. 먼저 \`pnpm build\` 를 실행하거나 ` +
        `\`pnpm test:e2e:build\` 로 한 번에 돌리세요.`
    )
  }

  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    /**
     * **이것이 없으면 테마를 테스트할 수 없다.** Playwright 는 `colorScheme` 을 지정하지
     * 않으면 `'light'` 로 **에뮬레이션한다**(문서: "Defaults to 'light'"). 그 상태에서는
     * 앱이 무엇을 하든 렌더러의 `prefers-color-scheme` 이 항상 light 로 고정되어,
     * 측정값이 앱이 아니라 하네스를 말하게 된다.
     *
     * `null` 은 에뮬레이션을 끄고 시스템 기본값으로 되돌린다 — Electron 에서 그 "시스템"은
     * `nativeTheme.themeSource` 이므로, 앱이 실제로 정한 테마가 그대로 관측된다.
     */
    colorScheme: null
  })

  /**
   * main 의 stderr 를 테스트 로그로 흘린다.
   *
   * DB 열기 실패는 **창을 띄우지 않고 다이얼로그로 끝난다** (ADR-020 §4). 이 배선이 없으면
   * "창이 안 뜬다"는 사실만 알고 왜인지는 모른 채로 남는다.
   */
  app.process().stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[main] ${chunk.toString()}`)
  })

  return app
}

/**
 * 앱을 닫는다 — **프로세스가 실제로 죽는 것**과 `close()` 가 응답하는 것 중 먼저 오는 쪽을 취한다.
 *
 * `close()` 단독으로는 Linux 에서 멈춘다. Playwright 는 CDP 로 `app.quit()` 을 보내고 그
 * 응답을 기다리는데, 그 응답이 돌아오기 전에 앱이 죽어버리면 기다리던 프로미스가 영원히
 * 풀리지 않는다. macOS 는 종료가 느려 응답이 먼저 통과하므로 이 현상이 안 보인다.
 *
 * **진짜 멈춤을 숨기지 않는다.** 프로세스가 정말로 안 죽으면 `exited` 도 안 풀리고
 * `close()` 도 안 풀려서 예전처럼 teardown 타임아웃으로 실패한다. 여기서 통과하는 경우는
 * "앱이 정상 종료했다"뿐이며, 그것이 우리가 원하는 결과다.
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  const exited =
    proc.exitCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => proc.once('exit', () => resolve()))

  await Promise.race([app.close(), exited])
}

type AppFixtures = {
  /** 이 테스트 전용 임시 프로필 경로. 테스트가 끝나면 지워진다. */
  userDataDir: string
  electronApp: ElectronApplication
  /** 앱의 첫 창. Playwright 기본 `page`(브라우저용)를 덮지 않으려고 이름을 따로 둔다. */
  appWindow: Page
}

export const test = base.extend<AppFixtures>({
  // 의존하는 픽스처가 없어 빈 구조분해다. Playwright 가 첫 인자에 **구조분해 패턴을
  // 요구**하므로(`_fixtures` 로 이름을 주면 기동 자체가 실패한다) 이 형태를 피할 수 없다.
  // eslint 의 no-empty-pattern 은 e2e/ 스코프에서 꺼 둔다 (eslint.config.js).
  userDataDir: async ({}, use) => {
    const dir = makeUserDataDir()
    await use(dir)
    removeUserDataDir(dir)
  },

  electronApp: async ({ userDataDir }, use) => {
    const app = await launchApp(userDataDir)
    await use(app)
    // 실패한 테스트에서도 반드시 돌아야 하므로 정리 구간에 둔다.
    await closeApp(app)
  },

  appWindow: async ({ electronApp }, use) => {
    await use(await electronApp.firstWindow())
  }
})

export { expect } from '@playwright/test'
