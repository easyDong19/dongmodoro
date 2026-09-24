// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toast } from './Toast'

afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  it('메시지를 렌더한다', () => {
    render(<Toast message="오늘로 가져왔어요 — 조각 하나" onDismiss={vi.fn()} />)
    expect(screen.getByText('오늘로 가져왔어요 — 조각 하나')).toBeInTheDocument()
  })

  it('role=status · aria-live=polite 다 — 방금 누른 결과라 assertive 가 아니다', () => {
    render(<Toast message="가져왔어요" onDismiss={vi.fn()} />)
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('aria-live', 'polite')
    expect(el).not.toHaveAttribute('aria-live', 'assertive')
  })

  /**
   * 호출부는 유리 카드 안이다. `.card` 의 `backdrop-filter` 가 `position: fixed` 의 기준
   * 상자를 카드로 바꾸므로, 카드 DOM 안에 그려지면 창이 아니라 카드 모서리에 붙는다.
   */
  it('호출부가 아니라 body 에 그려진다 — 카드가 fixed 의 기준이 되지 않게', () => {
    const { container } = render(<Toast message="가져왔어요" onDismiss={vi.fn()} />)
    const el = screen.getByRole('status')
    expect(container).not.toContainElement(el)
    expect(el.parentElement).toBe(document.body)
  })

  it('--layer-toast 레이어에 놓인다', () => {
    render(<Toast message="가져왔어요" onDismiss={vi.fn()} />)
    expect(screen.getByRole('status').style.zIndex).toBe('var(--layer-toast)')
  })

  it('시간이 지나면 스스로 사라진다', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<Toast message="가져왔어요" onDismiss={onDismiss} />)

    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(4000))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('메시지가 바뀌면 타이머를 다시 센다 — 앞 메시지의 남은 시간에 잘리지 않는다', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast message="첫째" onDismiss={onDismiss} />)

    act(() => vi.advanceTimersByTime(3000))
    rerender(<Toast message="둘째" onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(1500))
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(2500))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
