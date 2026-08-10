import { describe, expect, it } from 'vitest'
import { bootstrapWatermark, evaluateSettlement, reviewStatus } from './review'
import type { Repositories, UnitOfWork } from './ports'

/**
 * 판정은 `settings` 두 키와 `review` 포트 두 개만 본다. 실 SQLite 를 붙이면 검증 대상이
 * 판정식이 아니라 SQL 이 된다 — 리포지토리 계약은 `db/repositories/review.test.ts` 소관이다.
 *
 * `writes` 를 세는 이유가 이 테스트의 절반이다. 판정 경로에 write 가 하나라도 섞이면
 * 워터마크 유실 시 다음 창 포커스에서 조용히 재초기화돼 미정산 과거 주가 영구
 * 스킵된다 (R27 · technical-spec §0.1).
 */
function fake(o: { watermark?: string; lead?: number; earliest?: string; pendingCount?: number }): {
  uow: UnitOfWork
  repos: Repositories
  writes: { key: string; value: string }[]
} {
  const store = new Map<string, string>()
  if (o.watermark !== undefined) store.set('last_settled_week', JSON.stringify(o.watermark))
  store.set('plan_lead_days', JSON.stringify(o.lead ?? 1))

  const writes: { key: string; value: string }[] = []
  const repos = {
    settings: {
      get: (key: string) => store.get(key) ?? null,
      set: (key: string, value: string) => {
        writes.push({ key, value })
        store.set(key, value)
      },
      updatedAt: () => null
    },
    review: {
      earliestRecordedWeek: () => o.earliest ?? null,
      countPending: () => o.pendingCount ?? 0
    }
  } as unknown as Repositories

  return { uow: { run: (work) => work(repos) }, repos, writes }
}

/**
 * technical-spec 의 경계 시나리오 표를 그대로 옮긴다. 주 라벨(W35)은 렌더 전용이므로
 * 실제 월요일 날짜로 쓴다. 2026-08-03·10·17·24·31 · 09-07 이 전부 월요일이다.
 */
describe('evaluateSettlement — 경계 시나리오 (technical-spec §0)', () => {
  const cases = [
    {
      no: '2  평일 정상 사용 (수)',
      today: '2026-09-02',
      watermark: '2026-08-24',
      lead: 1,
      expected: { needed: false, targetWeek: '2026-08-31' }
    },
    {
      no: '3  정시 일요일',
      today: '2026-09-06',
      watermark: '2026-08-24',
      lead: 1,
      expected: {
        needed: true,
        targetWeek: '2026-09-07',
        from: '2026-08-31',
        to: '2026-08-31'
      }
    },
    {
      no: '4  시나리오 3 확정 직후 — 배너 즉시 소멸',
      today: '2026-09-06',
      watermark: '2026-08-31',
      lead: 1,
      expected: { needed: false, targetWeek: '2026-09-07' }
    },
    {
      no: '5  3주 만에 복귀 (화)',
      today: '2026-09-01',
      watermark: '2026-08-03',
      lead: 1,
      expected: {
        needed: true,
        targetWeek: '2026-08-31',
        from: '2026-08-10',
        to: '2026-08-24'
      }
    },
    {
      no: '6  시나리오 5 확정 직후',
      today: '2026-09-01',
      watermark: '2026-08-24',
      lead: 1,
      expected: { needed: false, targetWeek: '2026-08-31' }
    },
    {
      no: '11 lead 0 — 월요일 아침, 밀린 것 없음',
      today: '2026-08-31',
      watermark: '2026-08-24',
      lead: 0,
      expected: { needed: false, targetWeek: '2026-08-31' }
    },
    {
      no: '11 lead 0 — 월요일 아침에 지난 주 정산',
      today: '2026-08-31',
      watermark: '2026-08-17',
      lead: 0,
      expected: {
        needed: true,
        targetWeek: '2026-08-31',
        from: '2026-08-24',
        to: '2026-08-24'
      }
    },
    {
      no: '13 lead 2 — 토요일에 배너가 켜진다',
      today: '2026-08-29',
      watermark: '2026-08-17',
      lead: 2,
      expected: {
        needed: true,
        targetWeek: '2026-08-31',
        from: '2026-08-24',
        to: '2026-08-24'
      }
    },
    {
      no: '13 lead 2 — 그날 밤 자정을 넘겨도 범위가 그대로다',
      today: '2026-08-30',
      watermark: '2026-08-17',
      lead: 2,
      expected: {
        needed: true,
        targetWeek: '2026-08-31',
        from: '2026-08-24',
        to: '2026-08-24'
      }
    }
  ] as const

  it.each(cases)('$no', ({ today, watermark, lead, expected }) => {
    const { repos } = fake({ watermark, lead })
    expect(evaluateSettlement(repos, today)).toEqual(expected)
  })

  /**
   * 시나리오 14. 이전 판의 technical-spec 은 "토→일 전이에서는 확정 요청이 있을 수
   * 없다"고 단정했고 그것은 틀렸다 — 워터마크가 밀려 있으면 토요일에도 패널이 열리고,
   * 자정을 넘기면 범위가 **커진다.** STALE_RANGE 후처리가 이 방향을 다뤄야 하는 근거다.
   */
  it('14 밀린 상태에서 토→일을 넘기면 정산 범위가 커진다', () => {
    const { repos } = fake({ watermark: '2026-08-10', lead: 1 })
    expect(evaluateSettlement(repos, '2026-08-29')).toEqual({
      needed: true,
      targetWeek: '2026-08-24',
      from: '2026-08-17',
      to: '2026-08-17'
    })
    expect(evaluateSettlement(repos, '2026-08-30')).toEqual({
      needed: true,
      targetWeek: '2026-08-31',
      from: '2026-08-17',
      to: '2026-08-24'
    })
  })

  it('워터마크가 없으면 초기화하지 않고 판정 불가를 돌려준다', () => {
    const { repos, writes } = fake({})
    expect(evaluateSettlement(repos, '2026-09-06')).toEqual({
      needed: false,
      targetWeek: '2026-09-07'
    })
    expect(writes).toEqual([])
  })

  it('plan_lead_days 가 없으면 기본 1 로 본다', () => {
    const { repos } = fake({ watermark: '2026-08-24' })
    expect(evaluateSettlement(repos, '2026-09-06')).toMatchObject({ targetWeek: '2026-09-07' })
  })

  it('A20 — 3회 연속 판정해도 저장값을 한 번도 바꾸지 않는다 (R27)', () => {
    const { repos, writes } = fake({ watermark: '2026-08-03', lead: 1, pendingCount: 4 })
    for (let i = 0; i < 3; i++) evaluateSettlement(repos, '2026-09-01')
    expect(writes).toEqual([])
  })
})

