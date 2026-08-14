import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  launchApp,
  closeApp,
  makeUserDataDir,
  removeUserDataDir
} from './fixtures/app'

const DARK_BG = 'rgb(12, 26, 22)' // --bg-deep
const LIGHT_BG = 'rgb(231, 238, 236)' // --light-bg-deep

const bodyBackground = () => getComputedStyle(document.body).backgroundColor

/**
 * 전체 초기화는 **재시작으로 끝나는데, 그 재시작은 Playwright 가 볼 수 없다** — 새 프로세스는
 * 디버깅 포트 없이 Playwright 통제 밖에서 뜨고 `ElectronApplication` 은 원본과 함께 죽는다.
 * 그래서 재시작된 창을 붙잡으려 하지 않고, theme.spec 의 "같은 프로필로 두 번 띄우기" 패턴을
 * 그대로 쓴다: 우리가 직접 두 번째로 띄워서 그 결과가 첫 실행과 같은지 본다.
 *
 * 테마를 관측값으로 쓰는 이유는 그것이 `settings` 행이기 때문이다 — 사용자가 고른 범위가
 * "설정까지 포함한 완전 초기화" 이므로, 라이트로 바꾼 값이 다크로 돌아오는 것이 그 결정의
 * 단언 그 자체다.
 *
 * 픽스처를 쓰지 않고 직접 관리하는 이유는 quit.spec 과 같다 — 프로세스가 죽지 않는 실패를
 * 픽스처가 teardown 타임아웃으로 바꿔 버리면 무엇이 깨졌는지 알 수 없다.
 */
test('메뉴에서 초기화하면 데이터가 지워지고 백업이 남는다', async () => {
  const userDataDir = makeUserDataDir()
  try {
    const first = await launchApp(userDataDir)
    const firstWindow = await first.firstWindow()
    await firstWindow.getByRole('region', { name: '타이머' }).waitFor()

    // 지워질 것을 하나 만든다. 첫 실행 기본값이 다크이므로 라이트가 곧 "사용자가 바꾼 흔적" 이다.
    await firstWindow.getByRole('button', { name: '라이트 테마' }).click()
    await expect.poll(() => firstWindow.evaluate(bodyBackground)).toBe(LIGHT_BG)
    expect(existsSync(join(userDataDir, 'app.db'))).toBe(true)

    /**
     * 메인 안에서 두 가지를 무력화한다.
     *
     * `showMessageBoxSync` — 이름 그대로 동기라 메인 프로세스를 붙잡는다. 아무도 누르지
     * 않으면 테스트가 **진단 없는 타임아웃**으로 죽는다. `1` 은 `['취소', '초기화']` 의 초기화다.
     *
     * `relaunch` — 이것이 없으면 테스트가 아니라 경주가 된다. 재시작된 프로세스가 곧바로
     * 같은 프로필로 `app.db` 를 다시 만들어 아래의 "지워졌는가" 단언이 흔들리고, 단일
     * 인스턴스 잠금까지 쥐고 있어 두 번째 `launchApp` 이 즉시 물러난다. **재시작 자체는
     * 여기서 검증되지 않는다** — Playwright 가 볼 수 없는 부분이고, 아래에서 우리가 직접
     * 띄우는 두 번째 실행이 그 자리를 대신 본다.
     */
    await first.evaluate(({ dialog, app }) => {
      dialog.showMessageBoxSync = () => 1
      app.relaunch = () => {}
    })

    const proc = first.process()
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))

    // 응답을 기다리지 않는다 — 이 호출 도중에 프로세스가 죽는다 (quit.spec 과 같은 이유).
    first
      .evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('reset-all-data')?.click())
      .catch(() => {})

    /**
     * 이 단언이 잡는 것은 "데이터가 지워졌는가" 가 아니라 **앱이 멈추지 않았는가** 다.
     * 살아 있는 타이머 만료가 닫힌 DB 를 치면 main 의 예외가 에러 박스로 떠서 종료를
     * 붙잡는다 — 그때 여기가 'hung' 이 된다.
     */
    const outcome = await Promise.race([
      exited.then(() => 'exited' as const),
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 15_000))
    ])
    expect(outcome).toBe('exited')

    expect(existsSync(join(userDataDir, 'app.db'))).toBe(false)
    expect(existsSync(join(userDataDir, 'app.db-wal'))).toBe(false)
    expect(existsSync(join(userDataDir, 'app.db-shm'))).toBe(false)
    // 되돌릴 지점이 없는 초기화는 사고다. 백업이 남았는지가 그 약속의 단언이다.
    expect(readdirSync(userDataDir).filter((f) => f.startsWith('app.db.backup-'))).toHaveLength(1)

    // 앱이 스스로 재시작한 프로세스는 우리가 붙잡을 수 없으므로 직접 다시 띄운다.
    const second = await launchApp(userDataDir)
    const secondWindow = await second.firstWindow()
    await secondWindow.getByRole('region', { name: '타이머' }).waitFor()
    // 시딩이 다시 돌아 첫 실행 기본값으로 돌아왔다 — 설정까지 지우는 범위의 단언이다.
    expect(await secondWindow.evaluate(bodyBackground)).toBe(DARK_BG)
    await closeApp(second)
  } finally {
    removeUserDataDir(userDataDir)
  }
})
