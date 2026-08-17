// 테스트 내부 상태 관리이므로 ADR-025 캐시 규칙 제외
/* eslint-disable no-restricted-syntax */

/**
 * **테스트 전용.** jsdom 에는 `matchMedia` 가 없어서 구간을 만들 방법이 이것뿐이다.
 *
 * 실제 브라우저의 `MediaQueryList` 는 창이 바뀌면 `matches` 가 따라 바뀌고 `change` 가
 * 발화한다. 그 두 가지만 흉내 낸다 — `matches` 를 게터로 두어 폭이 바뀌면 즉시 따라오게
 * 하고, 등록된 리스너를 폭 변경 시 전부 호출한다.
 */
type Listener = () => void

const listeners = new Set<Listener>()
let currentWidth = 1280

/** 현재 창 폭을 바꾸고 구독자에게 알린다. `act()` 안에서 호출한다. */
export function setViewportWidth(width: number): void {
  currentWidth = width
  for (const listener of [...listeners]) listener()
}

/** 등록된 리스너 개수. 정리가 제대로 이루어졌는지 검증하는 테스트용. */
export function listenerCount(): number {
  return listeners.size
}

/** `window.matchMedia` 를 목으로 세운다. 각 테스트의 `beforeEach` 에서 호출한다. */
export function installMatchMedia(width = 1280): void {
  currentWidth = width
  listeners.clear()

  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? '0')
    return {
      get matches() {
        return currentWidth >= min
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => void listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => void listeners.delete(listener),
      addListener: (listener: Listener) => void listeners.add(listener),
      removeListener: (listener: Listener) => void listeners.delete(listener),
      dispatchEvent: () => false
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}
