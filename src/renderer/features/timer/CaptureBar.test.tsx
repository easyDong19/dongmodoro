// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { SessionRecorded } from '@shared/ipc/contracts'
import { keys } from '@renderer/shared/query/keys'
import { CaptureBar } from './CaptureBar'

const pendingPayload: SessionRecorded = {
  sessionId: 's1',
  kind: 'focus',
  taskId: null,
  durationSec: 1500,
  localDate: '2026-08-07',
  localWeek: '2026-08-03'
}

function setup(pending: SessionRecorded | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (pending) qc.setQueryData(keys.capturePending(), pending)

  window.api = {
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
      getState: vi.fn(),
      start: vi.fn(),
      startWithTask: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      adjust: vi.fn(),
      completeEarly: vi.fn(),
      setMode: vi.fn()
    },
    sessions: {
      capture: vi.fn().mockResolvedValue({ localDate: '2026-08-07', localWeek: '2026-08-03' })
    },
    events: {
      onTimerTransition: vi.fn(() => () => {}),
      onSessionRecorded: vi.fn(() => () => {}),
      onClockBoundary: vi.fn(() => () => {})
    }
  } as unknown as Api & { events: Api['events'] }

  render(
    <QueryClientProvider client={qc}>
      <CaptureBar />
    </QueryClientProvider>
  )
  return qc
}

describe('CaptureBar — 사후 캡처 (Task 10, ux-spec §5)', () => {
  it('대기 payload 가 없으면 아무것도 렌더하지 않는다', () => {
    setup(undefined)
    expect(screen.queryByPlaceholderText(/뭐 했는지/)).not.toBeInTheDocument()
  })

  it('대기 payload 가 있으면 N분 파생 placeholder 로 렌더된다', async () => {
    setup(pendingPayload)
    expect(
      await screen.findByPlaceholderText('이 25분, 뭐 했는지 한 줄 남길래요?')
    ).toBeInTheDocument()
  })

  it('기록 클릭 시 api.sessions.capture 를 호출하고 닫힌다', async () => {
    setup(pendingPayload)
    const input = await screen.findByPlaceholderText('이 25분, 뭐 했는지 한 줄 남길래요?')
    fireEvent.change(input, { target: { value: '문서 작성' } })
    fireEvent.click(screen.getByRole('button', { name: '기록' }))

    await waitFor(() => expect(window.api.sessions.capture).toHaveBeenCalledWith('s1', '문서 작성'))
    await waitFor(() => expect(screen.queryByPlaceholderText(/뭐 했는지/)).not.toBeInTheDocument())
  })

  it('건너뛰기 클릭 시 캡처 없이 닫힌다', async () => {
    setup(pendingPayload)
    await screen.findByPlaceholderText(/뭐 했는지/)
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }))

    expect(window.api.sessions.capture).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByPlaceholderText(/뭐 했는지/)).not.toBeInTheDocument())
  })

  it('Esc 로 캡처 없이 닫힌다', async () => {
    setup(pendingPayload)
    const input = await screen.findByPlaceholderText(/뭐 했는지/)
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(window.api.sessions.capture).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByPlaceholderText(/뭐 했는지/)).not.toBeInTheDocument())
  })
})
