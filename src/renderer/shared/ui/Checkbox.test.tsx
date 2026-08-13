// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {} from '@testing-library/jest-dom/vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox — 토큰 스킨 체크박스', () => {
  it('checkbox role 과 체크 상태를 그대로 노출한다', () => {
    render(<Checkbox checked aria-label="할 일 완료 토글" />)

    expect(screen.getByRole('checkbox', { name: '할 일 완료 토글' })).toBeChecked()
  })

  it('클릭하면 바뀐 상태를 알린다', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="토글" />)

    await user.click(screen.getByRole('checkbox'))

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('비활성이면 클릭이 먹지 않는다', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Checkbox disabled checked={false} onCheckedChange={onCheckedChange} aria-label="토글" />
    )

    const box = screen.getByRole('checkbox')
    expect(box).toBeDisabled()
    await user.click(box)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('히트 영역은 24px, 그려지는 박스는 16px 다 (ADR-004 §2)', () => {
    render(<Checkbox checked={false} aria-label="토글" />)

    const root = screen.getByRole('checkbox')
    // size-6 = 24px = --target-min. 박스를 키워 타깃을 채우지 않는다.
    expect(root.className).toContain('size-6')
    expect(root.querySelector('span')?.className).toContain('size-4')
  })

  it('체크 표시는 색과 글리프 두 축으로 갈린다 (principles §3.5)', () => {
    const { rerender } = render(<Checkbox checked aria-label="토글" />)

    // 색 축: data-state 로 갈린다 (teal 배경이 이 상태에만 붙는다).
    expect(screen.getByRole('checkbox')).toHaveAttribute('data-state', 'checked')
    // 글리프 축: 체크된 동안에만 lucide Check 가 렌더된다.
    expect(screen.getByRole('checkbox').querySelector('svg')).toBeTruthy()

    rerender(<Checkbox checked={false} aria-label="토글" />)
    expect(screen.getByRole('checkbox')).toHaveAttribute('data-state', 'unchecked')
    expect(screen.getByRole('checkbox').querySelector('svg')).toBeNull()
  })

  it('테두리는 --control-border 토큰을 쓴다 (tokens.md §1.2)', () => {
    render(<Checkbox checked={false} aria-label="토글" />)

    expect(screen.getByRole('checkbox').querySelector('span')?.className).toContain(
      'border-control-border'
    )
  })
})
