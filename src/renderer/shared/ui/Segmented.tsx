import type { ReactNode } from 'react'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  /** 선택됐을 때의 텍스트 색 유틸리티. 미선택은 항상 중립색이다. */
  selectedText?: string
  icon?: ReactNode
}

/**
 * 세그먼트 토글. 배타 선택 하나를 한 줄로 보여준다.
 *
 * **선택 상태에 보더가 필수다** — `--glass-strong` 배경은 고대비 모드에서 사라지므로
 * 배경만으로 선택을 표현하면 무엇이 선택됐는지 알 수 없다 (design-system ADR-006 §3).
 * `aria-pressed` 는 스크린리더용이고 **시각 신호를 대체하지 않는다.**
 *
 * 색 단독으로 의미를 전달하지 않도록 아이콘·문구를 함께 쓴다 (principles §2).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={`control inline-flex min-h-[var(--target-min)] items-center gap-1 rounded-md border px-2 text-xs ${
              on
                ? `border-control-border bg-glass-strong ${option.selectedText ?? 'text-ink'}`
                : 'border-transparent text-ink-dim'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
