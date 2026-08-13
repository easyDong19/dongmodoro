import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { ensureWeeks, testUow } from './test-helpers'
import type { Repositories, UnitOfWork } from '../../services/ports'

const AUG = '2026-08'
const SEP = '2026-09'
const W_AUG = '2026-08-03'
const W_AUG_LAST = '2026-08-31' // 9/6 까지 이어지는 주 — 전체가 8월에 귀속된다 (R18)

const AT = '2026-08-20T01:00:00.000Z'

function addMilestone(repos: Repositories, month: string, title: string): string {
  const id = uuidv7()
  repos.milestones.create({
    id,
    month,
    title,
    sortOrder: repos.milestones.nextSortOrder(month)
  })
  return id
}

/**
 * 할당들을 만들고 마일스톤에 연결한다. 반환은 생성 순 id 배열.
 *
 * **한 번의 `confirmPlan` 으로 전부 만든다.** 그 메서드는 선언형이라(R23) 요청 목록이 그
 * 주 계획의 전체이며, 두 번 나눠 부르면 앞의 항목이 폐기된다.
 */
function addItems(
  repos: Repositories,
  week: string,
  items: readonly { title: string; milestoneId?: string }[]
): string[] {
  const { createdIds } = repos.weekItems.confirmPlan({
    week,
    items: items.map((i) => ({ id: null, title: i.title, days: [] }))
  })
  createdIds.forEach((id, i) => {
    const m = items[i].milestoneId
    if (m !== undefined) repos.milestones.setWeekItemMilestone(id, m)
  })
  return createdIds
}

/** 할당 하나짜리 지름길. */
function addItem(
  repos: Repositories,
  o: { week: string; title: string; milestoneId?: string }
): string {
  return addItems(repos, o.week, [o])[0]
}

function focusOn(repos: Repositories, taskId: string, localDate: string, localWeek: string) {
  repos.sessions.insert({
    id: uuidv7(),
    startedAt: `${localDate}T01:00:00.000Z`,
    endedAt: `${localDate}T01:25:00.000Z`,
    durationSec: 1500,
    kind: 'focus',
    taskId,
    localDate,
    localWeek
  })
}

/** 할당 밑에 조각 하나를 만든다. */
function addTask(repos: Repositories, weekItemId: string): string {
  const id = uuidv7()
  repos.tasks.create({ id, weekItemId, title: '조각' })
  return id
}

function seedWeek(uow: UnitOfWork, ...weeks: string[]) {
  ensureWeeks(uow, ...weeks)
}

describe('milestones.listForMonth — 생성 순 고정, 보관 제외 (R10·R11)', () => {
  it('생성 순으로 준다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      addMilestone(repos, AUG, '첫째')
      addMilestone(repos, AUG, '둘째')
      addMilestone(repos, AUG, '셋째')
      expect(repos.milestones.listForMonth(AUG).map((m) => m.title)).toEqual([
        '첫째',
        '둘째',
        '셋째'
      ])
    })
  })

  it('보관된 것은 목록에서 빠진다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      addMilestone(repos, AUG, '남을 것')
      const hidden = addMilestone(repos, AUG, '보관할 것')
      repos.milestones.archive(hidden, AT)
      expect(repos.milestones.listForMonth(AUG).map((m) => m.title)).toEqual(['남을 것'])
    })
  })

  it('다른 달은 섞이지 않는다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      addMilestone(repos, AUG, '8월')
      addMilestone(repos, SEP, '9월')
      expect(repos.milestones.listForMonth(SEP).map((m) => m.title)).toEqual(['9월'])
    })
  })
})

