import type { BrowserWindow } from 'electron'
import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import type { UnitOfWork } from '../services/ports'
import { readTheme, setTheme } from '../services/theme'
import { handleIpc } from './handle'

/**
 * 설정 유스케이스의 invoke 핸들러.
 *
 * 이 파일은 배선만 한다 — 정규화·적용 규칙은 전부 services/theme.ts 가 갖는다. 특히
 * **핸들러가 `nativeTheme` 을 직접 만지지 않는다**: 적용 지점이 둘이 되는 순간
 * design-system ADR-010 §3 의 "해석은 한 곳" 이 깨진다.
 *
 * 창을 함수로 받는 이유는 다른 핸들러들과 같다 — 등록이 창 생성보다 먼저 일어나므로
 * 그 시점의 창을 값으로 붙잡아 둘 수 없다. Windows·Linux 에서 테마가 바뀔 때
 * `setTitleBarOverlay` 를 다시 불러야 하므로 여기서 창이 필요하다.
 */
export function registerSettingsHandlers(
  uow: UnitOfWork,
  getWindow: () => BrowserWindow | null
): void {
  handleIpc(CHANNELS.settings.getTheme, contracts.settings.getTheme, () => ({
    theme: readTheme(uow)
  }))

  handleIpc(CHANNELS.settings.setTheme, contracts.settings.setTheme, (theme) => ({
    theme: setTheme(uow, theme, getWindow())
  }))
}
