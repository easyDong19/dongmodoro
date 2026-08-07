import { v7 as uuidv7 } from 'uuid'
import { localKeys } from '../../shared/time'
import type { TodayRow, UnitOfWork } from './ports'

/**
 * 오늘 목록 유스케이스 5종 (today-tasks). 유스케이스 하나 = `uow.run` 트랜잭션 하나
 * (ADR-015 §1). "오늘"은 각 함수 진입 시 `localKeys()` 로 한 번만 읽는다 —
 * 트랜잭션 내부에서 다시 읽으면 자정 경계를 걸친 순간에 두 값이 갈릴 수 있다
 * (ADR-022 §1 과 같은 이유).
 */

/** `오늘 목록` (R4): 미완료 우선, 그 안에서는 pull 된 순서. */
export function listToday(uow: UnitOfWork): { dayKey: string; rows: TodayRow[] } {
  const { localDate } = localKeys()
  const rows = uow.run((repos) => repos.today.list(localDate))

  const sorted = [...rows].sort((a, b) => {
    const aDone = a.completedAt === null ? 0 : 1
    const bDone = b.completedAt === null ? 0 : 1
    if (aDone !== bDone) return aDone - bDone
    if (a.pulledAt < b.pulledAt) return -1
    if (a.pulledAt > b.pulledAt) return 1
    return 0
  })

  return { dayKey: localDate, rows: sorted }
}

/** `오늘 목록에 바로 추가` (R9): task 생성 + 기타 항목 lazy + pull, 한 트랜잭션. */
export function addDirect(uow: UnitOfWork, title: string): { itemWeek: string } {
  const trimmed = title.trim()
  if (trimmed === '') {
    throw new Error('addDirect: title must not be empty')
  }

  const { localDate, localWeek } = localKeys()
  return uow.run((repos) => {
    const weekItemId = repos.weekItems.ensureSystemItem(localWeek)
    const taskId = uuidv7()
    repos.tasks.create({ id: taskId, weekItemId, title: trimmed })
    repos.today.pull(taskId, localDate)
    return { itemWeek: localWeek }
  })
}

/** 오늘 목록에 pull (R7): 완료 task 거부, 이미 오늘 활성 pull 이면 거부(중복 금지). */
export function pullTask(uow: UnitOfWork, taskId: string): { itemWeek: string } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const task = repos.tasks.get(taskId)
    if (!task) {
      throw new Error(`pull: task '${taskId}' not found`)
    }
    if (task.completedAt !== null) {
      throw new Error(`pull: task '${taskId}' is already completed`)
    }
    const alreadyActive = repos.today.list(localDate).some((row) => row.taskId === taskId)
    if (alreadyActive) {
      throw new Error(`pull: task '${taskId}' is already in today's list`)
    }

    repos.today.pull(taskId, localDate)

    const itemWeek = repos.weekItems.weekOf(task.weekItemId)
    if (itemWeek === null) {
      throw new Error(`pull: parent week item not found for task '${taskId}'`)
    }
    return { itemWeek }
  })
}

/** 오늘 목록에서 제거 (R13): 분기(marked/deleted)는 저장소가 판단, 서비스는 결과만 쓴다. */
export function removeTask(uow: UnitOfWork, taskId: string): { itemWeek: string } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const task = repos.tasks.get(taskId)
    if (!task) {
      throw new Error(`remove: task '${taskId}' not found`)
    }

    repos.today.remove(taskId, localDate)

    const itemWeek = repos.weekItems.weekOf(task.weekItemId)
    if (itemWeek === null) {
      throw new Error(`remove: parent week item not found for task '${taskId}'`)
    }
    return { itemWeek }
  })
}

/**
 * 완료 토글 — 응답의 `parentWeek` 는 부모 항목의 주다. 지난 주로 이월되지 않은
 * 항목이면 지난 주 그대로 반환한다(ADR-025 §3 사건 5 — renderer 재계산 금지).
 */
export function toggleTaskComplete(
  uow: UnitOfWork,
  taskId: string
): { parentWeek: string; completedAt: string | null } {
  return uow.run((repos) => {
    const task = repos.tasks.get(taskId)
    if (!task) {
      throw new Error(`toggleComplete: task '${taskId}' not found`)
    }

    const completedAt = repos.tasks.toggleComplete(taskId)

    const parentWeek = repos.weekItems.weekOf(task.weekItemId)
    if (parentWeek === null) {
      throw new Error(`toggleComplete: parent week item not found for task '${taskId}'`)
    }
    return { parentWeek, completedAt }
  })
}
