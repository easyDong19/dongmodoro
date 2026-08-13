import { describe, expect, it } from 'vitest'
import { budgetPrefill, effectiveBudget, weekSnapshot } from './baseline'
import type { Repositories, WeekPlan } from './ports'

// SQL 이 아니라 **결정 순서**를 검증한다 — 페이크로 충분하다.
// (`effectiveBudget` 은 폴백이 없다는 것 자체가 계약이므로 그 부재를 테스트가 지킨다.)
function fakeRepos(o: { plan?: WeekPlan | null; settings?: Record<string, string> }): Repositories {
  // 길이 3종은 시딩된 상태를 기본으로 둔다 — globalBaseline 은 없으면 throw 한다.
  const settings: Record<string, string> = {
    focus_min: '25',
    short_break_min: '5',
    long_break_min: '15',
    ...o.settings
  }
  return {
    settings: { get: (k: string) => settings[k] ?? null, set: () => {}, updatedAt: () => null },
    weeks: { baseline: () => null, ensure: () => {}, plan: () => o.plan ?? null, setPlan: () => {} }
  } as unknown as Repositories
}

describe('effectiveBudget (pomo-baseline R11)', () => {
  it('weeks 행이 없으면 기록 없음(null)', () => {
    expect(effectiveBudget(fakeRepos({ plan: null }), '2026-08-03')).toBeNull()
  })

  it('행은 있는데 budget 이 NULL 이면 기록 없음(null)', () => {
    const repos = fakeRepos({ plan: { budget: null, capacity: null, plannedAt: null } })
    expect(effectiveBudget(repos, '2026-08-03')).toBeNull()
  })

  it('budget = 0 은 기록 없음이 아니라 개수 0 이다 (ADR-018 §1)', () => {
    const repos = fakeRepos({ plan: { budget: 0, capacity: null, plannedAt: null } })
    expect(effectiveBudget(repos, '2026-08-03')).toBe(0)
  })

  it('capacity 합으로 예산을 파생하지 않는다', () => {
    const repos = fakeRepos({
      plan: { budget: null, capacity: [4, 4, 4, 4, 4, 0, 0], plannedAt: null }
    })
    expect(effectiveBudget(repos, '2026-08-03')).toBeNull()
  })
})

describe('budgetPrefill (pomo-baseline R12)', () => {
  it('weekly_capacity 가 없으면 프리필하지 않는다 — M3a 는 항상 이 경로다', () => {
    expect(budgetPrefill(fakeRepos({}))).toBeNull()
  })

  it('있으면 합을 프리필한다', () => {
    expect(budgetPrefill(fakeRepos({ settings: { weekly_capacity: '[4,4,4,4,4,0,0]' } }))).toBe(20)
  })
})

/**
 * 축소된 함수다 (ADR-029·ADR-030). 남은 책임은 FK 를 만족시킬 `weeks` 행을 만들 때
 * 넘길 값을 주는 것뿐이고, 계획 의사는 통화가 폐기됐으므로 항상 NULL 이다.
 */
describe('weekSnapshot — 행 생성 시 넘길 값 (weekly-review R37)', () => {
  it('길이 3종만 담고 계획 의사는 언제나 null 이다', () => {
    expect(weekSnapshot(fakeRepos({}))).toEqual({
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      capacity: null,
      budget: null
    })
  })

  /** 남아 있는 `weekly_capacity` 행을 다시 읽어들이지 않는다 — 폐기된 통화다. */
  it('`weekly_capacity` 가 남아 있어도 무시한다', () => {
    const repos = fakeRepos({ settings: { weekly_capacity: '[4,4,4,4,4,0,0]' } })
    expect(weekSnapshot(repos)).toMatchObject({ capacity: null, budget: null })
  })
})
