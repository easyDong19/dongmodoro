import { describe, expect, it } from 'vitest'
import { budgetPrefill, effectiveBudget } from './baseline'
import type { Repositories, WeekPlan } from './ports'

// SQL 이 아니라 **결정 순서**를 검증한다 — 페이크로 충분하다.
// (effectiveBaseline 이 폴백 순서를 갖는 것과 달리, effectiveBudget 은 폴백이 없다는
//  것 자체가 계약이므로 그 부재를 테스트가 지킨다.)
function fakeRepos(o: { plan?: WeekPlan | null; settings?: Record<string, string> }): Repositories {
  const settings = o.settings ?? {}
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
