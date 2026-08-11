import { useState } from 'react'
import { Button } from '@renderer/shared/ui/button'
import { BaselineForm } from './BaselineForm'
import { useBaseline } from './useBaseline'

/**
 * `조정` 진입점과 그 폼 (weekly-review ux-spec §6 · pomo-baseline R25).
 *
 * **현재 값 표시는 여기 없다.** 그것은 정산 패널이 자기 payload(`getPending.baseline`)로
 * 이미 그리고 있고, 같은 사실을 두 경로로 가져오면 저장 직후 두 숫자가 어긋난 순간이
 * 생긴다. 저장 후 그 표시를 갱신하는 것은 `baseline-changed` 무효화의 몫이다.
 *
 * **길이 저장은 정산 확정과 무관하다** (ux-spec §6). 여기서 저장한 값은 정산을 확정하지
 * 않고 패널을 닫아도 남고, 반대로 정산을 확정해도 진행 중인 주의 값은 바뀌지 않는다.
 */
export function BaselineSection() {
  const [open, setOpen] = useState(false)
  const { data, save, isPending, failed } = useBaseline()

  return (
    <>
      {/* 값을 아직 모르면 폼을 열 수 없다 — 빈 폼을 열고 기본값을 지어내면 사용자가
          건드린 적 없는 값까지 저장된다. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={data === undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        조정
      </Button>

      {open && data !== undefined ? (
        <BaselineForm
          data={data}
          pending={isPending}
          failed={failed}
          onSave={(form) => save(form, { onSuccess: () => setOpen(false) })}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
