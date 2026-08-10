import type { ReactNode, Ref } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Api } from '@shared/ipc/api'
import { weeksSince } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import { PomoDots } from '@renderer/shared/ui/PomoDots'

type Item = Awaited<ReturnType<Api['week']['summary']>>['items'][number]

/** 배열 인덱스 0 = 월요일 (ADR-010 §1). 순수 상수이므로 "오늘이 무슨 요일인가"와 무관하다. */
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const

/**
 * 요일 핍 7개. **2상태(배정됨·미배정)** 이며 색과 지름 **두 채널**로 구분한다 —
 * 색만 다르면 색각 이상에서 구분이 사라진다 (principles §3.5). 불투명도로 상태를
 * 표현하지도 않는다.
 *
 * 4상태(지난/오늘/앞으로)는 이번 마일스톤에서 뺐다 — renderer 가 "오늘이 무슨 요일인가"를
 * 알 방법이 없다. `aria-label` 의 요일 이름은 인덱스→이름 매핑이라 그 정보와 무관하고,
 * 없으면 스크린 리더에 구분 없는 점 7개로 읽힌다.
 */
function DayPips({ days }: { days: number[] }) {
  return (
    <span className="flex items-center gap-1">
      {DAY_NAMES.map((name, i) => {
        const on = days.includes(i)
        return (
          <span
            key={name}
            data-testid="day-pip"
            aria-label={name}
            aria-pressed={on}
            role="img"
            className={on ? 'size-1.5 rounded-full bg-teal' : 'size-1 rounded-full bg-ink-faint'}
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
        <PomoDots spent={row.spentPomos} est={row.estPomos} />
        {row.childTotal > 0 ? (
          <span className="text-xs text-ink-dim">{`· 조각 ${row.childDone}/${row.childTotal}`}</span>
        ) : null}
        <DayPips days={row.days} />
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
