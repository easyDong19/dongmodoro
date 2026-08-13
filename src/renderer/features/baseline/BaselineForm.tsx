import { useState } from 'react'
import { Button } from '@renderer/shared/ui/button'
import type { BaselineView } from './useBaseline'

/** 길이 하한 1분 (R5). 계약도 같은 하한을 걸며, 여기 것은 그 값을 화면에 비추는 것뿐이다. */
const MIN_LENGTH = 1

function toNumber(raw: string): number | null {
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * 뽀모 길이 편집 폼 (pomo-baseline R25).
 *
 * 자리는 정산 패널 안이지만 (weekly-review ux-spec §6) 이 컴포넌트는 그 패널을 모른다 —
 * 첫 실행 온보딩이 생기면 같은 컴포넌트를 다른 자리에 놓기만 하면 된다.
 *
 * **요일별 가용량 7칸과 변경 전/후 총 집중 시간 비교(R26)는 없다** — 가용량은 폐기된
 * 통화이고(ADR-030), 비교의 분모였던 유효 예산·가용량 합이 함께 사라졌다 (ADR-029 §3).
 */
export function BaselineForm({
  data,
  pending,
  failed,
  onSave,
  onCancel
}: {
  data: BaselineView
  pending: boolean
  failed: boolean
  onSave: (form: { focusMin: number; shortBreakMin: number; longBreakMin: number }) => void
  onCancel: () => void
}) {
  const [focusMin, setFocusMin] = useState<number | null>(data.focusMin)
  const [shortBreakMin, setShortBreakMin] = useState<number | null>(data.shortBreakMin)
  const [longBreakMin, setLongBreakMin] = useState<number | null>(data.longBreakMin)

  const lengthsValid =
    focusMin !== null &&
    shortBreakMin !== null &&
    longBreakMin !== null &&
    [focusMin, shortBreakMin, longBreakMin].every((n) => Number.isInteger(n) && n >= MIN_LENGTH)

  return (
    <div className="flex flex-col gap-3 rounded-md border border-glass-border-soft p-3">
      <div className="flex flex-wrap gap-3">
        <LengthField label="집중" value={focusMin} onChange={setFocusMin} />
        <LengthField label="짧은 휴식" value={shortBreakMin} onChange={setShortBreakMin} />
        <LengthField label="긴 휴식" value={longBreakMin} onChange={setLongBreakMin} />
      </div>

      {failed ? (
        <p data-testid="baseline-error" className="text-xs text-ink-dim">
          저장하지 못했어요 — 다시 시도해 주세요. 아무것도 반영되지 않았어요
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        {/* 라벨이 §7 의 `이번 주 시작`·`다음 주 시작` 과 겹치지 않는다 — 두 버튼이 한 화면에
            동시에 보이므로, 겹치면 어느 것이 정산 확정인지 사라진다 (ux-spec §6). */}
        <Button
          type="button"
          size="sm"
          disabled={pending || !lengthsValid}
          onClick={() =>
            lengthsValid ? onSave({ focusMin, shortBreakMin, longBreakMin }) : undefined
          }
        >
          길이 저장
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  )
}

function LengthField({
  label,
  value,
  onChange
}: {
  label: string
  value: number | null
  onChange: (next: number | null) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-dim">
      {`${label} (분)`}
      <input
        type="number"
        min={MIN_LENGTH}
        aria-label={`${label} 길이 (분)`}
        value={value ?? ''}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className="min-h-[var(--target-min)] w-20 rounded-md border border-control-border bg-glass px-2 py-1 font-mono text-sm tabular-nums text-ink"
      />
    </label>
  )
}
