import { useState } from 'react'
import type { contracts } from '@shared/ipc/contracts'
import type { z } from 'zod'
import { Button } from '@renderer/shared/ui/button'
import { Checkbox } from '@renderer/shared/ui/Checkbox'

type MonthRes = z.infer<typeof contracts.milestones.forMonth.res>
type Candidate = MonthRes['carryCandidates'][number]

/**
 * 직전 달 미완료 제목 가져오기 (milestones R22 · A23).
 *
 * **제목만** 복사한다 — 계약이 제목 배열만 받으므로 원본을 건드릴 방법이 애초에 없다.
 * 직전 달 배지의 `N`·`M` 이 변하지 않는 것은 그 부재에서 온다.
 *
 * 후보가 0건이면 호출부가 이 컴포넌트를 렌더하지 않는다 (R22 마지막 줄).
 */
export function CarryTitlesAction({
  candidates,
  onCarry
}: {
  candidates: Candidate[]
  onCarry: (titles: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="carry-titles-open"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        지난달에 남은 결과물 가져오기
      </Button>
    )
  }

  const titles = candidates.filter((c) => picked.has(c.id)).map((c) => c.title)

  return (
    <div data-testid="carry-titles-picker" className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {candidates.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2 text-xs text-ink">
              <Checkbox
                checked={picked.has(c.id)}
                onCheckedChange={() => toggle(c.id)}
                aria-label={c.title}
                data-testid="carry-candidate"
              />
              <span className="truncate">{c.title}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={titles.length === 0}
          data-testid="carry-titles-confirm"
          onClick={() => {
            onCarry(titles)
            setOpen(false)
            setPicked(new Set())
          }}
        >
          가져오기
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>
    </div>
  )
}
