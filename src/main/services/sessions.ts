import { v7 as uuidv7 } from 'uuid'
import { instantFromMs, localKeys, now } from '@shared/time'
import type { SessionRecorded } from '@shared/ipc/contracts'
import type { UnitOfWork } from './ports'

/**
 * 세션 기록 유스케이스 (timer R6-R9). 유스케이스 하나 = `uow.run` 트랜잭션 하나
 * (ADR-015 §1). 발송은 여기서 하지 않는다 — 호출자(timer-host)가 이 함수의 반환
 * (커밋 후)을 받아 `session:recorded` 를 보낸다 (ADR-026 §2).
 */

export type RecordSessionInput = {
  kind: 'focus' | 'short' | 'long'
  startedAtMs: number
  endedAtMs: number
  durationSec: number
  taskId: string | null
}

export function recordSession(uow: UnitOfWork, input: RecordSessionInput): SessionRecorded {
  // 달력 키는 시작 시각 기준, 한 번의 읽기로 짝을 만든다 (R7, ADR-022 §1).
  const { localDate, localWeek } = localKeys(input.startedAtMs)
  const sessionId = uuidv7()
  uow.run((repos) => {
    repos.sessions.insert({
      id: sessionId,
      startedAt: instantFromMs(input.startedAtMs),
      endedAt: instantFromMs(input.endedAtMs),
      durationSec: input.durationSec,
      kind: input.kind,
      taskId: input.taskId,
      localDate,
      localWeek
    })
  })
  // 저장값 그대로 — renderer 는 재계산하지 않는다 (ADR-025 §1-2).
  return {
    sessionId,
    kind: input.kind,
    taskId: input.taskId,
    durationSec: input.durationSec,
    localDate,
    localWeek
  }
}

/**
 * 사후 캡처 (R8, ADR-012 §3): 자유 집중 세션에 한 줄 이름을 붙인다. 완료 task 를
 * 소급 생성해 세션에 연결하며, 부모 "기타" 항목은 **세션의 local_week 기준**이다 —
 * 자정을 걸친 세션에서 "오늘"의 주와 다를 수 있다 (A5b).
 */
export function captureSession(
  uow: UnitOfWork,
  sessionId: string,
  title: string
): { localDate: string; localWeek: string } {
  const trimmed = title.trim()
  if (trimmed === '') {
    throw new Error('sessions.capture: title must not be empty')
  }
  return uow.run((repos) => {
    const session = repos.sessions.get(sessionId)
    if (!session) {
      throw new Error(`sessions.capture: session '${sessionId}' not found`)
    }
    const weekItemId = repos.weekItems.ensureSystemItem(session.localWeek)
    const taskId = uuidv7()
    repos.tasks.create({ id: taskId, weekItemId, title: trimmed, completedAt: now() })
    repos.sessions.attachTask(sessionId, taskId, trimmed)
    return { localDate: session.localDate, localWeek: session.localWeek }
  })
}
