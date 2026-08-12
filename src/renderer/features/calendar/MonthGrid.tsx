import type { contracts } from '@shared/ipc/contracts'
import type { z } from 'zod'
import { dayOfMonth } from '@shared/time'
import { StudyDot } from './StudyDot'

type MonthResponse = z.infer<typeof contracts.calendar.month.res>

/** 월요일 시작 (ADR-010 §1 — 시안 v7 의 일요일 시작을 뒤집는다). */
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/**
 * 셀 상태는 **세 개의 독립 채널**이다 (calendar-records R15 · A19). 셋이 한 셀에 겹쳐도
 * 서로를 덮지 않는다:
 *
 * | 상태 | 채널 | 토큰 |
 * |---|---|---|
 * | 오늘 | **숫자 색** | `--amber` + semibold — 숫자 채널의 최우선 |
 * | 선택 | **셀 배경·보더** | `--glass-strong` / `--glass-border` |
 * | 기록 | **점 요소** | `--teal` / 진한 점은 `--amber` |
 *
 * **선택을 숫자 색이나 점 색으로 표현하는 구현은 금지한다** — 그 순간 "오늘" 또는
 * "기록"이 지워진다. 이것이 A19 가 검사하는 것이다.
 */
function dayNumberClass(isToday: boolean): string {
  return isToday ? 'text-amber font-semibold' : 'text-ink-dim'
}

export function MonthGrid({
  data,
  todayKey,
  selectedDay,
  onSelectDay
}: {
  data: MonthResponse
  todayKey: string
  selectedDay: string
  onSelectDay: (dayKey: string) => void
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 px-1 pb-1">
        {WEEKDAYS.map((label) => (
          <div key={label} className="text-center text-[10px] text-ink-faint">
            {label}
          </div>
        ))}
      </div>

      <div data-testid="month-grid" className="grid grid-cols-7 gap-1 px-1">
        {/* 그 달에 속하지 않는 앞 빈 칸은 점·선택 대상이 아니다 (R15). */}
        {Array.from({ length: data.leadingBlanks }, (_, i) => (
          <div key={`blank${i}`} aria-hidden="true" />
        ))}

        {data.days.map((day) => {
          const isToday = day.dayKey === todayKey
          const isSelected = day.dayKey === selectedDay
          const dayNum = dayOfMonth(day.dayKey)

          return (
            <button
              key={day.dayKey}
              type="button"
              data-testid="day-cell"
              data-day={day.dayKey}
              data-today={isToday ? 'true' : undefined}
              data-selected={isSelected ? 'true' : undefined}
              onClick={() => onSelectDay(day.dayKey)}
              aria-pressed={isSelected}
              aria-label={`${dayNum}일${day.hasRecord ? ` · 집중 ${day.focusCount}회` : ''}`}
              className={[
                'flex min-h-[var(--target-min)] flex-col items-center justify-center gap-0.5 rounded-md py-1',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal',
                // 선택은 **배경 채널 단독**이다 — 숫자 색을 바꾸지 않는다.
                isSelected
                  ? 'border border-glass-border bg-glass-strong'
                  : 'border border-transparent'
              ].join(' ')}
            >
              <span className={`font-mono text-xs tabular-nums ${dayNumberClass(isToday)}`}>
                {dayNum}
              </span>
              {/* 점 자리는 기록 유무와 무관하게 확보한다 — 없으면 셀 높이가 들쭉날쭉해진다. */}
              <span className="flex h-[5px] items-center">
                {day.hasRecord ? <StudyDot level={day.dotLevel} /> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
