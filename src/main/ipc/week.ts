import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import type { UnitOfWork } from '../services/ports'
import {
  addTaskToItem,
  confirmWeekPlan,
  dropItem,
  itemDrawer,
  planDraft,
  pullFromDrawer,
  setItemCompleted,
  setItemMilestone,
  weekSummary
} from '../services/week-plan'
import { handleIpc } from './handle'

/**
 * 주간 계획 유스케이스 9종의 invoke 핸들러 (M3a Task 4).
 *
 * 이 파일은 배선만 한다 — 완료 거부·소속 검증 같은 규칙은 전부 서비스가 갖고 있다
 * (week-plan.ts). 핸들러가 규칙을 흉내내기 시작하면 두 곳이 어긋나는 날이 온다.
 */
export function registerWeekHandlers(uow: UnitOfWork): void {
  handleIpc(CHANNELS.week.summary, contracts.week.summary, (week) => weekSummary(uow, week))
  handleIpc(CHANNELS.week.planDraft, contracts.week.planDraft, (week) => planDraft(uow, week))
  handleIpc(CHANNELS.week.confirmPlan, contracts.week.confirmPlan, (input) =>
    confirmWeekPlan(uow, input)
  )
  handleIpc(CHANNELS.week.drawer, contracts.week.drawer, (weekItemId) =>
    itemDrawer(uow, weekItemId)
  )
  handleIpc(CHANNELS.week.addTask, contracts.week.addTask, (input) => addTaskToItem(uow, input))
  handleIpc(CHANNELS.week.pullFromDrawer, contracts.week.pullFromDrawer, (input) =>
    pullFromDrawer(uow, input)
  )
  handleIpc(CHANNELS.week.complete, contracts.week.complete, (weekItemId) =>
    setItemCompleted(uow, weekItemId, true)
  )
  handleIpc(CHANNELS.week.uncomplete, contracts.week.uncomplete, (weekItemId) =>
    setItemCompleted(uow, weekItemId, false)
  )
  handleIpc(CHANNELS.week.drop, contracts.week.drop, (weekItemId) => dropItem(uow, weekItemId))
  handleIpc(CHANNELS.week.setMilestone, contracts.week.setMilestone, (input) =>
    setItemMilestone(uow, input)
  )
}
