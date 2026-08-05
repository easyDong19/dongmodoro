import { app } from 'electron'
import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import { handleIpc } from './handle'

/**
 * 첫 유스케이스. 도메인 로직이 0 이라 배관만 검증한다.
 * schemaVersion 은 DB 계층이 소유하므로 주입받는다 (Task 4 에서 실값이 연결된다).
 */
export function registerSystemHandlers(getSchemaVersion: () => number): void {
  handleIpc(CHANNELS.system.getAppInfo, contracts.system.getAppInfo, () => ({
    appVersion: app.getVersion(),
    schemaVersion: getSchemaVersion()
  }))
}
