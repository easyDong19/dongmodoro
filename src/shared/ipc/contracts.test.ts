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

describe('settings.setBaseline contract (pomo-baseline R5)', () => {
  const form = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

  it('accepts the seeded defaults', () => {
    expect(contracts.settings.setBaseline.req.parse([form])).toEqual([form])
  })

  /** 가용량은 폐기된 통화다 (ADR-030) — strictObject 가 남은 필드를 경계에서 되돌린다. */
  it('rejects a leftover capacity field', () => {
    expect(() => contracts.settings.setBaseline.req.parse([{ ...form, capacity: null }])).toThrow()
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
})

describe('settings.getBaseline contract (pomo-baseline R6)', () => {
  const res = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

  it('takes no arguments', () => {
    expect(contracts.settings.getBaseline.req.parse([])).toEqual([])
    expect(() => contracts.settings.getBaseline.req.parse([1])).toThrow()
  })

  it('returns the three lengths and nothing else', () => {
    expect(contracts.settings.getBaseline.res.parse(res)).toEqual(res)
  })

  /**
   * 시간 비교의 기준 개수는 그 분모(유효 예산·가용량 합)와 함께 폐기됐다
   * (ADR-029 §3). 파생 필드가 다시 붙으면 여기가 먼저 깨져야 한다.
   */
  it('rejects the retired basis fields', () => {
    expect(() =>
      contracts.settings.getBaseline.res.parse({ ...res, basisPomos: 24, basisSource: 'budget' })
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

describe('milestones contract — 수치 필드가 없다 (R3 · A3)', () => {
  it('빈 제목과 공백 제목을 거부한다', () => {
    const req = contracts.milestones.create.req
    expect(req.safeParse([{ month: '2026-08', title: '' }]).success).toBe(false)
    expect(req.safeParse([{ month: '2026-08', title: '   ' }]).success).toBe(false)
  })

  /**
   * A3 — "마일스톤 추가 폼에 뽀모·할당량 등 숫자 입력 필드가 없다." 계약이 `strictObject`
   * 이므로 수치 필드를 실은 요청이 거부된다. 계약에 없으면 화면이 만들 수 없다.
   */
  it('예상 뽀모를 실은 생성 요청을 거부한다 (A3)', () => {
    const res = contracts.milestones.create.req.safeParse([
      { month: '2026-08', title: '결과물', estPomos: 4 }
    ])
    expect(res.success).toBe(false)
  })

  it('제목 복사는 제목 배열만 받는다 — 원본 id 를 받지 않는다 (R22 · A23)', () => {
    const req = contracts.milestones.carryTitles.req
    expect(req.safeParse([{ month: '2026-08', titles: ['남은 것'] }]).success).toBe(true)
    expect(req.safeParse([{ month: '2026-08', titles: ['a'], sourceIds: ['m1'] }]).success).toBe(
      false
    )
  })

  it('빈 제목 배열을 거부한다 — 아무것도 안 만드는 호출은 의도가 아니다', () => {
    expect(
      contracts.milestones.carryTitles.req.safeParse([{ month: '2026-08', titles: [] }]).success
    ).toBe(false)
  })

  it('응답의 마일스톤 행에 수치 필드가 없다', () => {
    const res = contracts.milestones.forMonth.res.safeParse({
      month: '2026-08',
      mode: 'edit',
      items: [
        {
          id: 'm1',
          month: '2026-08',
          title: '결과물',
          completedAt: null,
          archivedAt: null,
          rollup: null,
          estPomos: 4
        }
      ],
      badge: null,
      rollupWeek: null,
      carryCandidates: []
    })
    expect(res.success).toBe(false)
  })

  it('연결 해제는 null 로 표현되며 유효하다 (R13)', () => {
    const req = contracts.week.setMilestone.req
    expect(req.safeParse([{ weekItemId: 'i1', milestoneId: null }]).success).toBe(true)
    expect(req.safeParse([{ weekItemId: 'i1', milestoneId: 'm1' }]).success).toBe(true)
    expect(req.safeParse([{ weekItemId: 'i1' }]).success).toBe(false)
  })
})
