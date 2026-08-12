import { describe, it, expect } from 'vitest'
import { contracts } from './contracts'
import type { Api } from './api'

// Api 는 계약에서 조건부 타입으로 파생된다. 조건이 안 맞으면 조용히 never 가 되고,
// never 에는 무엇이든 대입되므로 preload 의 `: Api` 검사가 통째로 공허해진다.
// 이 대입이 파생 결과가 실제로 호출 가능한 함수 타입임을 컴파일 시점에 못박는다.
const _apiShapeIsDerived: Api['system']['getAppInfo'] = () =>
  Promise.resolve({ appVersion: '0.1.0', schemaVersion: 1 })

describe('system.getAppInfo contract', () => {
  it('res accepts a valid payload', () => {
    expect(
      contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0', schemaVersion: 1 })
    ).toEqual({ appVersion: '0.1.0', schemaVersion: 1 })
  })
  it('res rejects missing fields', () => {
    expect(() => contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0' })).toThrow()
  })
  it('res rejects a non-integer schemaVersion', () => {
    expect(() =>
      contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0', schemaVersion: 1.5 })
    ).toThrow()
  })
  // z.object() 는 모르는 키를 조용히 버린다 — 계약이 어긋나도 알 수 없다.
  // strictObject 로 거부해서 계약 드리프트가 소리를 내게 한다 (zod 스킬 schema-object-unknowns).
  it('res rejects unknown fields instead of silently stripping them', () => {
    expect(() =>
      contracts.system.getAppInfo.res.parse({
        appVersion: '0.1.0',
        schemaVersion: 1,
        rogue: true
      })
    ).toThrow()
  })
  it('req accepts no arguments', () => {
    expect(contracts.system.getAppInfo.req.parse([])).toEqual([])
  })
  it('req rejects unexpected arguments', () => {
    expect(() => contracts.system.getAppInfo.req.parse(['rogue'])).toThrow()
  })
})

describe('settings.getTheme · setTheme contract (design-system ADR-010 §1)', () => {
  it('accepts only light and dark', () => {
    expect(contracts.settings.setTheme.req.parse(['light'])).toEqual(['light'])
    expect(contracts.settings.setTheme.req.parse(['dark'])).toEqual(['dark'])
  })

  /**
   * `system` 을 계약에서 거부하는 것이 이 ADR 의 경계선이다. 통과시키면 화면이 다시
   * OS 추종을 요청할 수 있게 되고, 그 값을 저장하는 순간 상태가 셋으로 돌아간다.
   */
  it('rejects the removed system option', () => {
    expect(() => contracts.settings.setTheme.req.parse(['system'])).toThrow()
  })

  it('rejects an arbitrary string', () => {
    expect(() => contracts.settings.setTheme.req.parse(['purple'])).toThrow()
  })

  it('getTheme takes no arguments', () => {
    expect(contracts.settings.getTheme.req.parse([])).toEqual([])
    expect(() => contracts.settings.getTheme.req.parse(['light'])).toThrow()
  })

  it('both responses carry the stored theme and nothing else', () => {
    expect(contracts.settings.getTheme.res.parse({ theme: 'dark' })).toEqual({ theme: 'dark' })
    expect(contracts.settings.setTheme.res.parse({ theme: 'light' })).toEqual({ theme: 'light' })
    expect(() => contracts.settings.getTheme.res.parse({ theme: 'dark', rogue: true })).toThrow()
  })
})

describe('settings.setBaseline contract (pomo-baseline R5·R7·R8)', () => {
  const form = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, capacity: null }

  it('accepts the seeded defaults with capacity unset', () => {
    expect(contracts.settings.setBaseline.req.parse([form])).toEqual([form])
  })

  it('accepts a seven-slot capacity array, index 0 being Monday', () => {
    const withCapacity = { ...form, capacity: [4, 2, 4, 2, 4, 0, 8] }
    expect(contracts.settings.setBaseline.req.parse([withCapacity])).toEqual([withCapacity])
  })

  /**
   * A5 의 네 값이다. 이 거부가 경계에 없으면 `focus_min = 0` 인 DB 가 만들어지고,
   * 그 주의 타이머는 즉시 끝나는 세션을 무한히 기록한다.
   */
  it.each([0, -5, 12.5])('rejects focusMin %p', (focusMin) => {
    expect(() => contracts.settings.setBaseline.req.parse([{ ...form, focusMin }])).toThrow()
  })

  it('rejects a missing focusMin', () => {
    const { focusMin: _dropped, ...rest } = form
    expect(() => contracts.settings.setBaseline.req.parse([rest])).toThrow()
  })

  it.each([6, 8])('rejects a capacity array of length %p', (len) => {
    const capacity = Array.from({ length: len }, () => 1)
    expect(() => contracts.settings.setBaseline.req.parse([{ ...form, capacity }])).toThrow()
  })

  /** 가용량은 0 을 허용한다 — "그날은 안 한다"는 정상적인 계획 의사다 (R7). */
  it('accepts zero in a capacity slot but not a negative one', () => {
    const zeroed = { ...form, capacity: [0, 0, 0, 0, 0, 0, 0] }
    expect(contracts.settings.setBaseline.req.parse([zeroed])).toEqual([zeroed])
    expect(() =>
      contracts.settings.setBaseline.req.parse([{ ...form, capacity: [-1, 0, 0, 0, 0, 0, 0] }])
    ).toThrow()
  })
})

