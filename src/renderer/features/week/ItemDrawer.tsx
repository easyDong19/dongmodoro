import { useState } from 'react'
import type { Api } from '@shared/ipc/api'
import { Button } from '@renderer/shared/ui/button'
import { Checkbox } from '@renderer/shared/ui/Checkbox'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'
import { useReducedMotion } from '@renderer/shared/ui/useReducedMotion'

type Drawer = Awaited<ReturnType<Api['week']['drawer']>>
type Task = Drawer['tasks'][number]

export type PullInput = {
  taskIds: string[]
  /** 새 조각은 **제목이 전부다** — 조각에도 계획 숫자를 매기지 않는다 (ADR-030 §3). */
  newTask: { title: string } | null
}

function TaskRow({
  task,
  checked,
  onToggle
}: {
  task: Task
  checked: boolean
  onToggle: () => void
}) {
  const done = task.completedAt !== null
  // 소속 주 때문에 선택이 막히는 상태는 없다 (R13). 막는 것은 이 둘뿐이다.
  const disabled = done || task.inToday

  return (
    <li
      data-testid="drawer-task-row"
      className="flex min-h-[var(--target-min)] items-center gap-2 rounded-md px-2 py-1"
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
        aria-label={task.title}
      />
      <span
        data-testid="drawer-task-title"
        className={`flex-1 truncate text-sm ${done ? 'text-ink-dim line-through' : 'text-ink'}`}
      >
        {task.title}
      </span>
      {/* 조각의 측정 시간에는 **주 조건이 없다** — 이월된 조각의 이력이 끊기지 않게
          하는 의도된 비대칭이다 (today-tasks R3-3, ux-spec §6.2). */}
      <MeasuredTime sec={task.measuredSec} />
      {done ? <span className="text-xs text-ink-dim">완료</span> : null}
      {!done && task.inToday ? <span className="text-xs text-ink-faint">오늘 목록에</span> : null}
    </li>
  )
}

/**
 * 항목 드로어 (ux-spec §6) — 항목 행 아래로 **인라인 펼침**이다.
 *
 * `role="dialog"` 를 쓰지 않는 것이 의도다. 모달이면 열려 있는 동안 타이머와 오늘 목록
 * 조작이 막히는데, 이 드로어는 그 둘을 보면서 고르라고 있는 화면이다.
 *
 * 조각이 0개인 경우가 폴백이 아니라 **주 경로 중 하나**다 (R12): 첫 조각은 고르는 게
 * 아니라 쓰는 것이므로, 목록 영역을 지우고 입력 하나만 남긴다.
 */
