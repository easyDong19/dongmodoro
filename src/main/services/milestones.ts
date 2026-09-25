import { v7 as uuidv7 } from 'uuid'
import { addMonths, calendarKeys, now } from '../../shared/time'
import type { MilestoneBadge, MilestoneRow, UnitOfWork } from './ports'

/**
 * 월 마일스톤 유스케이스 (milestones). 유스케이스 하나 = `uow.run` 트랜잭션 하나
 * (ADR-015 §1).
 *
 * **표시 모드 5분기의 구현은 이 파일 하나다** (R20). 조건이 상호 배타이고 **순서 자체가
 * 규칙**이라, 화면이 `if` 를 다시 쓰면 두 모드를 동시에 가진 카드가 나온다.
 */

export type MilestoneMode =
  /** 미래 달 전부. 선행 편집이 열린다 — 날짜 제한 없이 언제든 계획할 수 있다
      (2026-08-17 사용자 결정, R6 의 "다음 달 한 칸" 제한 폐기). 이번 주 Sprint 가 이 달
      Milestone 에 걸려 있으면 롤업도 붙는다 (ADR-035). */
  | 'lead-edit'
  /** 이번 달인데 0건. 빈 상태 + 추가 CTA + 직전 달 제목 복사 (R22). */
  | 'current-empty'
  /** 이번 달. 편집 전부 + 이번 주 롤업. */
  | 'edit'
  /** 지난달 · 1건 이상. 감쇠 + 달성 배지. 완전 읽기 전용. */
  | 'past'
  /** 지난달 · 0건. 배지·CTA·롤업 없이 사실 문구만. */
  | 'past-empty'

/**
 * R20 의 표를 **위에서 아래 순서로 처음 참인 행 하나**로 판정한다.
 *
 * 판별은 달력 키의 **사전순 비교만** 쓴다 (R2 · A2 — 사전순 = 시간순).
 *
 * `far-future` 가 없어진 것이 의도다 — 미래 달은 얼마나 멀든 전부 선행 편집이다
 * (날짜 제한 폐기, 2026-08-17 사용자 결정). 과거는 그대로 읽기 전용이다.
 *
 * 순수 함수로 떼어 둔 이유는 이 순서가 이 기능에서 가장 틀리기 쉬운 부분이고, DB 없이
 * 다섯 갈래를 전부 직접 검증할 수 있어야 하기 때문이다.
 */
export function displayMode(month: string, todayMonth: string, count: number): MilestoneMode {
  if (month > todayMonth) return 'lead-edit'
  if (month === todayMonth) return count === 0 ? 'current-empty' : 'edit'
  return count === 0 ? 'past-empty' : 'past'
}

/** 그 모드에서 편집(추가·제목 수정·삭제·완료 토글)이 열리는가 (R6·R20). */
export function isEditable(mode: MilestoneMode): boolean {
  return mode === 'lead-edit' || mode === 'current-empty' || mode === 'edit'
}

export type MilestoneCardItem = MilestoneRow & {
  /**
   * 그 마일스톤의 **이번 주** 롤업. `null` 은 "이번 주에 이 Milestone 에 연결된 Sprint 가
   * 없다"이며 0 과 다르다 (R17) — 연결은 있는데 집중하지 않았으면 `0` 이다.
   */
  rollup: { measuredSec: number } | null
}

export type MonthMilestones = {
  month: string
  mode: MilestoneMode
  items: MilestoneCardItem[]
  /** 지난달 배지. `M === 0` 이면 `null` — `0/0 달성` 을 만들지 않는다 (R21 · A22). */
  badge: MilestoneBadge | null
  /** 직전 달 미완료 제목 (R22). 빈 배열이면 화면이 복사 액션을 렌더하지 않는다. */
  carryCandidates: MilestoneRow[]
}

/**
 * 마일스톤 카드 한 화면 = 응답 하나.
 *
 * **롤업의 대상 주는 언제나 오늘이 속한 주다** (ADR-035). 그 주가 어느 달에 귀속되는지
 * (R18)는 묻지 않는다 — 숫자를 가르는 것은 저장소 조회의 "그 Milestone 에 연결됐는가"
 * 하나이고, Sprint 는 Milestone 하나에만 연결되므로 같은 시간이 두 카드로 갈라지지 않는다.
 *
 * 예전에는 "이번 주가 이 달에 귀속될 때만" 조회했다. 그 게이트가 이월로 달을 넘긴 연결의
 * 시간을 **어느 카드에도** 띄우지 않았다 — 9/7 주에 8월 Milestone 을 태우면 8월 카드는
 * 게이트에, 9월 카드는 Milestone 필터에 걸렸다 (A13 위반, 2026-09-24 재현).
 */
