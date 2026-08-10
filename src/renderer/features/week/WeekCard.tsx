import { useRef, useState, type Ref } from 'react'
import { addWeeks, weekRangeLabel } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import { Toast } from '@renderer/shared/ui/Toast'
import { BudgetGauge } from './BudgetGauge'
import { ItemDrawer } from './ItemDrawer'
import { OtherRow } from './OtherRow'
import { Planner, type PlanTarget } from './Planner'
import { WeekItemRow } from './WeekItemRow'
import { useDrawer } from './useDrawer'
import { usePlanner } from './usePlanner'
import { useWeek } from './useWeek'
import { ReviewBanner } from '@renderer/features/review/ReviewBanner'
import { ReviewPanel } from '@renderer/features/review/ReviewPanel'
import { useReview } from '@renderer/features/review/useReview'
import { useReviewStatus } from '@renderer/features/review/useReviewStatus'

/**
 * 빈 상태 세 갈래 (ux-spec §8). 사실만 적고 칭찬하지 않는다 (principles §1).
 *
 * 갈래를 가르는 기준이 "항목이 있느냐" 하나가 아니라는 점이 핵심이다 — 계획은 없지만
 * 기록은 있는 주에 "할당을 잡으면 예산이 보여요"라고 하면 이미 보이고 있는 기록을
 * 없는 셈 치는 말이 된다.
 */
