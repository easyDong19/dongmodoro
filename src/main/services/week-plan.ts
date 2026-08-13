import { v7 as uuidv7 } from 'uuid'
import { localKeys, monthOfWeek, now } from '../../shared/time'
import type { ChildTaskRow, MilestoneRow, PlanDraftItem, UnitOfWork, WeekItemRow } from './ports'

/**
 * 기타 행 **측정 시간** — 차액이며 통화만 바뀌었다 (ADR-031 §2).
 *
 * ```
 * 기타 행 측정 시간(초) = 주 총 focus 초 − Σ(화면에 보이는 항목의 focus 초)
 * ```
 *
 * **초 단계에서 계산한다.** 분으로 접은 값끼리 빼면 항목 3개가 각 90초일 때 Σ 가 6분이
 * 되어 총합 270초(=4분)보다 커지고, 차액이 음수가 된다 — 반올림을 표시 직전 한 번으로
 * 미루는 이유가 이것이다 (ADR-031 §2).
 *
 * **클램프하지 않는다.** 술어가 옳으면 음수가 될 수 없고, 음수가 나온다면 숨겨야 할
 * 값이 아니라 드러나야 할 버그다 (ux-spec §3.4).
 */
export function otherRowMeasuredSec(
  weekTotalMeasuredSec: number,
  visibleItems: readonly Pick<WeekItemRow, 'measuredSec'>[]
): number {
  return weekTotalMeasuredSec - visibleItems.reduce((sum, item) => sum + item.measuredSec, 0)
}

/**
 * 플래너 확정 (R23·R24). **확정을 막는 경로가 이 함수에 없다** — 막을 근거였던 과적은
 * 예산과 함께 죽었다 (ADR-030 §3). 전체가 트랜잭션 하나다 (ADR-015).
 */
export function confirmWeekPlan(
  uow: UnitOfWork,
  input: { week: string; items: readonly PlanDraftItem[] }
): { week: string; droppedCount: number } {
  return uow.run((repos) => {
    const { droppedIds } = repos.weekItems.confirmPlan({ week: input.week, items: input.items })
    return { week: input.week, droppedCount: droppedIds.length }
  })
}

export type WeekSummary = {
  week: string
  /** 그 주 측정 시간 총합(초). 분으로 접지 않는다 — 포맷은 renderer 의 몫이다. */
  totalMeasuredSec: number
  items: WeekItemRow[]
  otherRow: { visible: boolean; measuredSec: number }
}

/** 일반 뷰 한 화면 = 응답 하나. 화면이 조각을 모아 조립하지 않게 한다. */
export function weekSummary(uow: UnitOfWork, week: string): WeekSummary {
  return uow.run((repos) => {
    const items = repos.weekItems.listForWeek(week)
    const totalMeasuredSec = repos.weekItems.weekTotalMeasuredSec(week)
    const measuredSec = otherRowMeasuredSec(totalMeasuredSec, items)
    return {
      week,
      totalMeasuredSec,
      items,
      otherRow: {
        /**
         * 표시 조건 세 갈래 (ADR-027 §3, 통화 전환분은 ux-spec §3.4).
         *
         * ①② 는 `hasUnplannedActivity` — 미분류 세션·부모 없는 조각이면 **값이 0 이어도**
         * 행을 띄운다. ③ 은 `hasHiddenFocus` 로, 목록에 보이는 항목으로 설명되지 않는
         * focus 세션의 **존재**를 본다.
         *
         * ③ 을 옛 규칙대로 `차액 > 0` 으로 읽지 않는 이유가 `duration_sec = 0` 세션이다 —
         * 시작 직후 `완료 처리` 가 만드는 정상 경로이고, 그런 세션만 붙은 항목을 폐기하면
         * 차액이 0 초라 행이 사라진다. 그러면 실재한 집중이 화면에서 증발해 A24 가 깨진다.
         * 크기가 아니라 존재로 판정하면 그 구멍이 닫힌다.
         *
         * 마지막 `measuredSec !== 0` 은 술어 버그를 드러내기 위한 것이다. 정의역이 옳으면
         * ③ 이 거짓일 때 차액은 정확히 0 이므로, 0 이 아닌데 행이 숨는 상태를 만들지 않는다
         * (ux-spec §3.4 — 음수를 감추지 않는다).
         */
        visible:
          repos.weekItems.hasUnplannedActivity(week) ||
          repos.weekItems.hasHiddenFocus(week) ||
          measuredSec !== 0,
        measuredSec
      }
    }
  })
}

