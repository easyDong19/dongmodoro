import { describe, expect, it } from 'vitest'
import { backdateOriginWeek, ensureWeeks, testUow } from '../db/repositories/test-helpers'
import {
  bootstrapWatermark,
  evaluateSettlement,
  resolveDecisions,
  reviewPending,
  reviewStatus,
  settle
} from './review'
import { STALE_RANGE } from '@shared/ipc/contracts'
import type { PendingDecisionRow } from './review'
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

/**
 * 확정 결정의 순수 계산. **거부하지 않고 흡수하는 것**이 이 함수의 전부다 (R29) —
 * 패널은 모달이 아니므로 열어둔 채 다른 화면에서 항목을 완료·삭제·추가하는 것이
 * 정상 사용이고, 그 정상 사용이 확정을 실패시키면 안 된다.
 */
describe('resolveDecisions — 예외 흡수 (R29)', () => {
  const row = (o: Partial<PendingDecisionRow> & { id: string }): PendingDecisionRow => ({
    week: '2026-08-10',
    title: o.id,
    estPomos: 5,
    spentPomos: 0,
    remaining: 5,
    carryWeeks: 1,
    ...o
  })

  it('A7 — 예외가 비면 전부 이월이다 (R13)', () => {
    const d = resolveDecisions([row({ id: 'a' }), row({ id: 'b' })], [])
    expect(d.drops).toEqual([])
    expect(d.carries).toEqual([
      { sourceId: 'a', title: 'a', estPomos: 5, fromException: false },
      { sourceId: 'b', title: 'b', estPomos: 5, fromException: false }
    ])
  })

  it('A22 — 재조회 목록에 없는 예외는 무시한다. 거부하지 않는다', () => {
    const d = resolveDecisions([row({ id: 'a' })], [{ kind: 'drop', itemId: 'gone' }])
    expect(d.ignoredExceptionIds).toEqual(['gone'])
    expect(d.drops).toEqual([])
    expect(d.carries).toHaveLength(1)
  })

  it('A23 — 그 사이 새로 생긴 항목은 이월되고 예외가 아니었음이 표시된다', () => {
    const d = resolveDecisions(
      [row({ id: 'known' }), row({ id: 'new' })],
      [{ kind: 'carry_reduced', itemId: 'known', estPomos: 2 }]
    )
    expect(d.carries).toEqual([
      { sourceId: 'known', title: 'known', estPomos: 2, fromException: true },
      { sourceId: 'new', title: 'new', estPomos: 5, fromException: false }
    ])
  })

  it('보내주기는 이월하지 않는다', () => {
    const d = resolveDecisions([row({ id: 'a' })], [{ kind: 'drop', itemId: 'a' }])
    expect(d.drops).toEqual(['a'])
    expect(d.carries).toEqual([])
  })

  it('A9 — 남은 몫이 0 이어도 이월 est 는 1 이다 (R14-1 · ADR-019 §1)', () => {
    const d = resolveDecisions([row({ id: 'a', estPomos: 2, spentPomos: 5, remaining: 0 })], [])
    expect(d.carries[0].estPomos).toBe(1)
  })

  it('축소 est 는 1..이월 est 로 클램프하고 그 사실을 알린다 (규칙 4)', () => {
    const pending = [row({ id: 'a', remaining: 4 }), row({ id: 'b', remaining: 4 })]
    const d = resolveDecisions(pending, [
      { kind: 'carry_reduced', itemId: 'a', estPomos: 9 },
      { kind: 'carry_reduced', itemId: 'b', estPomos: 3 }
    ])
    expect(d.carries.map((c) => c.estPomos)).toEqual([4, 3])
    expect(d.clampedExceptionIds).toEqual(['a'])
  })

  it('패널을 열어둔 사이 남은 몫이 줄어도 거부하지 않고 새 상한으로 자른다', () => {
    // 화면은 remaining 5 를 보고 3 을 보냈는데 그 사이 세션이 돌아 remaining 이 1 이 됐다
    const d = resolveDecisions(
      [row({ id: 'a', estPomos: 5, spentPomos: 4, remaining: 1 })],
      [{ kind: 'carry_reduced', itemId: 'a', estPomos: 3 }]
    )
    expect(d.carries[0].estPomos).toBe(1)
    expect(d.clampedExceptionIds).toEqual(['a'])
  })
})

