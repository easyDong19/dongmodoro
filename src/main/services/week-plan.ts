import { v7 as uuidv7 } from 'uuid'
import { calendarKeys, localKeys, now } from '../../shared/time'
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
 * 연결 후보의 순서 — **이번 달 → 미래(가까운 달부터) → 과거(가까운 달부터)** (ADR-035).
 * 고를 일이 가장 많은 달이 위에 온다. 같은 달 안에서는 저장소가 준 생성 순을 지킨다
 * (`sort` 는 안정 정렬이다).
 */
function candidateOrder(rows: MilestoneRow[], todayMonth: string): MilestoneRow[] {
  const rank = (month: string): [number, number] => {
    if (month === todayMonth) return [0, 0]
    const [y, m] = month.split('-').map(Number)
    const [ty, tm] = todayMonth.split('-').map(Number)
    const distance = Math.abs(y * 12 + m - (ty * 12 + tm))
    return month > todayMonth ? [1, distance] : [2, distance]
  }
  return [...rows].sort((a, b) => {
    const [ga, da] = rank(a.month)
    const [gb, db] = rank(b.month)
    return ga - gb || da - db
  })
}

/**
 * 드로어 한 화면 = 응답 하나. 폐기 항목도 열린다 (header 가 listForWeek 밖을 본다).
 *
 * 마일스톤 후보는 **모든 달의 마일스톤**이다 (ADR-035). 그 주가 귀속된 달로 좁히던 제한
 * (예전 R14)이 없어졌으므로 지금 걸린 연결도 언제나 후보 안에 있다. 순서만 서버가 정해
 * 실어 보낸다 — 오늘을 아는 쪽이 여기다.
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
  const { dayKey: localDate, monthKey } = calendarKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`itemDrawer: week item '${weekItemId}' not found`)
    return {
      itemWeek: header.week,
      completedAt: header.completedAt,
      tasks: repos.weekItems.childTasks(weekItemId, localDate),
      milestone: repos.milestones.linkedMilestone(weekItemId),
      milestoneCandidates: candidateOrder(repos.milestones.listAll(), monthKey)
    }
  })
}

/**
 * 드로어의 `새 조각 추가` — 조각을 만들되 **오늘로 보내지 않는다.**
 *
 * `pullFromDrawer` 의 newTask 는 생성과 pull 이 한 몸이라 여러 개를 쪼개려면 드로어를
 * 그 수만큼 여닫아야 했다. 쪼개기(Enter 마다 이 함수)와 가져오기(pullFromDrawer)를
 * 분리한 것이 이 함수의 존재 이유다. 가드는 pullFromDrawer 와 같은 규율이다 —
 * UI 비활성만으로는 IPC 를 직접 부르는 경로가 열린다.
 */
export function addTaskToItem(
  uow: UnitOfWork,
  input: { weekItemId: string; title: string }
): { taskId: string; itemWeek: string } {
  return uow.run((repos) => {
    const header = repos.weekItems.header(input.weekItemId)
    if (header === null) throw new Error(`addTask: item '${input.weekItemId}' not found`)
    if (header.completedAt !== null) {
      throw new Error(`addTask: item '${input.weekItemId}' is completed`) // R27 과 같은 가드
    }

    const trimmed = input.title.trim()
    if (trimmed === '') throw new Error('addTask: task title must not be empty')

    const taskId = uuidv7()
    repos.tasks.create({ id: taskId, weekItemId: input.weekItemId, title: trimmed })
    return { taskId, itemWeek: header.week }
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
 * 할당 ↔ 마일스톤 연결 (milestones R13 · ADR-035).
 *
 * **어느 달의 마일스톤에나 연결된다.** 예전에는 그 주가 귀속된 달로 제한했다(R14 · A12) —
 * "롤업이 임의의 달에서 올라와 월 경계가 사라진다"는 이유였지만, 롤업은 Milestone 기준으로
 * 세므로 그 시간은 연결된 Milestone 의 카드에만 뜬다. 제한이 막던 것은 경계 주(9/28 주)에
 * 10월 목표를 거는 정상적인 계획이었다.
 *
 * 남은 검증은 존재뿐이다 — 드로어가 열린 채 다른 곳에서 지운 마일스톤을 고르는 경로.
 *
 * **해제(`null`)는 언제나 허용된다** — 연결 없음은 오류 상태가 아니다 (R13).
 *
 * `months` 는 이 연결 변경으로 카드가 달라지는 달들이다 (옛 Milestone 의 달, 새 Milestone 의
 * 달). 무효화할 달을 화면이 추측하지 않게 서버가 싣는다.
 */
export function setItemMilestone(
  uow: UnitOfWork,
  input: { weekItemId: string; milestoneId: string | null }
): { itemWeek: string; months: string[] } {
  return uow.run((repos) => {
    const header = repos.weekItems.header(input.weekItemId)
    if (header === null) {
      throw new Error(`setItemMilestone: item '${input.weekItemId}' not found`)
    }

    const next = input.milestoneId === null ? null : repos.milestones.byId(input.milestoneId)
    if (input.milestoneId !== null && next === null) {
      throw new Error(`setItemMilestone: milestone '${input.milestoneId}' not found`)
    }
    const previous = repos.milestones.linkedMilestone(input.weekItemId)

    repos.milestones.setWeekItemMilestone(input.weekItemId, input.milestoneId)
    const months = [previous?.month, next?.month].filter((m): m is string => m !== undefined)
    return { itemWeek: header.week, months: [...new Set(months)].sort() }
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
