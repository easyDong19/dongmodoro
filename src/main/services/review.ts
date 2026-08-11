import { addDays, addWeeks, weekOfDay, weeksBetween, weeksSince } from '@shared/time'
import { STALE_RANGE } from '@shared/ipc/contracts'
import { effectiveBudget, globalBaseline, weekSnapshot } from './baseline'
import { remainingPomos } from './week-plan'
import type { Baseline, CompletedItemRow, Repositories, ReviewWeekFact, UnitOfWork } from './ports'

const WATERMARK = 'last_settled_week'
const LEAD = 'plan_lead_days'

/**
 * 정산 판정의 결과. `needed: false` 여도 `targetWeek` 은 늘 있다 — 플래너가 "어느 주를
 * 계획하는 중인가"를 이 값으로 안다.
 */
export type SettlementStatus =
  | { needed: false; targetWeek: string }
  | { needed: true; targetWeek: string; from: string; to: string }

/**
 * 계획 대상 주 = `weekOf(오늘 + plan_lead_days)` (technical-spec §0).
 * `plan_lead_days` 기본 1 = 일요일에 다음 주를 계획한다.
 */
function planTargetWeek(repos: Repositories, todayKey: string): string {
  const raw = repos.settings.get(LEAD)
  const lead = raw === null ? 1 : (JSON.parse(raw) as number)
  return weekOfDay(addDays(todayKey, lead))
}

function readWatermark(repos: Repositories): string | null {
  const raw = repos.settings.get(WATERMARK)
  return raw === null ? null : (JSON.parse(raw) as string)
}

/**
 * 정산 필요 판정 (technical-spec §0.1). **순수 읽기다 — write 가 0 이다** (R27).
 *
 * 저장 입력은 워터마크 하나뿐이라 조건 분기가 없다: 정시·지각·첫 실행·확정 직후가
 * 전부 같은 식 하나를 지난다. `from > to` 는 에러가 아니라 **정상 상태**이며, 평일
 * 정상 사용과 확정 직후가 모두 그 경로다.
 *
 * **워터마크가 없으면 여기서 초기화하지 않는다.** 판정은 앱 시작·창 포커스·자정 tick
 * 마다 도는 경로라, 읽기가 write 를 유발하면 워터마크 유실 시 다음 포커스에서 조용히
 * 재초기화돼 미정산 과거 주가 영구 스킵된다. 초기화는 `bootstrapWatermark` 의 일이다.
 *
 * 달력 키는 사전순 = 시간순이므로 범위 비교가 문자열 비교로 성립한다 (ADR-009 §1).
 *
 * `uow` 가 아니라 `repos` 를 받는 이유: 확정 트랜잭션의 1단계(낙관적 동시성 재판정)가
 * **트랜잭션 안에서** 이 함수를 부른다. UnitOfWork 는 중첩할 수 없다 (ports.ts).
 */
export function evaluateSettlement(repos: Repositories, todayKey: string): SettlementStatus {
  const targetWeek = planTargetWeek(repos, todayKey)
  const wm = readWatermark(repos)
  if (wm === null) return { needed: false, targetWeek }

  const from = addWeeks(wm, 1)
  const to = addWeeks(targetWeek, -1)
  if (from > to) return { needed: false, targetWeek }

  return { needed: true, targetWeek, from, to }
}

/**
 * 워터마크 초기화 — **앱 시작 절차의 일부**이고 판정이 아니다 (technical-spec §0.2).
 * 마이그레이션·시딩 다음, 창을 띄우기 전에 1회 부른다.
 *
 * 기록이 없으면 `targetWeek − 1주` 다 — 설치 직후 숙제 0 (R4). 그 대가로 첫 실행이
 * 계획일이면 설치일이 속한 주가 즉시 워터마크 뒤로 가는데, 명시 수용한 부작용이다
 * (R39). 그 주의 세션은 캘린더·항목 소진·주간 카드에 정상 반영되고 정산 요약에만
 * 안 나온다.
 *
 * 기록이 **있는데** 키가 없으면 유실·복구된 DB 다. 그때는 가장 이른 기록 주 − 1주로
 * 되돌려 밀린 주를 정산 범위에 넣는다 (R28). 병합은 화면 1개로 흡수되므로(R6) 이
 * 폴백이 숙제를 만들지 않는다. `min` 을 취하는 것은 기록이 미래 주에만 있는 이상
 * 상태에서도 워터마크가 `targetWeek − 1주` 보다 뒤로 가지 않게 하기 위함이다.
 */
