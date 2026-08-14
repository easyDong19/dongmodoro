import { test, expect } from './fixtures/app'

/**
 * 세션 종료 주의 신호의 **electron 배선**만 본다 (timer ux-spec §6.2). 규칙 자체는
 * `src/main/services/session-signals.test.ts` 가 순수하게 덮으므로 여기서 다시 재지 않는다 —
 * 이 스펙이 잡는 것은 유닛 테스트가 구조적으로 닿을 수 없는 두 가지다.
 *
 * 1. `app.dock` 이 실제로 그 API 를 갖고 있는가 (Electron 을 올릴 때 조용히 바뀔 수 있다).
 * 2. `browser-window-focus` 리스너가 정말 걸려 있는가 (배선이 끊기면 `critical` 바운스가
 *    영원히 튄다 — 아무 에러도 나지 않는 종류의 회귀다).
 *
 * **관측 방법은 몽키패치다.** Dock 이 튀는 것을 화면에서 볼 방법이 없으므로, main 프로세스의
 * `app.dock` 을 호출 기록기로 갈아끼운다. 이 스펙에 한해 그렇게 하는 것이고 앱 코드에는
 * 테스트용 구멍을 내지 않는다.
 *
 * **플랫폼이 갈린다.** `app.dock` 은 macOS 에만 있고 CI 는 ubuntu 에서 이 스위트를 돌린다
 * (ci.yml 의 `xvfb-run ... pnpm test:e2e`). 그래서 mac 에서는 바운스·취소를 재고,
 * 그 밖에서는 **`?.` 가드가 터지지 않는지**를 잰다 — 그쪽이 CI 가 지켜 줄 수 있는 회귀다.
 */
const IS_MAC = process.platform === 'darwin'

type DockRecorder = { bounced: string[]; cancelled: number[] }

const BOUNCE_ID = 42

test('창이 포커스가 아닐 때만 주의 신호가 시작되고, 포커스되면 끊긴다', async ({
  electronApp,
  appWindow
}) => {
  // 완료 시퀀스가 main 에서 던지면 IPC 응답이 거부되고 렌더러 콘솔에 남는다 —
  // dock 이 없는 플랫폼에서 `?.` 가드가 빠졌을 때 이것이 신호다.
  const consoleErrors: string[] = []
  appWindow.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await expect(appWindow.getByRole('region', { name: '타이머' })).toBeVisible()

  const wiring = await electronApp.evaluate(({ app, BrowserWindow }, bounceId) => {
    const g = globalThis as unknown as { dockRec: { bounced: string[]; cancelled: number[] } }
    g.dockRec = { bounced: [], cancelled: [] }

    const dock = app.dock
    if (dock) {
      dock.bounce = (type?: string) => {
        g.dockRec.bounced.push(type ?? 'none')
        return bounceId
      }
      dock.cancelBounce = (id: number) => {
        g.dockRec.cancelled.push(id)
      }
    }

    // 창이 눈앞에 없는 상황이 이 기능의 전제다.
    BrowserWindow.getAllWindows()[0].blur()

    return {
      hasDock: dock !== undefined,
      hasBounce: typeof dock?.bounce === 'function',
      hasCancelBounce: typeof dock?.cancelBounce === 'function',
      focusListeners: app.listenerCount('browser-window-focus'),
      focusedAfterBlur: BrowserWindow.getAllWindows()[0].isFocused()
    }
  }, BOUNCE_ID)

  // 배선은 플랫폼과 무관하게 걸려 있어야 한다. 이것이 없으면 바운스를 끊을 길이 없다.
  expect(wiring.focusListeners).toBeGreaterThan(0)
  expect(wiring.hasDock).toBe(IS_MAC)
  if (IS_MAC) {
    expect(wiring.hasBounce).toBe(true)
    expect(wiring.hasCancelBounce).toBe(true)
  }

  // 자유 집중 CTA 와 이름이 겹치므로 정확히 일치하는 쪽을 잡는다.
  await appWindow.getByRole('button', { name: '시작', exact: true }).click()
  await appWindow.getByRole('button', { name: '완료 처리' }).click()

  // 완료 시퀀스가 끝까지 갔다 — 휴식 idle 로 전환되어 다시 시작 버튼이 나온다.
  await expect(appWindow.getByRole('button', { name: '시작', exact: true })).toBeVisible()

  if (IS_MAC) {
    // 포커스가 아니었으므로 계속형으로 튄다 (ux-spec §6.2).
    await expect
      .poll(async () => await readDock(), { timeout: 5000 })
      .toEqual({ bounced: ['critical'], cancelled: [] })

    // 사용자가 창을 보면 신호는 할 일을 마쳤다. 취소는 bounce 가 준 id 로만 가능하다.
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].focus()
    })
    await expect
      .poll(async () => await readDock(), { timeout: 5000 })
      .toEqual({ bounced: ['critical'], cancelled: [BOUNCE_ID] })
  } else {
    // dock 이 없는 플랫폼에서 완료가 조용히 지나가야 한다 — 신호가 없는 것은 정상이고,
    // 던지는 것은 정상이 아니다.
    expect(await readDock()).toEqual({ bounced: [], cancelled: [] })
  }

  expect(consoleErrors).toEqual([])

  async function readDock(): Promise<DockRecorder> {
    return await electronApp.evaluate(() => {
      const g = globalThis as unknown as { dockRec: DockRecorder }
      return { ...g.dockRec }
    })
  }
})
