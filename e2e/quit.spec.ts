import { test, expect, launchApp, makeUserDataDir, removeUserDataDir } from './fixtures/app'

/**
 * 종료 경로는 **두 갈래이고 이벤트 순서가 서로 반대다.**
 *
 * - 창을 닫아서 끄면 `close` → `window-all-closed` → `app.quit()` → `before-quit` 순이다.
 * - `app.quit()` 으로 끄면(Cmd+Q, 자동화) `before-quit` 이 **먼저** 오고 그 다음 창이 닫힌다.
 *
 * 앱의 정리(시계·타이머 호스트·DB 닫기)가 `before-quit` 에 있었기 때문에 두 번째 갈래에서
 * **DB 를 닫은 뒤에 창의 close 핸들러가 DB 를 읽었고**(종료 확인 조건이 타이머 스냅샷을
 * 읽는다), `The database connection is not open` 이 main 에서 던져졌다. main 의 예외는
 * Electron 이 에러 박스로 띄우므로 그 모달이 종료를 붙잡아 **앱이 영영 죽지 않았다.**
 *
 * 픽스처를 쓰지 않고 직접 띄우는 이유는, 픽스처의 정리 경로가 바로 이 버그를 밟아
 * 테스트가 실패하는 대신 **teardown 타임아웃**으로 무너지기 때문이다 — 무엇이 깨졌는지
 * 말해주지 않는다.
 */
test('app.quit() 경로로도 프로세스가 죽는다', async () => {
  const userDataDir = makeUserDataDir()
  try {
    const app = await launchApp(userDataDir)
    const win = await app.firstWindow()
    await win.getByRole('region', { name: '타이머' }).waitFor()

    const proc = app.process()
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))

    // 응답을 기다리지 않는다 — 종료 중인 프로세스가 CDP 응답을 돌려준다는 보장이 없다.
    app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => {})

    const outcome = await Promise.race([
      exited.then(() => 'exited' as const),
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 15_000))
    ])

    expect(outcome).toBe('exited')
    expect(proc.exitCode).toBe(0)
  } finally {
    removeUserDataDir(userDataDir)
  }
})
