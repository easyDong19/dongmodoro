// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { Theme } from '@shared/ipc/contracts'
import { ThemeToggle } from './ThemeToggle'

function setup(stored: Theme | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const setTheme = vi.fn().mockImplementation((theme: Theme) => Promise.resolve({ theme }))

  window.api = {
    settings: {
      // 값이 없는 경우를 흉내내려면 **응답을 주지 않아야** 한다 — resolve 해버리면
      // 로딩 상태를 만들 수 없다.
      getTheme:
        stored === undefined
          ? vi.fn(() => new Promise(() => {}))
          : vi.fn().mockResolvedValue({ theme: stored }),
      setTheme
    }
  } as unknown as Api

  render(
    <QueryClientProvider client={qc}>
      <ThemeToggle />
    </QueryClientProvider>
  )
  return { setTheme }
}

const light = () => screen.getByRole('button', { name: '라이트 테마' })
const dark = () => screen.getByRole('button', { name: '다크 테마' })

describe('ThemeToggle — 2택 세그먼트 (design-system ADR-010 §2)', () => {
  it('저장된 테마 쪽만 눌린 상태로 그린다', async () => {
    setup('dark')
    await waitFor(() => expect(dark()).toHaveAttribute('aria-pressed', 'true'))
    expect(light()).toHaveAttribute('aria-pressed', 'false')
  })

  it('라이트가 저장돼 있으면 반대로 그린다', async () => {
    setup('light')
    await waitFor(() => expect(light()).toHaveAttribute('aria-pressed', 'true'))
    expect(dark()).toHaveAttribute('aria-pressed', 'false')
  })

  /**
   * 응답 전에 한쪽을 눌린 상태로 그리면, 저장값이 반대일 때 화면이 한 번 튄다.
   * 잠깐 비어 있는 편이 추측한 상태를 보여주는 것보다 정직하다.
   */
  it('값을 아직 못 읽었으면 어느 쪽도 눌린 상태가 아니다', () => {
    setup(undefined)
    expect(light()).toHaveAttribute('aria-pressed', 'false')
    expect(dark()).toHaveAttribute('aria-pressed', 'false')
  })

  it('반대쪽을 누르면 그 값으로 저장을 요청한다', async () => {
    const { setTheme } = setup('dark')
    await waitFor(() => expect(dark()).toHaveAttribute('aria-pressed', 'true'))

    await userEvent.click(light())
    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('light'))
  })

  /** `system` 은 계약에서 사라졌다 — UI 에도 그 선택지가 없어야 한다. */
  it('선택지가 둘뿐이다', async () => {
    setup('dark')
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  /** 조작 타깃 하한과 접근성 이름 (design-system ADR-004 §2 · principles §6). */
  it('아이콘만 있는 버튼에도 접근성 이름이 있다', () => {
    setup('dark')
    expect(light()).toHaveAccessibleName('라이트 테마')
    expect(dark()).toHaveAccessibleName('다크 테마')
  })
})
