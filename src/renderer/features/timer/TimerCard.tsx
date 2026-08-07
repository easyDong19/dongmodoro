import { X } from 'lucide-react'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import type { TimerMode } from '@shared/timer/snapshot'
import { api } from '@renderer/shared/api'
import { Button } from '@renderer/shared/ui/button'
import { useTimer } from './useTimer'
import { CaptureBar } from './CaptureBar'

const MODE_TABS: { mode: TimerMode; label: string }[] = [
  { mode: 'focus', label: '집중' },
  { mode: 'short', label: '짧은 휴식' },
  { mode: 'long', label: '긴 휴식' }
]

const ADJUST_CHIPS = [-10, -5, -1, 1, 5, 10]

const RING_RADIUS = 88
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function formatMmSs(totalSec: number): string {
  const clamped = Math.max(0, totalSec)
  const mm = Math.floor(clamped / 60)
  const ss = clamped % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** 세션 라벨 (ux-spec §4). focus 는 `N번째 집중`, 휴식은 대기/진행 문구가 갈린다. */
function sessionLabel(snapshot: TimerSnapshotWire): string {
  if (snapshot.mode === 'focus') return `${snapshot.focusCountToday + 1}번째 집중`
  if (snapshot.phase === 'running' || snapshot.phase === 'paused') return '쉬는 중'
  const isFourthCycle = snapshot.focusCountToday > 0 && snapshot.focusCountToday % 4 === 0
  if (snapshot.mode === 'long' && isFourthCycle) return '네 번째 집중 완료 — 길게 쉴 차례예요'
  return '짧게 쉬어가요'
}

/** 타이머 카드 — App 의 왼쪽 카드 (Task 10). 캡처 바를 하단에 함께 렌더한다. */
export function TimerCard() {
  const { snapshot, remaining } = useTimer()

  if (!snapshot || remaining === null) {
    return <div className="flex flex-col gap-4 rounded-lg p-4" aria-busy="true" />
  }

  const progress = 1 - remaining / Math.max(1, snapshot.durationSec)
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)))

  const isRunning = snapshot.phase === 'running'
  const isPaused = snapshot.phase === 'paused'
  const primaryLabel = isRunning ? '일시정지' : isPaused ? '계속' : '시작'
  const primaryAction = () => {
    if (isRunning) void api.timer.pause()
    else if (isPaused) void api.timer.resume()
    else void api.timer.start()
  }
  const showCompleteButton = snapshot.mode === 'focus' && (isRunning || isPaused)
  const showClearTarget =
    snapshot.mode === 'focus' && snapshot.phase === 'idle' && snapshot.taskId !== null

  return (
    <div className="flex flex-col gap-4 rounded-lg p-4">
      <div className="flex gap-2" aria-label="타이머 모드">
        {MODE_TABS.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={snapshot.mode === mode}
            onClick={() => void api.timer.setMode(mode)}
            className="rounded-md px-3 py-1.5 text-sm text-ink"
            style={{ background: snapshot.mode === mode ? 'var(--glass-strong)' : 'transparent' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative flex items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-full max-w-[220px]" aria-hidden="true">
          <defs>
            <linearGradient id="timer-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--teal)" />
              <stop offset="100%" stopColor="var(--amber)" />
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--glass-border)"
            strokeWidth="10"
          />
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="url(#timer-ring-gradient)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 100 100)"
            className="motion-reduce:transition-none"
            style={{ transition: 'stroke-dashoffset var(--motion-medium) linear' }}
          />
        </svg>
        <div
          className="absolute font-mono tabular-nums text-ink"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-display)' }}
        >
          {formatMmSs(remaining)}
        </div>
      </div>

      <p className="text-center text-sm text-ink">{sessionLabel(snapshot)}</p>

      {snapshot.mode === 'focus' ? (
        <div className="flex items-center justify-center gap-2">
          <span
            className={snapshot.taskTitle === null ? 'text-sm text-ink-dim' : 'text-sm text-ink'}
          >
            {snapshot.taskTitle ?? '자유 집중'}
          </span>
          {showClearTarget ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="집중 대상 해제"
              onClick={() => void api.timer.reset()}
            >
              <X />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-2">
        {ADJUST_CHIPS.map((delta) => (
          <button
            key={delta}
            type="button"
            aria-label={`${delta > 0 ? '+' : ''}${delta}분`}
            onClick={() => void api.timer.adjust(delta)}
            className="px-2 py-1 text-xs text-ink"
            style={{ borderRadius: 'var(--radius-sm)', background: 'var(--glass)' }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => void api.timer.reset()}>
          초기화
        </Button>
        <Button type="button" variant="default" size="sm" onClick={primaryAction}>
          {primaryLabel}
        </Button>
        {showCompleteButton ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void api.timer.completeEarly()}
          >
            완료 처리
          </Button>
        ) : null}
      </div>

      <CaptureBar />
    </div>
  )
}
