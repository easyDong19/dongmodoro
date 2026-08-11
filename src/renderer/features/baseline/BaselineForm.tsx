import { useState } from 'react'
import { Button } from '@renderer/shared/ui/button'
import type { BaselineView } from './useBaseline'

/** 배열 인덱스 0 = 월요일 (pomo-baseline R7 · ADR-010 §1). */
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 길이 하한 1분 (R5). 계약도 같은 하한을 걸며, 여기 것은 그 값을 화면에 비추는 것뿐이다. */
const MIN_LENGTH = 1

/** 비어 있는 칸은 `null` 이다 — `0` 으로 읽으면 "안 정했다"가 "0 으로 정했다"가 된다. */
type Slots = (number | null)[]

function toNumber(raw: string): number | null {
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * `개수 × 분` 을 시간 문자열로. 소수 첫째 자리까지 보이고 `.0` 은 떼어낸다 —
 * `10시간` 과 `4.2시간` 이 같은 줄에 나란히 설 수 있어야 한다.
 *
 * 시간 초크포인트(ADR-009 §3)와 무관하다. 달력 키를 다루지 않는 단순 산술이며, 어떤
 * 시각도 만들지 않는다.
 */
function hoursLabel(pomos: number, focusMin: number): string {
  const hours = (pomos * focusMin) / 60
  return `${Number(hours.toFixed(1))}시간`
}

/**
 * 전역 분모 편집 폼 (pomo-baseline R25 · R26).
 *
 * 자리는 정산 패널 안이지만 (weekly-review ux-spec §6) 이 컴포넌트는 그 패널을 모른다 —
 * 첫 실행 온보딩이 생기면 같은 컴포넌트를 다른 자리에 놓기만 하면 된다.
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
  onSave: (form: {
    focusMin: number
    shortBreakMin: number
    longBreakMin: number
    capacity: number[] | null
  }) => void
  onCancel: () => void
}) {
  const [focusMin, setFocusMin] = useState<number | null>(data.focusMin)
  const [shortBreakMin, setShortBreakMin] = useState<number | null>(data.shortBreakMin)
  const [longBreakMin, setLongBreakMin] = useState<number | null>(data.longBreakMin)

  /**
   * 미설정이면 7칸이 **빈 채로** 열린다 (R8 · A9). 폼을 열었다 저장하는 것만으로 배열이
   * 생기면 "아직 정하지 않았다"가 영구히 "예산 0 으로 하겠다"가 된다.
   */
  const [slots, setSlots] = useState<Slots>(data.capacity ?? DAY_NAMES.map(() => null))

  /** 한 칸이라도 채워졌으면 나머지는 0 으로 완성한다. 하나도 없으면 미설정 그대로다. */
  const capacity: number[] | null = slots.some((n) => n !== null) ? slots.map((n) => n ?? 0) : null

  const lengthsValid =
    focusMin !== null &&
    shortBreakMin !== null &&
    longBreakMin !== null &&
    [focusMin, shortBreakMin, longBreakMin].every((n) => Number.isInteger(n) && n >= MIN_LENGTH)

  /**
   * R26 의 기준 개수. 출처가 가용량이면 **지금 편집 중인 값**으로 다시 합산한다 — 서버가
   * 열 때 준 숫자를 고집하면, 가용량을 24 → 10 으로 고친 사용자에게 24 기준 비교가 남는다.
   */
  const basisPomos =
    data.basisSource === 'capacity'
      ? (capacity?.reduce((sum, n) => sum + n, 0) ?? null)
      : data.basisPomos

  /** 비교를 보여줄 이유는 길이가 실제로 달라질 때뿐이다. 기준이 없으면 생략한다 (A25). */
  const showComparison =
    basisPomos !== null && focusMin !== null && lengthsValid && focusMin !== data.focusMin

  return (
    <div className="flex flex-col gap-3 rounded-md border border-glass-border-soft p-3">
      <div className="flex flex-wrap gap-3">
        <LengthField label="집중" value={focusMin} onChange={setFocusMin} />
        <LengthField label="짧은 휴식" value={shortBreakMin} onChange={setShortBreakMin} />
        <LengthField label="긴 휴식" value={longBreakMin} onChange={setLongBreakMin} />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs text-ink-dim">요일별 가용 뽀모 (개수)</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((name, i) => (
            <label key={name} className="flex flex-col items-center gap-1 text-xs text-ink-dim">
              {name}
              <input
                type="number"
                min={0}
                aria-label={`${name}요일 가용 뽀모`}
                value={slots[i] ?? ''}
                onChange={(e) =>
                  setSlots(slots.map((slot, j) => (j === i ? toNumber(e.target.value) : slot)))
                }
                className="min-h-[var(--target-min)] w-12 rounded-md border border-control-border bg-glass px-2 py-1 text-center font-mono text-sm tabular-nums text-ink"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* 변경 전/후를 나란히 놓기만 한다. 가용량·예산을 고쳐 제안하지 않는다 (A24 · 원칙 6). */}
      {showComparison ? (
        <p data-testid="baseline-hours" className="font-mono text-xs tabular-nums text-ink-dim">
          {`주 ${basisPomos}개 · 지금 ${hoursLabel(basisPomos, data.focusMin)} → 바꾸면 ${hoursLabel(basisPomos, focusMin)}`}
        </p>
      ) : null}

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
            lengthsValid ? onSave({ focusMin, shortBreakMin, longBreakMin, capacity }) : undefined
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
