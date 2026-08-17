import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useReducedMotion } from '@renderer/shared/ui/useReducedMotion'
import { MonthColumn } from './MonthColumn'
import type { MonthSlotProps } from './useMonthOverlay'

/**
 * MONTH 묶음이 놓이는 **하나의 자리** — 와이드에서는 좌 컬럼, 미디엄에서는 오버레이
 * (app-shell ux-spec §3.1).
 *
 * **두 자리를 각각 렌더하지 않고 한 컴포넌트가 옷만 갈아입는 이유:** React 는 위치와
 * 타입이 같을 때만 서브트리를 유지한다. 와이드에서 `MonthColumn` 을 직접, 미디엄에서
 * 오버레이 안에 렌더하면 구간을 넘을 때마다 MONTH 가 언마운트·재마운트되어 보고 있던 달과
 * 입력 중인 초안이 사라지고 캘린더·마일스톤 질의가 다시 나간다. 설계 §4.3 은 "구간 전환
 * 중에 데이터 리페치·mutation 을 트리거하지 않는다"를 요구한다.
 *
 * **덮는 대상은 우측 계획 컬럼(WEEK·TODAY)이다.** 좌측에서 열면 타이머를 덮게 되는데,
 * 타이머는 코어 루프라 어떤 상태에서도 가려지지 않아야 한다 (design-system ADR-011 §2).
 * MONTH 와 WEEK·TODAY 는 둘 다 계획 레이어이므로, 좁은 화면에서 계획끼리 자리를 교대하는
 * 것이 "타이머가 코어 루프, 계획은 레이어" 원칙과 맞는다.
 *
 * **비모달이라 스크림도 포커스 트랩도 없다.** `Tab` 으로 오버레이 밖(타이머)에 도달할 수
 * 있어야 한다 (§8.1). 대신 오버레이가 **덮고 있는** 계획 컬럼은 `App` 에서 `inert` 로
 * 빠진다 — 흐린 판 뒤에 가려진 컨트롤에 포커스 링만 뜨는 상태를 만들지 않기 위해서다.
 *
 * **바깥 클릭으로 닫지 않는다.** 타이머 버튼은 정의상 "밖"이므로, 그 규칙을 두면 일시정지를
 * 누를 때마다 오버레이가 예고 없이 닫힌다. 닫는 경로는 토글 재클릭 · `Esc` · 닫기 버튼 셋뿐.
 */
export function MonthSlot({
  overlay,
  onClose,
  slotRef,
  columnRef,
  closeRef,
  onFocus,
  onBlur
}: MonthSlotProps) {
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!overlay) return
    const onKey = (event: KeyboardEvent): void => {
      /**
       * **오버레이는 `Esc` 의 마지막 청구자다.** 안쪽 입력(마일스톤 초안·행 이름 편집)이나
       * 캡처 바가 이미 취소로 소비한 키를 여기서 또 받으면, 필드 하나를 무르려던 손짓에
       * 오버레이까지 함께 사라진다 — §3.1 이 바깥 클릭에 대해 금지한 바로 그 놀람이다.
       * 소비한 쪽이 `preventDefault()` 를 부르고, 여기서는 그 표시를 존중한다.
       */
      if (event.defaultPrevented) return
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [overlay, onClose])

  return (
    <div
      ref={slotRef}
      onFocus={onFocus}
      onBlur={onBlur}
      // 모션 축소 선호에서는 전이 없이 즉시 표시한다 (§3.1 · design-system ADR-005 §2).
      data-motion={overlay && reduced ? 'reduced' : undefined}
      className={
        overlay
          ? 'month-overlay absolute inset-y-6 right-6 z-[var(--layer-overlay)]'
          : 'flex min-h-0'
      }
    >
      {overlay ? (
        <button
          ref={closeRef}
          type="button"
          aria-label="MONTH 닫기"
          title="MONTH 닫기"
          onClick={onClose}
          // z-index 를 주지 않는다 — 절대 배치된 요소는 같은 스택 문맥의 흐름 형제 위에 이미
          // 그려진다. 다른 층(`--layer-sticky`)의 이름을 빌려 오면 그 층의 의미가 흐려진다.
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] border border-control-border bg-glass-strong text-ink"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
      <MonthColumn ref={columnRef} />
    </div>
  )
}