describe('milestones.badgeCounts — 보관은 집계에 중립 (R21 · A21)', () => {
  /**
   * **이 테스트가 D4 결함의 재발 방지선이다.** 분모에서 보관을 빼면 3개 중 1개 완료한
   * 달에서 나머지 2개를 보관하는 것만으로 "1/1 달성"이 된다 — 아무것도 더 하지 않고
   * 달성률을 올리는 경로다.
   */
  it('3개 중 1개 완료 상태에서 2개를 보관해도 1/3 이고, 왕복해도 변하지 않는다 (A21)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const a = addMilestone(repos, AUG, 'a')
      const b = addMilestone(repos, AUG, 'b')
      const c = addMilestone(repos, AUG, 'c')
      repos.milestones.complete(a, AT)

      expect(repos.milestones.badgeCounts(AUG)).toEqual({
        total: 3,
        completed: 1,
        archivedCount: 0
      })

      repos.milestones.archive(b, AT)
      repos.milestones.archive(c, AT)
      expect(repos.milestones.badgeCounts(AUG)).toEqual({
        total: 3,
        completed: 1,
        archivedCount: 2
      })

      repos.milestones.unarchive(b)
      repos.milestones.unarchive(c)
      expect(repos.milestones.badgeCounts(AUG)).toEqual({
        total: 3,
        completed: 1,
        archivedCount: 0
      })
    })
  })

  it('0건인 달은 total 0 이다 — 화면이 배지를 그리지 않는 근거다 (A22)', () => {
    const { uow } = testUow()
    expect(uow.run((repos) => repos.milestones.badgeCounts(AUG))).toEqual({
      total: 0,
      completed: 0,
      archivedCount: 0
    })
  })
})

describe('milestones.carryCandidates — 미완료, 보관 무관 (R22)', () => {
  it('미완료만 낸다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const done = addMilestone(repos, AUG, '끝낸 것')
      addMilestone(repos, AUG, '남은 것')
      repos.milestones.complete(done, AT)
      expect(repos.milestones.carryCandidates(AUG).map((m) => m.title)).toEqual(['남은 것'])
    })
  })

  it('보관된 미완료도 후보로 낸다 — 고르는 것은 사용자다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const archived = addMilestone(repos, AUG, '보관된 미완료')
      repos.milestones.archive(archived, AT)
      expect(repos.milestones.carryCandidates(AUG).map((m) => m.title)).toEqual(['보관된 미완료'])
    })
  })
})

describe('milestones.remove — 물리 삭제와 SET NULL (R8 · A8)', () => {
  it('삭제하면 연결된 할당은 남고 집중 기록도 그대로다', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const item = addItem(repos, { week: W_AUG, title: '할당', milestoneId: m })
      const task = addTask(repos, item)
      focusOn(repos, task, '2026-08-04', W_AUG)

      repos.milestones.remove(m)

      expect(repos.milestones.listForMonth(AUG)).toEqual([])
      const items = repos.weekItems.listForWeek(W_AUG)
      expect(items).toHaveLength(1)
      expect(items[0].measuredSec).toBe(1500)
      expect(repos.milestones.linkedMilestone(item)).toBeNull()
    })
  })
})

