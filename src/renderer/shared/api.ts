import type { Api } from '@shared/ipc/api'

declare global {
  interface Window {
    api: Api
  }
}

/** preload 가 contextBridge 로 심어둔 API. renderer 의 유일한 데이터 출입구다 (ADR-007). */
export const api = window.api