/**
 * 여기서부터는 실 SQLite 다. `reviewPending` 은 리포지토리 다섯 개를 합성하는 자리라
 * 페이크로 검증하면 "내가 짠 페이크가 내 기대와 같은지"만 확인하게 된다.
 *
 * 날짜 배치: 워터마크 8/03 · 오늘 8/30(일) → 계획 대상 주 8/31, 정산 범위 {8/10, 8/17, 8/24}.
 * `seeded()` 는 앞의 두 주에만 행을 만들어 **8/24 를 공백 주로 남긴다.**
 */
describe('reviewPending — 패널 데이터', () => {
  const W1 = '2026-08-10'
  const W2 = '2026-08-17'
  const TARGET = '2026-08-31'
  const SUNDAY = '2026-08-30'
  const WEDNESDAY = '2026-08-26'

  function seeded(): ReturnType<typeof testUow> {
    const t = testUow()
    ensureWeeks(t.uow, W1, W2)
    t.uow.run((repos) => repos.settings.set('last_settled_week', JSON.stringify('2026-08-03')))
    return t
  }

  /** `needed: true` 를 좁혀 준다 — 아니면 아래 단언마다 분기를 써야 한다. */
  function panel(uow: UnitOfWork, todayKey: string) {
    const out = reviewPending(uow, todayKey)
    if (!out.needed) throw new Error('정산 대기 상태여야 하는 셋업이다')
    return out
  }

  it('빈 범위면 needed:false 로 답한다 — 던지지 않는다 (ux-spec §8)', () => {
    const { uow } = testUow()
    uow.run((repos) => repos.settings.set('last_settled_week', JSON.stringify('2026-08-24')))
    expect(reviewPending(uow, SUNDAY)).toEqual({ needed: false, targetWeek: TARGET })
  })

  it('범위를 알리고 기록 있는 주만 담으며 공백 주는 세기만 한다 (R11)', () => {
    const { uow } = seeded()
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
      })
      repos.weekItems.confirmPlan({
        week: W2,
        items: [{ id: null, title: 'B', estPomos: 1, days: [] }]
      })
    })

    const out = panel(uow, SUNDAY)
    expect([out.from, out.to, out.targetWeek]).toEqual([W1, '2026-08-24', TARGET])
    expect(out.summary.weeks.map((w) => w.week)).toEqual([W1, W2])
    expect(out.summary.idleWeekCount).toBe(1) // 8/24 에는 아무 기록도 없다
  })

  /**
   * `weeks` 행이 있다고 기록이 있는 것은 아니다 — 세션이나 항목이 있어야 한다
   * (technical-spec `summary.weeks[]` 정의). 부트스트랩의 `earliestRecordedWeek` 은
   * 반대로 `weeks` 행도 기록으로 세는데, 두 질문이 다르기 때문이다: 저쪽은 "이 DB 가
   * 언제부터 쓰였나", 이쪽은 "이 주에 대해 할 말이 있나".
   */
  it('weeks 행만 있는 주는 요약에 나오지 않고 공백으로 센다', () => {
    const { uow } = seeded() // W1·W2 의 weeks 행만 만들고 항목·세션은 넣지 않았다
    const out = panel(uow, SUNDAY)
    expect(out.summary.weeks).toEqual([])
    expect(out.summary.idleWeekCount).toBe(3)
  })

  it('A8·A9 — 남은 몫이 항목 est 기준이고 소진이 넘치면 0 이다', () => {
    const { uow } = seeded()
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: W1,
        items: [
          { id: null, title: 'est 5 소진 2', estPomos: 5, days: [] },
          { id: null, title: 'est 1 소진 3', estPomos: 1, days: [] }
        ]
      })
      repos.tasks.create({ id: 'ta', weekItemId: createdIds[0], title: '조각' })
      repos.tasks.create({ id: 'tb', weekItemId: createdIds[1], title: '조각' })
      const s = (id: string, taskId: string) => ({
        id,
        startedAt: '2026-08-11T01:00:00.000Z',
        endedAt: '2026-08-11T01:25:00.000Z',
        durationSec: 1500,
        kind: 'focus' as const,
        taskId,
        localDate: '2026-08-11',
        localWeek: W1
      })
      repos.sessions.insert(s('a0', 'ta'))
      repos.sessions.insert(s('a1', 'ta'))
      for (let i = 0; i < 3; i++) repos.sessions.insert(s(`b${i}`, 'tb'))
    })

    const byTitle = new Map(panel(uow, SUNDAY).pending.map((p) => [p.title, p]))
    expect(byTitle.get('est 5 소진 2')?.remaining).toBe(3)
    expect(byTitle.get('est 1 소진 3')?.remaining).toBe(0)
  })

  /**
   * A13. 이월 생성은 Task 6 소관이라 여기서는 `origin_week` 이 앞선 행을 **직접 심어**
   * 계산식만 본다 — 사슬 길이로 세면 건너뛴 주에서 값이 틀어진다 (Q12).
   */
  it('A13 — N주째는 사슬 길이가 아니라 주차 차이다', () => {
    const { uow, db } = seeded()
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W2,
        items: [{ id: null, title: '오래된 것', estPomos: 1, days: [] }]
      })
    })
    // 3주 앞(7/27)에 처음 생긴 항목이 두 주를 건너뛰어 8/17 에 와 있는 상태
    backdateOriginWeek(db, '2026-07-27')

    expect(panel(uow, SUNDAY).pending[0].carryWeeks).toBe(4)
  })

  it('정정 ② — 계획 대상 주의 스냅샷이 없으면 targetWeekBudget 이 null 이다', () => {
    const { uow } = seeded()
    expect(panel(uow, SUNDAY).targetWeekBudget).toBeNull()
  })

  it('길이는 계획 대상 주의 스냅샷이 아니라 전역 설정값이다 (ADR-013 §3)', () => {
    const { uow } = seeded()
    uow.run((repos) => {
      repos.weeks.ensure(TARGET, {
        focusMin: 50,
        shortBreakMin: 10,
        longBreakMin: 30,
        capacity: null,
        budget: null
      })
    })
    expect(panel(uow, SUNDAY).baseline.focusMin).toBe(25)
  })

  it('계획 대상 주가 오늘이 속한 주인지 알린다 (ux-spec §7.1)', () => {
    const { uow } = seeded()
    expect(panel(uow, SUNDAY).targetWeekIsCurrent).toBe(false)
    // 평일 지각 정산에서는 계획 대상 주가 곧 이번 주다
    expect(panel(uow, WEDNESDAY).targetWeekIsCurrent).toBe(true)
  })

  it('A25 — 마지막으로 공부한 주는 정산 범위 밖이어도 실려 온다', () => {
    const { uow } = seeded()
    ensureWeeks(uow, '2026-08-03')
    uow.run((repos) => {
      repos.sessions.insert({
        id: 'old',
        startedAt: '2026-08-04T01:00:00.000Z',
        endedAt: '2026-08-04T01:25:00.000Z',
        durationSec: 1500,
        kind: 'focus',
        taskId: null,
        localDate: '2026-08-04',
        localWeek: '2026-08-03' // 범위(from = 8/10) 밖이다
      })
    })

    const { summary } = panel(uow, SUNDAY)
    expect(summary.lastStudiedWeek).toBe('2026-08-03')
    expect(summary.lastStudiedPomos).toBe(1)
  })
})

