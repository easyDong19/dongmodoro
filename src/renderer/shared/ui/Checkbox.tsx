import { Check } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'

import { cn } from '@renderer/shared/lib/utils'

/**
 * 체크박스 (design-system principles §5·§6, tokens.md §1.2).
 *
 * 네이티브 `<input type="checkbox">` 를 대체한다. 네이티브는 `appearance` 를 우리가
 * 지정하지 않아 OS 기본 크롬으로 그려졌고, 다크 테마의 유리 표면 위에서 **불투명한 흰
 * 사각형**이 됐다 — 행에서 가장 대비가 센 요소가 제목이 아니라 체크박스였다.
 * tokens.md §1.2 는 `--control-border` 를 애초에 "체크박스·입력 필드·스테퍼" 경계로
 * 정의해 뒀고, 이 컴포넌트가 그 소비자다.
 *
 * **박스는 16px, 히트 영역은 24px 다** (ADR-004 §2 — 라벨·글리프를 키워 달성하지 않고
 * 투명 여백으로 넓힌다). 네이티브 시절에는 global.css 의 `input { min-width }` 규칙이
 * 박스 자체를 24px 로 부풀려 이 규칙을 반대로 만족시키고 있었다.
 *
 * 체크 표시는 `--teal` 배경 + lucide `Check` 글리프다. 색과 글리프 두 축으로 갈리므로
 * 고대비 모드·색각 이상에서도 상태가 사라지지 않는다 (principles §3·§3.5). 정산 패널의
 * 완료 표시와 같은 언어다.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-transparent',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&[data-state=checked]>span]:border-teal [&[data-state=checked]>span]:bg-teal',
        className
      )}
      {...props}
    >
      <span className="control flex size-4 items-center justify-center rounded-sm border border-control-border bg-glass text-bg-deep">
        <CheckboxPrimitive.Indicator>
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  )
}