export function bootstrapWatermark(uow: UnitOfWork, todayKey: string): void {
  uow.run((repos) => {
    if (readWatermark(repos) !== null) return

    const base = addWeeks(planTargetWeek(repos, todayKey), -1)
    const earliest = repos.review.earliestRecordedWeek()
    const fallback = earliest === null ? base : addWeeks(earliest, -1)

    repos.settings.set(WATERMARK, JSON.stringify(fallback < base ? fallback : base))
  })
}

export type ReviewStatus =
  | { needed: false; targetWeek: string }
  | {
      needed: true
      targetWeek: string
      from: string
      to: string
      weekCount: number
      pendingItemCount: number
    }

/**
 * 배너용 판정 (`review.getStatus`). 읽기 전용이다.
 *
 * `pendingItemCount` 가 0 이어도 `needed` 는 참일 수 있다 — 워터마크를 전진시키는 것
 * 자체가 확정의 일이기 때문이다 (R5). 이 값은 배너 **문구**만 가른다.
 */
export function reviewStatus(uow: UnitOfWork, todayKey: string): ReviewStatus {
  return uow.run((repos) => {
    const st = evaluateSettlement(repos, todayKey)
    if (!st.needed) return st
    return {
      ...st,
      weekCount: weeksBetween(st.from, st.to).length,
      pendingItemCount: repos.review.countPending(st.from, st.to)
    }
  })
}

/** 3택 한 행. 남은 몫과 배지는 **저장값이 아니라 파생**이라 여기서 붙인다. */
export type PendingDecisionRow = {
  id: string
  week: string
  title: string
  estPomos: number
  spentPomos: number
  /** `max(0, est − 소진)`. **측정값이므로 0 이 될 수 있다** (ADR-019 §1). */
  remaining: number
  /** 이월 배지 `N주째`. 사슬 길이가 아니라 주차 차이다 (Q12). */
  carryWeeks: number
}

export type ReviewPending =
  | { needed: false; targetWeek: string }
  | {
      needed: true
      targetWeek: string
      /** 계획 대상 주가 오늘이 속한 주인가 — 확정 버튼 라벨이 갈린다 (ux-spec §7.1). */
      targetWeekIsCurrent: boolean
      from: string
      to: string
      summary: {
        weeks: ReviewWeekFact[]
        /** 범위 안에서 기록이 전혀 없던 주의 수 — "N주 쉬었어요" 의 재료다. */
        idleWeekCount: number
        lastStudiedWeek: string | null
        lastStudiedPomos: number | null
      }
      completed: CompletedItemRow[]
      pending: PendingDecisionRow[]
      /** **nullable 이다.** `weekly_capacity` 를 시딩하지 않으므로 기본 예산이 없다 */
      targetWeekBudget: number | null
      baseline: Baseline
    }

/**
 * 3택 대상에 파생값을 붙인다. **패널과 확정이 같은 함수를 쓴다** — 화면이 본 남은 몫과
 * 서버가 클램프에 쓰는 남은 몫이 갈리면 클램프가 사용자에게 설명 불가능해진다.
 */
function pendingRows(repos: Repositories, from: string, to: string): PendingDecisionRow[] {
  return repos.review.listPending(from, to).map((row) => ({
    id: row.id,
    week: row.week,
    title: row.title,
    estPomos: row.estPomos,
    spentPomos: row.spentPomos,
    // M3a 가 만든 클램프를 그대로 쓴다 — 정산이 자기 것을 따로 만들면 두 곳이 갈린다.
    remaining: remainingPomos(row.estPomos, row.spentPomos),
    carryWeeks: weeksSince(row.originWeek, row.week)
  }))
}

