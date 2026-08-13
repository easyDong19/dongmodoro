import type { ReactNode, Ref } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Api } from '@shared/ipc/api'
import { weeksSince } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'

type Item = Awaited<ReturnType<Api['week']['summary']>>['items'][number]

/** 배열 인덱스 0 = 월요일 (ADR-010 §1). 순수 상수이므로 "오늘이 무슨 요일인가"와 무관하다. */
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const

type PipState = 'off' | 'on' | 'past' | 'today' | 'upcoming'

/**
 * 핍 상태의 시각 표현 (ux-spec §3.2 표). **색 축과 모양 축이 둘 다 갈린다** — 색만
 * 다르면 색각 이상에서 구분이 사라지고(principles §3.5), 모양만 다르면 5px 지름에서
 * 안 읽힌다.
 *
 * 불투명도를 쓰지 않는 것도 규칙이다 — 고대비 모드에서 사라진다. "지난 요일"은 놓쳤다는
 * 표시가 아니므로 `--danger` 도, 실패 문구도 붙이지 않는다 (§3.2, principles §1·§2).
 *
 * `오늘` 의 글로우는 **바깥 링으로 대신한다.** 점 하나에 걸 글로우 토큰이 tokens.md 에
 * 없고, 없는 값을 소비처에서 지어내는 것은 §10 이 ADR 을 먼저 요구하는 일이다.
 */
const PIP_STYLE: Record<PipState, string> = {
  off: 'size-1 rounded-full bg-ink-faint',
  on: 'size-1.5 rounded-full bg-teal',
  past: 'size-1.5 rounded-full border border-teal',
  today: 'size-2 rounded-full bg-amber ring-1 ring-amber ring-offset-1 ring-offset-bg-deep',
  upcoming: 'size-1.5 rounded-full bg-teal'
}

const PIP_LABEL: Record<PipState, string> = {
  off: '',
  on: ' · 배정',
  past: ' · 배정, 지난 요일',
  today: ' · 배정, 오늘',
  upcoming: ' · 배정, 다가올 요일'
}

function pipState(assigned: boolean, index: number, todayIndex: number | null): PipState {
  if (!assigned) return 'off'
  if (todayIndex === null) return 'on'
  if (index < todayIndex) return 'past'
  return index === todayIndex ? 'today' : 'upcoming'
}

/**
 * 요일 핍 7개, 월요일 시작 (ADR-010 §1).
 *
 * `todayIndex` 가 `null` 이면 2상태로 남는다 — 보고 있는 주가 오늘이 속한 주가 아니면
 * "지난/오늘/다가올"이 성립하지 않기 때문이다. 상태를 `aria-label` 에도 실어, 스크린
 * 리더가 색과 모양에 기대지 않게 한다.
 */
function DayPips({ days, todayIndex }: { days: number[]; todayIndex: number | null }) {
  return (
    <span className="flex items-center gap-1">
      {DAY_NAMES.map((name, i) => {
        const state = pipState(days.includes(i), i, todayIndex)
        return (
          <span
            key={name}
            data-testid="day-pip"
            data-state={state}
            aria-label={`${name}${PIP_LABEL[state]}`}
            aria-pressed={state !== 'off'}
            role="img"
            className={PIP_STYLE[state]}
          />
        )
      })}
    </span>
  )
}

/**
 * 일반 뷰의 항목 행 (ux-spec §3). 도메인 판정은 전부 main 이 실어 보낸 값으로 한다 —
 * 이 컴포넌트는 계산하지 않고 그린다.
 */
export function WeekItemRow({
  row,
  week,
  todayIndex,
  onPullNext,
  onComplete,
  onUncomplete,
  onToggleDrawer,
  drawerOpen = false,
  drawerId,
  caretRef,
  children
}: {
  row: Item
  week: string
  /** 이 주에서 오늘이 몇 번째 날인가 (0 = 월). 보고 있는 주가 이번 주가 아니면 null. */
  todayIndex: number | null
  onPullNext: (id: string) => void
  onComplete: (id: string) => void
  onUncomplete: (id: string) => void
  onToggleDrawer?: (id: string) => void
  drawerOpen?: boolean
  drawerId?: string
  caretRef?: Ref<HTMLButtonElement>
  /** 열린 드로어. 행 아래 인라인으로 들어간다 — 모달이 아니다 (§6). */
  children?: ReactNode
}) {
  const done = row.completedAt !== null
  const carriedWeeks = weeksSince(row.originWeek, week)
  // 완료 제안은 자식이 있고 전부 끝났고 아직 미완료일 때만 (§4). 완료된 뒤에는 소진이
  // 더 붙어도 다시 뜨지 않는다 — 완료는 사용자가 만든 사실이지 파생값이 아니다 (R28·A37).
  const suggestComplete = !done && row.childTotal > 0 && row.childDone === row.childTotal

  return (
    <li data-testid="week-item-row" className="flex flex-col gap-1 rounded-md px-2 py-2">
      <div className="flex items-center gap-2">
        <Button
          ref={caretRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={drawerOpen ? '드로어 닫기' : '드로어 열기'}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={() => onToggleDrawer?.(row.id)}
        >
          {drawerOpen ? <ChevronDown /> : <ChevronRight />}
        </Button>

        <span
          className={`flex-1 truncate text-sm ${done ? 'text-ink-dim line-through' : 'text-ink'}`}
        >
          {row.title}
        </span>

        {carriedWeeks >= 2 ? (
          <span className="rounded-sm text-xs text-amber">{`${carriedWeeks}주째`}</span>
        ) : null}

        {done ? (
          <span className="text-xs text-ink-faint">완료됨</span>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => onPullNext(row.id)}>
            + 오늘로
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 pl-8">
        <MeasuredTime sec={row.measuredSec} />
        {row.childTotal > 0 ? (
          <span className="text-xs text-ink-dim">{`· 조각 ${row.childDone}/${row.childTotal}`}</span>
        ) : null}
        <DayPips days={row.days} todayIndex={todayIndex} />
      </div>

      {suggestComplete ? (
        // 거절 버튼이 없는 것이 의도다 — 무시하면 active 로 남는다 (§4).
        <div className="flex items-center gap-2 pl-8">
          <span className="text-xs text-ink-dim">할 일을 다 끝냈어요 — 이 할당도 완료할까요?</span>
          <Button type="button" variant="secondary" size="xs" onClick={() => onComplete(row.id)}>
            완료로 표시
          </Button>
        </div>
      ) : null}

      {done ? (
        <div className="flex pl-8">
          <Button type="button" variant="ghost" size="xs" onClick={() => onUncomplete(row.id)}>
            완료 해제
          </Button>
        </div>
      ) : null}

      {children}
    </li>
  )
}
