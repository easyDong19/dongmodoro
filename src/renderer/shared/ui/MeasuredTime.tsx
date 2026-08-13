import { formatMeasured } from '@renderer/shared/lib/measured-time'

/**
 * 측정 시간 한 조각 (week-plan ux-spec §0 — 그 절이 규칙의 원본이다).
 *
 * 포맷은 `formatMeasured` 하나이고, 이 컴포넌트가 더하는 것은 **타이포 규칙**뿐이다:
 * 숫자는 `--font-mono` + tabular-nums 이어야 폭이 흔들리지 않고(§0.4), 기본 톤은
 * `--ink-dim` 이다 (§0.5 — 세션 0인 자리의 `0분` 도 이 톤으로 적는다).
 *
 * `sec` 는 언제나 main 이 내려보낸 초다. 값 없음(`null`)은 여기 오지 않는다 — 숫자
 * 자리를 아예 그리지 않는 것이 그 표현이므로, 호출부가 렌더 여부로 가른다 (§0.3).
 */
export function MeasuredTime({
  sec,
  className,
  testId = 'measured-time'
}: {
  sec: number
  className?: string
  /** 한 화면에 여러 개가 나올 때 특정 자리를 집어내기 위한 것 (예: 주 총합). */
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      className={`font-mono tabular-nums ${className ?? 'text-xs text-ink-dim'}`}
    >
      {formatMeasured(sec)}
    </span>
  )
}