describe('settings.getBaseline contract (pomo-baseline R26)', () => {
  const res = {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    capacity: null,
    basisPomos: null,
    basisSource: null
  }

  it('takes no arguments', () => {
    expect(contracts.settings.getBaseline.req.parse([])).toEqual([])
    expect(() => contracts.settings.getBaseline.req.parse([1])).toThrow()
  })

  /** 기준 개수 없음은 오류가 아니다 (A25) — 화면이 비교를 생략할 뿐이다. */
  it('allows the basis to be absent', () => {
    expect(contracts.settings.getBaseline.res.parse(res)).toEqual(res)
  })

  it('carries where the basis came from', () => {
    const fromBudget = { ...res, basisPomos: 24, basisSource: 'budget' as const }
    expect(contracts.settings.getBaseline.res.parse(fromBudget)).toEqual(fromBudget)
  })

  it('rejects an unknown basis source', () => {
    expect(() =>
      contracts.settings.getBaseline.res.parse({ ...res, basisPomos: 24, basisSource: 'guess' })
    ).toThrow()
  })
})

describe('calendar contract — 달력 키 형식은 경계에서 거른다 (ADR-011 §6)', () => {
  it('zero-pad 없는 월 키를 거부한다', () => {
    expect(contracts.calendar.month.req.safeParse(['2026-8']).success).toBe(false)
  })

  it('두 자리 연도를 거부한다', () => {
    expect(contracts.calendar.month.req.safeParse(['26-08']).success).toBe(false)
  })

  it('월 채널에 날짜 키를 보내면 거부한다 — 두 키가 섞이면 범위 조회가 하루짜리가 된다', () => {
    expect(contracts.calendar.month.req.safeParse(['2026-08-04']).success).toBe(false)
  })

  it('정상 월 키를 통과시킨다', () => {
    expect(contracts.calendar.month.req.safeParse(['2026-08']).success).toBe(true)
  })

  it('날짜 채널은 날짜 키만 받는다', () => {
    expect(contracts.calendar.day.req.safeParse(['2026-08-04']).success).toBe(true)
    expect(contracts.calendar.day.req.safeParse(['2026-08']).success).toBe(false)
  })

  /**
   * 점 없음은 `hasRecord: false` 로만 표현된다. `dotLevel: null` 을 허용하면 같은 사실을
   * 두 필드가 말하게 되고, 두 값이 어긋난 응답이 계약을 통과한다.
   */
  it('dotLevel 에 null 을 허용하지 않는다', () => {
    const day = {
      dayKey: '2026-08-04',
      hasRecord: false,
      focusCount: 0,
      dotLevel: null
    }
    const res = contracts.calendar.month.res.safeParse({
      month: '2026-08',
      leadingBlanks: 0,
      days: [day]
    })
    expect(res.success).toBe(false)
  })

  it('앞 빈 칸 수는 0~6 이다 — 7 은 한 줄이 통째로 비었다는 뜻이라 있을 수 없다', () => {
    const base = { month: '2026-08', days: [] }
    expect(contracts.calendar.month.res.safeParse({ ...base, leadingBlanks: 6 }).success).toBe(true)
    expect(contracts.calendar.month.res.safeParse({ ...base, leadingBlanks: 7 }).success).toBe(
      false
    )
  })
})
