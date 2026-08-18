import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import type { TimerMode } from '@shared/timer/snapshot'
import { api } from '@renderer/shared/api'
import { Button } from '@renderer/shared/ui/button'
import { useTimer } from './useTimer'
import { CaptureBar } from './CaptureBar'
import { StudyDaysLine } from '@renderer/features/calendar/StudyDaysLine'

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
  if (snapshot.mode === 'short') return '짧게 쉬어가요'
  // long idle 의 4회차 판정은 focusSinceLastLong 으로 한다 — 자정에 안 끊기는 카운터라
  // 엔진의 실제 전환 판정(timer-host.ts onComplete)과 항상 일치한다 (리뷰 finding I-1).
  const isFourthCycle = snapshot.focusSinceLastLong > 0 && snapshot.focusSinceLastLong % 4 === 0
  return isFourthCycle ? '네 번째 집중 완료 — 길게 쉴 차례예요' : '길게 쉬어가요'
}

/** 타이머 카드 — App 의 왼쪽 카드 (Task 10). 캡처 바를 하단에 함께 렌더한다. */
export function TimerCard() {
  const { snapshot, remaining } = useTimer()

  if (!snapshot || remaining === null) {
    return <div className="flex h-full flex-col gap-4 rounded-lg p-4" aria-busy="true" />
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

  return (
    /* `h-full` 이 있어야 `.timer-dial-area` 의 `flex: 1` 이 확정 높이를 받는다 — 높이가
       내용에서 나오면 사이즈 컨테이너의 `100cqh` 가 성립하지 않는다. */
    <div className="flex h-full flex-col gap-4 rounded-lg p-4">
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

      {/* 크기의 기준은 글자가 아니라 **다이얼 한 변** 이다 (design-system ADR-012). 한 변이
          `min(가로 여유, 세로 여유)` 를 하한·상한 사이에서 따르고 링·숫자가 거기서 파생된다.
          그 계산은 전부 global.css 의 `.timer-dial-area`·`.timer-dial` 안에 있다 — 여기에
          유틸리티로 흩뿌리면 인과가 두 자리로 갈라진다. */}
      <div className="timer-dial-area">
        <div className="timer-dial">
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
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
          <div className="timer-digits">{formatMmSs(remaining)}</div>
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
        </div>
      ) : null}

      {/* 조절은 대기 중에만 — 조절이 곧 기준이므로 실행 중 조절은 의도치 않은 기준
          변경이 된다 (설계 R3). 숨기지 않는 이유: 버튼 줄이 상태마다 재배치되면
          레이아웃이 흔들리고, 비활성 자체가 "지금은 바꿀 수 없다"를 말한다. */}
      <div className="flex items-center justify-center gap-2">
        {ADJUST_CHIPS.map((delta) => (
          <button
            key={delta}
            type="button"
            disabled={isRunning || isPaused}
            aria-label={`${delta > 0 ? '+' : ''}${delta}분`}
            onClick={() => void api.timer.adjust(delta)}
            className="flex h-6 min-w-6 items-center justify-center px-2 text-xs text-ink disabled:pointer-events-none disabled:opacity-50"
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

      {/*
        `이번 주 N일 공부 중` — **자리만 여기다.** 데이터와 카피의 소유는 calendar-records
        이며(R27), 문구를 바꿀 때 고치는 문서는 그쪽 PRD 다.
      */}
      <StudyDaysLine />

      <CaptureBar />
    </div>
  )
}
