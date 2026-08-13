import { ArchiveX } from 'lucide-react'
import { weekStartLabel } from '@shared/time'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'
import { Segmented } from '@renderer/shared/ui/Segmented'
import type { Choice, PendingRow } from './useDecisions'

/**
 * 2택 (ux-spec §5.2). `보내주기` 의 `--danger` 는 **아이콘에만** 쓴다 — 라벨 글자는
 * `--ink` 다. `--danger` 는 최악 배경에서 3.85:1 이라 텍스트 AA 를 만족하지 못하고
 * (design-system ADR-003 §5), 의미 전달은 아이콘과 `보내주기` 라는 문구가 이미 맡는다.
 *
 * `줄여서` 가 없다 (ADR-031 §1). 줄일 대상이던 est 가 사라졌고 시간으로 대체하지
 * 않는다 — 이월 항목의 측정 시간은 정의상 0 이다.
 */
const OPTIONS = [
  { value: 'carry' as const, label: '다음 주로', selectedText: 'text-teal' },
  {
    value: 'drop' as const,
    label: '보내주기',
    selectedText: 'text-ink',
    icon: <ArchiveX className="size-3 text-danger" aria-hidden />
  }
]

/**
 * 정렬 (R34): **이월 N주째가 큰 항목이 위로**, 같으면 오래된 주 먼저, 그 다음 생성순.
 * 서버는 주·생성순으로만 주므로(계약) 이 재정렬은 화면의 일이다 — 표시 정렬이다.
 *
 * `sort` 가 안정 정렬이라 세 번째 기준(생성순)은 서버 순서가 그대로 남는다.
 */
function sortForDisplay(rows: readonly PendingRow[]): PendingRow[] {
  return [...rows].sort((a, b) => b.carryWeeks - a.carryWeeks || a.week.localeCompare(b.week))
}

export function PendingSection({
  rows,
  merged,
  choiceOf,
  onPick
}: {
  rows: readonly PendingRow[]
  /** 범위가 2주 이상인가 — 출처 주 라벨을 그 때만 붙인다 (§5.1). */
  merged: boolean
  choiceOf: (row: PendingRow) => Choice
  onPick: (row: PendingRow, choice: Choice) => void
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-dim">넘어갈 항목이 없어요 — 이번 주를 마감할까요</p>
  }

  const longCarried = rows.filter((row) => row.carryWeeks >= 3).length

  return (
    <section className="flex flex-col gap-2">
      {/* 초안의 "3주째부터 기본 선택 비우기"를 대체하는 자리다 (§5.2 가정 블록) — 기본
          선택을 비우면 클릭 1회 확정이 깨지므로, 그 니즈를 정렬과 이 한 줄로 흡수한다.
          판단·권유 문구를 붙이지 않는다: "정리하세요" 류는 원칙 6 위반이다. */}
      {longCarried > 0 ? (
        <p className="text-xs text-ink-dim">{`3주 이상 넘어온 항목 ${longCarried}건`}</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {sortForDisplay(rows).map((row) => (
          <Row
            key={row.id}
            row={row}
            merged={merged}
            choice={choiceOf(row)}
            onPick={(choice) => onPick(row, choice)}
          />
        ))}
      </ul>
    </section>
  )
}

function Row({
  row,
  merged,
  choice,
  onPick
}: {
  row: PendingRow
  merged: boolean
  choice: Choice
  onPick: (choice: Choice) => void
}) {
  return (
    <li data-testid="pending-row" className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        {/* 보내주기를 고르면 행 전체를 흐린다 (§5.2) — 선택의 결과를 미리 보여준다. */}
        <span
          className={`flex-1 truncate text-lg ${choice === 'drop' ? 'text-ink-faint' : 'text-ink'}`}
        >
          {row.title}
        </span>
        {/* 출처 주는 읽어야 하는 정보라 `--ink-faint` 를 쓰지 않는다 (ADR-003 §3). */}
        {merged ? (
          <span className="font-mono text-2xs tabular-nums text-ink-dim">
            {weekStartLabel(row.week)}
          </span>
        ) : null}
        {/* 이월 배지는 사실 표시 전용이다. 색으로 강조하지 않고 훈계 문구도 붙이지 않는다. */}
        {row.carryWeeks >= 2 ? (
          <span className="rounded-sm text-2xs text-ink-dim">{`${row.carryWeeks}주째`}</span>
        ) : null}
      </div>

      {/* 남은 몫이 있던 자리다. 남은 몫은 est 와 함께 죽었고, 그 자리에 **이미 한 일**이
          온다 — 이월할지 보내줄지를 고를 때 읽을 사실은 그것뿐이다 (ADR-031 §1). 세션이
          없던 항목도 `0분` 으로 자리를 지킨다 (week-plan ux-spec §0.5). */}
      <div className="flex items-center gap-1">
        {/* 라벨을 숫자 **앞**에 둔다. `0분 집중했어요` 처럼 서술어를 붙이면 세션이 없던
            항목에서 문장이 어색해지고, 숫자 뒤 조사를 피하는 규칙(§6)과도 같은 결이다. */}
        <span className="text-xs text-ink-dim">집중</span>
        <MeasuredTime sec={row.measuredSec} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label={`${row.title} 처리`} options={OPTIONS} value={choice} onChange={onPick} />
      </div>
    </li>
  )
}