/**
 * 정산 패널 데이터 (`review.getPending`). 읽기 전용이다.
 *
 * **빈 범위도 표현할 수 있어야 한다.** 패널은 배너에서만 열리지만, `STALE_RANGE` 후
 * 재조회했을 때 범위가 사라져 있을 수 있다 (다른 창에서 확정했거나 자정을 넘겼거나).
 * 그때 던지거나 빈 목록으로 거짓말하는 대신 `needed: false` 를 돌려 화면이
 * "지금 정산할 주가 없어요" 로 갈 수 있게 한다 (ux-spec §8).
 */
export function reviewPending(uow: UnitOfWork, todayKey: string): ReviewPending {
  return uow.run((repos) => {
    const st = evaluateSettlement(repos, todayKey)
    if (!st.needed) return st

    const weeks = repos.review.weekFacts(st.from, st.to)
    const last = repos.review.lastStudied()

    return {
      needed: true,
      targetWeek: st.targetWeek,
      targetWeekIsCurrent: weekOfDay(todayKey) === st.targetWeek,
      from: st.from,
      to: st.to,
      summary: {
        weeks,
        idleWeekCount: weeksBetween(st.from, st.to).length - weeks.length,
        lastStudiedWeek: last?.week ?? null,
        lastStudiedPomos: last?.spentPomos ?? null
      },
      completed: repos.review.listCompleted(st.from, st.to),
      pending: pendingRows(repos, st.from, st.to),
      targetWeekBudget: effectiveBudget(repos, st.targetWeek),
      // 계획 대상 주의 스냅샷이 아니라 **전역 설정값**이다 — 길이 표시는 "앞으로 적용될
      // 값"을 말하는 자리이기 때문이다 (ADR-013 §3).
      baseline: globalBaseline(repos)
    }
  })
}

// 남는 에러가 하나뿐인 것은 의도된 결과다. 이전 판의 `DECISION_MISSING`·
// `DECISION_UNKNOWN`·`REDUCED_OUT_OF_RANGE` 는 각각 "결정 없음 = 이월"·"무시"·"클램프"로
// 흡수돼 사라졌다. 문자열은 renderer 와 공유한다 (shared/ipc/contracts.ts).
export type SettleException =
  { kind: 'carry_reduced'; itemId: string; estPomos: number } | { kind: 'drop'; itemId: string }

export type SettleInput = {
  /** 화면이 보고 있던 범위. 낙관적 동시성의 근거다. */
  expectedRange: { from: string; to: string }
  targetWeek: string
  /** **예외만** 담는다. 빈 배열은 "전부 이월"이라는 완전한 의사 표시다 (R13). */
  exceptions: readonly SettleException[]
}

export type SettleResult = {
  settledThrough: string
  carriedItemIds: string[]
  droppedItemIds: string[]
  carriedPomos: number
  /** 예외에 없어 서버가 이월한 항목 — 화면이 몰랐을 수 있다 (R30). */
  autoCarried: { sourceItemId: string; newItemId: string; title: string; estPomos: number }[]
  ignoredExceptionIds: string[]
  clampedExceptionIds: string[]
}

export type SettleDecisions = {
  drops: string[]
  carries: { sourceId: string; title: string; estPomos: number; fromException: boolean }[]
  /** 재조회 결과에 없어 무시한 예외 (완료·삭제·폐기·시스템·범위 밖이 전부 여기로). */
  ignoredExceptionIds: string[]
  clampedExceptionIds: string[]
}

/**
 * 예외 목록 × **재조회한** pending → 실제로 실행할 결정 (technical-spec 3단계).
 *
 * 어떤 입력도 거부하지 않는다. 패널이 모달이 아니라는 약속(R7)의 대가로 화면이 보낸
 * 예외는 언제든 낡을 수 있고, 낡은 예외를 거부하면 정상 사용이 확정을 실패시킨다 (R29).
 * 그래서 모르는 항목은 무시하고, 범위를 벗어난 축소는 자른다.
 */