export function ItemDrawer({
  id,
  data,
  onPull,
  onAddTask,
  onClose,
  onComplete,
  onUncomplete,
  onDrop,
  onSetMilestone
}: {
  id: string
  data: Drawer
  onPull: (input: PullInput) => void
  /** 조각을 쌓기만 한다 — 오늘로 보내는 것은 onPull 의 몫이다 (쪼개기·가져오기 분리). */
  onAddTask: (title: string) => Promise<{ taskId: string }>
  onClose: () => void
  onComplete: () => void
  onUncomplete: () => void
  onDrop: () => void
  onSetMilestone: (milestoneId: string | null) => void
}) {
  const reduced = useReducedMotion()
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [confirmingDrop, setConfirmingDrop] = useState(false)

  const itemDone = data.completedAt !== null
  const hasTasks = data.tasks.length > 0
  const trimmed = title.trim()
  const canPull = !itemDone && (selected.length > 0 || trimmed !== '')
  /**
   * 버튼이 가져갈 개수 = 체크한 조각 + 적다 만 입력(있으면 1). 입력을 세는 이유는
   * Enter 를 잊고 버튼을 누르는 손을 위해 **가져오기가 입력을 회수**하기 때문이다 —
   * 라벨의 숫자와 실제로 가는 개수가 다르면 안 된다.
   */
  const pullCount = selected.length + (trimmed === '' ? 0 : 1)

  const toggle = (taskId: string) =>
    setSelected((prev) =>
      prev.includes(taskId) ? prev.filter((t) => t !== taskId) : [...prev, taskId]
    )

  /**
   * Enter/`추가` — 조각을 만들고 **자동으로 체크**해 둔다. 쪼개는 의도가 대부분
   * "오늘 하려고"라서다. 내일 몫이면 체크만 풀면 조각으로 남는다. 입력을 비우되
   * 포커스는 그대로라 연속으로 쌓을 수 있다.
   */
  const addPiece = async () => {
    if (itemDone || trimmed === '') return
    const { taskId } = await onAddTask(trimmed)
    setSelected((prev) => [...prev, taskId])
    setTitle('')
  }

  return (
    <div
      id={id}
      data-testid="item-drawer"
      data-motion={reduced ? 'reduced' : undefined}
      className={`ml-8 flex flex-col gap-2 rounded-md border border-glass-border-soft px-3 py-2 ${
        reduced ? '' : 'transition-[height] duration-150'
      }`}
    >
      {/*
        마일스톤 연결 (milestones R13·R14 · A11·A12).
        - `연결 없음` 이 **정상 선택지**다. 미연결에 경고·요구 문구를 붙이지 않는다 (R13).
        - 후보는 서버가 좁혀서 보낸다 — 그 할당의 주가 귀속된 달의 미보관 마일스톤뿐이다.
        - 지금 값이 후보 밖이면(이월이 승계한 타월 연결 — R15) **지우지 않고** 비활성
          옵션으로 함께 보여준다. 선택지에서 빼면 렌더 시점에 값이 사라진 것처럼 보인다.
      */}
      <label className="flex items-center gap-2 text-xs text-ink-dim">
        결과물
        <select
          data-testid="milestone-select"
          className="min-w-0 flex-1 rounded-md border border-control-border bg-glass px-2 py-1 text-xs text-ink"
          value={data.milestone?.id ?? ''}
          onChange={(e) => onSetMilestone(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">연결 없음</option>
          {data.milestoneCandidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
          {data.milestone !== null &&
          !data.milestoneCandidates.some((m) => m.id === data.milestone?.id) ? (
            <option value={data.milestone.id} disabled data-testid="milestone-foreign-option">
              {`${data.milestone.title} (다른 달)`}
            </option>
          ) : null}
        </select>
      </label>

      {hasTasks ? (
        <>
          <p className="text-xs text-ink-dim">이 할당의 조각 — 오늘 할 것을 고르세요</p>
          <ul className="flex flex-col">
            {data.tasks.map((task) => (
              <TaskRow
                key={task.taskId}
                task={task}
                checked={selected.includes(task.taskId)}
                onToggle={() => toggle(task.taskId)}
              />
            ))}
          </ul>
        </>
      ) : null}

      <label className="flex flex-col gap-1 text-xs text-ink-dim">
        {hasTasks
          ? '새 조각 추가 — Enter 로 계속 쌓아요'
          : '오늘 할 몫을 쪼개서 적어요 — 이게 첫 조각이 돼요'}
        <span className="flex items-center gap-1">
          <input
            type="text"
            maxLength={40}
            value={title}
            disabled={itemDone}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // 조합 중 Enter(한글 IME)는 글자 확정이지 제출이 아니다 — 무시한다.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void addPiece()
            }}
            className="min-w-0 flex-1 rounded-md border border-control-border bg-glass px-2 py-1 text-sm text-ink"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={itemDone}
            onClick={() => void addPiece()}
          >
            추가
          </Button>
        </span>
      </label>

      {itemDone ? (
        // 사실만 적는다 — 완료 뒤 시간이 더 쌓여도 `초과했어요` 류를 붙이지 않는다 (R28).
        <p className="text-xs text-ink-dim">완료된 할당이에요 — 해제하면 다시 가져올 수 있어요</p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          닫기
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canPull}
          onClick={() =>
            onPull({
              taskIds: selected,
              newTask: trimmed === '' ? null : { title: trimmed }
            })
          }
        >
          {pullCount > 0 ? `오늘로 가져오기 (${pullCount})` : '오늘로 가져오기'}
        </Button>
      </div>

      <div className="flex items-center gap-2 border-t border-glass-border-soft pt-2">
        {itemDone ? (
          <Button type="button" variant="ghost" size="xs" onClick={onUncomplete}>
            완료 해제
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="xs" onClick={onComplete}>
            완료로 표시
          </Button>
        )}

        {/* 확인 중에는 트리거를 감춘다 — 같은 이름의 버튼이 둘이면 무엇을 눌렀는지 흐려진다. */}
        {confirmingDrop ? (
          <>
            <span className="text-xs text-ink-dim">
              이 할당을 보내줄까요? 지금까지 한 집중과 조각은 남아요.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="hover:text-danger"
              onClick={() => {
                setConfirmingDrop(false)
                onDrop()
              }}
            >
              보내주기
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setConfirmingDrop(false)}
            >
              취소
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="hover:text-danger"
            onClick={() => setConfirmingDrop(true)}
          >
            보내주기
          </Button>
        )}
      </div>
    </div>
  )
}
