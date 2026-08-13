import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'

/**
 * 기타 행 (ux-spec §3.4) — 목록 맨 아래 한 행. 계획에 없던 집중을 한 줄로 모은다.
 *
 * 값은 **차액**이라 main 이 계산해 보내며(ADR-027 §1), 이 컴포넌트는 판정하지 않는다.
 *
 * 톤: 점선 테두리로 계획 항목과 구분하되 `--ink-faint` 로 낮추지 않는다 — 실제로 한
 * 집중이므로 흐리게 만들면 "덜 중요한 기록"이라고 거짓말을 하는 셈이다.
 *
 * 값은 **초**로 오고 포맷은 표기 규칙 한 벌을 따른다 (ux-spec §0). 차액이므로 음수가
 * 나올 수 있고, 그때도 감추지 않는다 — 술어 버그가 화면에 드러나야 한다 (§0.1).
 */
export function OtherRow({ measuredSec }: { measuredSec: number }) {
  return (
    <li
      data-testid="other-row"
      className="flex items-center gap-2 rounded-md border border-dashed border-glass-border-soft px-2 py-2"
    >
      <span className="flex-1 text-sm text-ink-dim">기타 — 계획에 없던 집중</span>
      <MeasuredTime sec={measuredSec} />
    </li>
  )
}
