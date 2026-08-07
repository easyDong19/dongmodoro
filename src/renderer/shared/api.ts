import type { Api } from '@shared/ipc/api'

declare global {
  interface Window {
    api: Api
  }
}

/**
 * preload 가 contextBridge 로 심어둔 API. renderer 의 유일한 데이터 출입구다 (ADR-007).
 *
 * `window.api` 를 그대로 참조하지 않고 Proxy 로 감싼다 — 모듈 최상단에서 캡처하면
 * 그 시점의 `window.api` 값이 영구히 고정된다. 컴포넌트 테스트는 렌더 직전에
 * `window.api` 를 목으로 채워 넣는데(preload 가 없는 jsdom 환경이라 그 방법뿐이다),
 * 캡처형이면 import 시점(목 주입 이전)의 undefined 가 굳어 항상 깨진다. Proxy 는 호출
 * 시점에 `window.api` 를 다시 읽으므로 프로덕션 동작(부트스트랩에서 이미 채워져 있음)은
 * 그대로이고, 테스트에서만 있는 타이밍 문제가 사라진다.
 */
export const api: Api = new Proxy({} as Api, {
  get(_target, prop, receiver) {
    return Reflect.get(window.api, prop, receiver)
  }
})