export function monthMilestones(uow: UnitOfWork, month: string): MonthMilestones {
  const { monthKey: todayMonth, weekKey } = calendarKeys()

  return uow.run((repos) => {
    const badgeCounts = repos.milestones.badgeCounts(month)
    const mode = displayMode(month, todayMonth, badgeCounts.total)
    const rows = repos.milestones.listForMonth(month)

    // Milestone 이 없는 달은 조회하지 않는다 — 붙일 자리가 없다.
    const rollups =
      rows.length === 0
        ? new Map<string, { measuredSec: number }>()
        : new Map(
            repos.milestones
              .rollup(month, weekKey)
              .map((r) => [r.milestoneId, { measuredSec: r.measuredSec }])
          )

    return {
      month,
      mode,
      items: rows.map((r) => ({ ...r, rollup: rollups.get(r.id) ?? null })),
      // 배지는 지난달 카드의 것이다. 그 밖의 모드에서 내보내면 화면이 쓸 수 있게 된다.
      badge: mode === 'past' ? badgeCounts : null,
      carryCandidates:
        mode === 'current-empty' ? repos.milestones.carryCandidates(addMonths(month, -1)) : []
    }
  })
}

/** 추가 (R7). 순번은 저장소가 세며 화면이 정하지 않는다 — 생성 순 고정이 규칙이다 (R10). */
export function createMilestone(
  uow: UnitOfWork,
  input: { month: string; title: string }
): { month: string; id: string } {
  const title = input.title.trim()
  if (title === '') throw new Error('createMilestone: title must not be empty')

  return uow.run((repos) => {
    const id = uuidv7()
    repos.milestones.create({
      id,
      month: input.month,
      title,
      sortOrder: repos.milestones.nextSortOrder(input.month)
    })
    return { month: input.month, id }
  })
}

/**
 * 제목 수정 (R7).
 *
 * 조작 응답이 주간 항목처럼 `itemWeek` 를 싣지 않는 이유: 마일스톤 카드는 **한 달만**
 * 그리고 그 카드의 모든 행이 그 달 소속이라, 무효화할 달을 화면이 이미 안다. 주간 쪽은
 * 폐기·이월 항목이 보고 있는 주와 다를 수 있어 main 만 알았고, 여기는 그 상황이 없다.
 */
export function renameMilestone(uow: UnitOfWork, input: { id: string; title: string }): void {
  const title = input.title.trim()
  if (title === '') throw new Error('renameMilestone: title must not be empty')
  uow.run((repos) => repos.milestones.rename(input.id, title))
}

/** 완료 토글 (R9). 완료 시각을 남기므로 "언제 끝냈는지"를 나중에 기간으로 걸러낼 수 있다. */
export function setMilestoneCompleted(
  uow: UnitOfWork,
  input: { id: string; completed: boolean }
): { completedAt: string | null } {
  return uow.run((repos) => {
    if (!input.completed) {
      repos.milestones.uncomplete(input.id)
      return { completedAt: null }
    }
    const at = now()
    repos.milestones.complete(input.id, at)
    return { completedAt: at }
  })
}

/** 물리 삭제 (R8). 확인은 화면이 받는다 — 계약과 서비스는 id 만 안다. */
export function removeMilestone(uow: UnitOfWork, id: string): void {
  uow.run((repos) => repos.milestones.remove(id))
}

/**
 * 직전 달 제목 복사 (R22 · A23).
 *
 * **제목만** 복사한다. 완료 상태·연결을 옮기지 않고 원본을 수정·삭제하지도 않으므로,
 * 직전 달 배지의 `N`·`M` 이 변하지 않는다.
 */
export function carryMilestoneTitles(
  uow: UnitOfWork,
  input: { month: string; titles: readonly string[] }
): { month: string; created: number } {
  return uow.run((repos) => {
    let sortOrder = repos.milestones.nextSortOrder(input.month)
    let created = 0
    for (const raw of input.titles) {
      const title = raw.trim()
      if (title === '') continue
      repos.milestones.create({ id: uuidv7(), month: input.month, title, sortOrder })
      sortOrder += 1
      created += 1
    }
    return { month: input.month, created }
  })
}
