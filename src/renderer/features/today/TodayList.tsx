import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Plus, X } from 'lucide-react'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { Button } from '@renderer/shared/ui/button'
import { Checkbox } from '@renderer/shared/ui/Checkbox'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'
import { useToday } from './useToday'

type TodayRow = Awaited<ReturnType<typeof api.today.list>>['rows'][number]

function TodayRowItem({
  row,
  canPlay,
  canRemove,
  onToggle,
  onRemove,
  onPlay
}: {
  row: TodayRow
  canPlay: boolean
  canRemove: boolean
  onToggle: (taskId: string) => void
  onRemove: (taskId: string) => void
  onPlay: (taskId: string) => void
}) {
  const isDone = row.completedAt !== null
  return (
    // **2단이다** — 한 줄에 6개를 넣으면 폭이 모자란 쪽은 언제나 제목이었다. 카드 폭은
    // 360px 고정이고(App.tsx) 그 안에서 `sourceTitle` 은 truncate 도 shrink 도 없었으므로,
    // 부모 항목 제목이 길면 정작 읽어야 할 할 일 제목이 잘렸다. 주간 카드 행(WeekItemRow)과
    // 정산 패널 행(PendingSection)이 이미 쓰던 문법으로 맞춘다: 제목 줄 + 들여쓴 메타 줄.
    <li className="flex flex-col gap-0.5 rounded-md px-2 py-2">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={isDone}
          onCheckedChange={() => onToggle(row.taskId)}
          aria-label={`${row.title} 완료 토글`}
        />
        <span
          data-testid="today-row-title"
          // 완료 표현을 행 전체 opacity 로 하지 않는다 — 그러면 아직 눌러야 하는
          // 체크박스와 읽어야 하는 측정 시간까지 대비 하한 아래로 떨어진다.
          // 취소선 + `--ink-dim` 은 주간 카드 행과 같은 표현이다.
          className={`flex-1 truncate text-sm ${isDone ? 'text-ink-dim line-through' : 'text-ink'}`}
        >
          {row.title}
        </span>
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
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="치우기"
            onClick={() => onRemove(row.taskId)}
          >
            <X />
          </Button>
        ) : null}
      </div>

      {/* 메타 줄. 체크박스 폭(24px) + gap(8px) 만큼 들여써 제목 아래에 정렬한다. */}
      <div className="flex items-center gap-2 pl-8">
        {/* 출처가 없는 항목(직접 추가)은 자리를 그리지 않는다 — `기타` 는 데이터의 시스템
            항목 이름이지 사용자가 고른 분류가 아니라, 라벨로 쓰면 없는 분류를 있는 것처럼
            읽힌다. 있는 경우에도 제목보다 먼저 줄어들도록 truncate 를 건다. */}
        {row.sourceTitle !== null ? (
          <span className="min-w-0 truncate text-xs text-ink-dim">{row.sourceTitle}</span>
        ) : null}
        {/* 항목당 누적 측정 시간 (today-tasks R3·R3-3). 조각 단위라 **주 조건이 없다** —
            이월된 조각이 지난 주에 쌓은 시간도 여기 그대로 남는다. */}
        <MeasuredTime sec={row.measuredSec} className="shrink-0 text-xs text-ink-dim" />
      </div>
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
  // 세션이 도는 동안(running·paused) 치우기를 누르면 타이머는 계속 도는데 행만 사라진다 —
  // 타이머가 꺼진(idle) 뒤에만 치우기를 노출한다.
  const canRemove = timerQuery.data?.phase === 'idle'
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
            canRemove={canRemove}
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
              canRemove={canRemove}
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
