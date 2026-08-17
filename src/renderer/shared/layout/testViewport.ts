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
let reducedMotion = false
/** 목을 세우기 전의 값. jsdom 에는 없으므로 `undefined` 가 정상이고, 그래서 별도 플래그로 "잡았는지"를 구분한다. */
let originalMatchMedia: typeof window.matchMedia | undefined
let captured = false

/** 현재 창 폭을 바꾸고 구독자에게 알린다. `act()` 안에서 호출한다. */
export function setViewportWidth(width: number): void {
  currentWidth = width
  for (const listener of [...listeners]) listener()
}

/** 등록된 리스너 개수. 정리가 제대로 이루어졌는지 검증하는 테스트용. */
export function listenerCount(): number {
  return listeners.size
}

/**
 * `window.matchMedia` 를 목으로 세운다. 각 테스트의 `beforeEach` 에서 호출하고,
 * `afterEach` 에서 `uninstallMatchMedia()` 로 걷는다.
 *
 * `reducedMotion` 은 `prefers-reduced-motion: reduce` 의 답이다. 기본값 `false` 가
 * **실사용자 대다수의 경로**다 — 이 값을 항상 참으로 답하던 시절에는 모션이 붙는 경로를
 * 어떤 테스트도 밟지 못했다.
 */
export function installMatchMedia(width = 1280, options: { reducedMotion?: boolean } = {}): void {
  currentWidth = width
  reducedMotion = options.reducedMotion ?? false
  listeners.clear()
  if (!captured) {
    originalMatchMedia = window.matchMedia
    captured = true
  }

  window.matchMedia = ((query: string) => {
    /**
     * **아는 쿼리에만 답한다.** 모르는 쿼리를 `min-width: 0` 으로 떨어뜨리면 무엇을 묻든
     * `matches: true` 가 되어, 목이 답을 지어내고 테스트는 그 거짓말을 검증하게 된다.
     */
    const minWidth = /min-width:\s*(\d+)px/.exec(query)?.[1]
    const asksReducedMotion = /prefers-reduced-motion:\s*reduce/.test(query)

    return {
      get matches() {
        if (minWidth !== undefined) return currentWidth >= Number(minWidth)
        if (asksReducedMotion) return reducedMotion
        return false
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

/**
 * 목을 걷는다. 각 테스트의 `afterEach` 에서 호출한다.
 *
 * **파일 안 순서에 의존하지 않기 위해서다.** 목은 모듈 수준이라 한 번 세우면 폭이 그대로
 * 남는다. 걷지 않으면 "폭을 주지 않은 테스트는 와이드"라는 약속이 앞 테스트가 남긴 폭에
 * 좌우되고, 미디엄 블록 아래에 새 테스트를 하나 적는 것만으로 조용히 깨진다.
 */
export function uninstallMatchMedia(): void {
  listeners.clear()
  currentWidth = 1280
  reducedMotion = false
  if (originalMatchMedia === undefined) {
    // jsdom 에는 원래 없다 — 세우기 전 상태로 되돌린다.
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia
  } else {
    window.matchMedia = originalMatchMedia
  }
}
