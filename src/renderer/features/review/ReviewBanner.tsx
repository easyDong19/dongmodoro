import { useState, type Ref } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { weekRangeLabel, weekStartLabel } from '@shared/time'
import { Button } from '@renderer/shared/ui/button'
import type { ReviewStatus } from './useReviewStatus'

/**
 * 정산 범위의 라벨 (계획서 정정 ①). ISO 주 번호(`W35`)를 쓰지 않는다 — 53주 연도에서
 * 깨지는 계산이고(ADR-010 Context), 바로 위 카드 헤더가 이미 날짜 범위를 쓰고 있어
 * 같은 컬럼에 두 표기가 섞인다.
 *
 * 한 주는 시작 날짜만 적어 짧게 둔다 (`8/17`). 여러 주는 첫 주의 시작과 마지막 주의
 * 끝을 이어 범위 전체를 말한다 (`8/10 – 8/23`).
 */
function rangeLabel(from: string, to: string): string {
  if (from === to) return weekStartLabel(from)
  return `${weekStartLabel(from)} – ${weekRangeLabel(to).split(' – ')[1]}`
}

/**
 * 정산 배너 (ux-spec §2). 주간 카드 일반 뷰 상단에 얹힌다.
 *
 * **`--amber` 다.** 정산 대기는 파괴적 행위도 실패도 아니므로 `--danger` 를 쓰지 않고
 * (principles §1·§2), "미달성"·"밀린"·"숙제"·"지연" 류 단어도 쓰지 않는다. N 은 항상
 * **넘어갈** 건수다 (원칙 7).
 *
 * 닫기는 **로컬 상태로만** 둔다. "무시했다"를 저장하면 판정의 저장 입력이 둘이 되어
 * 워터마크 단독 판정이 닫아 둔 구멍이 다시 열린다 (technical-spec `dismissBanner` 절).
 * 대신 **범위가 달라지면 다시 뜬다** — 자정을 넘겨 범위가 커지는 경우(시나리오 14)에
 * 닫아 둔 배너가 잠겨 있으면 새로 들어온 주가 조용히 묻힌다.
 */
export function ReviewBanner({
  status,
  currentWeek,
  ctaRef,
  onStart
}: {
  status: ReviewStatus | undefined
  /** 오늘이 속한 주. "이번 주 마감"과 "지난 주"를 가른다. */
  currentWeek: string
  /** 패널을 닫을 때 포커스가 돌아올 자리 (PRODUCT.md 접근성 §4). */
  ctaRef?: Ref<HTMLButtonElement>
  onStart: () => void
}) {
  const [dismissed, setDismissed] = useState<string | null>(null)

  if (status === undefined || !status.needed) return null

  const range = `${status.from}..${status.to}`
  if (dismissed === range) return null

  const singleCurrentWeek = status.from === status.to && status.from === currentWeek
  const headline =
    status.pendingItemCount === 0
      ? '이번 주 마감하고 다음 주를 시작할까요'
      : singleCurrentWeek
        ? `이번 주 마감이 기다려요 · 다음 주로 넘어갈 ${status.pendingItemCount}건`
        : status.from === status.to
          ? `지난 주(${rangeLabel(status.from, status.to)}) 정산이 기다려요 · 다음 주로 넘어갈 ${status.pendingItemCount}건`
          : `${rangeLabel(status.from, status.to)} 정산이 기다려요 · 다음 주로 넘어갈 ${status.pendingItemCount}건`

  return (
    <div
      data-testid="review-banner"
      className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-amber bg-glass px-2 py-2"
    >
      <CalendarClock className="size-4 shrink-0 text-amber" aria-hidden />
      <p className="flex-1 text-xs text-ink">{headline}</p>
      <Button ref={ctaRef} type="button" variant="secondary" size="xs" onClick={onStart}>
        정산 시작
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="배너 닫기"
        onClick={() => setDismissed(range)}
      >
        <X />
      </Button>
    </div>
  )
}
