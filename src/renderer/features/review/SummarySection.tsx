import { weekStartLabel } from '@shared/time'
import { PomoDots } from '@renderer/shared/ui/PomoDots'
import type { ReviewPending } from './useReview'

type Summary = Extract<ReviewPending, { needed: true }>['summary']

/**
 * 정산 요약 (ux-spec §3). **실제로 한 일을 먼저 놓는다** (R9) — 공부한 날 수와 소진
 * 뽀모가 남은 건수보다 앞선다. 달성률 %는 주요 지표로 띄우지 않는다.
 *
 * "이번 주 마감"이라는 표현은 의도된 선택이다 (§3). 일요일에 확정하면 그 주에는 아직
 * 하루가 남아 있고, 정산 후 그날 밤에 돌린 세션은 이 요약에 안 잡히지만 캘린더·항목
 * 소진에는 반영된다 (R26). "지난 주"라고 쓰면 그 어긋남이 거짓말이 된다.
 */
export function SummarySection({
  summary,
  from,
  to,
  currentWeek
}: {
  summary: Summary
  from: string
  to: string
  /** 오늘이 속한 주. "이번 주 마감"과 "지난 주"를 가른다. */
  currentWeek: string
}) {
  const { weeks, idleWeekCount, lastStudiedWeek, lastStudiedPomos } = summary
  const totalSpent = weeks.reduce((sum, w) => sum + w.spentPomos, 0)
  const merged = from !== to

  return (
    <section className="flex flex-col gap-2">
      {weeks.length === 0 ? (
        // 기록도 계획도 없는 범위에는 해석할 예산조차 없다 — 주별 목록을 만들지 않는다.
        <p className="text-sm text-ink-dim">이 기간에는 기록이 없어요</p>
      ) : merged ? (
        <MergedHeadline totalSpent={totalSpent} weeks={weeks} />
      ) : (
        <SingleHeadline week={weeks[0]} isCurrentWeek={from === currentWeek} />
      )}

      {/* 공백은 판단 없이 사실로만 (R11). "쉬었어요"에 아쉬움·격려를 붙이지 않는다. */}
      {idleWeekCount > 0 ? (
        <p className="text-xs text-ink-dim">
          {`${idleWeekCount}주 쉬었어요`}
          {lastStudiedWeek !== null && lastStudiedPomos !== null
            ? ` · 마지막으로 공부한 주(${weekStartLabel(lastStudiedWeek)}) 뽀모 ${lastStudiedPomos} 소진`
            : ''}
        </p>
      ) : null}
    </section>
  )
}

function SingleHeadline({
  week,
  isCurrentWeek
}: {
  week: Summary['weeks'][number]
  isCurrentWeek: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-ink">
        {isCurrentWeek ? '이번 주 마감' : `지난 주(${weekStartLabel(week.week)})`}
        {` — ${week.studiedDays}일 공부, 뽀모 ${week.spentPomos} 소진`}
        {/* 예산이 없으면 괄호 자체를 적지 않는다. 0 이라고 쓰면 "정한 적 없음"과
            "0 으로 정했음"이 뭉개진다 (ADR-018 §1). */}
        {week.budget !== null ? ` (예산 ${week.budget})` : ''}
      </p>
      <SpentDots spent={week.spentPomos} budget={week.budget} />
    </div>
  )
}

function MergedHeadline({ totalSpent, weeks }: { totalSpent: number; weeks: Summary['weeks'] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-ink">{`${weekStartLabel(weeks[0].week)} – ${weekStartLabel(
        weeks[weeks.length - 1].week
      )} — 뽀모 ${totalSpent} 소진`}</p>
      <ul className="flex flex-col gap-0.5">
        {weeks.map((w) => (
          <li
            key={w.week}
            data-testid="summary-week-row"
            className="font-mono text-xs tabular-nums text-ink-dim"
          >
            {`${weekStartLabel(w.week)} · ${w.studiedDays}일 공부, 뽀모 ${w.spentPomos}`}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 소진 도트. 예산이 있으면 그것을 est 로 삼아 초과분이 앰버 도트 + `+N` 로 나온다 —
 * 예산 초과에 빨강·경고를 쓰지 않는 것이 규칙이다 (§3, principles §1).
 *
 * 예산이 없으면 `neutral` 이다. 기본 규칙으로 est 0 을 넣으면 소진 전부가 초과로
 * 렌더돼, 계획한 적 없는 소진을 초과라고 부르게 된다 (PomoDots 주석).
 */
function SpentDots({ spent, budget }: { spent: number; budget: number | null }) {
  return budget === null ? (
    <PomoDots spent={spent} est={0} variant="neutral" />
  ) : (
    <PomoDots spent={spent} est={budget} />
  )
}
