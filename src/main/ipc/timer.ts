import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import type { UnitOfWork } from '../services/ports'
import { captureSession } from '../services/sessions'
import type { TimerEngine } from '../services/timer-engine'
import { handleIpc } from './handle'

/**
 * 타이머 명령 + 사후 캡처 invoke 핸들러 (Task 8). 상태 변경 명령의 응답은 전부
 * 전이 후 스냅샷이다 — 전이 이벤트와 별개로, 호출자는 자기 명령의 결과를 즉시 받는다.
 */
export function registerTimerHandlers(engine: TimerEngine, uow: UnitOfWork): void {
  handleIpc(CHANNELS.timer.getState, contracts.timer.getState, () => engine.getSnapshot())
  handleIpc(CHANNELS.timer.start, contracts.timer.start, () => engine.start())
  handleIpc(CHANNELS.timer.startWithTask, contracts.timer.startWithTask, (taskId) =>
    engine.startWithTask(taskId)
  )
  handleIpc(CHANNELS.timer.pause, contracts.timer.pause, () => engine.pause())
  handleIpc(CHANNELS.timer.resume, contracts.timer.resume, () => engine.resume())
  handleIpc(CHANNELS.timer.reset, contracts.timer.reset, () => engine.reset())
  handleIpc(CHANNELS.timer.adjust, contracts.timer.adjust, (deltaMin) => engine.adjust(deltaMin))
  handleIpc(CHANNELS.timer.completeEarly, contracts.timer.completeEarly, () =>
    engine.completeEarly()
  )
  handleIpc(CHANNELS.timer.setMode, contracts.timer.setMode, (mode) => engine.setMode(mode))
  handleIpc(CHANNELS.sessions.capture, contracts.sessions.capture, (sessionId, title) =>
    captureSession(uow, sessionId, title)
  )
}
