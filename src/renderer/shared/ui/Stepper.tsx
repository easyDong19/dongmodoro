import { Button } from './button'

/**
 * 수 조절 스테퍼 `− n +`.
 *
 * 하한·상한에 닿으면 **해당 버튼만** 비활성된다. 경고 문구도 흔들림 애니메이션도 붙이지
 * 않는다 (weekly-review ux-spec §5.3) — 줄이는 것은 실패가 아니다.
 */
export function Stepper({
  value,
  min,
  max,
  label,
  onChange
}: {
  value: number
  min: number
  max: number
  label: string
  onChange: (next: number) => void
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`${label} 줄이기`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </Button>
      <span
        data-testid="stepper-value"
        aria-label={label}
        className="min-w-4 text-center font-mono text-sm tabular-nums text-ink"
      >
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`${label} 늘리기`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </Button>
    </span>
  )
}
