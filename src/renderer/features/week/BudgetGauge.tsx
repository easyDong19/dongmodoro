import { useReducedMotion } from '@renderer/shared/ui/useReducedMotion'

/**
 * 주간 예산 게이지 (ux-spec §7). 카드 하단에 고정되며, 예산 대비 소진은 이 화면이
 * 존재하는 이유다.
 *
 * **세 상태이고 `null` 과 `0` 을 합치지 않는다** (2026-08-10 결정):
 * - `null` = 아직 안 정했다 → `/ 미설정` + `예산을 정하면 …`
 * - `0` = 0 으로 **정했다** → 소진 숫자만. 정한 사람에게 "정하면"이라고 말하면 거짓이다
 * - 그 외 = 바 + `소진 / 예산`
 *
 * 두 무예산 상태 모두 나눗셈을 하지 않는다 — `소진 / 0` 도 `0 / 0` 도 그리지 않는다 (A27).
 *
 * 과적에 실패 프레임을 쓰지 않는다 (principles §3): 빨강도 경고 아이콘도 없고, 보조 문구는
 * 여유일 때와 **같다**. 예산은 추정치라서 넘는 것이 실패가 아니다.
 */
export function BudgetGauge({ budget, spent }: { budget: number | null; spent: number }) {
  const reduced = useReducedMotion()
  const over = budget !== null && budget > 0 ? Math.max(0, spent - budget) : 0
  const hasBar = budget !== null && budget > 0

  return (
    <div className="flex flex-col gap-1 px-4 py-3" aria-label="주간 예산">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm tabular-nums text-ink">
          {budget === null
            ? `${spent} / 미설정`
            : budget === 0
              ? `${spent}`
              : `${spent} / ${budget}`}
        </span>
        {over > 0 ? (
          <span className="font-mono text-xs tabular-nums text-amber">{`+${over}`}</span>
        ) : null}
      </div>

      {hasBar ? (
        <div
          data-testid="budget-bar"
          data-motion={reduced ? 'reduced' : undefined}
          className="h-1.5 w-full overflow-hidden rounded-full bg-glass-strong"
        >
          <div
            className={`h-full rounded-full bg-teal ${reduced ? '' : 'transition-[width] duration-200'}`}
            style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
          />
        </div>
      ) : null}

      {/* 예산 0 은 문구가 없다 — 여기서만 세 상태가 두 갈래로 갈린다. */}
      {budget === null ? (
        <p className="text-xs text-ink-dim">예산을 정하면 예산 대비 소진이 보여요</p>
      ) : budget > 0 ? (
        <p className="text-xs text-ink-dim">예산은 추정치예요 — 넘어가도 괜찮아요</p>
      ) : null}
    </div>
  )
}
