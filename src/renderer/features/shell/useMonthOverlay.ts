import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject
} from 'react'
import type { Breakpoint } from '@shared/layout/breakpoints'

/** `MonthSlot` 이 그대로 받는 묶음. 슬롯은 DOM 만 그리고 판단은 전부 이 훅이 한다. */
export interface MonthSlotProps {
  /** 오버레이로 그릴지(미디엄 + 열림), 컬럼 자리로 그릴지(와이드). */
  overlay: boolean
  onClose: () => void
  slotRef: RefObject<HTMLDivElement | null>
  columnRef: RefObject<HTMLDivElement | null>
  closeRef: RefObject<HTMLButtonElement | null>
  onFocus: () => void
  onBlur: (event: FocusEvent<HTMLDivElement>) => void
}

export interface MonthOverlayState {
  /** 미디엄에서 오버레이가 열려 있는지. 와이드에서는 토글 자체가 없다. */
  open: boolean
  /** MONTH 묶음을 렌더할지 — 와이드면 항상, 미디엄이면 열렸을 때만. */
  visible: boolean
  toggle: () => void
  close: () => void
  slotProps: MonthSlotProps
}

/**
 * MONTH 오버레이의 상태·전환·포커스를 한 곳에서 소유한다 (app-shell ux-spec §3.1·§5·§8.1).
 *
 * `App` 은 구성 루트다. 미디어 쿼리 판정·UI 상태·전환 규칙·포커스 이동이 거기 쌓이면
 * "무엇을 어디에 배치하는가"가 그 사이에 묻힌다. 그래서 MONTH 쪽 규칙 전부가 여기에 있다.
 *
 * ## 와이드 → 미디엄 을 **렌더 중** 조정하는 이유
 *
 * 이 규칙(§5.1)을 effect 로 쓰면 순서가 이렇게 된다: 미디엄 + 닫힘으로 한 번 커밋 →
 * MONTH 가 DOM 에서 **사라졌다가** → effect 가 열어 다시 마운트. `useLayoutEffect` 로
 * 바꿔도 한 프레임이 아니라 언마운트가 문제다 — 캘린더가 보고 있던 달, 마일스톤의 입력
 * 중인 초안, React Query 구독이 그 사이에 전부 버려지고 재조회가 뜬다. 설계 §4.3 은
 * "구간 전환 중에 데이터 리페치·mutation 을 트리거하지 않는다"를 요구한다.
 *
 * 그래서 이전 구간을 상태로 들고 **렌더 중에** 비교해 조정한다. React 는 이 렌더 결과를
 * 버리고 즉시 다시 렌더하므로 커밋은 한 번뿐이고, MONTH 는 언마운트를 겪지 않는다.
 */
export function useMonthOverlay(breakpoint: Breakpoint): MonthOverlayState {
  const isWide = breakpoint === 'wide'
  const [open, setOpen] = useState(false)
  const [lastBreakpoint, setLastBreakpoint] = useState(breakpoint)

  const slotRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  /** 포커스가 MONTH 슬롯 안에 있었는지. 구간 전환으로 포커스가 사라진 경우를 가려낸다. */
  const focusWithin = useRef(false)
  /**
   * 열림이 **사용자 조작** 에서 온 것인지. 오버레이 안으로 포커스를 옮기는 것은 §8.1 이
   * 그 경우에만 허용한다 — 창을 줄이다 열린 오버레이가 TODAY 입력에서 포커스를 뺏어가면
   * 문장 한가운데서 타이핑이 끊긴다.
   */
  const autoFocus = useRef(false)

  if (lastBreakpoint !== breakpoint) {
    const previous = lastBreakpoint
    setLastBreakpoint(breakpoint)
    if (previous === 'wide' && breakpoint === 'medium') {
      setOpen(true)
      autoFocus.current = false
    }
  }

  const close = useCallback(() => {
    autoFocus.current = false
    setOpen(false)
  }, [])

  const toggle = useCallback(() => {
    autoFocus.current = true
    setOpen((wasOpen) => !wasOpen)
  }, [])

  const onFocus = useCallback(() => {
    focusWithin.current = true
  }, [])

  const onBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    // 슬롯 안에서 옮겨 다니는 포커스는 여전히 "안"이다.
    if (!event.currentTarget.contains(event.relatedTarget)) focusWithin.current = false
  }, [])

  // 사용자가 연 오버레이만 첫 요소(닫기 버튼)로 포커스를 옮긴다. 가두지는 않는다 (§8.1).
  useLayoutEffect(() => {
    if (isWide || !open || !autoFocus.current) return
    autoFocus.current = false
    closeRef.current?.focus()
  }, [isWide, open])

  /**
   * 미디엄 → 와이드 에서 오버레이의 닫기 버튼이 사라진다. 그때 포커스를 잡고 있었으면
   * 브라우저는 그것을 `body` 로 되돌리는데, §8.1 은 "그 요소를 담고 있던 카드의 컨테이너"
   * 로 옮기라고 정했다 — 키보드 사용자가 자기 자리를 잃지 않아야 한다.
   *
   * 살아남은 요소가 포커스를 유지하고 있으면(예: 마일스톤 입력) 건드리지 않는다. 포커스가
   * 애초에 슬롯 밖(타이머)에 있었던 경우도 마찬가지다 — 그건 뺏어오는 것이 된다.
   */
  const lastFocusBreakpoint = useRef(breakpoint)
  useLayoutEffect(() => {
    const previous = lastFocusBreakpoint.current
    lastFocusBreakpoint.current = breakpoint
    if (previous !== 'medium' || breakpoint !== 'wide') return

    const slot = slotRef.current
    if (slot === null || !focusWithin.current) return
    if (slot.contains(document.activeElement)) return
    columnRef.current?.focus()
  }, [breakpoint])

  return {
    open,
    visible: isWide || open,
    toggle,
    close,
    slotProps: { overlay: !isWide, onClose: close, slotRef, columnRef, closeRef, onFocus, onBlur }
  }
}
