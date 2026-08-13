import type { BrowserWindow } from 'electron'
import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import type { UnitOfWork } from '../services/ports'
import type { TimerEngine } from '../services/timer-engine'
import { globalBaseline, writeBaseline } from '../services/baseline'
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
  getWindow: () => BrowserWindow | null,
  engine: Pick<TimerEngine, 'refreshBaseline'>
): void {
  handleIpc(CHANNELS.settings.getTheme, contracts.settings.getTheme, () => ({
    theme: readTheme(uow)
  }))

  handleIpc(CHANNELS.settings.setTheme, contracts.settings.setTheme, (theme) => ({
    theme: setTheme(uow, theme, getWindow())
  }))

  handleIpc(CHANNELS.settings.getBaseline, contracts.settings.getBaseline, () =>
    uow.run(globalBaseline)
  )

  handleIpc(CHANNELS.settings.setBaseline, contracts.settings.setBaseline, (form) => {
    const saved = writeBaseline(uow, form)
    /**
     * 저장 **뒤에** 부른다 — 엔진이 새 길이를 읽어야 하는데 그 출처가 방금 쓴 settings 다.
     *
     * 여기서 전이가 나가면 renderer 의 타이머 카드가 그것으로 갱신된다. 쿼리 무효화로
     * 하지 않는 이유는 다이얼이 쿼리에서 오는 값이 아니라 **엔진 상태**이기 때문이다
     * (invalidate.ts 의 `baseline-changed` 가 타이머를 대상에서 뺀 그 근거는 유효하다 —
     * 바뀐 것은 "엔진이 스스로 다시 읽을 때까지 기다린다"는 판단 쪽이다).
     */
    engine.refreshBaseline()
    return saved
  })
}