/**
 * 확정 트랜잭션. 날짜는 위 패널 테스트와 같다 —
 * 워터마크 8/03 · 오늘 8/30(일) → 계획 대상 주 8/31, 범위 {8/10, 8/17, 8/24}.
 */
describe('settle — 확정 (R22 · 트랜잭션 1개)', () => {
  const W1 = '2026-08-10'
  const TARGET = '2026-08-31'
  const SUNDAY = '2026-08-30'
  const AT = '2026-08-30T12:00:00.000Z'
  const NOW = { dayKey: SUNDAY, instant: AT }
  const RANGE = { from: W1, to: '2026-08-24' }

  function seeded(): ReturnType<typeof testUow> {
    const t = testUow()
    ensureWeeks(t.uow, W1)
    t.uow.run((repos) => repos.settings.set('last_settled_week', JSON.stringify('2026-08-03')))
    return t
  }

  function plan(t: ReturnType<typeof testUow>, ...titles: string[]): string[] {
    return t.uow.run(
      (repos) =>
        repos.weekItems.confirmPlan({
          week: W1,
          items: titles.map((title) => ({ id: null, title, estPomos: 3, days: [] }))
        }).createdIds
    )
  }

  const input = (exceptions: Parameters<typeof settle>[2]['exceptions'] = []) => ({
    expectedRange: RANGE,
    targetWeek: TARGET,
    exceptions
  })

  it('A7 — 손대지 않고 확정하면 남은 항목 전체가 계획 대상 주에 생긴다 (R18)', () => {
    const t = seeded()
    plan(t, 'A', 'B')

    const out = settle(t.uow, NOW, input())
    expect(out.carriedItemIds).toHaveLength(2)
    expect(out.carriedPomos).toBe(6)

    t.uow.run((repos) => {
      // 원본은 그 주에 미완료로 남는다 — 사실이 보존된다
      expect(repos.weekItems.listForWeek(W1).map((r) => r.title)).toEqual(['A', 'B'])
      expect(repos.weekItems.listForWeek(TARGET).map((r) => r.title)).toEqual(['A', 'B'])
    })
  })

  it('R19 — 새 항목이 origin_week 를 승계하고 요일 배치는 비운다', () => {
    const t = seeded()
    plan(t, 'A')
    backdateOriginWeek(t.db, '2026-07-27')

    settle(t.uow, NOW, input())

    t.uow.run((repos) => {
      const [carried] = repos.weekItems.listForWeek(TARGET)
      expect(carried.originWeek).toBe('2026-07-27') // 최초 생성 주가 박제된 채 따라온다
      expect(carried.days).toEqual([])
    })
  })

  it('A27 — 미완료 조각만 새 항목으로 옮겨간다. 완료 조각은 원본에 남는다 (R35)', () => {
    const t = seeded()
    const [itemId] = plan(t, 'A')
    t.uow.run((repos) => {
      repos.tasks.create({ id: 'done', weekItemId: itemId, title: '끝낸 조각', completedAt: AT })
      repos.tasks.create({ id: 'open', weekItemId: itemId, title: '남은 조각' })
    })

    settle(t.uow, NOW, input())

    t.uow.run((repos) => {
      const [carried] = repos.weekItems.listForWeek(TARGET)
      expect(repos.tasks.get('open')?.weekItemId).toBe(carried.id)
      expect(repos.tasks.get('done')?.weekItemId).toBe(itemId)
    })
  })

  it('A14 — 보내주기는 dropped_at 만 찍고 행을 남긴다 (R21)', () => {
    const t = seeded()
    const [a, b] = plan(t, 'A', 'B')

    const out = settle(t.uow, NOW, input([{ kind: 'drop', itemId: a }]))
    expect(out.droppedItemIds).toEqual([a])

    t.uow.run((repos) => {
      expect(repos.weekItems.listForWeek(TARGET).map((r) => r.title)).toEqual(['B'])
      // 원본 행은 남아 있다 — 폐기는 삭제가 아니다 (ADR-014 §1)
      expect(repos.weekItems.header(a)).not.toBeNull()
      expect(repos.weekItems.listForWeek(W1).map((r) => r.id)).toEqual([b])
    })
  })

  it('A10 — 축소 이월은 자른 est 로 새 항목을 만든다', () => {
    const t = seeded()
    const [a] = plan(t, 'A')

    settle(t.uow, NOW, input([{ kind: 'carry_reduced', itemId: a, estPomos: 2 }]))

    t.uow.run((repos) => expect(repos.weekItems.listForWeek(TARGET)[0].estPomos).toBe(2))
  })

  it('R4·A16 — 워터마크가 targetWeek − 1주로 가고 재판정하면 빈 범위다', () => {
    const t = seeded()
    plan(t, 'A')

    const out = settle(t.uow, NOW, input())
    expect(out.settledThrough).toBe('2026-08-24')
    expect(reviewPending(t.uow, SUNDAY)).toEqual({ needed: false, targetWeek: TARGET })
  })

  it('A5 — 미완료 항목이 0건이어도 확정되고 워터마크만 전진한다 (R5)', () => {
    const t = seeded()
    const out = settle(t.uow, NOW, input())
    expect(out.carriedItemIds).toEqual([])
    expect(out.settledThrough).toBe('2026-08-24')
  })

  it('R37 — 범위의 주와 계획 대상 주에 행이 생기고 범위 쪽만 settled_at 을 받는다', () => {
    const t = seeded()
    settle(t.uow, NOW, input())
    t.uow.run((repos) => {
      // 범위 3주 + 계획 대상 주 전부 행이 있다
      for (const w of [W1, '2026-08-17', '2026-08-24', TARGET]) {
        expect(repos.weeks.baseline(w)).not.toBeNull()
      }
    })
  })

  it('시나리오 8 — 계획 대상 주에 이미 항목이 있으면 행을 추가할 뿐 병합하지 않는다', () => {
    const t = seeded()
    plan(t, '같은 제목')
    t.uow.run((repos) =>
      repos.weekItems.confirmPlan({
        week: TARGET,
        items: [{ id: null, title: '같은 제목', estPomos: 1, days: [] }]
      })
    )

    settle(t.uow, NOW, input())

    t.uow.run((repos) =>
      expect(repos.weekItems.listForWeek(TARGET).map((r) => r.title)).toEqual([
        '같은 제목',
        '같은 제목'
      ])
    )
  })

  it('A23 — 응답이 자동 이월을 사실로 알린다 (R30)', () => {
    const t = seeded()
    const [a] = plan(t, '화면이 아는 것', '그 사이 생긴 것')

    const out = settle(t.uow, NOW, input([{ kind: 'carry_reduced', itemId: a, estPomos: 1 }]))
    expect(out.autoCarried.map((c) => c.title)).toEqual(['그 사이 생긴 것'])
    expect(out.autoCarried[0].estPomos).toBe(3)
  })

  describe('STALE_RANGE', () => {
    it('범위가 다르면 중단한다 (시나리오 10)', () => {
      const t = seeded()
      expect(() =>
        settle(t.uow, NOW, { ...input(), expectedRange: { from: W1, to: '2026-08-17' } })
      ).toThrow(STALE_RANGE)
    })

    it('계획 대상 주가 다르면 중단한다', () => {
      const t = seeded()
      expect(() => settle(t.uow, NOW, { ...input(), targetWeek: '2026-09-07' })).toThrow(
        STALE_RANGE
      )
    })

    it('이미 정산이 끝나 빈 범위면 중단한다', () => {
      const t = seeded()
      settle(t.uow, NOW, input())
      expect(() => settle(t.uow, NOW, input())).toThrow(STALE_RANGE)
    })

    it('중단하면 아무것도 쓰지 않는다', () => {
      const t = seeded()
      plan(t, 'A')
      expect(() => settle(t.uow, NOW, { ...input(), targetWeek: '2026-09-07' })).toThrow()
      t.uow.run((repos) => {
        expect(repos.weekItems.listForWeek(TARGET)).toEqual([])
        expect(repos.settings.get('last_settled_week')).toBe('"2026-08-03"')
      })
    })
  })

  /**
   * A15. 원자성은 주장이 아니라 검증 대상이다. 이월 INSERT·폐기가 끝난 **뒤** 마지막
   * 단계(워터마크 전진)에서 터뜨려, 앞의 쓰기가 전부 되감기는지 본다.
   */
  it('A15 — 마지막 단계에서 실패하면 이월·폐기·워터마크가 전부 확정 이전 값이다 (R22)', () => {
    const t = seeded()
    const [a, b] = plan(t, 'A', 'B')

    const faulty: UnitOfWork = {
      run: (work) =>
        t.uow.run((repos) =>
          work({
            ...repos,
            settings: {
              ...repos.settings,
              set: (key, value) => {
                if (key === 'last_settled_week') throw new Error('강제 실패')
                repos.settings.set(key, value)
              }
            }
          })
        )
    }

    expect(() => settle(faulty, NOW, input([{ kind: 'drop', itemId: a }]))).toThrow('강제 실패')

    t.uow.run((repos) => {
      expect(repos.weekItems.listForWeek(TARGET)).toEqual([]) // 이월 INSERT 없음
      expect(repos.weekItems.listForWeek(W1).map((r) => r.id)).toEqual([a, b]) // 폐기 없음
      expect(repos.settings.get('last_settled_week')).toBe('"2026-08-03"')
    })
  })
})
