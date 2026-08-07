import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import type { UnitOfWork } from '../services/ports'
import { addDirect, listToday, pullTask, removeTask, toggleTaskComplete } from '../services/today'
import { handleIpc } from './handle'

/** 오늘 목록 유스케이스 5종의 invoke 핸들러 (Task 7). */
export function registerTodayHandlers(uow: UnitOfWork): void {
  handleIpc(CHANNELS.today.list, contracts.today.list, () => listToday(uow))
  handleIpc(CHANNELS.today.addDirect, contracts.today.addDirect, (title) => addDirect(uow, title))
  handleIpc(CHANNELS.today.pull, contracts.today.pull, (taskId) => pullTask(uow, taskId))
  handleIpc(CHANNELS.today.remove, contracts.today.remove, (taskId) => removeTask(uow, taskId))
  handleIpc(CHANNELS.today.toggleComplete, contracts.today.toggleComplete, (taskId) =>
    toggleTaskComplete(uow, taskId)
  )
}
