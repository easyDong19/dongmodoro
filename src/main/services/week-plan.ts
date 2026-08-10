import { effectiveBaseline } from './baseline'
import type { PlanDraftItem, UnitOfWork, WeekItemRow } from './ports'

/**
 * 기타 행 소진 — **차액으로 정의한다** (ADR-027 §1).
 *
 * `visibleItems` 는 **화면에 보이는 항목**(= `listForWeek` 의 결과)이어야 한다. 폐기 항목을
 * 넣으면 그 소진이 상쇄되어 어디에도 나타나지 않고 A24 가 깨진다.
 *
 * 클램프하지 않는다 — 술어가 옳으면 음수가 될 수 없고, 음수가 나온다면 그것은 숨겨야 할
 * 값이 아니라 드러나야 할 버그다.
 */
export function otherRowSpent(
  weekTotalSpent: number,
  visibleItems: readonly Pick<WeekItemRow, 'spentPomos'>[]
): number {
  return weekTotalSpent - visibleItems.reduce((sum, item) => sum + item.spentPomos, 0)
}

/**
 * 항목의 남은 몫 (R9·A12). 기준은 **항목 est** 이며 자식 조각 est 합이 아니다.
 * 0 에서 클램프한다 — 소진이 est 를 넘긴 항목의 남은 몫은 음수가 아니라 0 이다.
 *
 * 화면에 그리는 것은 정산(M3b)이지만 규칙의 소유는 week-plan R9 이므로 여기서 만든다.
 * 두 곳에서 각자 클램프하면 한쪽만 고쳐지는 날이 온다.
 */
export function remainingPomos(estPomos: number, spentPomos: number): number {
  return Math.max(0, estPomos - spentPomos)
}

/**
 * 플래너 확정 (R22~R24). **과적 여부와 무관하게 항상 성공한다** — 확정을 막는 경로가
 * 이 함수에 없다 (R22, 차단 0건). 전체가 트랜잭션 하나다 (ADR-015).
 */
export function confirmWeekPlan(
  uow: UnitOfWork,
  input: { week: string; budget: number | null; items: readonly PlanDraftItem[] }
): { week: string; droppedCount: number } {
  return uow.run((repos) => {
    // 행이 없으면 그 시점 유효 길이를 박제해 만든다 (ADR-013 §2). 있으면 덮지 않는다.
    // NOTE(M3b): weekly-review R37 은 capacity·예산까지 함께 박제하라고 요구한다.
    // M3a 는 capacity 가 항상 NULL 이라 무해하지만, 정산이 capacity 편집을 들이면
    // 플래너로 만든 주만 capacity 스냅샷이 비는 비대칭이 생긴다. 그때 ensure 를 확장할 것.
    repos.weeks.ensure(input.week, effectiveBaseline(repos, input.week))
    repos.weeks.setPlan(input.week, input.budget)
    const { droppedIds } = repos.weekItems.confirmPlan({ week: input.week, items: input.items })
    return { week: input.week, droppedCount: droppedIds.length }
  })
}
