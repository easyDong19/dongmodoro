import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useReducedMotion } from '@renderer/shared/ui/useReducedMotion'
import { MonthColumn } from './MonthColumn'

/**
 * 미디엄 구간의 MONTH 오버레이 (app-shell ux-spec §3.1).
 *
 * **덮는 대상은 우측 계획 컬럼(WEEK·TODAY)이다.** 좌측에서 열면 타이머를 덮게 되는데,
 * 같은 절의 비모달 규칙은 "열린 동안에도 타이머를 조작할 수 있다"(PRD R10)를 요구한다.
 * MONTH 와 WEEK·TODAY 는 둘 다 계획 레이어이므로, 좁은 화면에서 계획끼리 자리를 교대하는
 * 것이 "타이머가 코어 루프, 계획은 레이어" 원칙과 맞는다.
 *
 * **비모달이라 스크림도 포커스 트랩도 없다.** `Tab` 으로 오버레이 밖에 도달할 수 있어야
 * 한다 (§8.1). 열릴 때 포커스는 첫 요소(닫기 버튼)로 옮기되 가두지 않는다.
 *
 * **바깥 클릭으로 닫지 않는다.** 타이머 버튼은 정의상 "밖"이므로, 그 규칙을 두면 일시정지를
 * 누를 때마다 오버레이가 예고 없이 닫힌다. 닫는 경로는 토글 재클릭 · `Esc` · 닫기 버튼 셋뿐.
 */
export function MonthOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      // 모션 축소 선호에서는 전이 없이 즉시 표시한다 (§3.1 · design-system ADR-005 §2).
      data-motion={reduced ? 'reduced' : undefined}
      className="month-overlay absolute inset-y-6 right-6 z-[var(--layer-overlay)]"
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="MONTH 닫기"
        title="MONTH 닫기"
        onClick={onClose}
        className="absolute right-2 top-2 z-[var(--layer-sticky)] flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] border border-control-border bg-glass-strong text-ink"
      >
        <X size={14} aria-hidden="true" />
      </button>
      <MonthColumn />
    </div>
  )
}
