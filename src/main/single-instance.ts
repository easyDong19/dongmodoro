import { app } from 'electron'
import type { BrowserWindow } from 'electron'

/**
 * 단일 인스턴스 잠금 (app-shell PRD R19).
 *
 * **개발 모드에서는 절대 드러나지 않는 결함이다** — 앱을 한 번만 띄우기 때문이다. 설치본에서
 * 사용자가 Dock 아이콘을 두 번 누르면 두 프로세스가 **같은 SQLite 파일을 연다**: 타이머가
 * 둘 돌고, 알림이 두 번 오고, 시작 시 백업이 살아 있는 인스턴스의 DB 위에서 실행된다.
 *
 * 호출 순서가 규칙의 전부다. **잠금 판정이 DB 열기보다 먼저여야 한다** — 뒤집으면 두 번째
 * 프로세스가 이미 파일을 만진 뒤에 물러난다. `app.quit()` 은 즉시 반환하므로, 호출부가
 * `false` 를 받고도 계속 진행하면 종료 중인 프로세스가 부팅을 끝까지 밟는다.
 *
 * 이 잠금은 트레이·창 닫기=숨김을 **끌고 오지 않는다.** PRD R25 가 셋을 동반 필수로 묶은
 * 것은 "창 닫기 = 숨김"을 도입할 때의 이야기이고, 지금은 창 닫기 = 종료라 잠금만 단독으로
 * 성립한다.
 *
 * `index.ts` 가 아니라 별도 파일인 이유는 테스트다 — `index.ts` 는 import 되는 것만으로
 * 부팅을 실행하므로 그 안에 두면 이 함수를 검사할 방법이 없다.
 */
export function acquireSingleInstanceLock(): boolean {
  if (app.requestSingleInstanceLock()) return true
  app.quit()
  return false
}

/**
 * 두 번째 실행에 대한 응답 (PRD R18 표의 `앱 재실행 시도`) — 창을 만들지 않고 기존 창을
 * 앞으로 부른다.
 *
 * **타이머를 건드리지 않는다.** 복귀는 실행이 아니다 (R28 과 같은 이유). 창이 없으면 아무
 * 일도 하지 않는다: 지금은 창이 닫히면 앱도 종료되므로 그 경로에 도달할 수 없고, 도달
 * 가능해지는 시점(트레이 도입)에 무엇을 할지는 그 작업이 정한다.
 */
export function focusExistingWindow(window: BrowserWindow | null): void {
  if (window === null) return
  if (window.isMinimized()) window.restore()
  window.focus()
}
