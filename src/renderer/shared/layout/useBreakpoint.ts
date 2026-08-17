import { useEffect, useState } from 'react'
import { BP_WIDE, type Breakpoint } from '@shared/layout/breakpoints'

const QUERY = `(min-width: ${BP_WIDE}px)`

function read(): Breakpoint {
  return (window.matchMedia?.(QUERY).matches ?? true) ? 'wide' : 'medium'
}

/**
 * 창 폭 구간 판정 **한 곳** (design-system ADR-001).
 *
 * **CSS 미디어 쿼리로 나누지 않는 이유:** app-shell ux-spec §5 는 "와이드에서 미디엄으로
 * 넘어오면 MONTH 오버레이가 열린 상태로 진입한다"를 요구한다. 이것은 상태가 아니라
 * **전환** 에 반응하는 규칙이라 CSS 로는 표현할 수 없다. 판정이 CSS 와 JS 두 곳에 있으면
 * 값이 어긋나는 순간 "레이아웃은 미디엄인데 토글은 안 보인다"가 된다.
 *
 * **쿼리가 하나뿐인 이유:** 내로우 구간은 창 최소 폭(`BP_MEDIUM`)으로 진입 자체를 막으므로
 * 판정에 등장할 일이 없다.
 *
 * `matchMedia` 가 없는 환경에서는 `wide` 로 떨어진다 — 판정 실패가 카드를 감추는 쪽으로
 * 기울면 안 된다.
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(read)

  useEffect(() => {
    const mql = window.matchMedia?.(QUERY)
    if (!mql) return
    const onChange = (): void => setBreakpoint(mql.matches ? 'wide' : 'medium')
    onChange() // 마운트와 구독 사이에 폭이 바뀌었을 수 있다
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return breakpoint
}