/** 플래너 진입 시 초안 프리필. 기타 항목은 초안에 넣지 않는다 (R16). */
export function planDraft(uow: UnitOfWork, week: string): { week: string; items: PlanDraftItem[] } {
  return uow.run((repos) => ({
    week,
    items: repos.weekItems
      .listForWeek(week)
      .map((i) => ({ id: i.id, title: i.title, days: i.days }))
  }))
}

/**
 * 드로어 한 화면 = 응답 하나. 폐기 항목도 열린다 (header 가 listForWeek 밖을 본다).
 *
 * 마일스톤 후보를 **여기서 계산해 실어 보낸다** (milestones R14 · A12). 렌더러가
 * `monthOfWeek` 를 부르고 보관을 거르면 후보 규칙이 두 곳이 된다.
 *
 * 지금 걸린 연결(`milestone`)은 후보 밖일 수 있다 — 이월 승계가 만든 타월 연결이며,
 * 화면은 그것을 지우지 않고 비활성 옵션으로 함께 보여준다 (R15).
 */
export function itemDrawer(
  uow: UnitOfWork,
  weekItemId: string
): {
  itemWeek: string
  completedAt: string | null
  tasks: ChildTaskRow[]
  milestone: MilestoneRow | null
  milestoneCandidates: MilestoneRow[]
} {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`itemDrawer: week item '${weekItemId}' not found`)
    return {
      itemWeek: header.week,
      completedAt: header.completedAt,
      tasks: repos.weekItems.childTasks(weekItemId, localDate),
      milestone: repos.milestones.linkedMilestone(weekItemId),
      milestoneCandidates: repos.milestones.listForMonth(monthOfWeek(header.week))
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
    newTask: { title: string } | null
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
      repos.tasks.create({ id: taskId, weekItemId: input.weekItemId, title: trimmed })
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

/**
 * 할당 ↔ 마일스톤 연결 (milestones R13·R14 · A12).
 *
 * **후보 제한을 서비스가 강제한다.** 화면이 후보 목록을 좁히는 것만으로는 IPC 를 직접
 * 부르는 경로가 열린다 — `pullFromDrawer` 의 소속 검증과 같은 규율이다. 후보는 그 할당의
 * 주가 귀속된 달(`monthOfWeek`)의 **보관되지 않은** 마일스톤이며, 8월 주의 할당을 9월
 * 마일스톤에 새로 매달 수 없다. 그렇지 않으면 한 마일스톤의 롤업이 임의의 달에서 올라와
 * 월 레이어의 경계가 사라진다.
 *
 * **해제(`null`)는 언제나 허용된다** — 연결 없음은 오류 상태가 아니다 (R13). 이월이
 * 승계한 타월 연결도 이 경로로 끊을 수 있어야 한다.
 */
export function setItemMilestone(
  uow: UnitOfWork,
  input: { weekItemId: string; milestoneId: string | null }
): { itemWeek: string } {
  return uow.run((repos) => {
    const header = repos.weekItems.header(input.weekItemId)
    if (header === null) {
      throw new Error(`setItemMilestone: item '${input.weekItemId}' not found`)
    }

    if (input.milestoneId !== null) {
      const candidates = repos.milestones.listForMonth(monthOfWeek(header.week))
      if (!candidates.some((m) => m.id === input.milestoneId)) {
        throw new Error(
          `setItemMilestone: milestone '${input.milestoneId}' is not a candidate for week ${header.week}`
        )
      }
    }

    repos.milestones.setWeekItemMilestone(input.weekItemId, input.milestoneId)
    return { itemWeek: header.week }
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
