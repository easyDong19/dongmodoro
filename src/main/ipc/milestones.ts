import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import {
  carryMilestoneTitles,
  createMilestone,
  monthMilestones,
  removeMilestone,
  renameMilestone,
  setMilestoneCompleted
} from '../services/milestones'
import type { UnitOfWork } from '../services/ports'
import { handleIpc } from './handle'

/**
 * 월 마일스톤 7종의 invoke 핸들러 (milestones).
 *
 * 이 파일은 배선만 한다 — 표시 모드 6분기도 롤업 게이팅도 서비스가 갖고 있다
 * (services/milestones.ts). 핸들러가 판정을 흉내내면 R20 의 순서가 두 곳이 된다.
 */
export function registerMilestoneHandlers(uow: UnitOfWork): void {
  handleIpc(CHANNELS.milestones.forMonth, contracts.milestones.forMonth, (month) =>
    monthMilestones(uow, month)
  )
  handleIpc(CHANNELS.milestones.create, contracts.milestones.create, (input) =>
    createMilestone(uow, input)
  )
  handleIpc(CHANNELS.milestones.rename, contracts.milestones.rename, (input) =>
    renameMilestone(uow, input)
  )
  handleIpc(CHANNELS.milestones.setCompleted, contracts.milestones.setCompleted, (input) =>
    setMilestoneCompleted(uow, input)
  )
  handleIpc(CHANNELS.milestones.remove, contracts.milestones.remove, (id) =>
    removeMilestone(uow, id)
  )
  handleIpc(CHANNELS.milestones.carryTitles, contracts.milestones.carryTitles, (input) =>
    carryMilestoneTitles(uow, input)
  )
}
