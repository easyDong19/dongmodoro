// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { installMatchMedia, setViewportWidth } from './testViewport'
import { useBreakpoint } from './useBreakpoint'

describe('useBreakpoint — 구간 판정 (design-system ADR-001)', () => {
  beforeEach(() => installMatchMedia())

  it('1200px 이상은 와이드다', () => {
    installMatchMedia(1200)
    expect(renderHook(() => useBreakpoint()).result.current).toBe('wide')
  })

  it('1199px 은 미디엄이다 — 경계는 이상/미만이다', () => {
    installMatchMedia(1199)
    expect(renderHook(() => useBreakpoint()).result.current).toBe('medium')
  })

  it('720px 은 미디엄이다', () => {
    installMatchMedia(720)
    expect(renderHook(() => useBreakpoint()).result.current).toBe('medium')
  })

  it('창을 좁히면 와이드에서 미디엄으로 따라 바뀐다', () => {
    installMatchMedia(1280)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('wide')

    act(() => setViewportWidth(900))
    expect(result.current).toBe('medium')

    act(() => setViewportWidth(1280))
    expect(result.current).toBe('wide')
  })

  it('matchMedia 가 없는 환경에서는 던지지 않고 와이드로 떨어진다', () => {
    // @ts-expect-error — 판정 수단이 없는 환경을 재현한다
    delete window.matchMedia
    expect(() => renderHook(() => useBreakpoint())).not.toThrow()
    expect(renderHook(() => useBreakpoint()).result.current).toBe('wide')
  })

  it('언마운트하면 리스너를 정리한다', () => {
    installMatchMedia(1280)
    const { unmount } = renderHook(() => useBreakpoint())
    unmount()
    // 정리되지 않았다면 이 호출이 언마운트된 훅의 setState 를 때려 경고가 난다
    expect(() => act(() => setViewportWidth(900))).not.toThrow()
  })
})
