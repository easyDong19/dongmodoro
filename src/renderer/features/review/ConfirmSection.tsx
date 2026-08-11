import { Button } from '@renderer/shared/ui/button'
import type { ReviewPending } from './useReview'

type Panel = Extract<ReviewPending, { needed: true }>

/**
 * 안내 + 확정 (ux-spec §6·§7).
 *
 * 확정 전 확인 다이얼로그를 두지 않는다 (§7.3) — 파괴적 행위가 아니고(폐기도 soft),
 * 확정 후 플래너에서 계속 편집할 수 있다.
 */
export function ConfirmSection({
  data,
  carriedPomos,
  pending,
  error,
  onConfirm
}: {
  data: Panel
  /** 지금 선택 기준의 이월 뽀모 합. 라벨과 중립 사실 줄이 이 값에서 나온다. */
  carriedPomos: number
  pending: boolean
  error: 'stale' | 'failed' | null
  onConfirm: () => void
}) {
  const weekWord = data.targetWeekIsCurrent ? '이번 주' : '다음 주'
  const unplanned = data.summary.weeks.reduce((sum, w) => sum + w.unplannedPomos, 0)
  const { focusMin, shortBreakMin, longBreakMin } = data.baseline

  return (
    <section className="flex flex-col gap-3">
      {/* "미분류"라는 단어를 쓰지 않는다 (§6) — 주간 카드의 "기타 — 계획에 없던 집중"과
          같은 개념이므로 같은 말을 쓴다. 값이 0 이면 문장 자체를 렌더하지 않는다. */}
      {unplanned > 0 ? (
        <p className="text-xs text-ink-dim">
          {`계획에 없던 집중 ${unplanned}은 기록으로만 남아요. 할당이 틀린 건 실패가 아니라 정보예요.`}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-xs text-ink-dim">
          {`뽀모 길이 — 집중 ${focusMin} · 짧은 휴식 ${shortBreakMin} · 긴 휴식 ${longBreakMin}`}
        </p>
        {/* 완결 문장이므로 메타 토큰(xs)이 아니라 sm 이다 (design-system ADR-009 §2).
            "정산에서만 바꿔요" 류를 쓰지 않는다 — 길이는 언제든 편집할 수 있고, 정산에
            있는 것은 진입점일 뿐이다 (ADR-013 §3). 그 진입점은 pomo-baseline 소관이라
            이번 마일스톤에서 뺐고, 여기서는 현재 값만 사실로 적는다. */}
        <p className="text-sm text-ink-dim">
          바꾼 길이는 다음 주부터 적용돼요 · 이번 주 기록은 그대로예요
        </p>
      </div>

      {/* 3주 만에 복귀해 60뽀모가 한 주로 들어오는 상황과 한 주를 알차게 보낸 상황에
          같은 시각 언어(앰버 글로우 + 불꽃)를 쓰지 않기 위한 줄이다 (R40). 막지도,
          캡을 두지도, 줄이라고 권하지도 않는다 — 두 숫자를 나란히 놓기만 한다. */}
      {carriedPomos > 0 ? (
        <p className="font-mono text-xs tabular-nums text-ink-dim">
          {`이월 ${carriedPomos}`}
          {/* 예산이 없으면 숫자를 지어내지 않는다. `예산 0` 은 거짓말이다 (ADR-018 §1). */}
          {data.targetWeekBudget !== null ? ` · ${weekWord} 예산 ${data.targetWeekBudget}` : ''}
        </p>
      ) : null}

      {error !== null ? (
        <p data-testid="review-error" className="text-xs text-ink-dim">
          {error === 'stale'
            ? '날짜가 바뀌어서 정산 범위를 다시 불러왔어요'
            : '저장하지 못했어요 — 다시 시도해 주세요. 아무것도 반영되지 않았어요'}
        </p>
      ) : null}

      <div>
        <Button type="button" size="sm" disabled={pending} onClick={onConfirm}>
          {carriedPomos > 0
            ? `${weekWord} 시작 (이월 뽀모 ${carriedPomos} 포함)`
            : `${weekWord} 시작`}
        </Button>
      </div>
    </section>
  )
}
