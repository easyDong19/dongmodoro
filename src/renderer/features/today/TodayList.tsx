import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Plus, X } from 'lucide-react'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { Button } from '@renderer/shared/ui/button'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'
import { useToday } from './useToday'

type TodayRow = Awaited<ReturnType<typeof api.today.list>>['rows'][number]

function TodayRowItem({
  row,
  canPlay,
  onToggle,
  onRemove,
  onPlay
}: {
  row: TodayRow
  canPlay: boolean
  onToggle: (taskId: string) => void
  onRemove: (taskId: string) => void
  onPlay: (taskId: string) => void
}) {
  const isDone = row.completedAt !== null
  return (
    <li
      className={`flex items-center gap-3 rounded-md px-2 py-2 ${isDone ? 'opacity-[0.55]' : ''}`}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggle(row.taskId)}
        aria-label={`${row.title} 완료 토글`}
        className="size-4"
      />
      <span className="flex-1 truncate text-sm text-ink" data-testid="today-row-title">
        {row.title}
      </span>
      <span className="text-xs text-ink-dim">{row.sourceTitle ?? '기타'}</span>
      {/* 항목당 누적 측정 시간 (today-tasks R3·R3-3). 조각 단위라 **주 조건이 없다** —
          이월된 조각이 지난 주에 쌓은 시간도 여기 그대로 남는다. */}
      <MeasuredTime sec={row.measuredSec} />
      {canPlay && !isDone ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="타이머 시작"
          onClick={() => onPlay(row.taskId)}
        >
          <Play />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="치우기"
        onClick={() => onRemove(row.taskId)}
      >
        <X />
      </Button>
    </li>
  )
}

/** 오늘 목록 카드 — App 의 오른쪽 카드 (Task 9). */
export function TodayList() {
  const { query, addDirect, remove, toggle } = useToday()
  const timerQuery = useQuery({
    queryKey: keys.timer(),
    queryFn: () => api.timer.getState(),
    staleTime: Infinity
  })
  const [draft, setDraft] = useState('')

  const canPlay = timerQuery.data?.mode === 'focus' && timerQuery.data?.phase === 'idle'
  // query.data 가 아직 undefined 인 "로딩 중"과 "조회 결과 0건"은 다른 상태다 — 합치면
  // 첫 마운트에서 실제로는 행이 있는데도 빈 상태 카피가 잠깐 깜빡인다.
  const isLoading = query.data === undefined
  const rows = query.data?.rows ?? []
  const incomplete = rows.filter((r) => r.completedAt === null)
  const completed = rows.filter((r) => r.completedAt !== null)

  const handleToggle = (taskId: string) => toggle.mutate(taskId)
  const handleRemove = (taskId: string) => remove.mutate(taskId)
  const handlePlay = (taskId: string) => void api.timer.startWithTask(taskId)

  const submitDraft = () => {
    const title = draft.trim()
    if (title === '') return
    addDirect.mutate(title, { onSuccess: () => setDraft('') })
  }

  const directInput = (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submitDraft()
      }}
    >
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="할 일을 바로 추가"
        className="flex-1 rounded-md border border-control-border bg-glass px-3 py-1.5 text-sm text-ink"
      />
      <Button type="submit" variant="secondary" size="icon-sm" aria-label="추가">
        <Plus />
      </Button>
    </form>
  )

  if (isLoading) {
    // 아직 조회 중 — 빈 상태 카피도, 행도 그리지 않는다 (있을지 없을지 모르므로).
    return <div className="flex flex-col gap-4 rounded-lg p-4" aria-busy="true" />
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-lg p-4">
        <p className="text-sm text-ink-dim">오늘 몫이 비어 있어요</p>
        {directInput}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg p-4">
      <ul className="flex flex-col gap-1" data-testid="today-incomplete">
        {incomplete.map((row) => (
          <TodayRowItem
            key={row.taskId}
            row={row}
            canPlay={canPlay}
            onToggle={handleToggle}
            onRemove={handleRemove}
            onPlay={handlePlay}
          />
        ))}
      </ul>
      {completed.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="today-completed">
          {completed.map((row) => (
            <TodayRowItem
              key={row.taskId}
              row={row}
              canPlay={canPlay}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onPlay={handlePlay}
            />
          ))}
        </ul>
      ) : null}
      {directInput}
    </div>
  )
}
