import { useRef, useState, type Ref } from 'react'
import { weekRangeLabel } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import { Toast } from '@renderer/shared/ui/Toast'
import { BudgetGauge } from './BudgetGauge'
import { ItemDrawer } from './ItemDrawer'
import { OtherRow } from './OtherRow'
import { Planner } from './Planner'
import { WeekItemRow } from './WeekItemRow'
import { useDrawer } from './useDrawer'
import { usePlanner } from './usePlanner'
import { useWeek } from './useWeek'

/**
 * 빈 상태 세 갈래 (ux-spec §8). 사실만 적고 칭찬하지 않는다 (principles §1).
 *
 * 갈래를 가르는 기준이 "항목이 있느냐" 하나가 아니라는 점이 핵심이다 — 계획은 없지만
 * 기록은 있는 주에 "할당을 잡으면 예산이 보여요"라고 하면 이미 보이고 있는 기록을
 * 없는 셈 치는 말이 된다.
 */
function EmptyState({
  kind,
  onOpenPlanner,
  ctaRef
}: {
  kind: 'no-plan' | 'unplanned-only' | 'all-done'
  onOpenPlanner: () => void
  ctaRef: Ref<HTMLButtonElement>
}) {
  if (kind === 'unplanned-only') {
    return <p className="px-2 py-2 text-xs text-ink-dim">계획이 없어도 기록은 남아요</p>
  }
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-4">
      <p className="text-sm text-ink-dim">
        {kind === 'all-done'
          ? '이번 주 할당을 다 끝냈어요'
          : '이번 주 할당을 잡으면 뽀모 예산이 여기 보여요'}
      </p>
      <Button ref={ctaRef} type="button" variant="secondary" size="sm" onClick={onOpenPlanner}>
        {kind === 'all-done' ? '수정' : '+ 이번 주 할당 잡기'}
      </Button>
    </div>
  )
}

/**
 * 주간 카드 일반 뷰 (ux-spec §2). 세로 3단이고 **가운데만 늘어나고 스크롤한다.**
 *
 * 게이지가 목록 **바깥**에 있고 `shrink-0` 인 것이 이 레이아웃의 요점이다. 목록 안에
 * 넣거나 `min-h-0` 를 빼면 항목이 쌓일 때 카드가 늘어나 게이지가 뷰포트 밖으로 밀린다 —
 * 예산 대비 소진은 이 화면이 존재하는 이유라 항상 보여야 한다.
 */
