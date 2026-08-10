import { addDays, addWeeks, weekOfDay, weeksBetween, weeksSince } from '@shared/time'
import { effectiveBudget, globalBaseline } from './baseline'
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
      pending: repos.review.listPending(st.from, st.to).map((row) => ({
        id: row.id,
        week: row.week,
        title: row.title,
        estPomos: row.estPomos,
        spentPomos: row.spentPomos,
        // M3a 가 만든 클램프를 그대로 쓴다 — 정산이 자기 것을 따로 만들면 두 곳이 갈린다.
        remaining: remainingPomos(row.estPomos, row.spentPomos),
        carryWeeks: weeksSince(row.originWeek, row.week)
      })),
      targetWeekBudget: effectiveBudget(repos, st.targetWeek),
      // 계획 대상 주의 스냅샷이 아니라 **전역 설정값**이다 — 길이 표시는 "앞으로 적용될
      // 값"을 말하는 자리이기 때문이다 (ADR-013 §3).
      baseline: globalBaseline(repos)
    }
  })
}
