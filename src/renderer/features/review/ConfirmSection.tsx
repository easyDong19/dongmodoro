import { BaselineSection } from '@renderer/features/baseline/BaselineSection'
import { Button } from '@renderer/shared/ui/button'
import type { ReviewPending } from './useReview'

type Panel = Extract<ReviewPending, { needed: true }>

/**
 * 안내 (ux-spec §6). 섹션 4 이며 **스크롤 영역 안**에 있다 — 확정 버튼만 하단 고정이다 (§10).
 */
export function GuidanceSection({ data }: { data: Panel }) {
  const unplanned = data.summary.weeks.reduce((sum, w) => sum + w.unplannedPomos, 0)
  const { focusMin, shortBreakMin, longBreakMin } = data.baseline

  return (
    <section className="flex flex-col gap-2">
      {/* "미분류"라는 단어를 쓰지 않는다 (§6) — 주간 카드의 "기타 — 계획에 없던 집중"과
          같은 개념이므로 같은 말을 쓴다. 값이 0 이면 문장 자체를 렌더하지 않는다.

          **숫자 뒤에 조사를 붙이지 않는다.** ux-spec 초판은 `계획에 없던 집중 N은` 이라고
          적었지만 은/는은 숫자를 읽은 소리에 따라 갈린다 (2 는 `이` 라 `는`, 3 은 `삼` 이라
          `은`) — 실물에서 `집중 2은` 이 나왔다. 주간 카드의 pull 토스트가 같은 이유로
          제목 뒤 조사를 뺐고(week-plan ux-spec §3.1), 여기도 같은 방식으로 끊는다. */}
      {unplanned > 0 ? (
        <p className="text-xs text-ink-dim">
          {`계획에 없던 집중 ${unplanned} — 기록으로만 남아요. 할당이 틀린 건 실패가 아니라 정보예요.`}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        {/* 현재 값은 이 패널의 payload 로 그린다. `조정` 폼도 같은 값을 자기 채널로
            읽지만, **표시의 출처는 여기 하나뿐이다** — 두 경로가 같은 사실을 그리면
            저장 직후 한쪽만 갱신된 순간이 화면에 보인다. 저장 후 이 줄을 갱신하는 것은
            `baseline-changed` 무효화의 몫이다. */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-ink-dim">
            {`뽀모 길이 — 집중 ${focusMin} · 짧은 휴식 ${shortBreakMin} · 긴 휴식 ${longBreakMin}`}
          </p>
          <BaselineSection />
        </div>
        {/* 완결 문장이므로 메타 토큰(xs)이 아니라 sm 이다 (design-system ADR-009 §2).
            "정산에서만 바꿔요" 류를 쓰지 않는다 — 길이는 언제든 편집할 수 있고, 정산에
            있는 것은 진입점일 뿐이다 (ADR-013 §3). */}
        <p className="text-sm text-ink-dim">
          바꾼 길이는 다음 주부터 적용돼요 · 이번 주 기록은 그대로예요
        </p>
      </div>
    </section>
  )
}

/**
 * 확정 (ux-spec §7). **스크롤 하단에 고정된다** (§10) — 항목이 몇 개든 확정 버튼에
 * 도달할 수 있어야 한다. 실물에서 이것이 스크롤 안에 있었고, 목록이 길어지면 버튼이
 * 화면 밖으로 밀렸다.
 *
 * 확정 전 확인 다이얼로그를 두지 않는다 (§7.3) — 파괴적 행위가 아니고(폐기도 soft),
 * 확정 후 플래너에서 계속 편집할 수 있다.
 */
export function ConfirmSection({
  data,
  carriedPomos,
  pending,
  error,
  onConfirm,
  onClose
}: {
  data: Panel
  /** 지금 선택 기준의 이월 뽀모 합. 라벨과 중립 사실 줄이 이 값에서 나온다. */
  carriedPomos: number
  pending: boolean
  error: 'stale' | 'failed' | null
  onConfirm: () => void
  onClose: () => void
}) {
  const weekWord = data.targetWeekIsCurrent ? '이번 주' : '다음 주'

  return (
    <div className="flex flex-col gap-2">
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

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onConfirm}>
          {carriedPomos > 0
            ? `${weekWord} 시작 (이월 뽀모 ${carriedPomos} 포함)`
            : `${weekWord} 시작`}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  )
}
