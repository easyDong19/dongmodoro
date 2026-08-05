/**
 * IPC 채널 이름. main·preload 가 같은 상수를 보게 해서 오타로 인한 무응답을 없앤다.
 * 새 유스케이스는 여기 → contracts.ts → handleIpc → preload 순으로 네 곳을 모두 채운다 (ADR-007).
 */
export const CHANNELS = {
  system: { getAppInfo: 'system:getAppInfo' }
} as const
