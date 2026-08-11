import { useRef, useState } from 'react'
import type { Api } from '@shared/ipc/api'
import { weekRangeLabel } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'

type Draft = Awaited<ReturnType<Api['week']['planDraft']>>
type DraftItem = Draft['items'][number]

export type ConfirmInput = { budget: number | null; items: DraftItem[] }

/** 배열 인덱스 0 = 월요일 (ADR-010 §1). */
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 예상 뽀모 하한은 1 이다 (R6) — 계약도 같은 하한을 건다. */
const MIN_EST = 1

/**
 * 초안 행. `origin` 이 `×` 의 의미를 가른다 (§5.3.1):
 * - `new` — 이 세션에서 추가한 행. 아직 아무 데이터도 만들지 않았으므로 그냥 사라진다
 * - `existing` — 이미 저장된 항목. 확정 시 폐기되므로 **행을 지우지 않고** 예정 표시로 바꾼다
 */
type Row = DraftItem & { key: string; origin: 'new' | 'existing'; pendingDrop: boolean }

const TARGET_MIN = 'min-h-[var(--target-min)] min-w-[var(--target-min)]'

function DayChips({
  selected,
  onToggle
}: {
  selected: number[]
  onToggle: (index: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {DAY_NAMES.map((name, i) => {
        const on = selected.includes(i)
        return (
          <button
            key={name}
            type="button"
            data-testid="day-chip"
            aria-pressed={on}
            // onMouseDown 을 막아 제목 입력이 포커스를 잃지 않게 한다 (§5.4).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onToggle(i)}
            className={`${TARGET_MIN} rounded-md px-2 text-xs ${
              on ? 'bg-glass-strong text-teal' : 'text-ink-dim'
            }`}
          >
            {name}
          </button>
        )
      })}
    </div>
  )
}

/** 편집 대상 주. 세 번째 값은 없다 — 지난 주·2주 뒤는 v1 비범위다 (§5.0). */
export type PlanTarget = 'current' | 'next'

const TARGET_LABEL: Record<PlanTarget, string> = { current: '이번 주', next: '다음 주' }

/**
 * 편집 대상 주 세그먼트 (§5.0). **선택 상태에 보더가 필수다** — `--glass-strong` 배경은
 * 고대비 모드에서 사라지므로 배경만으로 선택을 표현하면 무엇이 선택됐는지 알 수 없다
 * (design-system ADR-006 §3). `aria-pressed` 는 스크린리더용이고 시각 신호를 대체하지 않는다.
 */
function TargetToggle({
  target,
  onPick
}: {
  target: PlanTarget
  onPick: (next: PlanTarget) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {(['current', 'next'] as const).map((value) => {
        const on = value === target
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(value)}
            className={`${TARGET_MIN} rounded-md border px-2 text-xs ${
              on
                ? 'border-control-border bg-glass-strong text-teal'
                : 'border-transparent text-ink-dim'
            }`}
          >
            {TARGET_LABEL[value]}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 플래너 모드 (ux-spec §5). 4단계를 한 화면에 위에서 아래로 쌓는다 — 마법사도, 단계
 * 전환도 없다. 어느 단계든 언제나 되돌아가 고칠 수 있는 것이 요점이다.
 *
 * **헤더·확정 버튼 라벨은 `target` 하나에서만 파생한다** (§5.0, PRD R5). 오늘이 무슨
 * 요일인지에서 직접 파생하면, 일요일에 `이번 주 할당 잡기` 를 눌렀는데 다음 주가 열리는
 * 모순이 생긴다.
 *
 * **과적이 확정을 막지 않는다** (R22). 예산은 추정치이고, 넘긴 것은 실패가 아니라 사실이다.
 */
export function Planner({
  draft,
  week,
  target,
  onChangeWeek,
  onConfirm,
  onCancel
}: {
  draft: Draft
  /** 편집 중인 주 키. 범위 라벨을 그린다. */
  week: string
  target: PlanTarget
  onChangeWeek: (next: PlanTarget) => void
  onConfirm: (input: ConfirmInput) => void
  onCancel: () => void
}) {
  const titleRef = useRef<HTMLInputElement>(null)
  const [budget, setBudget] = useState<number | null>(draft.budget ?? draft.prefill)
  const [rows, setRows] = useState<Row[]>(() =>
    draft.items.map((item, i) => ({
      ...item,
      key: `e${i}`,
      origin: 'existing',
      pendingDrop: false
    }))
  )
  const [title, setTitle] = useState('')
  const [est, setEst] = useState(MIN_EST)
  const [days, setDays] = useState<number[]>([])
  const [confirmingDrop, setConfirmingDrop] = useState<string | null>(null)
  /**
   * 전환 확인 대기 중인 세그먼트. **고치던 내용을 조용히 버리지 않기 위한 장치**이며
   * 파괴적 행위가 아니므로 `--danger` 도 경고 톤도 쓰지 않는다 (§5.0).
   */
  const [confirmingSwitch, setConfirmingSwitch] = useState<PlanTarget | null>(null)
  /** 초안을 건드렸는가. 행 추가·제거·예산·입력 중인 제목이 전부 여기 모인다. */
  const [dirty, setDirty] = useState(false)

  const pickTarget = (next: PlanTarget) => {
    if (next === target) return
    if (dirty) {
      setConfirmingSwitch(next)
      return
    }
    onChangeWeek(next)
  }

  const kept = rows.filter((r) => !r.pendingDrop)
  const planned = kept.reduce((sum, r) => sum + r.estPomos, 0)
  const over = budget !== null && budget > 0 ? Math.max(0, planned - budget) : 0

  const addItem = () => {
    const trimmed = title.trim()
    if (trimmed === '') return
    setRows((prev) => [
      ...prev,
      {
        id: null,
        title: trimmed,
        estPomos: est,
        days,
        key: `n${prev.length}${trimmed}`,
        origin: 'new',
        pendingDrop: false
      }
    ])
    setDirty(true)
    setTitle('')
    setEst(MIN_EST)
    setDays([]) // 요일 선택 초기화 — 다음 항목이 앞 항목의 배치를 물려받지 않는다 (§5.3)
    titleRef.current?.focus()
  }

  const removeRow = (row: Row) => {
    setDirty(true)
    if (row.origin === 'new') {
      setRows((prev) => prev.filter((r) => r.key !== row.key)) // 무해한 취소 — 확인 없음
      return
    }
    setConfirmingDrop(row.key) // 확정 시 폐기가 일어나므로 미리 알린다
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-1 px-4 pt-4">
        <p className="eyebrow">WEEK</p>
        <h2 className="card-title text-ink">{`${TARGET_LABEL[target]} 계획`}</h2>
        <TargetToggle target={target} onPick={pickTarget} />
        <p className="font-mono text-xs tabular-nums text-ink-dim">{weekRangeLabel(week)}</p>
        {confirmingSwitch !== null ? (
          <div className="flex flex-col gap-1 rounded-md border border-glass-border-soft px-2 py-2">
            <span className="text-xs text-ink-dim">
              고치던 내용이 있어요 — 저장하지 않고 다른 주로 갈까요?
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  const next = confirmingSwitch
                  setConfirmingSwitch(null)
                  onChangeWeek(next)
                }}
              >
                저장하지 않고 이동
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setConfirmingSwitch(null)}
              >
                여기 남기
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <label className="flex flex-col gap-1 text-xs text-ink-dim">
          {`${TARGET_LABEL[target]} 예산 (추정치)`}
          <input
            type="number"
            min={0}
            value={budget ?? ''}
            onChange={(e) => {
              setDirty(true)
              setBudget(e.target.value === '' ? null : Number(e.target.value))
            }}
            className="w-24 rounded-md border border-control-border bg-glass px-2 py-1 font-mono text-sm tabular-nums text-ink"
          />
        </label>

        <div className="mt-3 flex flex-col gap-2 border-t border-glass-border-soft pt-3">
          <label className="flex flex-col gap-1 text-xs text-ink-dim">
            할당 제목
            <input
              ref={titleRef}
              type="text"
              maxLength={40}
              value={title}
              onChange={(e) => {
                setDirty(true)
                setTitle(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addItem()
              }}
              className="rounded-md border border-control-border bg-glass px-2 py-1 text-sm text-ink"
            />
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-dim">예상 뽀모</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="예상 뽀모 줄이기"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEst((n) => Math.max(MIN_EST, n - 1))}
            >
              −
            </Button>
            <span data-testid="est-value" className="font-mono text-sm tabular-nums text-ink">
              {est}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="예상 뽀모 늘리기"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEst((n) => n + 1)}
            >
              +
            </Button>
          </div>

          <p className="text-xs text-ink-dim">언제 (선택)</p>
          <DayChips
            selected={days}
            onToggle={(i) =>
              setDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]))
            }
          />

          <div>
            <Button type="button" size="sm" disabled={title.trim() === ''} onClick={addItem}>
              항목 추가
            </Button>
          </div>
        </div>

        <ul className="mt-3 flex flex-col gap-1 border-t border-glass-border-soft pt-3">
          {rows.map((row) => (
            <li
              key={row.key}
              data-testid="draft-row"
              className="flex items-center gap-2 rounded-md px-1 py-1"
            >
              <span
                data-testid="draft-row-title"
                className={`flex-1 truncate text-sm ${
                  row.pendingDrop ? 'text-ink-dim line-through' : 'text-ink'
                }`}
              >
                {row.title}
              </span>
              <span className="text-xs text-ink-dim">
                {row.days.length === 0
                  ? '미배치'
                  : DAY_NAMES.filter((_, i) => row.days.includes(i)).join('')}
              </span>
              <span className="font-mono text-xs tabular-nums text-ink-dim">
                {`(뽀모 ${row.estPomos})`}
              </span>

              {row.pendingDrop ? (
                <>
                  <span className="text-xs text-ink-dim">보내줄 예정</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setRows((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, pendingDrop: false } : r))
                      )
                    }
                  >
                    되돌리기
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="제거"
                  className="hover:text-danger"
                  onClick={() => removeRow(row)}
                >
                  ×
                </Button>
              )}
            </li>
          ))}
        </ul>

        {confirmingDrop !== null ? (
          <div className="mt-2 flex flex-col gap-2 rounded-md border border-glass-border-soft px-2 py-2">
            <span className="text-xs text-ink-dim">
              이 할당을 보내줄까요? 지금까지 한 집중과 조각은 남아요.
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="hover:text-danger"
                onClick={() => {
                  setRows((prev) =>
                    prev.map((r) => (r.key === confirmingDrop ? { ...r, pendingDrop: true } : r))
                  )
                  setConfirmingDrop(null)
                }}
              >
                보내주기
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setConfirmingDrop(null)}
              >
                취소
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* 게이지(§7)는 플래너에서 숨겨지고 이 합계가 그 자리를 대신한다 (§5.5). */}
      <div data-testid="plan-total" className="shrink-0 px-4 py-3">
        {budget === null ? (
          <p className="text-xs text-ink-dim">예산을 정하면 과적을 알려줘요</p>
        ) : (
          <>
            <p className="font-mono text-sm tabular-nums text-ink">
              {`계획 합계 ${planned} / 예산 ${budget}`}
            </p>
            <div
              data-testid="plan-total-bar"
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-glass-strong"
            >
              <div
                className={`h-full rounded-full ${over > 0 ? 'bg-amber' : 'bg-teal'}`}
                style={{
                  width: `${budget === 0 ? 100 : Math.min(100, (planned / budget) * 100)}%`
                }}
              />
            </div>
            {over > 0 ? (
              // 질문형까지만 — 단정도, 이 화면에 없는 액션(다음 주로 미루기)도 권하지 않는다.
              <p className="mt-1 text-xs text-amber">
                {`+${over} 과적이에요. 예상 뽀모를 줄일까요, 항목을 덜어낼까요?`}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onConfirm({
                budget,
                // 보내줄 예정 행은 목록에서 빠진다 — 선언형 확정이라 그것이 곧 폐기다 (R24).
                items: kept.map(({ id, title: t, estPomos, days: d }) => ({
                  id,
                  title: t,
                  estPomos,
                  days: d
                }))
              })
            }
          >
            {`${TARGET_LABEL[target]} 시작`}
          </Button>
        </div>
      </div>
    </div>
  )
}
