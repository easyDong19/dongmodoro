import type { ReactNode } from 'react'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  /** 선택됐을 때의 텍스트 색 유틸리티. 미선택은 항상 중립색이다. */
  selectedText?: string
  icon?: ReactNode
}

const SIZE = {
  xs: 'px-2 text-xs',
  sm: 'px-3 text-sm'
} as const

/**
 * 토글 칸 하나의 표면. **앱의 모든 누름 상태 토글이 이 한 곳을 지난다** — 세그먼트뿐 아니라
 * 다중 선택 칩(플래너의 요일)도 여기서 클래스를 받는다. 컴포넌트마다 선택 표현을 따로 적으면
 * 한쪽이 보더를 빠뜨린다: 타이머 모드 탭과 요일 칩이 배경만으로 선택을 말하고 있었다.
 *
 * `offBorder` 는 미선택 칸의 테두리다. 배타 세그먼트는 투명(선택된 칸이 그룹을 대표한다),
 * 다중 선택 칩은 옅은 윤곽선이다 — 아무것도 안 고른 7칸이 글자만 남으면 누를 수 있는
 * 것으로 읽히지 않는다.
 */
export function segmentClass(
  on: boolean,
  {
    size = 'xs',
    selectedText = 'text-ink',
    offBorder = 'border-transparent'
  }: { size?: keyof typeof SIZE; selectedText?: string; offBorder?: string } = {}
): string {
  return `control inline-flex min-h-[var(--target-min)] items-center gap-1 rounded-md border ${SIZE[size]} ${
    on ? `border-control-border bg-glass-strong ${selectedText}` : `${offBorder} text-ink-dim`
  }`
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
  label,
  size = 'xs'
}: {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
  label: string
  size?: keyof typeof SIZE
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
            className={segmentClass(on, { size, selectedText: option.selectedText })}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
