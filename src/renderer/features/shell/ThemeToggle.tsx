import { Moon, Sun } from 'lucide-react'
import type { Theme } from '@shared/ipc/contracts'
import { useTheme } from './useTheme'

/**
 * 테마 2택 세그먼트 (design-system ADR-010 §2).
 *
 * **단일 토글 버튼이 아니라 세그먼트인 이유:** 아이콘 하나짜리 토글은 그 아이콘이
 * "지금 상태"인지 "누르면 될 것"인지 말해주지 않는다. 둘 다 관용적이라 어느 쪽으로
 * 읽어도 틀렸다고 할 수 없고, 그래서 사용자가 매번 눌러 보고 확인하게 된다.
 * 둘을 나란히 두면 선택된 쪽이 "지금", 나머지가 "누르면"이라 그 모호함이 사라진다.
 *
 * 그리고 선택 상태라는 개념이 있어야 [ADR-006 §3](고대비에서 색 외 제2 신호)의 보더
 * 규칙이 적용된다 — 토글 버튼에는 적용할 선택 상태 자체가 없다.
 */
const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: '라이트 테마', Icon: Sun },
  { value: 'dark', label: '다크 테마', Icon: Moon }
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="seg" role="group" aria-label="테마">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          // 값을 아직 못 읽었으면 어느 쪽도 눌린 상태로 그리지 않는다 — 추측한 상태를
          // 보여줬다가 응답이 오면 튀는 것보다 잠깐 비어 있는 편이 정직하다.
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
        >
          {/* 이모지 금지 — 아이콘은 lucide 컴포넌트로만 (principles §6). */}
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