function EmptyState({
  kind,
  targetLabel,
  onOpenPlanner,
  ctaRef
}: {
  kind: 'no-plan' | 'unplanned-only' | 'all-done'
  /** CTA 라벨도 편집 대상 주 선택에서 파생한다 (§2 라벨 파생 규칙, PRD R5). */
  targetLabel: string
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
          : `${targetLabel} 할당을 잡으면 뽀모 예산이 여기 보여요`}
      </p>
      <Button ref={ctaRef} type="button" variant="secondary" size="sm" onClick={onOpenPlanner}>
        {kind === 'all-done' ? '수정' : `+ ${targetLabel} 할당 잡기`}
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
  const { weekKey, todayIndex, query, pullNext, complete, uncomplete, drop } = useWeek()
  // 동시에 하나만 열린다 (§6) — 열린 항목 id 하나로 표현한다.
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [reviewing, setReviewing] = useState(false)
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
  const reviewCtaRef = useRef<HTMLButtonElement | null>(null)
  const status = useReviewStatus().data
  /**
   * 편집 대상 주 = `week_of(오늘 + plan_lead_days)` (PRD R3). renderer 가 그 식을 다시
   * 계산하지 않고 판정 응답의 `targetWeek` 을 그대로 쓴다 — 설정이 바뀌면 여기도 따라간다.
   * 판정이 아직 안 왔으면 **이번 주**로 둔다. 모를 때 `다음 주` 로 떨어지면 평일에
   * 카드를 연 사용자가 한순간 다음 주 라벨을 보게 된다 — 기본 설정에서 그 값이 맞는
   * 날은 일요일 하루뿐이다.
   */
  const defaultTarget: PlanTarget =
    status === undefined || status.targetWeek === weekKey ? 'current' : 'next'
  const [target, setTarget] = useState<PlanTarget | null>(null)
  const planTarget = target ?? defaultTarget
  const planWeek = planTarget === 'current' ? weekKey : addWeeks(weekKey, 1)

  const review = useReview(reviewing)
  const drawer = useDrawer(weekKey, openId)
  const planner = usePlanner(planning, planWeek)
  const summary = query.data

  /** 복귀는 확정·취소 공통이다. 버튼이 다시 렌더된 뒤라야 포커스가 걸린다. */
  const leavePlanner = () => {
    setPlanning(false)
    // 편집 대상 주 선택도 함께 놓는다 — 다음에 열 때는 그날의 기본값에서 다시 시작한다.
    setTarget(null)
    queueMicrotask(() => ctaRef.current?.focus())
  }

  /** 정산 진입 버튼(배너)으로 포커스를 돌려준다 — 패널이 사라지며 포커스를 잃지 않게. */
  const leaveReview = () => {
    setReviewing(false)
    queueMicrotask(() => reviewCtaRef.current?.focus())
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

  // 정산 패널도 카드를 통째로 대신한다 (weekly-review 계획서 정정 ③). 플래너와 같은 자리라
  // 둘이 동시에 열리지 않는다 — 배너는 일반 뷰에만 있으므로 구조적으로 배타적이다.
  if (reviewing && review.data !== undefined) {
    return <ReviewPanel data={review.data} onClose={leaveReview} />
  }

  // 플래너는 카드를 통째로 대신한다 — 일반 뷰와 나란히 두지 않는다 (§5.1).
  if (planning && planner.query.data !== undefined) {
    return (
      // key 로 주마다 새로 마운트한다 — 초안·예산·입력 중이던 값이 그 주의 것으로 전부
      // 다시 채워져야 한다 (§5.0 전환 효과). 상태를 손으로 되돌리면 빠뜨릴 자리가 생긴다.
      <Planner
        key={planWeek}
        draft={planner.query.data}
        week={planWeek}
        target={planTarget}
        onChangeWeek={setTarget}
        onConfirm={(input) => planner.confirm.mutate(input, { onSuccess: leavePlanner })}
        onCancel={leavePlanner}
      />
    )
  }

  const { otherRow, budget, totalSpent } = summary
  /**
   * 목록 정렬은 **생성순**이고, 오늘 배정된 항목만 상단으로 올린다 (§3.1, PRD R7·R10).
   * 사용자가 순서를 바꾸는 UI 는 없다.
   *
   * `sort` 는 안정 정렬이므로 두 그룹 안의 생성순이 유지된다 — main 이 이미 생성순으로
   * 주고 있다. 보고 있는 주가 이번 주가 아니면 "오늘 배정"이 성립하지 않아 정렬도 없다.
   */
  const items =
    todayIndex === null
      ? summary.items
      : [...summary.items].sort(
          (a, b) => Number(b.days.includes(todayIndex)) - Number(a.days.includes(todayIndex))
        )
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
        <p className="eyebrow">WEEK</p>
        <h2 className="card-title text-ink">이번 주 할당</h2>
        <p className="font-mono text-xs tabular-nums text-ink-dim">{weekRangeLabel(weekKey)}</p>
      </header>

      {/* 배너는 일반 뷰 상단에 얹힌다 (week-plan ux-spec §2). 떠 있어도 목록·드로어·pull·
          게이지가 전부 정상 동작한다 — 정산은 다른 기능의 선행 조건이 아니다 (R7). */}
      <div className="shrink-0">
        <ReviewBanner
          status={status}
          currentWeek={weekKey}
          ctaRef={reviewCtaRef}
          onStart={() => setReviewing(true)}
        />
      </div>

      {/* 보여줄 행이 없는 주에는 안내를 가운데로 올린다. 게이지는 하단 고정이라(§7) 목록이
          위에 붙으면 그 사이가 통째로 비어 화면이 미완성으로 읽힌다. 행이 하나라도 있으면
          위에서부터 쌓는다 — 목록은 읽는 순서가 있는 것이다. */}
      <ul
        data-testid="week-item-list"
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2 ${
          items.length === 0 && !otherRow.visible ? 'justify-center' : ''
        }`}
      >
        {items.map((row) => {
          const open = openId === row.id
          const drawerId = `week-drawer-${row.id}`
          return (
            <WeekItemRow
              key={row.id}
              row={row}
              week={weekKey}
              todayIndex={todayIndex}
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
            <EmptyState
              kind={emptyKind}
              targetLabel={planTarget === 'current' ? '이번 주' : '다음 주'}
              onOpenPlanner={() => setPlanning(true)}
              ctaRef={ctaRef}
            />
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