describe('bootstrapWatermark — 앱 시작 1회 (technical-spec §0.2)', () => {
  it('이미 있으면 손대지 않는다', () => {
    const { uow, writes } = fake({ watermark: '2026-08-03' })
    bootstrapWatermark(uow, '2026-09-06')
    expect(writes).toEqual([])
  })

  it('A1 — 기록이 전혀 없는 새 DB 는 targetWeek − 1주로 초기화되고 배너가 뜨지 않는다', () => {
    const { uow, repos } = fake({})
    bootstrapWatermark(uow, '2026-09-02') // 수요일
    expect(repos.settings.get('last_settled_week')).toBe('"2026-08-24"')
    expect(evaluateSettlement(repos, '2026-09-02')).toEqual({
      needed: false,
      targetWeek: '2026-08-31'
    })
  })

  /**
   * 시나리오 12 · R39. 헛배너를 막는 대가로 설치일이 속한 주가 즉시 워터마크 뒤로 간다.
   * 명시 수용한 부작용이므로 **테스트로 박제한다** — 나중에 누가 버그로 오해하고
   * 고치면 헛배너가 돌아온다.
   */
  it('A30 — 첫 실행이 계획일(일요일)이면 그 주가 워터마크 뒤로 간다 (명시 수용)', () => {
    const { uow, repos } = fake({})
    bootstrapWatermark(uow, '2026-08-30') // 일요일
    expect(repos.settings.get('last_settled_week')).toBe('"2026-08-24"')
    expect(evaluateSettlement(repos, '2026-08-30')).toEqual({
      needed: false,
      targetWeek: '2026-08-31'
    })
  })

  it('A21 — 기록이 있으면 가장 이른 기록 주 − 1주로 되돌려 밀린 주를 살린다', () => {
    const { uow, repos } = fake({ earliest: '2026-08-10' })
    bootstrapWatermark(uow, '2026-09-02')
    expect(repos.settings.get('last_settled_week')).toBe('"2026-08-03"')
    expect(evaluateSettlement(repos, '2026-09-02')).toEqual({
      needed: true,
      targetWeek: '2026-08-31',
      from: '2026-08-10',
      to: '2026-08-24'
    })
  })

  it('기록이 미래 주에만 있어도 targetWeek − 1주보다 뒤로 가지 않는다', () => {
    const { uow, repos } = fake({ earliest: '2026-10-05' })
    bootstrapWatermark(uow, '2026-09-02')
    expect(repos.settings.get('last_settled_week')).toBe('"2026-08-24"')
  })

  it('기록 주가 이미 targetWeek − 1주보다 뒤면 그 값을 쓴다', () => {
    const { uow, repos } = fake({ earliest: '2026-08-31' })
    bootstrapWatermark(uow, '2026-09-02')
    expect(repos.settings.get('last_settled_week')).toBe('"2026-08-24"')
  })
})

describe('reviewStatus — 배너 payload', () => {
  it('빈 범위면 targetWeek 만 준다', () => {
    const { uow } = fake({ watermark: '2026-08-24' })
    expect(reviewStatus(uow, '2026-09-02')).toEqual({
      needed: false,
      targetWeek: '2026-08-31'
    })
  })

  it('범위의 주 수와 넘어갈 건수를 함께 준다', () => {
    const { uow } = fake({ watermark: '2026-08-03', pendingCount: 7 })
    expect(reviewStatus(uow, '2026-09-01')).toEqual({
      needed: true,
      targetWeek: '2026-08-31',
      from: '2026-08-10',
      to: '2026-08-24',
      weekCount: 3,
      pendingItemCount: 7
    })
  })

  it('R5 — 미완료 항목이 0건이어도 정산 대기는 유지된다', () => {
    const { uow } = fake({ watermark: '2026-08-24', pendingCount: 0 })
    expect(reviewStatus(uow, '2026-09-06')).toMatchObject({
      needed: true,
      weekCount: 1,
      pendingItemCount: 0
    })
  })
})