export function resolveDecisions(
  pending: readonly PendingDecisionRow[],
  exceptions: readonly SettleException[]
): SettleDecisions {
  const known = new Map(pending.map((row) => [row.id, row]))
  const byId = new Map(exceptions.filter((e) => known.has(e.itemId)).map((e) => [e.itemId, e]))

  const decisions: SettleDecisions = {
    drops: [],
    carries: [],
    ignoredExceptionIds: exceptions.filter((e) => !known.has(e.itemId)).map((e) => e.itemId),
    clampedExceptionIds: []
  }

  for (const row of pending) {
    const ex = byId.get(row.id)
    if (ex?.kind === 'drop') {
      decisions.drops.push(row.id)
      continue
    }

    // 이월 est 의 하한 1 은 남은 몫의 성질이 아니라 **이월 규칙**이다 — 이월한다는 것은
    // 다음 주에도 계속한다는 뜻이므로 최소 1 을 계획한다 (R14-1 · ADR-019 §1).
    const carryEst = Math.max(1, row.remaining)
    let estPomos = carryEst
    if (ex?.kind === 'carry_reduced') {
      estPomos = Math.min(carryEst, Math.max(1, ex.estPomos))
      if (estPomos !== ex.estPomos) decisions.clampedExceptionIds.push(row.id)
    }

    decisions.carries.push({
      sourceId: row.id,
      title: row.title,
      estPomos,
      fromException: ex !== undefined
    })
  }

  return decisions
}

/**
 * 정산 확정 — **유스케이스 1개 = 트랜잭션 1개** (ADR-007). 중간 실패 시 반쯤 정산된
 * 상태가 남지 않는다 (R22).
 *
 * 단계 순서 자체가 안전 장치다:
 *   1. 재판정 — 없으면 패널을 열어둔 채 자정을 넘긴 뒤 확정할 때 화면이 본 범위와
 *      실제 범위가 어긋난 채로 워터마크가 전진해 항목이 조용히 건너뛰어진다.
 *   2. **재조회** — 화면이 보낸 목록이 아니라 지금의 사실. "예외만 전송"의 짝이다.
 *   3. 예외 대조 — 거부하지 않고 흡수 (`resolveDecisions`).
 *   4~6. 폐기 · 이월 생성 + 조각 재부모화 · 주별 행 (리포지토리 한 번).
 *   7. 워터마크 전진 — **마지막**이라 앞에서 실패하면 같은 범위가 다음 실행에 다시 잡힌다.
 */
export function settle(
  uow: UnitOfWork,
  now: { dayKey: string; instant: string },
  input: SettleInput
): SettleResult {
  return uow.run((repos) => {
    const st = evaluateSettlement(repos, now.dayKey)
    if (
      !st.needed ||
      st.from !== input.expectedRange.from ||
      st.to !== input.expectedRange.to ||
      st.targetWeek !== input.targetWeek
    ) {
      throw new Error(STALE_RANGE)
    }

    const decisions = resolveDecisions(pendingRows(repos, st.from, st.to), input.exceptions)

    const { carried } = repos.review.applySettlement({
      targetWeek: st.targetWeek,
      snapshot: weekSnapshot(repos, st.targetWeek),
      rangeWeeks: weeksBetween(st.from, st.to),
      drops: decisions.drops,
      carries: decisions.carries.map((c) => ({ sourceId: c.sourceId, estPomos: c.estPomos })),
      at: now.instant
    })

    repos.settings.set(WATERMARK, JSON.stringify(st.to))

    const newIdBySource = new Map(carried.map((c) => [c.sourceItemId, c.newItemId]))
    return {
      settledThrough: st.to,
      carriedItemIds: carried.map((c) => c.newItemId),
      droppedItemIds: decisions.drops,
      carriedPomos: decisions.carries.reduce((sum, c) => sum + c.estPomos, 0),
      autoCarried: decisions.carries
        .filter((c) => !c.fromException)
        .map((c) => ({
          sourceItemId: c.sourceId,
          newItemId: newIdBySource.get(c.sourceId) ?? '',
          title: c.title,
          estPomos: c.estPomos
        })),
      ignoredExceptionIds: decisions.ignoredExceptionIds,
      clampedExceptionIds: decisions.clampedExceptionIds
    }
  })
}
