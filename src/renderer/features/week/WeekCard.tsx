import { useRef, useState, type Ref } from 'react'
import { addWeeks, weekRangeLabel } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import { MeasuredTime } from '@renderer/shared/ui/MeasuredTime'
import { Toast } from '@renderer/shared/ui/Toast'
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
 * 기록은 있는 주에 "할당을 잡으면 여기에 쌓여요"라고 하면 이미 쌓여 있는 기록을
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
  /**
   * 세 갈래가 문구만 다르고 **CTA 는 셋 다 있다** (§8 표). 기록만 있는 주에서 CTA 를 빼면
   * 계획 없이 집중 한 번만 해도 그 주에는 플래너로 들어갈 길이 사라진다 — 앱을 처음 열고
   * 타이머부터 눌러 본 사용자가 밟는 경로라, 그 주 내내 계획을 못 세우게 된다.
   *
   * 기록만 있는 주는 위쪽에 기타 행이 이미 있으므로 문구를 작게 두고 여백도 줄인다.
   * 문구가 다른 이유는 §8 이 정한 그대로다 — 이미 보이고 있는 기록을 "없는 셈" 치지 않는다.
   */
  const unplannedOnly = kind === 'unplanned-only'
  return (
    <div className={`flex flex-col items-start gap-2 px-2 ${unplannedOnly ? 'py-2' : 'py-4'}`}>
      <p className={unplannedOnly ? 'text-xs text-ink-dim' : 'text-sm text-ink-dim'}>
        {kind === 'all-done'
          ? '이번 주 할당을 다 끝냈어요'
          : unplannedOnly
            ? '계획이 없어도 기록은 남아요'
            : `${targetLabel} 할당을 잡으면 여기서 집중한 시간이 쌓여요`}
      </p>
      <Button ref={ctaRef} type="button" variant="secondary" size="sm" onClick={onOpenPlanner}>
        {kind === 'all-done' ? '수정' : `+ ${targetLabel} 할당 잡기`}
      </Button>
    </div>
  )
}

/**
 * 주간 카드 일반 뷰 (ux-spec §2). 세로 2단이고 **목록만 늘어나고 스크롤한다.**
 *
 * 하단의 예산 게이지가 없어졌다 (ADR-030 §3 — 예산은 폐기된 통화다). 그 자리가 답하던
 * "이번 주에 얼마나 했나"는 **헤더의 측정 시간 합**이 답한다. 헤더는 `shrink-0` 이라
 * 항목이 몇 개든 그 숫자가 화면 밖으로 밀리지 않는다.
 */
export function WeekCard() {
  const { weekKey, todayIndex, query, pullNext, complete, uncomplete, drop, setMilestone } =
    useWeek()
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
   * 진입 경로가 둘(빈 상태 CTA · 헤더 `수정`)이지만 **한 번에 하나만 렌더된다** — 헤더
   * 버튼은 빈 상태가 아닐 때만 그린다. 그래서 누른 노드를 붙잡아 두는 대신 "지금 그 자리에
   * 있는 버튼"을 가리키게 한다 — 플래너가 열릴 때 버튼이 언마운트되므로, 노드를 붙잡으면
   * 복귀 시점엔 죽은 참조가 된다.
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
  if (reviewing && review.query.data !== undefined) {
    return (
      <ReviewPanel
        data={review.query.data}
        currentWeek={weekKey}
        settle={review.settle}
        error={review.error}
        // 확정 후 패널이 닫히고 배너가 사라진다. **플래너를 자동으로 열지 않는다** —
        // 정산과 플래닝은 분리된 단계다 (ux-spec §7.3).
        onSettled={(message) => {
          leaveReview()
          setToast(message)
        }}
        onClose={leaveReview}
      />
    )
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

  const { otherRow, totalMeasuredSec } = summary
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
      <header className="flex shrink-0 items-start gap-2 px-4 pt-4">
        <div className="flex-1">
          <p className="eyebrow">WEEK</p>
          <h2 className="card-title text-ink">이번 주 할당</h2>
          {/* 주 범위 옆에 이번 주 측정 시간 합을 둔다 (ux-spec §7). 세션이 0인 주에도
              `0분` 을 적는다 — 자리를 지우면 "값 없음"과 구분되지 않는다 (§0.3·§0.5). */}
          <p className="font-mono text-xs tabular-nums text-ink-dim">
            {weekRangeLabel(weekKey)}
            {' · '}
            <MeasuredTime sec={totalMeasuredSec} testId="week-total-measured" />
          </p>
        </div>

        {/* 활성 항목이 있을 때의 유일한 플래너 진입점이다 (§2). 빈 상태에는 본문 CTA 가
            있으므로 그리지 않는다 — 진입이 둘이 되면 어느 쪽이 "지금 쓸 것"인지 흐려지고,
            포커스를 돌려줄 자리도 갈린다.

            이것이 없으면 주중 재수정(PRD R23)에 진입점이 없다. 일요일에 다음 주 계획도
            세울 수 없고, 이월 항목이 다음 주에 활성으로 남으므로 그 주에도 같은 상태가
            이어진다. */}
        {emptyKind === null ? (
          <Button
            ref={ctaRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPlanning(true)}
          >
            수정
          </Button>
        ) : null}
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
        className={`scroll-area flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2 ${
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
                  onPull={(input) => {
                    /**
                     * 여러 개 가져오기의 토스트 — 원클릭 pull(§3.1)과 같은 이유로 띄운다:
                     * 내로우에서 오늘 목록이 안 보여도 무슨 일이 일어났는지 알아야 한다.
                     * 하나면 제목을 부르고(원클릭과 같은 문장), 여러 개면 개수로 접는다 —
                     * 제목 나열은 토스트가 감당 못 하는 길이다.
                     */
                    const count = input.taskIds.length + (input.newTask === null ? 0 : 1)
                    const single =
                      input.newTask?.title ??
                      drawer.query.data?.tasks.find((t) => t.taskId === input.taskIds[0])?.title
                    drawer.pull.mutate(input, {
                      onSuccess: () => {
                        closeDrawer(row.id)
                        setToast(
                          count === 1 && single !== undefined
                            ? `오늘로 가져왔어요 — ${single}`
                            : `오늘로 가져왔어요 — ${count}개`
                        )
                      }
                    })
                  }}
                  onAddTask={async (title) => {
                    const { taskId } = await drawer.addTask.mutateAsync(title)
                    return { taskId }
                  }}
                  onClose={() => closeDrawer(row.id)}
                  onComplete={() => complete.mutate(row.id)}
                  onUncomplete={() => uncomplete.mutate(row.id)}
                  onDrop={() => drop.mutate(row.id, { onSuccess: () => setOpenId(null) })}
                  onSetMilestone={(milestoneId) =>
                    setMilestone.mutate({ weekItemId: row.id, milestoneId })
                  }
                />
              ) : null}
            </WeekItemRow>
          )
        })}
        {/* 기타 행은 항상 목록 맨 아래다 (§3.4). */}
        {otherRow.visible ? <OtherRow measuredSec={otherRow.measuredSec} /> : null}
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

      {toast !== null ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}
