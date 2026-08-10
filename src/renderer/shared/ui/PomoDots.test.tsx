// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PomoDots } from './PomoDots'

describe('PomoDots', () => {
  it('default: 채움 = 소진, 미채움 = 남은 est', () => {
    render(<PomoDots spent={2} est={5} />)
    expect(screen.getAllByTestId('pomo-dot-filled')).toHaveLength(2)
    expect(screen.getAllByTestId('pomo-dot-empty')).toHaveLength(3)
    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  it('default: 초과분은 extra 도트 + +N 배지', () => {
    render(<PomoDots spent={7} est={5} />)
    expect(screen.getAllByTestId('pomo-dot-extra')).toHaveLength(2)
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryAllByTestId('pomo-dot-empty')).toHaveLength(0)
  })

  it('neutral(기타 행): 소진만 채우고 미채움·extra·+N 을 렌더하지 않는다 (§3.4)', () => {
    render(<PomoDots spent={3} est={0} variant="neutral" />)
    expect(screen.getAllByTestId('pomo-dot-filled')).toHaveLength(3)
    expect(screen.queryAllByTestId('pomo-dot-empty')).toHaveLength(0)
    expect(screen.queryAllByTestId('pomo-dot-extra')).toHaveLength(0)
    expect(screen.getByText('3')).toBeInTheDocument() // 소진 단독
    expect(screen.queryByText('3/0')).not.toBeInTheDocument()
  })

  it('이모지를 쓰지 않는다 (principles §6)', () => {
    const { container } = render(<PomoDots spent={7} est={5} />)
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  // principles §4 — 초과 글로우는 정적이다. 무한 펄스는 금지다.
  // 1·2판은 이 규칙을 산문으로만 적어 검증되지 않았다. 여기서 테스트로 못 박는다.
  it('초과 상태에 무한 애니메이션을 쓰지 않는다', () => {
    const { container } = render(<PomoDots spent={7} est={5} />)
    const animated = container.querySelectorAll('[class*="animate-"]')
    expect(animated).toHaveLength(0)
  })
})