describe('milestones.rollup — 주 단위 파생 (R16·R17)', () => {
  it('연결된 할당의 그 주 측정 시간 합을 준다', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const [i1, i2] = addItems(repos, W_AUG, [
        { title: 'a', milestoneId: m },
        { title: 'b', milestoneId: m }
      ])
      focusOn(repos, addTask(repos, i1), '2026-08-04', W_AUG)
      focusOn(repos, addTask(repos, i2), '2026-08-05', W_AUG)
      focusOn(repos, addTask(repos, i2), '2026-08-05', W_AUG)

      expect(repos.milestones.rollup(AUG, W_AUG)).toEqual([{ milestoneId: m, measuredSec: 4500 }])
    })
  })

  it('연결되지 않은 할당은 롤업에 들어가지 않는다 (R13)', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const loose = addItem(repos, { week: W_AUG, title: '미연결' })
      focusOn(repos, addTask(repos, loose), '2026-08-04', W_AUG)
      expect(repos.milestones.rollup(AUG, W_AUG)).toEqual([])
      expect(repos.milestones.listForMonth(AUG).map((x) => x.id)).toEqual([m])
    })
  })

  /**
   * A14 — 집계 술어는 `sessions.local_week = week_items.week` 다 (ADR-012 §1). 주 조건이
   * 빠지면 주 경계를 넘긴 세션이 두 주에서 세어지고, 에러 없이 숫자만 틀린다.
   */
  it('할당의 주와 다른 주에 기록된 세션은 롤업을 올리지 않는다 (A14)', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG, '2026-08-10')
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const item = addItem(repos, { week: W_AUG, title: 'a', milestoneId: m })
      const task = addTask(repos, item)
      focusOn(repos, task, '2026-08-04', W_AUG) // 그 주
      focusOn(repos, task, '2026-08-11', '2026-08-10') // 다음 주

      expect(repos.milestones.rollup(AUG, W_AUG)[0].measuredSec).toBe(1500)
    })
  })

  it('지난주 집중은 이번 주 롤업에 없다 (A15)', () => {
    const { uow } = testUow()
    seedWeek(uow, '2026-07-27', W_AUG)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const last = addItem(repos, {
        week: '2026-07-27',
        title: '지난주',
        milestoneId: m
      })
      focusOn(repos, addTask(repos, last), '2026-07-28', '2026-07-27')

      expect(repos.milestones.rollup(AUG, W_AUG)).toEqual([])
    })
  })

  /**
   * A13 의 뒷절 — 이월로 달을 넘긴 할당의 소진은 **연결된 마일스톤이 놓인 달** 카드로
   * 올라간다. 여기서는 9월 주의 할당이 8월 마일스톤에 걸린 상태를 직접 만든다 (이월
   * 승계가 만드는 것과 같은 모양이며, 타월 연결이 존재하는 유일한 합법 경로다 — R15).
   */
  it('타월 연결의 소진은 마일스톤이 놓인 달 카드로 올라간다 (A13 · R15)', () => {
    const { uow } = testUow()
    const wSep = '2026-09-07'
    seedWeek(uow, wSep)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '8월 결과물')
      const item = addItem(repos, { week: wSep, title: '9월 주 할당', milestoneId: m })
      focusOn(repos, addTask(repos, item), '2026-09-08', wSep)

      // 8월 마일스톤을 9월 주로 조회하면 그 소진이 잡힌다 — 달이 아니라 마일스톤이 기준이다.
      expect(repos.milestones.rollup(AUG, wSep)).toEqual([{ milestoneId: m, measuredSec: 1500 }])
      // 9월 카드에는 그 마일스톤이 없으므로 롤업도 없다.
      expect(repos.milestones.rollup(SEP, wSep)).toEqual([])
    })
  })

  it('달을 넘긴 주(8/31~9/6)의 9월 날짜 세션도 그 주 롤업이다 — 주는 쪼개지지 않는다 (R18)', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG_LAST)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const item = addItem(repos, { week: W_AUG_LAST, title: 'a', milestoneId: m })
      const task = addTask(repos, item)
      focusOn(repos, task, '2026-08-31', W_AUG_LAST)
      focusOn(repos, task, '2026-09-02', W_AUG_LAST)

      expect(repos.milestones.rollup(AUG, W_AUG_LAST)[0].measuredSec).toBe(2 * 1500)
    })
  })

  it('폐기된 할당은 롤업에서 빠진다 — 화면에 없는 할당의 집중을 설명할 자리가 없다', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const item = addItem(repos, { week: W_AUG, title: 'a', milestoneId: m })
      focusOn(repos, addTask(repos, item), '2026-08-04', W_AUG)
      repos.weekItems.drop(item)

      expect(repos.milestones.rollup(AUG, W_AUG)).toEqual([])
    })
  })
})

describe('milestones.linkedMilestone · setWeekItemMilestone (R13·R15)', () => {
  it('연결이 없으면 null 이다 — 오류 상태가 아니다 (R13)', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG)
    uow.run((repos) => {
      const item = addItem(repos, { week: W_AUG, title: 'a' })
      expect(repos.milestones.linkedMilestone(item)).toBeNull()
    })
  })

  it('연결과 해제가 왕복한다', () => {
    const { uow } = testUow()
    seedWeek(uow, W_AUG)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '결과물')
      const item = addItem(repos, { week: W_AUG, title: 'a' })

      repos.milestones.setWeekItemMilestone(item, m)
      expect(repos.milestones.linkedMilestone(item)?.id).toBe(m)

      repos.milestones.setWeekItemMilestone(item, null)
      expect(repos.milestones.linkedMilestone(item)).toBeNull()
    })
  })

  it('타월 연결도 그대로 읽힌다 — 후보 밖이어도 지워지지 않는다 (R15)', () => {
    const { uow } = testUow()
    const wSep = '2026-09-07'
    seedWeek(uow, wSep)
    uow.run((repos) => {
      const m = addMilestone(repos, AUG, '8월 결과물')
      const item = addItem(repos, { week: wSep, title: 'a', milestoneId: m })

      expect(repos.milestones.linkedMilestone(item)?.month).toBe(AUG)
      // 9월 주의 후보(= 9월 마일스톤)에는 그것이 없다 — 새로 매달 수는 없다는 뜻이다 (R14).
      expect(repos.milestones.listForMonth(SEP)).toEqual([])
    })
  })
})
