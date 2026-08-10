import { v7 as uuidv7 } from 'uuid'
import { localKeys, now } from '../../shared/time'
import { budgetPrefill, effectiveBaseline, effectiveBudget } from './baseline'
import type { ChildTaskRow, PlanDraftItem, UnitOfWork, WeekItemRow } from './ports'

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

export type WeekSummary = {
  week: string
  budget: number | null
  totalSpent: number
  items: WeekItemRow[]
  otherRow: { visible: boolean; spentPomos: number }
}

/** 일반 뷰 한 화면 = 응답 하나. 화면이 조각을 모아 조립하지 않게 한다. */
export function weekSummary(uow: UnitOfWork, week: string): WeekSummary {
  return uow.run((repos) => {
    const items = repos.weekItems.listForWeek(week)
    const totalSpent = repos.weekItems.weekTotalSpent(week)
    const spentPomos = otherRowSpent(totalSpent, items)
    return {
      week,
      budget: effectiveBudget(repos, week),
      totalSpent,
      items,
      otherRow: {
        // 표시 조건 세 갈래 (ADR-027 §3). 세 번째(`spentPomos > 0`)가 폐기·삭제로
        // 흘러든 소진을 잡는다 — 앞의 두 갈래만 보면 A24 가 깨진다.
        visible: repos.weekItems.hasUnplannedActivity(week) || spentPomos > 0,
        spentPomos
      }
    }
  })
}

/** 플래너 진입 시 초안 프리필. 기타 항목은 초안에 넣지 않는다 (R16). */
export function planDraft(
  uow: UnitOfWork,
  week: string
): { week: string; budget: number | null; prefill: number | null; items: PlanDraftItem[] } {
  return uow.run((repos) => ({
    week,
    budget: effectiveBudget(repos, week),
    prefill: budgetPrefill(repos),
    items: repos.weekItems.listForWeek(week).map((i) => ({
      id: i.id,
      title: i.title,
      estPomos: i.estPomos,
      days: i.days
    }))
  }))
}

/** 드로어 한 화면 = 응답 하나. 폐기 항목도 열린다 (header 가 listForWeek 밖을 본다). */
export function itemDrawer(
  uow: UnitOfWork,
  weekItemId: string
): { itemWeek: string; completedAt: string | null; tasks: ChildTaskRow[] } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`itemDrawer: week item '${weekItemId}' not found`)
    return {
      itemWeek: header.week,
      completedAt: header.completedAt,
      tasks: repos.weekItems.childTasks(weekItemId, localDate)
    }
  })
}

/**
 * 원클릭 pull (§3.1). 유자격 조각이 없으면 `pulled: null` 을 돌려주고, 화면은 그것을
 * 신호로 드로어를 연다 — 첫 pull 은 선택이 아니라 생성이기 때문이다 (R12).
 */
export function pullNextFromItem(
  uow: UnitOfWork,
  weekItemId: string
): { pulled: { taskId: string; title: string } | null; itemWeek: string } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`pullNext: week item '${weekItemId}' not found`)
    // 완료된 항목은 pull 을 막는다 (R27). 화면도 막지만 계약이 최종 방어선이다.
    if (header.completedAt !== null) {
      throw new Error(`pullNext: item '${weekItemId}' is completed`)
    }

    const taskId = repos.weekItems.nextPullable(weekItemId, localDate)
    if (taskId === null) return { pulled: null, itemWeek: header.week }

    repos.today.pull(taskId, localDate)
    return { pulled: { taskId, title: repos.tasks.titleOf(taskId) ?? '' }, itemWeek: header.week }
  })
}

/**
 * 드로어의 `오늘로 가져오기` (§6.3) — 새 조각 생성 + 선택한 기존 조각을 한 트랜잭션으로.
 *
 * M2 의 `pullTask`(services/today.ts)와 같은 규율을 따른다: **완료 거부·소속 검증을
 * 서비스가 한다.** UI 비활성만으로는 IPC 를 직접 부르는 경로가 열린다.
 */
export function pullFromDrawer(
  uow: UnitOfWork,
  input: {
    weekItemId: string
    taskIds: readonly string[]
    newTask: { title: string; estPomos: number | null } | null
  }
): { itemWeek: string } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(input.weekItemId)
    if (header === null) throw new Error(`pullFromDrawer: item '${input.weekItemId}' not found`)
    if (header.completedAt !== null) {
      throw new Error(`pullFromDrawer: item '${input.weekItemId}' is completed`) // R27
    }

    for (const taskId of input.taskIds) {
      const task = repos.tasks.get(taskId)
      if (!task) throw new Error(`pullFromDrawer: task '${taskId}' not found`)
      if (task.weekItemId !== input.weekItemId) {
        throw new Error(`pullFromDrawer: task '${taskId}' does not belong to this item`)
      }
      if (task.completedAt !== null) {
        throw new Error(`pullFromDrawer: task '${taskId}' is already completed`) // R7
      }
    }

    if (input.newTask !== null) {
      const trimmed = input.newTask.title.trim()
      if (trimmed === '') throw new Error('pullFromDrawer: new task title must not be empty')
      const taskId = uuidv7()
      repos.tasks.create({
        id: taskId,
        weekItemId: input.weekItemId,
        title: trimmed,
        ...(input.newTask.estPomos === null ? {} : { estPomos: input.newTask.estPomos })
      })
      repos.today.pull(taskId, localDate)
    }
    for (const taskId of input.taskIds) repos.today.pull(taskId, localDate)

    return { itemWeek: header.week }
  })
}

/** 항목 완료 확정·해제 (R25·R27). 완료는 언제나 사용자 클릭이 만드는 사실이다. */
export function setItemCompleted(
  uow: UnitOfWork,
  weekItemId: string,
  completed: boolean
): { itemWeek: string; completedAt: string | null } {
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`setItemCompleted: item '${weekItemId}' not found`)
    if (!completed) {
      repos.weekItems.uncomplete(weekItemId)
      return { itemWeek: header.week, completedAt: null }
    }
    const at = now()
    repos.weekItems.complete(weekItemId, at)
    return { itemWeek: header.week, completedAt: at }
  })
}

/** `보내주기` (§6.3). 폐기이지 삭제가 아니다 — 자식 조각·세션은 남는다 (ADR-014 §1). */
export function dropItem(uow: UnitOfWork, weekItemId: string): { itemWeek: string } {
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`dropItem: item '${weekItemId}' not found`)
    repos.weekItems.drop(weekItemId)
    return { itemWeek: header.week }
  })
}
