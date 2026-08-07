// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { TimerCard } from './TimerCard'

const baseSnapshot: TimerSnapshotWire = {
  mode: 'focus',
  phase: 'idle',
  startedAt: null,
  durationSec: 1500,
  pausedRemainingSec: null,
  taskId: null,
  taskTitle: null,
  focusCountToday: 0
}

function setup(timer: TimerSnapshotWire) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const mockApi = {
    system: { getAppInfo: vi.fn() },
    clock: { now: vi.fn() },
    today: {
      list: vi.fn(),
      addDirect: vi.fn(),
      pull: vi.fn(),
      remove: vi.fn(),
      toggleComplete: vi.fn()
    },
    timer: {
      getState: vi.fn().mockResolvedValue(timer),
      start: vi.fn().mockResolvedValue(timer),
      startWithTask: vi.fn().mockResolvedValue(timer),
      pause: vi.fn().mockResolvedValue(timer),
      resume: vi.fn().mockResolvedValue(timer),
      reset: vi.fn().mockResolvedValue(timer),
      adjust: vi.fn().mockResolvedValue(timer),
      completeEarly: vi.fn().mockResolvedValue(timer),
      setMode: vi.fn().mockResolvedValue(timer)
    },
    sessions: { capture: vi.fn() },
    events: {
      onTimerTransition: vi.fn(() => () => {}),
      onSessionRecorded: vi.fn(() => () => {}),
      onClockBoundary: vi.fn(() => () => {})
    }
  }
  window.api = mockApi as unknown as Api & { events: Api['events'] }

  render(
    <QueryClientProvider client={qc}>
      <TimerCard />
    </QueryClientProvider>
  )
  return mockApi
}

describe('TimerCard — 렌더 계약 (Task 10)', () => {
  it('모드 탭 3개가 렌더되고 활성 탭은 focus 다', async () => {
    setup(baseSnapshot)
    expect(await screen.findByRole('button', { name: '집중' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '짧은 휴식' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '긴 휴식' })).toBeInTheDocument()
  })

  it('모드 탭 클릭이 setMode 를 호출한다', async () => {
    const mockApi = setup(baseSnapshot)
    const tab = await screen.findByRole('button', { name: '짧은 휴식' })
    fireEvent.click(tab)
    expect(mockApi.timer.setMode).toHaveBeenCalledWith('short')
  })

  it('MM:SS 를 표시한다', async () => {
    setup({ ...baseSnapshot, durationSec: 1500 })
    expect(await screen.findByText('25:00')).toBeInTheDocument()
  })

  it('focus idle 이고 대상이 지정돼 있으면 해제 × 를 렌더하고 클릭 시 reset 을 부른다', async () => {
    const mockApi = setup({ ...baseSnapshot, taskId: 't1', taskTitle: '집중할 일' })
    expect(await screen.findByText('집중할 일')).toBeInTheDocument()
    const clearButton = screen.getByRole('button', { name: '집중 대상 해제' })
    fireEvent.click(clearButton)
    expect(mockApi.timer.reset).toHaveBeenCalled()
  })

  it('running 중에는 해제 × 를 렌더하지 않는다', async () => {
    setup({ ...baseSnapshot, phase: 'running', startedAt: 0, taskId: 't1', taskTitle: '집중할 일' })
    expect(await screen.findByText('집중할 일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '집중 대상 해제' })).not.toBeInTheDocument()
  })

  it('대상 미지정이면 자유 집중을 보여준다', async () => {
    setup(baseSnapshot)
    expect(await screen.findByText('자유 집중')).toBeInTheDocument()
  })

  it('휴식 모드에서는 집중 대상 줄을 렌더하지 않는다', async () => {
    setup({ ...baseSnapshot, mode: 'short', durationSec: 300 })
    await screen.findByText('짧게 쉬어가요')
    expect(screen.queryByText('자유 집중')).not.toBeInTheDocument()
  })

  it('조절 칩 6개가 렌더되고 클릭 시 adjust 를 호출한다', async () => {
    const mockApi = setup(baseSnapshot)
    await screen.findByRole('button', { name: '집중' })
    const chip = screen.getByRole('button', { name: '+5분' })
    fireEvent.click(chip)
    expect(mockApi.timer.adjust).toHaveBeenCalledWith(5)
    expect(screen.getByRole('button', { name: '-10분' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '-5분' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '-1분' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+1분' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+10분' })).toBeInTheDocument()
  })

  it('idle 에서는 시작 버튼, running 에서는 완료 처리가 노출된다', async () => {
    const mockApi = setup(baseSnapshot)
    const startButton = await screen.findByRole('button', { name: '시작' })
    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument()
    fireEvent.click(startButton)
    expect(mockApi.timer.start).toHaveBeenCalled()
  })

  it('focus running 에서 완료 처리 버튼이 노출되고 클릭 시 completeEarly 를 부른다', async () => {
    const mockApi = setup({ ...baseSnapshot, phase: 'running', startedAt: 0 })
    const doneButton = await screen.findByRole('button', { name: '완료 처리' })
    fireEvent.click(doneButton)
    expect(mockApi.timer.completeEarly).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '일시정지' })).toBeInTheDocument()
  })

  it('paused 에서는 계속 버튼을 보여준다', async () => {
    setup({ ...baseSnapshot, phase: 'paused', pausedRemainingSec: 900 })
    expect(await screen.findByRole('button', { name: '계속' })).toBeInTheDocument()
  })

  it('휴식 모드에서는 완료 처리가 노출되지 않는다', async () => {
    setup({ ...baseSnapshot, mode: 'short', phase: 'running', startedAt: 0, durationSec: 300 })
    await screen.findByRole('button', { name: '일시정지' })
    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument()
  })

  it('이모지 없이 렌더된다', async () => {
    setup(baseSnapshot)
    await screen.findByRole('button', { name: '집중' })
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
