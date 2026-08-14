import { useState } from 'react'
import { Plus } from 'lucide-react'
import { addMonths, monthOfWeek, monthOnlyLabel, weekRangeLabel } from '@shared/time'
import { useClock } from '@renderer/shared/query/useClock'
import { Button } from '@renderer/shared/ui/button'
import { CarryTitlesAction } from './CarryTitlesAction'
import { MilestoneRow, type RowActions } from './MilestoneRow'
import { useMilestones } from './useMilestones'

/**
 * 월 마일스톤 카드 (milestones).
 *
 * **표시 모드를 여기서 계산하지 않는다** — 서버가 실어 보낸 `mode` 로만 분기한다 (R20).
 * 조건을 다시 쓰면 R20 의 순서가 두 곳이 되고, 두 모드를 동시에 가진 카드가 나온다.
 *
 * **월 선택기·탭·모달을 두지 않는다** (R19 · A18). 달 이동은 캘린더의 `‹ ›` 하나뿐이고,
 * 이 카드는 `DisplayMonthProvider` 를 구독만 한다 (R26 · A24).
 */
export function MilestoneCard() {
  const { weekKey } = useClock()
  const { month, query, create, rename, setCompleted, setArchived, remove, carryTitles } =
    useMilestones()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const data = query.data
  if (data === undefined) return null

  const editable =
    data.mode === 'lead-edit' || data.mode === 'current-empty' || data.mode === 'edit'
  const actions: RowActions = {
    rename: (input) => rename.mutate(input),
    setCompleted: (input) => setCompleted.mutate(input),
    setArchived: (input) => setArchived.mutate(input),
    remove: (id) => remove.mutate(id)
  }

  function submitNew() {
    const title = draft.trim()
    if (title !== '') create.mutate(title)
    setDraft('')
    setAdding(false)
  }

  /*
   * **`aria-label` 을 두지 않는다.** 카드의 접근성 이름은 셸의 `<section>` 이 소유한다
   * (App.tsx) — 다른 카드(타이머·주간·오늘·캘린더)가 전부 그 규율이다. 여기에도 같은
   * 이름을 붙이면 **같은 이름의 region 이 중첩되어** 스크린리더가 두 번 읽고,
   * `getByRole('region', …)` 이 두 요소로 갈라진다.
   */
  return (
    <div className="flex min-h-0 flex-col gap-2" data-mode={data.mode} data-testid="milestone-card">
      <h2 className={`card-title ${data.mode.startsWith('past') ? 'text-ink-dim' : 'text-ink'}`}>
        결과물
      </h2>

      {/* 지난달 배지 (R21 · R23). M === 0 이면 서버가 null 을 주므로 여기서 그리지 않는다. */}
      {data.badge !== null ? (
        <p data-testid="milestone-badge" className="font-mono text-xs tabular-nums text-ink-dim">
          {data.badge.archivedCount === 0
            ? `${data.badge.completed}/${data.badge.total} 달성`
            : `${data.badge.completed}/${data.badge.total} 달성 · 보관 ${data.badge.archivedCount}건`}
        </p>
      ) : null}

      {data.items.length > 0 ? (
        <ul className="scroll-area flex min-h-0 flex-col gap-1.5 overflow-y-auto">
          {data.items.map((item, i) => (
            <MilestoneRow
              key={item.id}
              item={item}
              index={i}
              editable={editable}
              rollupWeek={data.rollupWeek}
              actions={actions}
            />
          ))}
        </ul>
      ) : null}

      {/*
        진행 중인 주가 이 달에 귀속되지 않은 동안에는 숫자 대신 **사실 문구**를 둔다
        (R18 · R23 · A17). 달 전환 직후 최대 6일간의 상태이며, 서버의 `rollupWeek: null`
        이 그 신호다.
      */}
      {data.mode === 'edit' && data.rollupWeek === null ? (
        <p data-testid="rollup-out-of-month" className="text-[10px] text-ink-dim">
          {`이번 주(${weekRangeLabel(weekKey)})는 ${monthOnlyLabel(monthOfWeek(weekKey))}에 속한 주예요`}
        </p>
      ) : null}

      {/* 보관 목록 — 해제의 도달 경로다 (R11 · A20). 모든 모드에서 열린다. */}
      {data.archivedItems.length > 0 ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid="archived-toggle"
            onClick={() => setShowArchived((v) => !v)}
          >
            {`보관 ${data.archivedItems.length}건`}
          </Button>
          {showArchived ? (
            <ul data-testid="archived-list" className="flex flex-col gap-1.5 pt-1">
              {data.archivedItems.map((item, i) => (
                <MilestoneRow
                  key={item.id}
                  item={{ ...item, rollup: null }}
                  index={i}
                  editable={false}
                  rollupWeek={null}
                  actions={actions}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* 빈 상태와 CTA — 문구는 사실만 말한다 (R23). 부정·결핍 프레임과 훈계 금지. */}
      {data.mode === 'current-empty' ? (
        <>
          <p className="text-xs text-ink-dim">이번 달이 끝나면 뭐가 달라져 있을까요?</p>
          {data.carryCandidates.length > 0 ? (
            <CarryTitlesAction
              candidates={data.carryCandidates}
              onCarry={(titles) => carryTitles.mutate(titles)}
            />
          ) : null}
        </>
      ) : null}

      {data.mode === 'lead-edit' && data.items.length === 0 ? (
        <p className="text-xs text-ink-dim">아직 계획 전</p>
      ) : null}

      {data.mode === 'past-empty' ? (
        <p className="text-xs text-ink-dim">이 달은 계획 없이 지나갔어요</p>
      ) : null}

      {/*
        먼 미래는 **CTA 를 두지 않는다** (R23) — 편집 경로가 아직 없으므로. 대신 그 달이
        "다음 달"이 되는 날짜(= 직전 달 1일)를 사실로 말한다.
      */}
      {data.mode === 'far-future' ? (
        <p data-testid="far-future-note" className="text-xs text-ink-dim">
          {`${monthOnlyLabel(month)}은 ${monthOnlyLabel(addMonths(month, -1))} 1일부터 계획할 수 있어요`}
        </p>
      ) : null}

      {editable ? (
        adding ? (
          /* h-8 은 이 입력이 대체하는 추가 버튼(size sm)과 같은 높이다 — 버튼↔입력 전환
             때 높이가 달라지면 아래 목록이 밀렸다 당겨진다 (실측: 추가 3회에 shift 9건). */
          <input
            autoFocus
            aria-label="새 결과물"
            className="h-8 rounded-md bg-glass-strong px-2 py-1 text-xs text-ink"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew()
              if (e.key === 'Escape') {
                setDraft('')
                setAdding(false)
              }
            }}
          />
        ) : (
          /*
            개수를 막지 않는다 (R4 · A4) — 2~3개는 권장 힌트일 뿐이고 4개 이상이어도
            저장을 막거나 경고색으로 표시하지 않는다. 판단은 사용자다.
          */
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="milestone-add"
            className="self-start"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden="true" />
            {data.mode === 'lead-edit' && data.items.length === 0
              ? `${monthOnlyLabel(month)} 계획 잡기`
              : '결과물 추가'}
          </Button>
        )
      ) : null}
    </div>
  )
}
