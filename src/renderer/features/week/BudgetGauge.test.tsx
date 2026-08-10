// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BudgetGauge } from './BudgetGauge'

const realMatchMedia = window.matchMedia

/** reduced-motion 을 강제로 켠다. 끄고 싶으면 `false` 를 넘긴다. */
function stubMatchMedia(reduced: boolean): void {
  window.matchMedia = ((q: string) => ({
    matches: reduced && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {}
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('BudgetGauge — 세 상태 (ux-spec §7)', () => {
  it('예산 미설정(null): 바 없이 `/ 미설정` 과 안내 문구', () => {
    render(<BudgetGauge budget={null} spent={4} />)
    expect(screen.getByText('4 / 미설정')).toBeInTheDocument()
    expect(screen.getByText('예산을 정하면 예산 대비 소진이 보여요')).toBeInTheDocument()
    expect(screen.queryByTestId('budget-bar')).not.toBeInTheDocument()
  })

  it('예산 0: 소진 숫자만 — `/ 미설정` 도 안내 문구도 없다 (A27)', () => {
    render(<BudgetGauge budget={0} spent={4} />)
    expect(screen.getByText('4')).toBeInTheDocument()
    // 예산을 0 으로 **정한** 사용자에게 "정하면"이라고 말하면 거짓이다.
    expect(screen.queryByText(/예산을 정하면/)).not.toBeInTheDocument()
    expect(screen.queryByText(/미설정/)).not.toBeInTheDocument()
    expect(screen.queryByText('4 / 0')).not.toBeInTheDocument()
    expect(screen.queryByText('0 / 0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('budget-bar')).not.toBeInTheDocument()
  })

  it('예산 있음·여유: 바와 `소진 / 예산`, 추정치 문구', () => {
    render(<BudgetGauge budget={20} spent={5} />)
    expect(screen.getByText('5 / 20')).toBeInTheDocument()
    expect(screen.getByText('예산은 추정치예요 — 넘어가도 괜찮아요')).toBeInTheDocument()
    expect(screen.getByTestId('budget-bar')).toBeInTheDocument()
  })

  it('과적(20/23): +3 배지가 뜨되 실패 프레임을 쓰지 않는다 (principles §3)', () => {
    const { container } = render(<BudgetGauge budget={20} spent={23} />)
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('예산은 추정치예요 — 넘어가도 괜찮아요')).toBeInTheDocument()
    expect(container.querySelectorAll('[class*="danger"]')).toHaveLength(0)
    expect(container.querySelector('.lucide-triangle-alert')).toBeNull()
  })

  it('reduced-motion 에서 바 전이를 끈다 (principles §4)', () => {
    stubMatchMedia(true)
    const { container } = render(<BudgetGauge budget={20} spent={5} />)
    expect(container.querySelector('[data-motion="reduced"]')).not.toBeNull()
  })

  it('reduced-motion 이 아니면 전이를 남긴다', () => {
    stubMatchMedia(false)
    const { container } = render(<BudgetGauge budget={20} spent={5} />)
    expect(container.querySelector('[data-motion="reduced"]')).toBeNull()
  })
})
