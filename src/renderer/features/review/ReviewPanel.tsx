import { weekRangeLabel, weekStartLabel } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import { CompletedSection } from './CompletedSection'
import { PendingSection } from './PendingSection'
import { SummarySection } from './SummarySection'
import { useDecisions } from './useDecisions'
import type { ReviewPending } from './useReview'

/**
 * 정산 패널 (weekly-review ux-spec §1). 섹션 순서는 요약 → 끝낸 것들 → 남은 것들 →
 * 안내 → 확정이며, 내로우에서도 바뀌지 않는다 (§10).
 *
 * **모달이 아니다** (R7, 원칙 5). 열려 있는 동안에도 타이머·오늘 목록 조작이 가능해야
 * 하므로 화면을 덮지 않고 **주간 카드 자리를 인라인으로 대신한다** — 플래너와 같은
 * 방식이다. 오버레이로 덮으면 그 약속이 실질적으로 깨진다.
 *
 * 배치는 잠정이다. 반응형 구간별 배치(인라인 확장 / 오버레이 / 탭 전체 화면)는
 * app-shell ux-spec 소관이고 아직 없다 (M3b 계획서 정정 ③).
 */
export function ReviewPanel({
  data,
  currentWeek,
  onClose
}: {
  data: ReviewPending
  /** 오늘이 속한 주. 요약의 "이번 주 마감"과 "지난 주"를 가른다. */
  currentWeek: string
  onClose: () => void
}) {
  // 3택 상태는 패널이 산다 — 확정 섹션이 같은 상태에서 이월 뽀모 합을 읽어야 하고,
  // 목록 컴포넌트가 갖고 있으면 그 값을 형제에게 넘길 길이 없다.
  const decisions = useDecisions()

  if (!data.needed) {
    // 배너에서만 열리지만, 재조회 사이에 범위가 사라질 수 있다 — 다른 창에서 확정했거나
    // 자정을 넘겼거나. 빈 목록으로 거짓말하지 않고 사실을 적는다 (§8).
    return (
      <div className="flex h-full flex-col">
        <header className="shrink-0 px-4 pt-4">
          <p className="eyebrow">WEEK</p>
          <h2 className="card-title text-ink">정산</h2>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2 px-4">
          <p className="text-sm text-ink-dim">지금 정산할 주가 없어요</p>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    )
  }

  const span =
    data.from === data.to
      ? weekRangeLabel(data.from)
      : `${weekStartLabel(data.from)} – ${weekRangeLabel(data.to).split(' – ')[1]}`

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pt-4">
        <p className="eyebrow">WEEK</p>
        <h2 className="card-title text-ink">정산</h2>
        <p className="font-mono text-xs tabular-nums text-ink-dim">{span}</p>
      </header>

      {/* 섹션 순서는 요약 → 끝낸 것들 → 남은 것들 → 안내 → 확정이며 내로우에서도
          바뀌지 않는다 (§10). 남은 것들부터는 다음 태스크가 채운다. */}
      <div
        data-testid="review-sections"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3"
      >
        <SummarySection
          summary={data.summary}
          from={data.from}
          to={data.to}
          currentWeek={currentWeek}
        />
        <CompletedSection rows={data.completed} />
        <PendingSection
          rows={data.pending}
          merged={data.from !== data.to}
          choiceOf={decisions.choiceOf}
          reduceValueOf={decisions.reduceValueOf}
          onPick={decisions.pick}
          onReduce={decisions.setReduceValue}
        />
      </div>

      <div className="shrink-0 px-4 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  )
}
