import { useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'
import type { ReviewPending } from './useReview'

type Completed = Extract<ReviewPending, { needed: true }>['completed']

/**
 * 끝낸 것들 (ux-spec §4). 목록 기준은 **항목의 주가 정산 범위 안**이고 `completed_at` 이
 * 있는 항목이며, 완료 시각이 범위 밖이어도 포함된다 — 그 항목이 어느 주의 계획이었는지가
 * 기준이다. 그 판정은 main 이 하고 여기는 그린다.
 *
 * **여기서는 아무 조작도 하지 않는다.** 완료의 사실은 이미 사용자 클릭이 만들었고 (Q14),
 * 정산은 그것을 되돌리는 자리가 아니다. 칭찬 문구도 붙이지 않는다 (원칙 6).
 */
export function CompletedSection({ rows }: { rows: Completed }) {
  const [open, setOpen] = useState(true)

  if (rows.length === 0) return null

  return (
    <section className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 self-start text-xs text-ink-dim"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {`끝낸 것들 ${rows.length}건`}
      </button>

      {open ? (
        <ul className="flex flex-col gap-1 pl-4">
          {rows.map((row) => (
            <li key={row.id} data-testid="completed-row" className="flex items-center gap-2">
              <Check className="size-3 shrink-0 text-teal" aria-hidden />
              <span className="flex-1 truncate text-sm text-ink">{row.title}</span>
              {/* 끝낸 항목에도 **한 일은 시간으로** 적는다 (ADR-030 §3). */}
              <MeasuredTime sec={row.measuredSec} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
