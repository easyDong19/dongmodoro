import type { contracts } from '@shared/ipc/contracts'
import type { z } from 'zod'
import { dayLabel } from '@shared/time'
import { api } from '@renderer/shared/api'
import { Button } from '@renderer/shared/ui/button'
import { useTimer } from '@renderer/features/timer/useTimer'

type DayResponse = z.infer<typeof contracts.calendar.day.res>

/** 원천 표시 (R18) — 세 조합이 서로 다른 사실이라 하나로 뭉치지 않는다. */
function sourceLabel(t: DayResponse['tasks'][number]): string {
  if (t.pulled && t.hadSession) return '가져와서 집중'
  if (t.hadSession) return '세션으로 생김'
  return '가져옴'
}

/**
 * 날짜 기록 패널 (calendar-records R17~R23).
 *
 * **읽기 전용이다** (R23) — 완료 토글·삭제·재-pull 을 여기서 제공하지 않는다. 유일한
 * 예외인 `자유 집중 시작`(R21)은 기록을 편집하지 않고 세션을 시작할 뿐이라 충돌하지 않는다.
 *
 * 날짜 라벨에 **연도를 포함한다** (R17 · A16). 표시 월과 선택 날짜의 달이 다를 수 있으므로
 * (R8), 연도가 없으면 어느 해 기록인지 오독된다.
 */
export function DayPanel({ data, todayKey }: { data: DayResponse; todayKey: string }) {
  const { snapshot } = useTimer()
  const isToday = data.dayKey === todayKey
  const focusIdle = snapshot?.mode === 'focus' && snapshot.phase === 'idle'

  const completed = data.tasks.filter((t) => t.completedAt !== null).length

  return (
    <section className="flex min-h-0 flex-col gap-2 px-1 pt-3" aria-label="날짜 기록">
      <h3 className="text-xs text-ink-dim">{dayLabel(data.dayKey)}</h3>

      {data.hasRecord ? (
        <>
          <p className="font-mono text-xs tabular-nums text-ink">
            {/* 조각이 없으면 집중 횟수만 (R20). 없는 분수를 만들지 않는다. */}
            {data.tasks.length === 0
              ? `집중 ${data.focusCount}회`
              : `집중 ${data.focusCount}회 · 할 일 ${completed}/${data.tasks.length} 완료`}
          </p>

          <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {data.tasks.map((t) => (
              <li
                key={t.taskId}
                data-testid="day-task"
                className="flex items-baseline justify-between gap-2"
              >
                <span
                  className={`truncate text-xs ${t.completedAt === null ? 'text-ink' : 'text-ink-dim line-through'}`}
                >
                  {t.title}
                </span>
                <span className="shrink-0 text-[10px] text-ink-faint">{sourceLabel(t)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-dim">이날은 기록이 없어요</p>
          {/*
            CTA 는 **오늘 + focus idle** 일 때만이다 (R21 · A14-1). 지나간 날짜의 기록을
            만들 방법은 없고, 없는 행동을 권하는 버튼은 거짓말이다. 동작은 타이머 카드의
            `시작` 과 완전히 동일하며 상태 기계는 timer 가 소유한다 — 여기는 진입점뿐이다.
          */}
          {isToday && focusIdle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="free-focus-cta"
              className="self-start"
              onClick={() => void api.timer.start()}
            >
              자유 집중 시작
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}
