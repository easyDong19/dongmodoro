import { weekRangeLabel } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import { BudgetGauge } from './BudgetGauge'
import { OtherRow } from './OtherRow'
import { WeekItemRow } from './WeekItemRow'
import { useWeek } from './useWeek'

/**
 * 빈 상태 세 갈래 (ux-spec §8). 사실만 적고 칭찬하지 않는다 (principles §1).
 *
 * 갈래를 가르는 기준이 "항목이 있느냐" 하나가 아니라는 점이 핵심이다 — 계획은 없지만
 * 기록은 있는 주에 "할당을 잡으면 예산이 보여요"라고 하면 이미 보이고 있는 기록을
 * 없는 셈 치는 말이 된다.
 */
function EmptyState({
  kind,
  onOpenPlanner
}: {
  kind: 'no-plan' | 'unplanned-only' | 'all-done'
  onOpenPlanner: () => void
}) {
  if (kind === 'unplanned-only') {
    return <p className="px-2 py-2 text-xs text-ink-dim">계획이 없어도 기록은 남아요</p>
  }
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-4">
      <p className="text-sm text-ink-dim">
        {kind === 'all-done'
          ? '이번 주 할당을 다 끝냈어요'
          : '이번 주 할당을 잡으면 뽀모 예산이 여기 보여요'}
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={onOpenPlanner}>
        {kind === 'all-done' ? '수정' : '+ 이번 주 할당 잡기'}
      </Button>
    </div>
  )
}

/**
 * 주간 카드 일반 뷰 (ux-spec §2). 세로 3단이고 **가운데만 늘어나고 스크롤한다.**
 *
 * 게이지가 목록 **바깥**에 있고 `shrink-0` 인 것이 이 레이아웃의 요점이다. 목록 안에
 * 넣거나 `min-h-0` 를 빼면 항목이 쌓일 때 카드가 늘어나 게이지가 뷰포트 밖으로 밀린다 —
 * 예산 대비 소진은 이 화면이 존재하는 이유라 항상 보여야 한다.
 */
export function WeekCard({ onOpenPlanner }: { onOpenPlanner?: () => void }) {
  const { weekKey, query, pullNext, complete, uncomplete } = useWeek()
  const summary = query.data

  if (summary === undefined) return null

  const { items, otherRow, budget, totalSpent } = summary
  const openPlanner = onOpenPlanner ?? (() => {})
  const emptyKind =
    items.length > 0
      ? items.every((i) => i.completedAt !== null)
        ? 'all-done'
        : null
      : otherRow.visible
        ? 'unplanned-only'
        : 'no-plan'

  return (
    // 랜드마크 라벨은 App 의 감싸는 section 이 갖는다 — 여기에도 붙이면 같은 이름이 둘이 된다.
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pt-4">
        <p className="text-xs tracking-wide text-ink-dim">WEEK</p>
        <h2 className="text-base text-ink">이번 주 할당</h2>
        <p className="font-mono text-xs tabular-nums text-ink-dim">{weekRangeLabel(weekKey)}</p>
      </header>

      <ul data-testid="week-item-list" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {items.map((row) => (
          <WeekItemRow
            key={row.id}
            row={row}
            week={weekKey}
            onPullNext={(id) => pullNext.mutate(id)}
            onComplete={(id) => complete.mutate(id)}
            onUncomplete={(id) => uncomplete.mutate(id)}
          />
        ))}
        {/* 기타 행은 항상 목록 맨 아래다 (§3.4). */}
        {otherRow.visible ? <OtherRow spentPomos={otherRow.spentPomos} /> : null}
        {emptyKind !== null ? (
          <li>
            <EmptyState kind={emptyKind} onOpenPlanner={openPlanner} />
          </li>
        ) : null}
      </ul>

      <div data-testid="week-gauge-slot" className="shrink-0">
        <BudgetGauge budget={budget} spent={totalSpent} />
      </div>
    </div>
  )
}
