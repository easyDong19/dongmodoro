import { weekStartLabel } from '@shared/time'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'
import type { ReviewPending } from './useReview'

type Summary = Extract<ReviewPending, { needed: true }>['summary']

/**
 * 정산 요약 (ux-spec §3). **실제로 한 일을 먼저 놓는다** (R9) — 공부한 날 수와 측정
 * 시간이 남은 건수보다 앞선다. 달성률 %는 주요 지표로 띄우지 않는다.
 *
 * `계획 대비` 가 사라졌다 (ADR-030 §3). 예산이 폐기된 통화라 비교의 분모가 없고,
 * 요약은 **사실 요약**이 된다: 며칠 공부했고 얼마나 쟀는가.
 *
 * "이번 주 마감"이라는 표현은 의도된 선택이다 (§3). 일요일에 확정하면 그 주에는 아직
 * 하루가 남아 있고, 정산 후 그날 밤에 돌린 세션은 이 요약에 안 잡히지만 캘린더·항목
 * 시간에는 반영된다 (R26). "지난 주"라고 쓰면 그 어긋남이 거짓말이 된다.
 *
 * 합산은 **초 단계에서** 끝난다 — 주별 값을 분으로 접어 더하면 총합이 주별 합과 어긋난다
 * (ADR-031 §2).
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
  const { weeks, idleWeekCount, lastStudiedWeek, lastStudiedMeasuredSec } = summary
  const totalMeasuredSec = weeks.reduce((sum, w) => sum + w.measuredSec, 0)
  const merged = from !== to

  return (
    <section className="flex flex-col gap-2">
      {weeks.length === 0 ? (
        // 기록도 계획도 없는 범위에는 요약할 사실이 없다 — 주별 목록을 만들지 않는다.
        <p className="text-sm text-ink-dim">이 기간에는 기록이 없어요</p>
      ) : merged ? (
        <MergedHeadline totalMeasuredSec={totalMeasuredSec} weeks={weeks} />
      ) : (
        <SingleHeadline week={weeks[0]} isCurrentWeek={from === currentWeek} />
      )}

      {/* 공백은 판단 없이 사실로만 (R11). "쉬었어요"에 아쉬움·격려를 붙이지 않는다. */}
      {idleWeekCount > 0 ? (
        <p className="text-xs text-ink-dim">
          {`${idleWeekCount}주 쉬었어요`}
          {lastStudiedWeek !== null && lastStudiedMeasuredSec !== null ? (
            <>
              {` · 마지막으로 공부한 주(${weekStartLabel(lastStudiedWeek)}) `}
              <MeasuredTime sec={lastStudiedMeasuredSec} />
            </>
          ) : null}
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
    <p className="text-sm text-ink">
      {isCurrentWeek ? '이번 주 마감' : `지난 주(${weekStartLabel(week.week)})`}
      {` — ${week.studiedDays}일 공부, 집중 `}
      <MeasuredTime sec={week.measuredSec} className="text-sm text-ink" />
    </p>
  )
}

function MergedHeadline({
  totalMeasuredSec,
  weeks
}: {
  totalMeasuredSec: number
  weeks: Summary['weeks']
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-ink">
        {`${weekStartLabel(weeks[0].week)} – ${weekStartLabel(weeks[weeks.length - 1].week)} — 집중 `}
        <MeasuredTime sec={totalMeasuredSec} className="text-sm text-ink" />
      </p>
      <ul className="flex flex-col gap-0.5">
        {weeks.map((w) => (
          <li
            key={w.week}
            data-testid="summary-week-row"
            className="font-mono text-xs tabular-nums text-ink-dim"
          >
            {`${weekStartLabel(w.week)} · ${w.studiedDays}일 공부, `}
            <MeasuredTime sec={w.measuredSec} />
          </li>
        ))}
      </ul>
    </div>
  )
}
