// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReviewBanner } from './ReviewBanner'
import type { ReviewStatus } from './useReviewStatus'

const THIS_WEEK = '2026-08-24'

function pending(over: Partial<Extract<ReviewStatus, { needed: true }>> = {}): ReviewStatus {
  return {
    needed: true,
    targetWeek: '2026-08-31',
    from: THIS_WEEK,
    to: THIS_WEEK,
    weekCount: 1,
    pendingItemCount: 3,
    ...over
  }
}

function renderBanner(status: ReviewStatus | undefined, onStart = vi.fn()) {
  return render(<ReviewBanner status={status} currentWeek={THIS_WEEK} onStart={onStart} />)
}

describe('ReviewBanner — 5상태 (ux-spec §2)', () => {
  it('판정이 아직 없으면 아무것도 렌더하지 않는다', () => {
    const { container } = renderBanner(undefined)
    expect(container).toBeEmptyDOMElement()
  })

  it('빈 범위면 배너 자체를 렌더하지 않는다', () => {
    const { container } = renderBanner({ needed: false, targetWeek: '2026-08-31' })
    expect(container).toBeEmptyDOMElement()
  })

  it('범위가 이번 주 하나면 마감 문구다', () => {
    renderBanner(pending())
    expect(screen.getByText(/이번 주 마감이 기다려요/)).toBeInTheDocument()
    expect(screen.getByText(/다음 주로 넘어갈 3건/)).toBeInTheDocument()
  })

  it('범위가 과거 한 주면 그 주를 날짜로 밝힌다', () => {
    renderBanner(pending({ from: '2026-08-17', to: '2026-08-17' }))
    expect(screen.getByText(/지난 주\(8\/17\) 정산이 기다려요/)).toBeInTheDocument()
  })

  it('여러 주가 병합되면 범위를 통째로 적는다', () => {
    renderBanner(pending({ from: '2026-08-10', to: '2026-08-17', weekCount: 2 }))
    expect(screen.getByText(/8\/10 – 8\/23 정산이 기다려요/)).toBeInTheDocument()
  })

  it('R5 — 넘어갈 항목이 0건이어도 배너가 뜨고 문구만 바뀐다', () => {
    renderBanner(pending({ pendingItemCount: 0 }))
    expect(screen.getByText('이번 주 마감하고 다음 주를 시작할까요')).toBeInTheDocument()
    expect(screen.queryByText(/넘어갈 0건/)).not.toBeInTheDocument()
  })

  it('정산 시작을 누르면 알린다', async () => {
    const onStart = vi.fn()
    renderBanner(pending(), onStart)
    await userEvent.click(screen.getByRole('button', { name: '정산 시작' }))
    expect(onStart).toHaveBeenCalledOnce()
  })
})

describe('ReviewBanner — 톤과 접근성', () => {
  it('--danger 를 쓰지 않는다 — 정산 대기는 실패도 파괴도 아니다 (principles §1·§2)', () => {
    const { container } = renderBanner(pending())
    expect(container.innerHTML).not.toMatch(/danger/)
  })

  it('앰버 톤이다', () => {
    const { container } = renderBanner(pending())
    expect(container.innerHTML).toMatch(/amber/)
  })

  it('실패 프레임 단어를 쓰지 않는다 (원칙 7)', () => {
    const { container } = renderBanner(pending({ from: '2026-08-10', to: '2026-08-17' }))
    for (const word of ['미달성', '밀린', '숙제', '지연', '실패']) {
      expect(container.textContent).not.toContain(word)
    }
  })

  it('닫으면 그 범위 동안은 조용하다', async () => {
    const { container, rerender } = renderBanner(pending())
    await userEvent.click(screen.getByRole('button', { name: '배너 닫기' }))
    expect(container).toBeEmptyDOMElement()

    // 같은 범위에서 건수만 달라진 재조회로는 다시 뜨지 않는다 — 그건 새 사실이 아니다.
    rerender(
      <ReviewBanner
        status={pending({ pendingItemCount: 5 })}
        currentWeek={THIS_WEEK}
        onStart={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * 자정을 넘겨 범위가 **커지는** 경우가 이 규칙이 있는 이유다 (technical-spec 시나리오 14).
   * 닫아 둔 배너가 그대로 잠겨 있으면 새로 들어온 주가 조용히 묻힌다.
   */
  it('범위가 달라지면 닫아 둔 배너가 다시 나타난다', async () => {
    const { container, rerender } = renderBanner(pending({ from: '2026-08-17', to: '2026-08-17' }))
    await userEvent.click(screen.getByRole('button', { name: '배너 닫기' }))
    expect(container).toBeEmptyDOMElement()

    rerender(
      <ReviewBanner
        status={pending({ from: '2026-08-17', to: THIS_WEEK, weekCount: 2 })}
        currentWeek={THIS_WEEK}
        onStart={vi.fn()}
      />
    )
    expect(screen.getByText(/정산이 기다려요/)).toBeInTheDocument()
  })
})