export function WeekCard() {
  const { weekKey, query, pullNext, complete, uncomplete, drop } = useWeek()
  // 동시에 하나만 열린다 (§6) — 열린 항목 id 하나로 표현한다.
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const caretRefs = useRef(new Map<string, HTMLButtonElement | null>())
  /**
   * 플래너 진입 버튼. 복귀할 때 포커스를 여기로 돌려준다 (PRODUCT.md 접근성 §4) —
   * 돌려주지 않으면 플래너가 사라지면서 포커스가 `<body>` 로 떨어져 키보드 사용자가
   * 위치를 잃는다.
   *
   * 진입 경로가 둘(빈 상태 CTA · `수정`)이지만 **한 번에 하나만 렌더된다.** 그래서 누른
   * 노드를 붙잡아 두는 대신 "지금 그 자리에 있는 버튼"을 가리키게 한다 — 플래너가 열릴
   * 때 버튼이 언마운트되므로, 노드를 붙잡으면 복귀 시점엔 죽은 참조가 된다.
   */
  const ctaRef = useRef<HTMLButtonElement | null>(null)
  const drawer = useDrawer(weekKey, openId)
  const planner = usePlanner(planning)
  const summary = query.data

  /** 복귀는 확정·취소 공통이다. 버튼이 다시 렌더된 뒤라야 포커스가 걸린다. */
  const leavePlanner = () => {
    setPlanning(false)
    queueMicrotask(() => ctaRef.current?.focus())
  }

  /** 닫을 때 포커스를 캐럿으로 돌려준다 — 열었던 자리를 잃지 않게 (PRODUCT.md 접근성 §4). */
  const closeDrawer = (id: string) => {
    setOpenId(null)
    caretRefs.current.get(id)?.focus()
  }

  /**
   * 원클릭 pull (§3.1). 유자격 조각이 없으면 `pulled: null` 이 오고, 그때 드로어를 연다 —
   * 첫 pull 은 고르는 게 아니라 쓰는 것이기 때문이다 (R12). 성공이면 토스트만 띄운다:
   * 내로우에서 오늘 목록이 안 보여도 무슨 일이 일어났는지 알 수 있어야 한다.
   */
  const onPullNext = (id: string) =>
    pullNext.mutate(id, {
      onSuccess: (r) =>
        r.pulled === null ? setOpenId(id) : setToast(`오늘로 가져왔어요 — ${r.pulled.title}`)
    })

  if (summary === undefined) return null

  // 플래너는 카드를 통째로 대신한다 — 일반 뷰와 나란히 두지 않는다 (§5.1).
  if (planning && planner.query.data !== undefined) {
    return (
      <Planner
        draft={planner.query.data}
        onConfirm={(input) => planner.confirm.mutate(input, { onSuccess: leavePlanner })}
        onCancel={leavePlanner}
      />
    )
  }

  const { items, otherRow, budget, totalSpent } = summary
  const emptyKind =
    items.length > 0
      ? items.every((i) => i.completedAt !== null)
        ? 'all-done'
        : null
      : otherRow.visible
        ? 'unplanned-only'
        : 'no-plan'

  return (
    // 랜드마크 라벨은 App 의 감싸는 section 이 갖는다 — 여기에도 붙이면 같은 이름이 둘이 된다.
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pt-4">
        <p className="text-xs tracking-wide text-ink-dim">WEEK</p>
        <h2 className="text-base text-ink">이번 주 할당</h2>
        <p className="font-mono text-xs tabular-nums text-ink-dim">{weekRangeLabel(weekKey)}</p>
      </header>

      <ul data-testid="week-item-list" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {items.map((row) => {
          const open = openId === row.id
          const drawerId = `week-drawer-${row.id}`
          return (
            <WeekItemRow
              key={row.id}
              row={row}
              week={weekKey}
              onPullNext={onPullNext}
              onComplete={(id) => complete.mutate(id)}
              onUncomplete={(id) => uncomplete.mutate(id)}
              onToggleDrawer={(id) => (open ? closeDrawer(id) : setOpenId(id))}
              drawerOpen={open}
              drawerId={drawerId}
              caretRef={(el) => {
                caretRefs.current.set(row.id, el)
              }}
            >
              {open && drawer.query.data !== undefined ? (
                <ItemDrawer
                  id={drawerId}
                  data={drawer.query.data}
                  onPull={(input) =>
                    drawer.pull.mutate(input, { onSuccess: () => closeDrawer(row.id) })
                  }
                  onClose={() => closeDrawer(row.id)}
                  onComplete={() => complete.mutate(row.id)}
                  onUncomplete={() => uncomplete.mutate(row.id)}
                  onDrop={() => drop.mutate(row.id, { onSuccess: () => setOpenId(null) })}
                />
              ) : null}
            </WeekItemRow>
          )
        })}
        {/* 기타 행은 항상 목록 맨 아래다 (§3.4). */}
        {otherRow.visible ? <OtherRow spentPomos={otherRow.spentPomos} /> : null}
        {emptyKind !== null ? (
          <li>
            <EmptyState kind={emptyKind} onOpenPlanner={() => setPlanning(true)} ctaRef={ctaRef} />
          </li>
        ) : null}
      </ul>

      <div data-testid="week-gauge-slot" className="shrink-0">
        <BudgetGauge budget={budget} spent={totalSpent} />
      </div>

      {toast !== null ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}
