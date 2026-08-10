import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 모션 축소 선호 판정 **한 곳** (principles §4). 주간 게이지 바와 항목 드로어가 같이 쓴다 —
 * 판정을 두 번 만들면 한쪽만 고쳐지는 날이 온다.
 *
 * 소비자는 이 값으로 컨테이너에 `data-motion="reduced"` 를 달고, 그 속성으로 전이 클래스를
 * 끈다. 전역 `* { transition: none !important }` 킬은 **폐기된 패턴**이다 — 모션만 죽이지
 * 않고 상태 변화 피드백까지 함께 죽인다 (design-system ADR-005 §2).
 *
 * `matchMedia` 가 없는 환경(구형 jsdom 목)에서도 던지지 않고 `false` 로 떨어진다 —
 * 모션을 켜는 쪽이 기본값이라, 판정 실패가 화면을 멈추게 하지는 않는다.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(QUERY).matches ?? false)

  useEffect(() => {
    const mql = window.matchMedia?.(QUERY)
    if (!mql) return
    const onChange = (): void => setReduced(mql.matches)
    onChange() // 마운트와 구독 사이에 값이 바뀌었을 수 있다
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
