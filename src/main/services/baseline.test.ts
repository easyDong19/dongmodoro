import { describe, expect, it } from 'vitest'
import { weekSnapshot } from './baseline'
import type { Repositories } from './ports'

// SQL 이 아니라 **결정 순서**를 검증한다 — 페이크로 충분하다.
function fakeRepos(o: { settings?: Record<string, string> }): Repositories {
  // 길이 3종은 시딩된 상태를 기본으로 둔다 — globalBaseline 은 없으면 throw 한다.
  const settings: Record<string, string> = {
    focus_min: '25',
    short_break_min: '5',
    long_break_min: '15',
    ...o.settings
  }
  return {
    settings: { get: (k: string) => settings[k] ?? null, set: () => {}, updatedAt: () => null },
    weeks: { baseline: () => null, ensure: () => {} }
  } as unknown as Repositories
}

/**
 * 축소된 함수다 (ADR-029·ADR-030). 남은 책임은 FK 를 만족시킬 `weeks` 행을 만들 때
 * 넘길 값을 주는 것뿐이고, 계획 의사는 통화가 폐기됐으므로 항상 NULL 이다.
 *
 * 옛 `effectiveBudget`·`budgetPrefill` 테스트가 여기 있었다. 두 함수는 플래너
 * 다이어트에서 죽었고 — 예산 입력이 사라져 프리필할 자리가 없고, 유효 예산을 읽는
 * 화면도 없다 (ADR-030 §3) — 그래서 그 계약을 지키던 테스트도 함께 걷었다.
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
