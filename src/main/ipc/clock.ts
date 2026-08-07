import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import { nowMs } from '@shared/time'
import { boundaryPayload } from '../services/clock'
import { handleIpc } from './handle'

/** `clock.now` invoke 핸들러 — 지금 순간의 달력 키 3종을 반환한다 (Task 5). */
export function registerClockHandlers(): void {
  handleIpc(CHANNELS.clock.now, contracts.clock.now, () => boundaryPayload(nowMs()))
}
