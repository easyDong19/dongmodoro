import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionRecorded } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { clearCapturePending } from '@renderer/shared/query/events'
import { Button } from '@renderer/shared/ui/button'

const MAX_LEN = 60

/**
 * 사후 캡처 바 (ux-spec §5, Task 10). 자유 focus 완료 직후에만 나타나고, `기록`·
 * `건너뛰기`·Esc 세 가지로만 닫힌다 — 모달이 아니고 다음 세션이 시작돼도 자동으로
 * 닫히지 않는다 (대기 캐시는 events.ts 초크포인트가 채우고, 여기서만 비운다).
 */
export function CaptureBar() {
  const qc = useQueryClient()
  const { data: pending } = useQuery<SessionRecorded | null>({
    queryKey: keys.capturePending(),
    queryFn: () => Promise.resolve(null),
    enabled: false,
    staleTime: Infinity
  })
  const [title, setTitle] = useState('')

  const dismiss = () => {
    setTitle('')
    clearCapturePending(qc)
  }

  const capture = useMutation({
    mutationFn: (vars: { sessionId: string; title: string }) =>
      api.sessions.capture(vars.sessionId, vars.title),
    onSuccess: (r) => {
      dispatchInvalidation(qc, {
        type: 'capture-recorded',
        payload: { localDate: r.localDate, localWeek: r.localWeek },
        currentDayKey: r.localDate
      })
      dismiss()
    }
  })

  if (!pending) return null

  const minutes = Math.round(pending.durationSec / 60)

  const submit = () => {
    const trimmed = title.trim()
    if (trimmed === '') return
    capture.mutate({ sessionId: pending.sessionId, title: trimmed })
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md p-3"
      style={{ background: 'var(--glass-strong)' }}
      role="group"
      aria-label="사후 캡처"
    >
      <input
        type="text"
        value={title}
        maxLength={MAX_LEN}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') dismiss()
        }}
        placeholder={`이 ${minutes}분, 뭐 했는지 한 줄 남길래요?`}
        className="flex-1 rounded-md border border-control-border bg-glass px-3 py-1.5 text-sm text-ink"
      />
      <Button type="button" variant="default" size="sm" onClick={submit}>
        기록
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
        건너뛰기
      </Button>
    </div>
  )
}
