import { test, expect } from './fixtures/app'

/**
 * 하네스가 살아 있음을 증명하는 최소 한 개. 코어 루프(타이머 시작·pull·정산)까지 덮는 것은
 * **테스트 백필**이라 별개 작업이다 (계획서 "이번 계획서에서 뺀 것").
 *
 * 잡는 방법은 App.tsx 가 이미 붙여 둔 `aria-label` 이다. 테스트 전용 `data-testid` 를
 * 심지 않는다 — 접근성 이름은 사용자에게도 의미가 있어 **테스트와 사용자가 같은 것을 본다**
 * (계획서 Global Constraints: E2E 를 위해 src/ 를 고치지 않는다).
 */
const CARD_LABELS = ['월 결과물', '캘린더', '타이머', '주간 계획', '오늘 목록'] as const

test('앱이 뜨고 카드 5장이 보인다', async ({ appWindow }) => {
  // 렌더러가 조용히 던지는 예외를 잡는다. 화면은 멀쩡해 보이는데 콘솔만 빨간 경우가 있다.
  const consoleErrors: string[] = []
  appWindow.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  for (const label of CARD_LABELS) {
    /**
     * 임의의 대기 시간을 쓰지 않고 요소 가시성으로 기다린다. ClockGate 가 `clock:now`
     * 응답 전에는 자식을 마운트하지 않으므로(ClockGate.tsx), 카드가 보인다는 것은
     * **IPC 왕복이 성공했다는 뜻**이기도 하다.
     */
    await expect(appWindow.getByRole('region', { name: label })).toBeVisible()
  }

  await appWindow.screenshot({ path: 'e2e-artifacts/smoke.png' })

  expect(consoleErrors).toEqual([])
})
