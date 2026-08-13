import { useState } from 'react'
import { Archive, ArchiveRestore, Check, Trash2 } from 'lucide-react'
import type { contracts } from '@shared/ipc/contracts'
import type { z } from 'zod'
import { Button } from '@renderer/shared/ui/button'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'

type MonthRes = z.infer<typeof contracts.milestones.forMonth.res>
type Item = MonthRes['items'][number]

export type RowActions = {
  rename: (input: { id: string; title: string }) => void
  setCompleted: (input: { id: string; completed: boolean }) => void
  setArchived: (input: { id: string; archived: boolean }) => void
  remove: (id: string) => void
}

/**
 * 마일스톤 한 행 (milestones R5·R7·R8·R9·R11·R17).
 *
 * `M1`·`M2` 라벨은 **표시 순서에서 파생하는 렌더 전용 값**이다 (R5 · A5) — 저장하지 않고
 * 어떤 참조 키로도 쓰지 않는다. 목록이 바뀌면 같은 마일스톤의 번호가 바뀔 수 있다.
 *
 * 미완료에 **부정 표기를 붙이지 않는다** (R23 · A24). 완료는 체크 아이콘의 **있음**으로만
 * 드러나고, 미완료는 그 **없음**으로만 드러난다.
 */
export function MilestoneRow({
  item,
  index,
  editable,
  rollupWeek,
  actions
}: {
  item: Item
  index: number
  editable: boolean
  rollupWeek: string | null
  actions: RowActions
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const done = item.completedAt !== null
  const archived = item.archivedAt !== null

  function commitRename() {
    const next = draft.trim()
    if (next !== '' && next !== item.title) actions.rename({ id: item.id, title: next })
    setEditing(false)
  }

  return (
    <li data-testid="milestone-row" data-milestone-id={item.id} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
          {`M${index + 1}`}
        </span>

        {editing ? (
          <input
            autoFocus
            aria-label="결과물 제목"
            className="min-w-0 flex-1 rounded-md bg-glass-strong px-2 py-1 text-xs text-ink"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraft(item.title)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate text-xs ${done ? 'text-ink-dim line-through' : 'text-ink'}`}
            onDoubleClick={editable ? () => setEditing(true) : undefined}
          >
            {item.title}
          </span>
        )}

        {/* 완료 토글·삭제는 편집 가능한 달에서만 (R20 순서 5 — 지난달은 보관·해제만). */}
        {editable ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={done ? '완료 해제' : '완료'}
              aria-pressed={done}
              data-testid="milestone-complete"
              className={done ? 'text-teal' : 'text-ink-faint'}
              onClick={() => actions.setCompleted({ id: item.id, completed: !done })}
            >
              <Check aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="삭제"
              data-testid="milestone-delete"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        ) : null}

        {/* 보관·해제는 **모든 모드에서** 열린다 (R11) — 읽기 전용에서 유일하게 허용되는 쓰기다. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={archived ? '보관 해제' : '보관'}
          data-testid={archived ? 'milestone-unarchive' : 'milestone-archive'}
          onClick={() => actions.setArchived({ id: item.id, archived: !archived })}
        >
          {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
        </Button>
      </div>

      {/*
        롤업은 **언제나 범위 라벨과 함께**다 (R17 · A16). 라벨 없는 숫자를 단독으로 두면
        주 경계 직후의 `0분` 이 월 진행으로 읽힌다.

        **분수가 아니다** — 분모였던 est 합은 폐기된 통화와 함께 죽었고(ADR-030 §3),
        남는 것은 그 주에 귀속된 측정 시간 하나다. 롤업이 없는 것(`null`)과 0 은 다른
        사실이라, 전자는 이 줄 자체를 그리지 않고 후자는 `0분` 을 적는다 (R17·R18).
      */}
      {item.rollup !== null && rollupWeek !== null ? (
        <p data-testid="milestone-rollup" className="pl-6 text-[10px] text-ink-dim">
          {'이번 주 '}
          <MeasuredTime sec={item.rollup.measuredSec} className="text-[10px] text-ink-dim" />
        </p>
      ) : null}

      {confirmingDelete ? (
        <div data-testid="milestone-delete-confirm" className="pl-6">
          {/*
            확인 문구는 **잃는 것을 사실로** 말한다 (R8 · A8) — 제목이 사라지고 연결이
            끊기지만 소진 기록은 남는다. 되돌리는 UI 는 없다.
          */}
          <p className="text-[10px] text-ink-dim">
            지우면 되돌릴 수 없어요. 연결된 할당은 기타로 남고 집중 기록은 그대로예요.
          </p>
          <div className="flex gap-1 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-danger"
              data-testid="milestone-delete-confirm-yes"
              onClick={() => {
                setConfirmingDelete(false)
                actions.remove(item.id)
              }}
            >
              지우기
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setConfirmingDelete(false)}
            >
              그대로 두기
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
