import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import { dayRecord, monthCalendar, studyDays } from '../services/calendar'
import type { UnitOfWork } from '../services/ports'
import { handleIpc } from './handle'

/**
 * 캘린더 열람 3종의 invoke 핸들러 (calendar-records).
 *
 * 이 파일은 배선만 한다 — `기록 있음` 술어도 점 등급도 서비스가 갖고 있다
 * (services/calendar.ts). 핸들러가 판정을 흉내내기 시작하면 술어가 두 곳이 되고,
 * 그것이 R5 가 막으려던 바로 그 상태다.
 */
export function registerCalendarHandlers(uow: UnitOfWork): void {
  handleIpc(CHANNELS.calendar.month, contracts.calendar.month, (month) => monthCalendar(uow, month))
  handleIpc(CHANNELS.calendar.day, contracts.calendar.day, (dayKey) => dayRecord(uow, dayKey))
  handleIpc(CHANNELS.calendar.studyDays, contracts.calendar.studyDays, (week) =>
    studyDays(uow, week)
  )
}
