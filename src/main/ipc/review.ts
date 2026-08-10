import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import { calendarKeys, nowMs } from '@shared/time'
import type { UnitOfWork } from '../services/ports'
import { reviewPending, reviewStatus } from '../services/review'
import { handleIpc } from './handle'

/**
 * 정산 유스케이스의 invoke 핸들러 (M3b).
 *
 * 이 파일은 배선만 한다 — 판정식·부트스트랩·확정 규칙은 전부 services/review.ts 가 갖는다.
 *
 * **오늘 날짜를 여기서 한 번 읽어 넘긴다.** 서비스가 시계를 직접 읽지 않게 하는 것은
 * 테스트가 시나리오 15종을 가짜 시계 없이 표로 돌리기 위해서다 (ADR-009 §3 은 시간
 * 초크포인트를, ADR-022 §1 은 "한 번의 시계 읽기"를 요구한다).
 */
export function registerReviewHandlers(uow: UnitOfWork): void {
  handleIpc(CHANNELS.review.getStatus, contracts.review.getStatus, () =>
    reviewStatus(uow, calendarKeys(nowMs()).dayKey)
  )
  handleIpc(CHANNELS.review.getPending, contracts.review.getPending, () =>
    reviewPending(uow, calendarKeys(nowMs()).dayKey)
  )
}
