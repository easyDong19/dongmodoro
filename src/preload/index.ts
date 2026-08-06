import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '@shared/ipc/channels'
import type { Api } from '@shared/ipc/api'

/**
 * 화이트리스트 (ADR-007 §3). raw ipcRenderer 를 절대 노출하지 않는다 —
 * 노출하면 renderer 가 임의 채널을 호출할 수 있어 계약이 무의미해진다.
 * 채널 하나당 여기 한 줄씩 늘어나는 것이 곧 "무엇이 열려 있는지"의 목록이다.
 *
 * `: Api` 를 붙여 계약이 요구하는 표면을 다 구현했는지 컴파일러가 검사하게 한다.
 */
const api: Api = {
  system: {
    getAppInfo: () => ipcRenderer.invoke(CHANNELS.system.getAppInfo)
  }
}

contextBridge.exposeInMainWorld('api', api)
